import { NextRequest } from "next/server";
import { getStore, hashToken, type SessionRecord, type UserRecord } from "./store";

export class HttpError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
  }
}

export function extractBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookieToken = req.cookies.get("ara_token")?.value;
  return cookieToken || null;
}

export function getOptionalAuth(req: NextRequest): { user: UserRecord; session: SessionRecord } | null {
  const token = extractBearerToken(req);
  if (!token) return null;

  const store = getStore();
  const tokenHash = hashToken(token);
  const session = store.sessions.get(tokenHash);
  if (!session || session.revoked_at !== null) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) return null;

  const user = store.users.get(session.user_id);
  if (!user || user.status === "DELETED") return null;
  if (user.status === "SUSPENDED") {
    throw new HttpError(403, "Your account has been suspended. Please contact support.");
  }
  return { user, session };
}

export function requireAuth(req: NextRequest): { user: UserRecord; session: SessionRecord } {
  const auth = getOptionalAuth(req);
  if (!auth) {
    throw new HttpError(401, "Not authenticated.");
  }
  return auth;
}

export function requireSuperAdmin(req: NextRequest): { user: UserRecord; session: SessionRecord } {
  const auth = requireAuth(req);
  if (auth.user.role !== "SUPER_ADMIN") {
    throw new HttpError(403, "Super admin access required.");
  }
  return auth;
}

export function getClientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || null;
  return req.headers.get("x-real-ip") || null;
}
