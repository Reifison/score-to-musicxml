import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { api } from "../api/client";
import type { PublicUser } from "../api/types";

const tokenKey = "score_session_token";

type AuthContextValue = {
  user: PublicUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    SecureStore.getItemAsync(tokenKey)
      .then(async (storedToken) => {
        if (!storedToken) return;
        const response = await api.me(storedToken);
        if (!mounted) return;
        setToken(storedToken);
        setUser(response.user);
      })
      .catch(() => SecureStore.deleteItemAsync(tokenKey))
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.login(email.trim(), password);
    await SecureStore.setItemAsync(tokenKey, response.token);
    setToken(response.token);
    setUser(response.user);
  }, []);

  const logout = useCallback(async () => {
    const currentToken = token;
    setToken(null);
    setUser(null);
    await SecureStore.deleteItemAsync(tokenKey);
    if (currentToken) await api.logout(currentToken).catch(() => undefined);
  }, [token]);

  const value = useMemo(() => ({ user, token, loading, login, logout }), [user, token, loading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
