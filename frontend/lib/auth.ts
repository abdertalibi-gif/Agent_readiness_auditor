"use client";

export interface User {
  id: string;
  email: string;
  name: string | null;
  company_name: string | null;
  preferred_language?: string | null;
  role: string | null;
  status: string | null;
  created_at: string;
}

/**
 * Compatibility shape kept for the demo team/settings pages that still read
 * a workspace-style session. Built from the real authenticated user.
 */
export interface Session {
  user: { name: string; email: string; role: string };
  orgName: string;
  orgId: string;
  workspaces: { id: string; name: string }[];
}

export interface AuthState {
  user: User | null;
  loading: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  company_name?: string;
  preferred_language?: "en" | "fr" | "ar" | "es";
}

export interface LoginInput {
  email: string;
  password: string;
}

const TOKEN_KEY = "ara_auth_token";
const USER_KEY = "ara_user";
export const AUTH_COOKIE = "ara_token";
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const TOKEN_KEY_META = "ara_auth_token_expiry";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const expiry = Number(localStorage.getItem(TOKEN_KEY_META) ?? 0);
  if (expiry && Date.now() > expiry) {
    clearSession();
    return null;
  }
  return localStorage.getItem(TOKEN_KEY);
}

function getStoredExpiry(): number {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(TOKEN_KEY_META) ?? 0);
}

export function getCachedUser(): User | null {
  if (typeof window === "undefined") return null;
  if (!getStoredExpiry() || Date.now() > getStoredExpiry()) {
    clearSession();
    return null;
  }
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function persistSession(token: string, user: User) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(TOKEN_KEY_META, String(Date.now() + TOKEN_TTL_SECONDS * 1000));
}

export function setAuthCookie(token: string) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${AUTH_COOKIE}=${token}; Path=/; Max-Age=${TOKEN_TTL_SECONDS}; SameSite=Lax${secure}`;
}

export function clearAuthCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${AUTH_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY_META);
  localStorage.removeItem(USER_KEY);
  clearAuthCookie();
}

export function getSession(): Session | null {
  const user = getCachedUser();
  if (!user) return null;
  const name = user.name || user.email.split("@")[0];
  const orgName = user.company_name || "My Workspace";
  return {
    user: { name, email: user.email, role: "OWNER" },
    orgName,
    orgId: `org_${user.id}`,
    workspaces: [{ id: `org_${user.id}`, name: orgName }],
  };
}