"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { AuthUser, UNAUTHORIZED_EVENT, authApi } from "./api";

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
  // Replace the stored token too. Used after a password change: the server
  // revokes every older token and returns a fresh one for this device.
  setSession: (token: string, user: AuthUser) => void;
  // Why this tab was signed out by the server (shown on the login page).
  notice: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(
    () => typeof window !== "undefined" && !!window.localStorage.getItem(TOKEN_KEY)
  );
  const [notice, setNotice] = useState<string | null>(null);

  // Server-side revocation: any authenticated 401 drops the session here, and
  // the (app) layout's auth gate then sends the user to /login.
  useEffect(() => {
    function onRevoked() {
      window.localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
      setNotice("Your session has ended, for example because your password was changed or reset. Please log in again.");
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onRevoked);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onRevoked);
  }, []);

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
    setNotice(null);
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
    <AuthContext.Provider value={{ token, user, loading, login, register, logout, setUser, setSession: persist, notice }}>
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
