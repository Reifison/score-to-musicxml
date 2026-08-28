import * as SecureStore from "expo-secure-store";
import { useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
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
    // Cached score data belongs to the previous account. Clear it before this
    // token becomes available so no screen can render another user's content.
    await queryClient.cancelQueries();
    queryClient.clear();
    await SecureStore.setItemAsync(tokenKey, response.token);
    setToken(response.token);
    setUser(response.user);
  }, [queryClient]);

  const logout = useCallback(async () => {
    const currentToken = token;
    // Clear all account-scoped queries before changing auth state. This is
    // intentionally broader than invalidation because score details and player
    // data must never survive a user switch in memory.
    await queryClient.cancelQueries();
    queryClient.clear();
    setToken(null);
    setUser(null);
    await SecureStore.deleteItemAsync(tokenKey);
    if (currentToken) await api.logout(currentToken).catch(() => undefined);
  }, [queryClient, token]);

  const value = useMemo(() => ({ user, token, loading, login, logout }), [user, token, loading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
