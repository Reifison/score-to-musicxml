import { z } from "zod";
import type { PublicUser, Role, User } from "../domain.js";
import { toPublicUser } from "../domain.js";
import { AppError, notFound } from "../errors/AppError.js";
import type { AuditRepository, UserRepository } from "../repositories/contracts.js";
import type { AuthService } from "./AuthService.js";

export const createUserSchema = z.object({
  name: z.string({ required_error: "Informe o nome." }).trim().min(2, "Nome precisa ter pelo menos 2 caracteres.").max(120, "Nome muito longo."),
  email: z.string({ required_error: "Informe o e-mail." }).trim().email("Informe um e-mail válido.").max(180, "E-mail muito longo."),
  password: z.string({ required_error: "Informe a senha." }).min(8, "Senha precisa ter pelo menos 8 caracteres.").max(200, "Senha muito longa."),
  role: z.enum(["admin", "user"], { required_error: "Escolha o perfil.", invalid_type_error: "Perfil inválido." }),
  isActive: z.boolean().optional()
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2, "Nome precisa ter pelo menos 2 caracteres.").max(120, "Nome muito longo.").optional(),
  email: z.string().trim().email("Informe um e-mail válido.").max(180, "E-mail muito longo.").optional(),
  password: z.string().min(8, "Senha precisa ter pelo menos 8 caracteres.").max(200, "Senha muito longa.").optional(),
  role: z.enum(["admin", "user"], { invalid_type_error: "Perfil inválido." }).optional(),
  isActive: z.boolean().optional()
});

export const updateOwnPasswordSchema = z.object({
  password: z.string({ required_error: "Informe a senha." }).min(8, "Senha precisa ter pelo menos 8 caracteres.").max(200, "Senha muito longa.")
});

export class UserService {
  constructor(
    private users: UserRepository,
    private audits: AuditRepository,
    private auth: AuthService
  ) {}

  async create(input: z.infer<typeof createUserSchema>, actor: User, ipAddress?: string): Promise<PublicUser> {
    const data = createUserSchema.parse(input);
    const passwordHash = await this.auth.hashPassword(data.password);
    try {
      const user = await this.users.create({
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash,
        role: data.role,
        isActive: data.isActive ?? true
      });
      await this.audits.create({ actorId: actor.id, action: "user_created", entity: "user", entityId: user.id, ipAddress, metadata: { role: user.role } });
      return toPublicUser(user);
    } catch {
      throw new AppError(409, "Já existe um usuário com este e-mail.", "EMAIL_EXISTS");
    }
  }

  async list(): Promise<PublicUser[]> {
    return (await this.users.list()).map(toPublicUser);
  }

  async update(id: string, input: z.infer<typeof updateUserSchema>, actor: User, ipAddress?: string): Promise<PublicUser> {
    const data = updateUserSchema.parse(input);
    const existing = await this.users.findById(id);
    if (!existing) throw notFound();
    if (id === actor.id && ((data.role && data.role !== existing.role) || data.isActive === false)) {
      throw new AppError(400, "Você não pode remover seu próprio acesso de admin.", "SELF_ADMIN_CHANGE");
    }
    const passwordHash = data.password ? await this.auth.hashPassword(data.password) : undefined;
    try {
      const user = await this.users.update(id, {
        name: data.name,
        email: data.email?.toLowerCase(),
        passwordHash,
        role: data.role as Role | undefined,
        isActive: data.isActive
      });
      const action = data.role && data.role !== existing.role ? "role_changed" : data.isActive === false ? "user_deactivated" : "user_updated";
      await this.audits.create({ actorId: actor.id, action, entity: "user", entityId: id, ipAddress });
      return toPublicUser(user);
    } catch {
      throw new AppError(409, "Não foi possível atualizar este usuário.", "USER_UPDATE_FAILED");
    }
  }

  async updateOwnPassword(actor: User, input: z.infer<typeof updateOwnPasswordSchema>, ipAddress?: string): Promise<PublicUser> {
    const data = updateOwnPasswordSchema.parse(input);
    const passwordHash = await this.auth.hashPassword(data.password);
    const user = await this.users.update(actor.id, { passwordHash });
    await this.audits.create({ actorId: actor.id, action: "password_changed", entity: "user", entityId: actor.id, ipAddress });
    return toPublicUser(user);
  }

  async delete(id: string, actor: User, ipAddress?: string): Promise<void> {
    const existing = await this.users.findById(id);
    if (!existing) throw notFound();
    if (id === actor.id) {
      throw new AppError(400, "Você não pode excluir seu próprio perfil.", "SELF_DELETE");
    }
    await this.users.update(id, { isActive: false });
    await this.audits.create({ actorId: actor.id, action: "user_deleted", entity: "user", entityId: id, ipAddress });
  }
}
