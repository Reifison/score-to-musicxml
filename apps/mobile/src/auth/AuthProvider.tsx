import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { ApiError, api } from "../api/client";
import type { PublicUser } from "../api/types";
import { clearPlayerSessionSnapshots } from "../player/sessionSnapshot";

const tokenKey = "score_session_token";
type SavedSession = { token: string; user: PublicUser };

function readSavedSession(value: string): { token: string; user?: PublicUser } {
  // Earlier builds stored just the token.
  if (!value.startsWith("{")) return { token: value };
  const session = JSON.parse(value) as Partial<SavedSession>;
  if (!session.token || !session.user?.id) throw new Error("Invalid saved session");
  return { token: session.token, user: session.user };
}

type AuthContextValue = {
  user: PublicUser | null;
  token: string | null;
  loading: boolean;
  restoreError: boolean;
  retrySession: () => Promise<boolean>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoreError, setRestoreError] = useState(false);
  const mountedRef = useRef(false);
  const restoreSequence = useRef(0);
  const tokenWrites = useRef<Promise<void>>(Promise.resolve());

  const queueTokenWrite = useCallback((write: () => Promise<void>) => {
    const operation = tokenWrites.current.catch(() => undefined).then(write);
    tokenWrites.current = operation.catch(() => undefined);
    return operation;
  }, []);

  const retrySession = useCallback(async (): Promise<boolean> => {
    const sequence = ++restoreSequence.current;
    const isCurrent = () => mountedRef.current && restoreSequence.current === sequence;
    let restoredLocally = false;
    setLoading(true);
    try {
      const storedValue = await SecureStore.getItemAsync(tokenKey);
      if (!isCurrent()) return false;
      if (!storedValue) {
        setToken(null);
        setUser(null);
        setRestoreError(false);
        return false;
      }
      const { token: storedToken, user: storedUser } = readSavedSession(storedValue);
      if (storedUser) {
        restoredLocally = true;
        setToken(storedToken);
        setUser(storedUser);
        setRestoreError(false);
        setLoading(false);
      }
      const response = await api.me(storedToken);
      if (!isCurrent()) return false;
      setToken(storedToken);
      setUser(response.user);
      setRestoreError(false);
      const savedValue = JSON.stringify({ token: storedToken, user: response.user });
      if (savedValue !== storedValue) {
        await queueTokenWrite(async () => {
          if (isCurrent()) await SecureStore.setItemAsync(tokenKey, savedValue);
        }).catch(() => undefined);
      }
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      if (error instanceof ApiError && error.status === 401) {
        setToken(null);
        setUser(null);
        await queueTokenWrite(async () => {
          if (isCurrent()) await SecureStore.deleteItemAsync(tokenKey);
        }).catch(() => undefined);
        if (isCurrent()) setRestoreError(false);
      } else if (!restoredLocally) {
        setRestoreError(true);
      }
      return false;
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [queueTokenWrite]);

  useEffect(() => {
    mountedRef.current = true;
    void retrySession();
    return () => {
      mountedRef.current = false;
      restoreSequence.current += 1;
    };
  }, [retrySession]);

  const login = useCallback(async (email: string, password: string) => {
    const sequence = ++restoreSequence.current;
    setLoading(false);
    const response = await api.login(email.trim(), password);
    const isCurrent = () => mountedRef.current && restoreSequence.current === sequence;
    if (!isCurrent()) throw new Error("A operação de login foi cancelada.");
    await queueTokenWrite(async () => {
      if (isCurrent()) await SecureStore.setItemAsync(tokenKey, JSON.stringify(response));
    });
    if (!isCurrent()) throw new Error("A operação de login foi cancelada.");
    setToken(response.token);
    setUser(response.user);
    setRestoreError(false);
  }, [queueTokenWrite]);

  const logout = useCallback(async () => {
    restoreSequence.current += 1;
    setLoading(false);
    const currentToken = token;
    const clearReadingSession = clearPlayerSessionSnapshots(user?.id).catch(() => undefined);
    setToken(null);
    setUser(null);
    setRestoreError(false);
    await Promise.all([queueTokenWrite(() => SecureStore.deleteItemAsync(tokenKey)), clearReadingSession]);
    if (currentToken) await api.logout(currentToken).catch(() => undefined);
  }, [queueTokenWrite, token, user?.id]);

  const value = useMemo(() => ({ user, token, loading, restoreError, retrySession, login, logout }), [user, token, loading, restoreError, retrySession, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
