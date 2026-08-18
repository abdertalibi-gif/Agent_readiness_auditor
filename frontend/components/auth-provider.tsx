"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { toast } from "sonner";

import { api, getAnonymousAuditId } from "@/lib/api";
import {
  clearSession,
  getToken,
  persistSession,
  setAuthCookie,
  type LoginInput,
  type RegisterInput,
  type User,
} from "@/lib/auth";
import { normalizeLocale, translate } from "@/lib/i18n";

function currentLocale(): ReturnType<typeof normalizeLocale> {
  if (typeof window === "undefined") return normalizeLocale(undefined);
  return normalizeLocale(localStorage.getItem("ara_locale"));
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      const token = getToken();
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const me = await api.me();
        if (!cancelled) setUser(me);
        // Claim any anonymous audit created before logging in.
        if (!cancelled && getAnonymousAuditId()) {
          try {
            await api.claimAnonymousAudits();
          } catch {
            // Non-blocking
          }
        }
      } catch {
        // Token is invalid, expired or the API is down. Clearing the stale
        // session keeps the app on the login page instead of a dead end.
        clearSession();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const res = await api.login(input);
    persistSession(res.access_token, res.user);
    setAuthCookie(res.access_token);
    setUser(res.user);
    // Claim any anonymous audit created before logging in.
    if (getAnonymousAuditId()) {
      try {
        await api.claimAnonymousAudits();
      } catch {
        // Non-blocking - will be retried on next session restore
      }
    }
    return res.user;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const user = await api.register(input);
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // The session may already be invalid server-side; local state is cleared
      // either way.
    }
    clearSession();
    setUser(null);
    toast.success(translate(currentLocale(), "auth.loggedOut"));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}