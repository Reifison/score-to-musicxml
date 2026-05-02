import bcrypt from "bcryptjs";
import type { Response } from "express";
import { env } from "../config/env.js";
import type { PublicUser, User } from "../domain.js";
import { AppError } from "../errors/AppError.js";
import type { AuditRepository, SessionRepository, UserRepository } from "../repositories/contracts.js";
import { randomToken, sha256 } from "../utils/crypto.js";
import { toPublicUser } from "../domain.js";

const sessionDays = 7;

export class AuthService {
  constructor(
    private users: UserRepository,
    private sessions: SessionRepository,
    private audits: AuditRepository
  ) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, env.BCRYPT_ROUNDS);
  }

  async login(email: string, password: string, ipAddress?: string): Promise<{ token: string; user: PublicUser }> {
    const genericError = new AppError(401, "E-mail ou senha inválidos.", "INVALID_CREDENTIALS");
    const user = await this.users.findByEmail(email);
    if (!user) {
      await this.audits.create({ action: "login_failed", ipAddress, metadata: { email: email.toLowerCase() } });
      throw genericError;
    }
    if (!user.isActive) {
      await this.audits.create({ actorId: user.id, action: "login_failed", ipAddress, metadata: { reason: "inactive" } });
      throw genericError;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await this.audits.create({ actorId: user.id, action: "login_failed", ipAddress });
      throw genericError;
    }
    const token = randomToken();
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);
    await this.sessions.create({ tokenHash, userId: user.id, expiresAt });
    await this.audits.create({ actorId: user.id, action: "login_success", ipAddress });
    return { token, user: toPublicUser(user) };
  }

  async authenticate(token: string | undefined): Promise<User | null> {
    if (!token) return null;
    const session = await this.sessions.findByTokenHash(sha256(token));
    if (!session || session.expiresAt < new Date()) return null;
    const user = await this.users.findById(session.userId);
    if (!user?.isActive) return null;
    return user;
  }

  async logout(token: string | undefined, actorId?: string, ipAddress?: string): Promise<void> {
    if (!token) return;
    await this.sessions.deleteByTokenHash(sha256(token));
    await this.audits.create({ actorId, action: "logout", ipAddress });
  }

  setSessionCookie(res: Response, token: string): void {
    res.cookie(env.SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionDays * 24 * 60 * 60 * 1000,
      path: "/"
    });
  }

  clearSessionCookie(res: Response): void {
    res.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });
  }
}
