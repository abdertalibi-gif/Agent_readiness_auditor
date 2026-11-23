import crypto from "node:crypto";
import type {
  AdminAuditLog,
  AuditStatus,
  Category,
  Check,
  InvitationStatus,
  PageOut,
  PlatformRole,
  ProgressJson,
  Recommendation,
  ReviewStatus,
  WorkspaceRole,
} from "@/lib/types";

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  company_name: string | null;
  preferred_language: string | null;
  password_hash: string;
  role: PlatformRole;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  suspended_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface SessionRecord {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface ResetTokenRecord {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface WorkspaceMemberRecord {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
}

export interface InvitationRecord {
  id: string;
  workspace_id: string;
  inviter_id: string | null;
  email: string;
  role: WorkspaceRole;
  token: string;
  status: InvitationStatus;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
}

export interface WebsiteRecord {
  id: string;
  domain: string;
  base_url: string;
  owner_id: string | null;
  created_at: string;
}

export interface AuditSummaryCategory {
  category: Category;
  label: string;
  score: number;
  weight: number;
  status: string;
  checks_total: number;
  checks_passed: number;
  checks_failed: number;
  checks_warning: number;
}

export interface AuditSummaryJson {
  categories: AuditSummaryCategory[];
  counts: Record<string, number>;
  coverage: {
    pages?: number;
    sitemap_urls?: number;
    crawl_errors?: number;
    truncated?: boolean;
  };
  ai_summary: string | null;
  rating_label: string;
  platform: string;
}

export interface AuditRecord {
  id: string;
  website_id: string | null;
  user_id: string | null;
  target_url: string;
  max_pages: number | null;
  status: AuditStatus;
  score: number | null;
  rating: string | null;
  error_message: string | null;
  failed_step: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  progress_json: ProgressJson | null;
  summary_json: AuditSummaryJson | null;
  _pipeline_step?: string;
}

export interface ReviewRecord {
  id: string;
  user_id: string;
  audit_id: string;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  created_at: string;
  updated_at: string;
}

export interface FeedbackRecord {
  id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppStore {
  users: Map<string, UserRecord>;
  sessions: Map<string, SessionRecord>;
  resetTokens: Map<string, ResetTokenRecord>;
  workspaces: Map<string, WorkspaceRecord>;
  workspaceMembers: Map<string, WorkspaceMemberRecord>;
  invitations: Map<string, InvitationRecord>;
  websites: Map<string, WebsiteRecord>;
  audits: Map<string, AuditRecord>;
  pagesByAudit: Map<string, PageOut[]>;
  checksByAudit: Map<string, Check[]>;
  recsByAudit: Map<string, Recommendation[]>;
  reviews: Map<string, ReviewRecord>;
  feedbackByUser: Map<string, FeedbackRecord>;
  auditLogs: AdminAuditLog[];
  nextAuditLogId: number;
  nextPageId: number;
  nextCheckId: number;
  nextRecId: number;
}

declare global {
  var __ara_store__: AppStore | undefined;
}

export function getStore(): AppStore {
  if (!globalThis.__ara_store__) {
    globalThis.__ara_store__ = {
      users: new Map(),
      sessions: new Map(),
      resetTokens: new Map(),
      workspaces: new Map(),
      workspaceMembers: new Map(),
      invitations: new Map(),
      websites: new Map(),
      audits: new Map(),
      pagesByAudit: new Map(),
      checksByAudit: new Map(),
      recsByAudit: new Map(),
      reviews: new Map(),
      feedbackByUser: new Map(),
      auditLogs: [],
      nextAuditLogId: 1,
      nextPageId: 1,
      nextCheckId: 1,
      nextRecId: 1,
    };
  }
  return globalThis.__ara_store__;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function toPublicUser(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    company_name: user.company_name,
    preferred_language: user.preferred_language,
    role: user.role,
    status: user.status,
    created_at: user.created_at,
  };
}

export function recordAdminLog(params: {
  action: string;
  actor: UserRecord | null;
  target_user_id?: string | null;
  target_workspace_id?: string | null;
  data?: Record<string, unknown> | null;
  ip_address?: string | null;
}): void {
  const store = getStore();
  store.auditLogs.unshift({
    id: store.nextAuditLogId++,
    actor_id: params.actor?.id ?? null,
    actor_email: params.actor?.email ?? null,
    action: params.action,
    target_user_id: params.target_user_id ?? null,
    target_workspace_id: params.target_workspace_id ?? null,
    data: params.data ?? null,
    ip_address: params.ip_address ?? null,
    created_at: nowIso(),
  });
}

export function getOrCreatePersonalWorkspace(user: UserRecord): WorkspaceRecord {
  const store = getStore();
  for (const member of store.workspaceMembers.values()) {
    if (member.user_id === user.id && member.role === "OWNER") {
      const ws = store.workspaces.get(member.workspace_id);
      if (ws) return ws;
    }
  }
  for (const ws of store.workspaces.values()) {
    if (ws.owner_id === user.id) return ws;
  }

  const wsId = crypto.randomUUID();
  const ws: WorkspaceRecord = {
    id: wsId,
    name: user.company_name || `${user.name || user.email.split("@")[0]}'s Workspace`,
    owner_id: user.id,
    created_at: nowIso(),
  };
  store.workspaces.set(wsId, ws);

  const memberId = crypto.randomUUID();
  store.workspaceMembers.set(memberId, {
    id: memberId,
    workspace_id: wsId,
    user_id: user.id,
    role: "OWNER",
    created_at: nowIso(),
  });
  return ws;
}

export function acceptPendingInvitationsForEmail(user: UserRecord): void {
  const store = getStore();
  const email = user.email.toLowerCase().trim();
  const now = Date.now();
  for (const inv of store.invitations.values()) {
    if (inv.email.toLowerCase() !== email || inv.status !== "PENDING") continue;
    if (new Date(inv.expires_at).getTime() <= now) {
      inv.status = "EXPIRED";
      continue;
    }
    const alreadyMember = Array.from(store.workspaceMembers.values()).some(
      (m) => m.workspace_id === inv.workspace_id && m.user_id === user.id
    );
    if (!alreadyMember) {
      const mId = crypto.randomUUID();
      store.workspaceMembers.set(mId, {
        id: mId,
        workspace_id: inv.workspace_id,
        user_id: user.id,
        role: inv.role,
        created_at: nowIso(),
      });
    }
    inv.status = "ACCEPTED";
    inv.accepted_at = nowIso();
  }
}
