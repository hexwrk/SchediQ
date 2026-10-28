"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { AuthUser, authApi } from "./api";

const TOKEN_KEY = "schediq_token";

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  // Replace the cached user after a server-side change (e.g. tier upgrade) so
  // the badge and gated UI update without a reload.
  setUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(
    () => typeof window !== "undefined" && !!window.localStorage.getItem(TOKEN_KEY)
  );

  useEffect(() => {
    const stored = window.localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      return;
    }

    authApi
      .me(stored)
      .then(({ user }) => {
        setToken(stored);
        setUser(user);
      })
      .catch(() => {
        window.localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setLoading(false));
  }, []);

  function persist(token: string, user: AuthUser) {
    window.localStorage.setItem(TOKEN_KEY, token);
    setToken(token);
    setUser(user);
  }

  async function login(email: string, password: string) {
    const res = await authApi.login(email, password);
    persist(res.token, res.user);
  }

  async function register(email: string, password: string, name: string) {
    const res = await authApi.register(email, password, name);
    persist(res.token, res.user);
  }

  function logout() {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ token, user, loading, login, register, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
