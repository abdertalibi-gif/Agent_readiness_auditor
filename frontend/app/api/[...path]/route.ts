import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cancelAudit, createAudit, serializeAudit } from "@/lib/server/audit-runner";
import {
  getClientIp,
  getOptionalAuth,
  HttpError,
  requireAuth,
  requireSuperAdmin,
} from "@/lib/server/auth";
import { generateReportPdf } from "@/lib/server/pdf";
import { SecurityError } from "@/lib/server/security";
import { CATEGORY_LABELS } from "@/lib/server/scoring";
import {
  acceptPendingInvitationsForEmail,
  generateToken,
  getOrCreatePersonalWorkspace,
  getStore,
  hashPassword,
  hashToken,
  nowIso,
  recordAdminLog,
  toPublicUser,
  verifyPassword,
  type AuditRecord,
  type InvitationRecord,
  type ReviewRecord,
  type UserRecord,
  type WorkspaceMemberRecord,
  type WorkspaceRecord,
} from "@/lib/server/store";
import type {
  AdminAuditLog,
  AdminFeedback,
  AdminInvitation,
  AdminReviewOut,
  AdminUser,
  AdminWorkspaceMember,
  Invitation,
  MyReviewOut,
  PlatformRole,
  PublicReviewOut,
  ReviewStatus,
  WorkspaceMember,
  WorkspaceRole,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_WORKSPACE_ROLES = new Set<WorkspaceRole>(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);
const VALID_PLATFORM_ROLES = new Set<PlatformRole>(["SUPER_ADMIN", "OWNER", "ADMIN", "MEMBER"]);
const VALID_REVIEW_STATUSES = new Set<ReviewStatus>(["PENDING", "APPROVED", "HIDDEN"]);
const MANAGER_ROLES = new Set<WorkspaceRole>(["OWNER", "ADMIN"]);
const REVIEWABLE_AUDIT_STATUSES = new Set(["COMPLETED", "PARTIAL"]);
const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

const TAG_RE = /<[^>]*>/g;
const UNSAFE_RE = /(javascript:|vbscript:|on[a-z]+\s*=)/gi;
const CONTROL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

function sanitizeComment(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let text = value.replace(CONTROL_RE, "");
  text = text.replace(TAG_RE, " ");
  text = text.replace(UNSAFE_RE, "");
  text = text.replace(/[<>]/g, " ");
  text = text.split(/\s+/).filter(Boolean).join(" ").trim();
  if (!text) return null;
  return text.slice(0, 1000);
}

function isMonetizationEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MONETIZATION_ENABLED === "true";
}

function jsonError(status: number, detail: string) {
  return NextResponse.json({ detail }, { status });
}

async function readJsonBody(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    throw new HttpError(400, "Invalid JSON request body.");
  }
}

function requireString(body: Record<string, unknown>, key: string, label?: string): string {
  const val = body[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new HttpError(422, `${label ?? key} is required.`);
  }
  return val.trim();
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function serializeMember(m: WorkspaceMemberRecord): WorkspaceMember {
  const store = getStore();
  const user = store.users.get(m.user_id);
  return {
    id: m.id,
    user_id: m.user_id,
    name: user?.name ?? null,
    email: user?.email ?? null,
    role: m.role,
    created_at: m.created_at,
  };
}

function serializeInvitation(inv: InvitationRecord, emailSent = false): Invitation {
  const store = getStore();
  const inviter = inv.inviter_id ? store.users.get(inv.inviter_id) : undefined;
  return {
    id: inv.id,
    email: inv.email,
    role: inv.role,
    inviter_id: inv.inviter_id,
    inviter_name: inviter?.name ?? null,
    status: inv.status,
    created_at: inv.created_at,
    expires_at: inv.expires_at,
    accepted_at: inv.accepted_at,
    rejected_at: inv.rejected_at,
    cancelled_at: inv.cancelled_at,
    email_sent: emailSent,
  };
}

function serializeAdminUser(user: UserRecord): AdminUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    company_name: user.company_name,
    role: user.role,
    status: user.status,
    suspended_at: user.suspended_at,
    deleted_at: user.deleted_at,
    created_at: user.created_at,
  };
}

function serializeAdminInvitation(inv: InvitationRecord): AdminInvitation {
  return {
    id: inv.id,
    workspace_id: inv.workspace_id,
    email: inv.email,
    role: inv.role,
    status: inv.status,
    created_at: inv.created_at,
    expires_at: inv.expires_at,
  };
}

function serializeMyReview(review: ReviewRecord): MyReviewOut {
  const store = getStore();
  const audit = store.audits.get(review.audit_id);
  return {
    id: review.id,
    audit_id: review.audit_id,
    audit_url: audit?.target_url ?? null,
    rating: review.rating,
    comment: review.comment,
    status: review.status,
    created_at: review.created_at,
    updated_at: review.updated_at,
  };
}

function serializePublicReview(review: ReviewRecord): PublicReviewOut {
  const store = getStore();
  const user = store.users.get(review.user_id);
  const audit = store.audits.get(review.audit_id);
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    user_name: user?.name ?? null,
    audit_url: audit?.target_url ?? null,
    created_at: review.created_at,
  };
}

function serializeAdminReview(review: ReviewRecord): AdminReviewOut {
  const store = getStore();
  const user = store.users.get(review.user_id);
  const audit = store.audits.get(review.audit_id);
  return {
    id: review.id,
    user_id: review.user_id,
    user_name: user?.name ?? null,
    user_email: user?.email ?? null,
    audit_id: review.audit_id,
    audit_url: audit?.target_url ?? null,
    rating: review.rating,
    comment: review.comment,
    status: review.status,
    created_at: review.created_at,
    updated_at: review.updated_at,
  };
}

function findUserByEmail(email: string): UserRecord | undefined {
  const normalized = normalizeEmail(email);
  for (const user of getStore().users.values()) {
    if (user.email === normalized) return user;
  }
  return undefined;
}

function revokeUserSessions(userId: string): void {
  const now = nowIso();
  for (const session of getStore().sessions.values()) {
    if (session.user_id === userId && session.revoked_at === null) {
      session.revoked_at = now;
    }
  }
}

function getAuditOrAnonymous(req: NextRequest, auditId: string): AuditRecord {
  const store = getStore();
  const audit = store.audits.get(auditId);
  if (!audit) {
    throw new HttpError(404, "Audit not found.");
  }

  const auth = getOptionalAuth(req);
  if (auth) {
    if (audit.user_id !== null && audit.user_id !== auth.user.id) {
      throw new HttpError(403, "You do not have access to this audit.");
    }
    if (audit.user_id === null && isMonetizationEnabled()) {
      throw new HttpError(403, "You do not have access to this audit.");
    }
    return audit;
  }

  if (!isMonetizationEnabled() && audit.user_id === null) {
    return audit;
  }

  throw new HttpError(401, "Not authenticated.");
}

function resolveWorkspace(user: UserRecord, workspaceId: string | null): WorkspaceRecord {
  const store = getStore();
  if (!workspaceId) {
    return getOrCreatePersonalWorkspace(user);
  }
  const member = Array.from(store.workspaceMembers.values()).find(
    (m) => m.workspace_id === workspaceId && m.user_id === user.id
  );
  const ws = store.workspaces.get(workspaceId);
  if (!member || !ws) {
    throw new HttpError(404, "Workspace not found.");
  }
  return ws;
}

function requireWorkspaceManager(workspaceId: string, userId: string): WorkspaceMemberRecord {
  const store = getStore();
  const member = Array.from(store.workspaceMembers.values()).find(
    (m) => m.workspace_id === workspaceId && m.user_id === userId
  );
  if (!member || !MANAGER_ROLES.has(member.role)) {
    throw new HttpError(403, "You do not have permission to manage this workspace.");
  }
  return member;
}

function findInvitationByToken(token: string): InvitationRecord | undefined {
  const store = getStore();
  for (const inv of store.invitations.values()) {
    if (inv.token === token) {
      if (inv.status === "PENDING" && new Date(inv.expires_at).getTime() <= Date.now()) {
        inv.status = "EXPIRED";
      }
      return inv;
    }
  }
  return undefined;
}

async function handleRequest(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await context.params;
  const method = req.method.toUpperCase();
  const segments = path ?? [];
  const store = getStore();

  try {
    // ---------- Health ----------
    if (segments.length === 1 && segments[0] === "health" && method === "GET") {
      return NextResponse.json({
        status: "ok",
        mode: "standalone-nextjs",
        timestamp: nowIso(),
      });
    }

    // ---------- Auth ----------
    if (segments[0] === "auth") {
      if (segments.length === 2 && segments[1] === "register" && method === "POST") {
        const body = await readJsonBody(req);
        const name = requireString(body, "name", "Name");
        const email = normalizeEmail(requireString(body, "email", "Email"));
        const password = typeof body.password === "string" ? body.password : "";
        if (!isValidEmail(email)) {
          throw new HttpError(422, "Please enter a valid email address.");
        }
        if (password.length < 8) {
          throw new HttpError(422, "Password must be at least 8 characters long.");
        }
        if (findUserByEmail(email)) {
          throw new HttpError(409, "An account with this email already exists.");
        }

        const companyRaw = typeof body.company_name === "string" ? body.company_name.trim() : "";
        const langRaw = typeof body.preferred_language === "string" ? body.preferred_language : "en";
        const preferredLanguage = ["en", "fr", "ar", "es"].includes(langRaw) ? langRaw : "en";

        const user: UserRecord = {
          id: crypto.randomUUID(),
          email,
          name,
          company_name: companyRaw || null,
          preferred_language: preferredLanguage,
          password_hash: hashPassword(password),
          role: "OWNER",
          status: "ACTIVE",
          suspended_at: null,
          deleted_at: null,
          created_at: nowIso(),
        };
        store.users.set(user.id, user);
        getOrCreatePersonalWorkspace(user);
        acceptPendingInvitationsForEmail(user);

        return NextResponse.json(toPublicUser(user), { status: 201 });
      }

      if (segments.length === 2 && segments[1] === "login" && method === "POST") {
        const body = await readJsonBody(req);
        const email = normalizeEmail(requireString(body, "email", "Email"));
        const password = typeof body.password === "string" ? body.password : "";
        const user = findUserByEmail(email);

        if (!user || !verifyPassword(password, user.password_hash)) {
          throw new HttpError(401, "Invalid email or password.");
        }
        if (user.status === "SUSPENDED") {
          throw new HttpError(403, "Your account has been suspended. Please contact support.");
        }
        if (user.status === "DELETED") {
          throw new HttpError(401, "Invalid email or password.");
        }

        const token = generateToken(32);
        const tokenHash = hashToken(token);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        store.sessions.set(tokenHash, {
          id: crypto.randomUUID(),
          user_id: user.id,
          token_hash: tokenHash,
          expires_at: expiresAt,
          revoked_at: null,
          created_at: nowIso(),
        });

        return NextResponse.json({
          access_token: token,
          token_type: "bearer",
          user: toPublicUser(user),
        });
      }

      if (segments.length === 2 && segments[1] === "logout" && method === "POST") {
        const { session } = requireAuth(req);
        session.revoked_at = nowIso();
        return new NextResponse(null, { status: 204 });
      }

      if (segments.length === 2 && segments[1] === "me" && method === "GET") {
        const { user } = requireAuth(req);
        return NextResponse.json(toPublicUser(user));
      }

      if (segments.length === 2 && segments[1] === "me" && method === "PATCH") {
        const { user } = requireAuth(req);
        const body = await readJsonBody(req);
        if (typeof body.preferred_language === "string") {
          const lang = body.preferred_language.trim();
          if (!["en", "fr", "ar", "es"].includes(lang)) {
            throw new HttpError(422, "Unsupported language.");
          }
          user.preferred_language = lang;
        }
        return NextResponse.json(toPublicUser(user));
      }

      if (segments.length === 2 && segments[1] === "forgot-password" && method === "POST") {
        const body = await readJsonBody(req);
        const email = normalizeEmail(requireString(body, "email", "Email"));
        const user = findUserByEmail(email);
        if (user && user.status === "ACTIVE") {
          const now = nowIso();
          for (const rt of store.resetTokens.values()) {
            if (rt.user_id === user.id && rt.used_at === null) {
              rt.used_at = now;
            }
          }
          const token = generateToken(32);
          const tokenHash = hashToken(token);
          store.resetTokens.set(tokenHash, {
            id: crypto.randomUUID(),
            user_id: user.id,
            token_hash: tokenHash,
            expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            used_at: null,
            created_at: now,
          });
        }
        return NextResponse.json({
          detail: "If an account exists with this email, a reset link has been sent.",
        });
      }

      if (segments.length === 2 && segments[1] === "reset-password" && method === "POST") {
        const body = await readJsonBody(req);
        const token = requireString(body, "token", "Reset token");
        const newPassword = typeof body.new_password === "string" ? body.new_password : "";
        if (newPassword.length < 8) {
          throw new HttpError(422, "Password must be at least 8 characters long.");
        }
        const rt = store.resetTokens.get(hashToken(token));
        if (!rt || rt.used_at !== null || new Date(rt.expires_at).getTime() <= Date.now()) {
          throw new HttpError(400, "This reset link is invalid or has expired.");
        }
        const user = store.users.get(rt.user_id);
        if (!user) {
          throw new HttpError(400, "This reset link is invalid or has expired.");
        }
        user.password_hash = hashPassword(newPassword);
        rt.used_at = nowIso();
        revokeUserSessions(user.id);
        return NextResponse.json({ detail: "Your password has been reset successfully." });
      }
    }

    // ---------- Audits ----------
    if (segments[0] === "audits") {
      if (segments.length === 1 && method === "POST") {
        const auth = getOptionalAuth(req);
        if (isMonetizationEnabled() && !auth) {
          throw new HttpError(401, "Authentication required.");
        }
        const body = await readJsonBody(req);
        const rawUrl = requireString(body, "url", "URL");
        const maxPages =
          typeof body.max_pages === "number" && Number.isFinite(body.max_pages)
            ? body.max_pages
            : null;
        try {
          const audit = createAudit(auth?.user.id ?? null, rawUrl, maxPages);
          return NextResponse.json(serializeAudit(audit), { status: 201 });
        } catch (err) {
          if (err instanceof SecurityError || err instanceof Error) {
            throw new HttpError(422, err.message);
          }
          throw err;
        }
      }

      if (segments.length === 1 && method === "GET") {
        const { user } = requireAuth(req);
        const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 50)));
        const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset") ?? 0));
        const items = Array.from(store.audits.values())
          .filter((a) => a.user_id === user.id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(offset, offset + limit)
          .map(serializeAudit);
        return NextResponse.json(items);
      }

      if (segments.length === 2 && segments[1] === "claim-anonymous" && method === "POST") {
        const { user } = requireAuth(req);
        const anonId = req.headers.get("x-anonymous-audit-id");
        let claimed = 0;
        if (anonId) {
          const audit = store.audits.get(anonId);
          if (audit && audit.user_id === null) {
            audit.user_id = user.id;
            if (audit.website_id) {
              const site = store.websites.get(audit.website_id);
              if (site && site.owner_id === null) {
                site.owner_id = user.id;
              }
            }
            claimed = 1;
          }
        }
        return NextResponse.json({ claimed });
      }

      if (segments.length >= 2) {
        const auditId = segments[1];
        const audit = getAuditOrAnonymous(req, auditId);

        if (segments.length === 2 && method === "GET") {
          return NextResponse.json(serializeAudit(audit));
        }

        if (segments.length === 3 && segments[2] === "status" && method === "GET") {
          return NextResponse.json(serializeAudit(audit), {
            headers: { "Cache-Control": "private, max-age=3" },
          });
        }

        if (segments.length === 3 && segments[2] === "summary" && method === "GET") {
          const summary = audit.summary_json;
          const categories = (summary?.categories ?? []).map((cat) => ({
            category: cat.category,
            label: CATEGORY_LABELS[cat.category] ?? cat.label ?? cat.category,
            score: cat.score,
            weight: cat.weight,
            status: cat.status,
            checks_total: cat.checks_total,
            checks_passed: cat.checks_passed,
            checks_failed: cat.checks_failed,
            checks_warning: cat.checks_warning,
          }));
          const ratingLabel =
            summary?.rating_label ??
            (audit.rating ? audit.rating.charAt(0).toUpperCase() + audit.rating.slice(1) : null);

          return NextResponse.json(
            {
              id: audit.id,
              target_url: audit.target_url,
              status: audit.status,
              score: audit.score,
              rating: audit.rating,
              rating_label: ratingLabel,
              overall_status: audit.rating,
              categories,
              counts: summary?.counts ?? {},
              ai_summary: summary?.ai_summary ?? null,
              coverage: summary?.coverage ?? {},
              platform: summary?.platform ?? null,
              created_at: audit.created_at,
              completed_at: audit.completed_at,
            },
            { headers: { "Cache-Control": "private, max-age=5" } }
          );
        }

        if (segments.length === 3 && segments[2] === "issues" && method === "GET") {
          const statusFilter = req.nextUrl.searchParams.get("status")?.toUpperCase();
          const severityFilter = req.nextUrl.searchParams.get("severity")?.toUpperCase();
          let items = [...(store.checksByAudit.get(audit.id) ?? [])];
          if (statusFilter) items = items.filter((c) => c.status === statusFilter);
          if (severityFilter) items = items.filter((c) => c.severity === severityFilter);
          items.sort(
            (a, b) =>
              (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) || a.id - b.id
          );
          return NextResponse.json({ total: items.length, items });
        }

        if (segments.length === 3 && segments[2] === "pages" && method === "GET") {
          const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 100)));
          const pages = (store.pagesByAudit.get(audit.id) ?? []).slice(0, limit);
          return NextResponse.json(pages);
        }

        if (segments.length === 3 && segments[2] === "recommendations" && method === "GET") {
          const recs = [...(store.recsByAudit.get(audit.id) ?? [])].sort(
            (a, b) => a.priority.localeCompare(b.priority) || a.id - b.id
          );
          return NextResponse.json(recs);
        }

        if (segments.length === 3 && segments[2] === "report" && method === "GET") {
          if (audit.status !== "COMPLETED" && audit.status !== "PARTIAL" && audit.status !== "FAILED") {
            throw new HttpError(409, "Report is not available until the audit finishes.");
          }
          const lang = req.nextUrl.searchParams.get("lang") || "en";
          const checks = store.checksByAudit.get(audit.id) ?? [];
          const recs = store.recsByAudit.get(audit.id) ?? [];
          const pages = store.pagesByAudit.get(audit.id) ?? [];
          const pdfBytes = await generateReportPdf(audit, checks, recs, pages);

          return new NextResponse(Buffer.from(pdfBytes), {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `attachment; filename="agent-readiness-report-${audit.id.slice(0, 8)}-${lang}.pdf"`,
              "Cache-Control": "private, max-age=3600",
            },
          });
        }

        if (segments.length === 3 && segments[2] === "cancel" && method === "POST") {
          const cancelled = cancelAudit(audit.id);
          if (!cancelled) throw new HttpError(404, "Audit not found.");
          return NextResponse.json(serializeAudit(cancelled));
        }
      }
    }

    // ---------- Team ----------
    if (segments[0] === "team") {
      const { user } = requireAuth(req);
      const workspaceIdParam = req.nextUrl.searchParams.get("workspace_id");
      const workspace = resolveWorkspace(user, workspaceIdParam);

      if (segments.length === 1 && method === "GET") {
        const members = Array.from(store.workspaceMembers.values())
          .filter((m) => m.workspace_id === workspace.id)
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map(serializeMember);
        const invitations = Array.from(store.invitations.values())
          .filter((i) => i.workspace_id === workspace.id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((i) => serializeInvitation(i, true));
        return NextResponse.json({
          workspace_id: workspace.id,
          workspace_name: workspace.name,
          members,
          invitations,
        });
      }

      if (segments.length === 2 && segments[1] === "invitations" && method === "GET") {
        const invitations = Array.from(store.invitations.values())
          .filter((i) => i.workspace_id === workspace.id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((i) => serializeInvitation(i, true));
        return NextResponse.json(invitations);
      }

      if (segments.length === 2 && segments[1] === "invitations" && method === "POST") {
        requireWorkspaceManager(workspace.id, user.id);
        const body = await readJsonBody(req);
        const email = normalizeEmail(requireString(body, "email", "Email"));
        if (!isValidEmail(email)) {
          throw new HttpError(422, "Please enter a valid email address.");
        }
        const roleRaw = requireString(body, "role", "Role").toUpperCase() as WorkspaceRole;
        if (!VALID_WORKSPACE_ROLES.has(roleRaw)) {
          throw new HttpError(400, "Invalid role.");
        }

        const invitee = findUserByEmail(email);
        if (invitee) {
          const alreadyMember = Array.from(store.workspaceMembers.values()).some(
            (m) => m.workspace_id === workspace.id && m.user_id === invitee.id
          );
          if (alreadyMember) {
            throw new HttpError(409, "This user is already a member of the workspace.");
          }
        }

        const pendingExists = Array.from(store.invitations.values()).some(
          (i) => i.workspace_id === workspace.id && i.email === email && i.status === "PENDING"
        );
        if (pendingExists) {
          throw new HttpError(409, "An invitation to this email is already pending.");
        }

        const inv: InvitationRecord = {
          id: crypto.randomUUID(),
          workspace_id: workspace.id,
          inviter_id: user.id,
          email,
          role: roleRaw,
          token: generateToken(32),
          status: "PENDING",
          created_at: nowIso(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          accepted_at: null,
          rejected_at: null,
          cancelled_at: null,
        };
        store.invitations.set(inv.id, inv);
        return NextResponse.json(serializeInvitation(inv, false), { status: 201 });
      }

      if (
        segments.length === 4 &&
        segments[1] === "invitations" &&
        segments[3] === "resend" &&
        method === "POST"
      ) {
        requireWorkspaceManager(workspace.id, user.id);
        const inv = store.invitations.get(segments[2]);
        if (!inv || inv.workspace_id !== workspace.id) {
          throw new HttpError(404, "Invitation not found.");
        }
        if (inv.status !== "PENDING") {
          throw new HttpError(400, "Only pending invitations can be resent.");
        }
        inv.token = generateToken(32);
        inv.expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        return NextResponse.json(serializeInvitation(inv, false));
      }

      if (segments.length === 3 && segments[1] === "invitations" && method === "DELETE") {
        requireWorkspaceManager(workspace.id, user.id);
        const inv = store.invitations.get(segments[2]);
        if (!inv || inv.workspace_id !== workspace.id) {
          throw new HttpError(404, "Invitation not found.");
        }
        if (inv.status !== "PENDING") {
          throw new HttpError(400, "Only pending invitations can be cancelled.");
        }
        inv.status = "CANCELLED";
        inv.cancelled_at = nowIso();
        return new NextResponse(null, { status: 204 });
      }

      if (segments.length === 3 && segments[1] === "members" && method === "PATCH") {
        requireWorkspaceManager(workspace.id, user.id);
        const member = store.workspaceMembers.get(segments[2]);
        if (!member || member.workspace_id !== workspace.id) {
          throw new HttpError(404, "Member not found.");
        }
        if (member.role === "OWNER") {
          throw new HttpError(400, "The workspace owner's role cannot be changed.");
        }
        const body = await readJsonBody(req);
        const role = requireString(body, "role", "Role").toUpperCase() as WorkspaceRole;
        if (!VALID_WORKSPACE_ROLES.has(role)) {
          throw new HttpError(400, "Invalid role.");
        }
        member.role = role;
        return NextResponse.json(serializeMember(member));
      }

      if (segments.length === 3 && segments[1] === "members" && method === "DELETE") {
        requireWorkspaceManager(workspace.id, user.id);
        const member = store.workspaceMembers.get(segments[2]);
        if (!member || member.workspace_id !== workspace.id) {
          throw new HttpError(404, "Member not found.");
        }
        if (member.role === "OWNER") {
          throw new HttpError(400, "The workspace owner cannot be removed.");
        }
        store.workspaceMembers.delete(member.id);
        return new NextResponse(null, { status: 204 });
      }
    }

    // ---------- Public Invitations ----------
    if (segments[0] === "invitations" && segments.length >= 2) {
      const token = decodeURIComponent(segments[1]);
      const inv = findInvitationByToken(token);

      if (segments.length === 2 && method === "GET") {
        if (!inv) {
          throw new HttpError(404, "This invitation link is invalid or has expired.");
        }
        const ws = store.workspaces.get(inv.workspace_id);
        if (!ws) {
          throw new HttpError(404, "This invitation link is invalid or has expired.");
        }
        const inviter = inv.inviter_id ? store.users.get(inv.inviter_id) : undefined;
        return NextResponse.json({
          workspace_id: ws.id,
          workspace_name: ws.name,
          inviter_name: inviter?.name ?? null,
          email: inv.email,
          role: inv.role,
          status: inv.status,
          expires_at: inv.expires_at,
        });
      }

      if (segments.length === 3 && segments[2] === "accept" && method === "POST") {
        const auth = getOptionalAuth(req);
        if (!inv) {
          throw new HttpError(400, "This invitation link is invalid or has already been used.");
        }
        const ws = store.workspaces.get(inv.workspace_id);
        if (!ws) {
          throw new HttpError(400, "This invitation link is invalid or has already been used.");
        }
        if (auth && normalizeEmail(auth.user.email) !== normalizeEmail(inv.email)) {
          throw new HttpError(403, "You are not the recipient of this invitation.");
        }
        if (inv.status !== "PENDING") {
          return NextResponse.json({ ok: false, reason: inv.status.toLowerCase() });
        }
        const invitee = findUserByEmail(inv.email);
        if (!invitee) {
          return NextResponse.json({
            ok: false,
            needs_registration: true,
            email: inv.email,
            workspace_id: ws.id,
            workspace_name: ws.name,
            role: inv.role,
          });
        }
        const existingMember = Array.from(store.workspaceMembers.values()).some(
          (m) => m.workspace_id === ws.id && m.user_id === invitee.id
        );
        if (!existingMember) {
          const mId = crypto.randomUUID();
          store.workspaceMembers.set(mId, {
            id: mId,
            workspace_id: ws.id,
            user_id: invitee.id,
            role: inv.role,
            created_at: nowIso(),
          });
        }
        inv.status = "ACCEPTED";
        inv.accepted_at = nowIso();
        return NextResponse.json({
          ok: true,
          workspace_id: ws.id,
          workspace_name: ws.name,
          role: inv.role,
        });
      }

      if (segments.length === 3 && segments[2] === "reject" && method === "POST") {
        const auth = getOptionalAuth(req);
        if (!inv) {
          throw new HttpError(400, "This invitation link is invalid or has already been used.");
        }
        const ws = store.workspaces.get(inv.workspace_id);
        if (!ws) {
          throw new HttpError(400, "This invitation link is invalid or has already been used.");
        }
        if (auth && normalizeEmail(auth.user.email) !== normalizeEmail(inv.email)) {
          throw new HttpError(403, "You are not the recipient of this invitation.");
        }
        if (inv.status !== "PENDING") {
          return NextResponse.json({ ok: false, reason: inv.status.toLowerCase() });
        }
        inv.status = "REJECTED";
        inv.rejected_at = nowIso();
        return NextResponse.json({ ok: true, workspace_name: ws.name });
      }
    }

    // ---------- Reviews ----------
    if (segments[0] === "reviews") {
      if (segments.length === 1 && method === "POST") {
        const { user } = requireAuth(req);
        const body = await readJsonBody(req);
        const auditId = requireString(body, "audit_id", "Audit ID");
        const rating = Number(body.rating);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
          throw new HttpError(422, "Rating must be between 1 and 5.");
        }
        const audit = store.audits.get(auditId);
        if (!audit) throw new HttpError(404, "Audit not found.");
        if (audit.user_id !== user.id) {
          throw new HttpError(403, "You do not have access to this audit.");
        }
        if (!REVIEWABLE_AUDIT_STATUSES.has(audit.status)) {
          throw new HttpError(400, "You can only review an audit after it has completed.");
        }
        const duplicate = Array.from(store.reviews.values()).some(
          (r) => r.user_id === user.id && r.audit_id === audit.id
        );
        if (duplicate) {
          throw new HttpError(409, "You have already reviewed this audit.");
        }
        const now = nowIso();
        const review: ReviewRecord = {
          id: crypto.randomUUID(),
          user_id: user.id,
          audit_id: audit.id,
          rating,
          comment: sanitizeComment(body.comment),
          status: "PENDING",
          created_at: now,
          updated_at: now,
        };
        store.reviews.set(review.id, review);
        return NextResponse.json(serializeMyReview(review), { status: 201 });
      }

      if (segments.length === 1 && method === "GET") {
        const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 20)));
        const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset") ?? 0));
        const approved = Array.from(store.reviews.values())
          .filter((r) => r.status === "APPROVED")
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        return NextResponse.json({
          total: approved.length,
          items: approved.slice(offset, offset + limit).map(serializePublicReview),
        });
      }

      if (segments.length === 2 && segments[1] === "stats" && method === "GET") {
        const approved = Array.from(store.reviews.values()).filter((r) => r.status === "APPROVED");
        const ratingCounts: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
        let weighted = 0;
        for (const r of approved) {
          ratingCounts[String(r.rating)] = (ratingCounts[String(r.rating)] ?? 0) + 1;
          weighted += r.rating;
        }
        return NextResponse.json({
          average_rating: approved.length > 0 ? Math.round((weighted / approved.length) * 100) / 100 : null,
          total_reviews: approved.length,
          rating_counts: ratingCounts,
        });
      }

      if (segments.length === 2 && segments[1] === "my" && method === "GET") {
        const { user } = requireAuth(req);
        const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 20)));
        const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset") ?? 0));
        const mine = Array.from(store.reviews.values())
          .filter((r) => r.user_id === user.id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        return NextResponse.json({
          total: mine.length,
          items: mine.slice(offset, offset + limit).map(serializeMyReview),
        });
      }

      if (segments.length === 2) {
        const { user } = requireAuth(req);
        const review = store.reviews.get(segments[1]);
        if (!review || review.user_id !== user.id) {
          throw new HttpError(404, "Review not found.");
        }

        if (method === "GET") {
          return NextResponse.json(serializeMyReview(review));
        }
        if (method === "PATCH") {
          const body = await readJsonBody(req);
          if (body.rating === undefined && body.comment === undefined) {
            throw new HttpError(400, "Nothing to update.");
          }
          if (body.rating !== undefined) {
            const rating = Number(body.rating);
            if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
              throw new HttpError(422, "Rating must be between 1 and 5.");
            }
            review.rating = rating;
          }
          if (body.comment !== undefined) {
            review.comment = sanitizeComment(body.comment);
          }
          review.updated_at = nowIso();
          return NextResponse.json(serializeMyReview(review));
        }
        if (method === "DELETE") {
          store.reviews.delete(review.id);
          return new NextResponse(null, { status: 204 });
        }
      }
    }

    // ---------- Feedback ----------
    if (segments[0] === "feedback") {
      if (segments.length === 2 && segments[1] === "me" && method === "GET") {
        const { user } = requireAuth(req);
        const fb = store.feedbackByUser.get(user.id);
        if (!fb) {
          return NextResponse.json({ has_feedback: false, rating: null, comment: null });
        }
        return NextResponse.json({
          has_feedback: true,
          rating: fb.rating,
          comment: fb.comment,
          created_at: fb.created_at,
          updated_at: fb.updated_at,
        });
      }

      if (segments.length === 1 && method === "POST") {
        const { user } = requireAuth(req);
        const body = await readJsonBody(req);
        const rating = Number(body.rating);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
          throw new HttpError(422, "Rating must be between 1 and 5.");
        }
        const comment = sanitizeComment(body.comment);
        const existing = store.feedbackByUser.get(user.id);
        const now = nowIso();
        if (existing) {
          existing.rating = rating;
          existing.comment = comment;
          existing.updated_at = now;
          return NextResponse.json({
            has_feedback: true,
            rating: existing.rating,
            comment: existing.comment,
            created_at: existing.created_at,
            updated_at: existing.updated_at,
          });
        }
        const fb = {
          id: crypto.randomUUID(),
          user_id: user.id,
          rating,
          comment,
          created_at: now,
          updated_at: now,
        };
        store.feedbackByUser.set(user.id, fb);
        return NextResponse.json({
          has_feedback: true,
          rating: fb.rating,
          comment: fb.comment,
          created_at: fb.created_at,
          updated_at: fb.updated_at,
        });
      }

      if (segments.length === 2 && segments[1] === "me" && method === "DELETE") {
        const { user } = requireAuth(req);
        store.feedbackByUser.delete(user.id);
        return new NextResponse(null, { status: 204 });
      }

      if (segments.length === 2 && segments[1] === "stats" && method === "GET") {
        requireSuperAdmin(req);
        const all = Array.from(store.feedbackByUser.values());
        const total = all.length;
        if (total === 0) {
          return NextResponse.json({
            total_ratings: 0,
            average_rating: null,
            five_star_percentage: 0,
            four_star_percentage: 0,
            three_star_percentage: 0,
            two_star_percentage: 0,
            one_star_percentage: 0,
            satisfaction_rate: 0,
          });
        }
        const counts = [0, 0, 0, 0, 0, 0];
        let sum = 0;
        let satisfied = 0;
        for (const f of all) {
          counts[f.rating] = (counts[f.rating] ?? 0) + 1;
          sum += f.rating;
          if (f.rating >= 4) satisfied += 1;
        }
        const pct = (n: number) => Math.round((n / total) * 100);
        return NextResponse.json({
          total_ratings: total,
          average_rating: Math.round((sum / total) * 100) / 100,
          five_star_percentage: pct(counts[5]),
          four_star_percentage: pct(counts[4]),
          three_star_percentage: pct(counts[3]),
          two_star_percentage: pct(counts[2]),
          one_star_percentage: pct(counts[1]),
          satisfaction_rate: pct(satisfied),
        });
      }

      if (segments.length === 1 && method === "GET") {
        requireSuperAdmin(req);
        const ratingParam = req.nextUrl.searchParams.get("rating");
        const searchParam = req.nextUrl.searchParams.get("search")?.trim().toLowerCase();
        const sortParam = req.nextUrl.searchParams.get("sort") || "newest";
        if (!["newest", "highest", "lowest"].includes(sortParam)) {
          throw new HttpError(400, "Invalid sort. Use newest | highest | lowest.");
        }
        const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 100)));
        const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset") ?? 0));

        let rows = Array.from(store.feedbackByUser.values());
        if (ratingParam) {
          const r = Number(ratingParam);
          if (r >= 1 && r <= 5) rows = rows.filter((f) => f.rating === r);
        }
        if (searchParam) {
          rows = rows.filter((f) => {
            const u = store.users.get(f.user_id);
            const email = u?.email.toLowerCase() ?? "";
            const name = u?.name?.toLowerCase() ?? "";
            return email.includes(searchParam) || name.includes(searchParam);
          });
        }
        rows.sort((a, b) => {
          if (sortParam === "highest") {
            return b.rating - a.rating || b.created_at.localeCompare(a.created_at);
          }
          if (sortParam === "lowest") {
            return a.rating - b.rating || b.created_at.localeCompare(a.created_at);
          }
          return b.created_at.localeCompare(a.created_at);
        });

        const items: AdminFeedback[] = rows.slice(offset, offset + limit).map((f) => {
          const u = store.users.get(f.user_id);
          return {
            id: f.id,
            user_id: f.user_id,
            user_name: u?.name ?? null,
            user_email: u?.email ?? null,
            rating: f.rating,
            comment: f.comment,
            created_at: f.created_at,
            updated_at: f.updated_at,
          };
        });
        return NextResponse.json({ total: rows.length, items });
      }
    }

    // ---------- Super Admin ----------
    if (segments[0] === "admin") {
      const { user: actor } = requireSuperAdmin(req);
      const ip = getClientIp(req);

      if (segments.length === 2 && segments[1] === "dashboard" && method === "GET") {
        const users = Array.from(store.users.values());
        return NextResponse.json({
          total_users: users.length,
          active_users: users.filter((u) => u.status === "ACTIVE").length,
          suspended_users: users.filter((u) => u.status === "SUSPENDED").length,
          deleted_users: users.filter((u) => u.status === "DELETED").length,
          total_workspaces: store.workspaces.size,
          total_audit_entries: store.auditLogs.length,
          recent_registrations: [...users]
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 8)
            .map(serializeAdminUser),
          recent_actions: store.auditLogs.slice(0, 10),
        });
      }

      if (segments[1] === "users") {
        if (segments.length === 2 && method === "GET") {
          const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase();
          const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 100)));
          const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset") ?? 0));
          const all = Array.from(store.users.values()).sort((a, b) =>
            b.created_at.localeCompare(a.created_at)
          );
          const filtered = q
            ? all.filter(
                (u) =>
                  u.email.toLowerCase().includes(q) || (u.name ?? "").toLowerCase().includes(q)
              )
            : all;
          return NextResponse.json({
            total: all.length,
            items: filtered.slice(offset, offset + limit).map(serializeAdminUser),
          });
        }

        if (segments.length >= 3) {
          const target = store.users.get(segments[2]);
          if (!target) throw new HttpError(404, "User not found.");

          if (segments.length === 3 && method === "GET") {
            return NextResponse.json(serializeAdminUser(target));
          }

          if (segments.length === 4 && segments[3] === "suspend" && method === "PATCH") {
            if (actor.id === target.id) {
              throw new HttpError(400, "You cannot suspend your own account.");
            }
            if (target.status === "SUSPENDED") {
              throw new HttpError(409, "This account is already suspended.");
            }
            target.status = "SUSPENDED";
            target.suspended_at = nowIso();
            revokeUserSessions(target.id);
            recordAdminLog({
              action: "user.suspend",
              actor,
              target_user_id: target.id,
              data: { email: target.email, status: "SUSPENDED" },
              ip_address: ip,
            });
            return NextResponse.json(serializeAdminUser(target));
          }

          if (segments.length === 4 && segments[3] === "unsuspend" && method === "PATCH") {
            if (target.status !== "SUSPENDED") {
              throw new HttpError(409, "This account is not currently suspended.");
            }
            target.status = "ACTIVE";
            target.suspended_at = null;
            recordAdminLog({
              action: "user.unsuspend",
              actor,
              target_user_id: target.id,
              data: { email: target.email, status: "ACTIVE" },
              ip_address: ip,
            });
            return NextResponse.json(serializeAdminUser(target));
          }

          if (segments.length === 3 && method === "DELETE") {
            if (actor.id === target.id) {
              throw new HttpError(400, "You cannot delete your own account.");
            }
            if (target.status === "DELETED") {
              throw new HttpError(409, "This account is already deleted.");
            }
            target.status = "DELETED";
            target.deleted_at = nowIso();
            revokeUserSessions(target.id);
            recordAdminLog({
              action: "user.delete",
              actor,
              target_user_id: target.id,
              data: { email: target.email, status: "DELETED" },
              ip_address: ip,
            });
            return NextResponse.json(serializeAdminUser(target));
          }

          if (segments.length === 4 && segments[3] === "restore" && method === "POST") {
            if (target.status !== "DELETED") {
              throw new HttpError(409, "Only deleted accounts can be restored.");
            }
            target.status = "ACTIVE";
            target.deleted_at = null;
            target.suspended_at = null;
            recordAdminLog({
              action: "user.restore",
              actor,
              target_user_id: target.id,
              data: { email: target.email, status: "ACTIVE" },
              ip_address: ip,
            });
            return NextResponse.json(serializeAdminUser(target));
          }

          if (segments.length === 4 && segments[3] === "role" && method === "PATCH") {
            const body = await readJsonBody(req);
            const role = requireString(body, "role", "Role").toUpperCase() as PlatformRole;
            if (!VALID_PLATFORM_ROLES.has(role)) {
              throw new HttpError(400, "Invalid user role.");
            }
            if (actor.id === target.id && role !== "SUPER_ADMIN") {
              throw new HttpError(400, "You cannot demote your own account.");
            }
            const oldRole = target.role;
            target.role = role;
            recordAdminLog({
              action: "user.role",
              actor,
              target_user_id: target.id,
              data: { old_role: oldRole, new_role: role, email: target.email },
              ip_address: ip,
            });
            return NextResponse.json(serializeAdminUser(target));
          }
        }
      }

      if (segments[1] === "workspaces") {
        if (segments.length === 2 && method === "GET") {
          const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 100)));
          const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset") ?? 0));
          const all = Array.from(store.workspaces.values()).sort((a, b) =>
            b.created_at.localeCompare(a.created_at)
          );
          const items = all.slice(offset, offset + limit).map((w) => ({
            id: w.id,
            name: w.name,
            created_at: w.created_at,
            member_count: Array.from(store.workspaceMembers.values()).filter(
              (m) => m.workspace_id === w.id
            ).length,
          }));
          return NextResponse.json({ total: all.length, items });
        }

        if (segments.length >= 4 && segments[3] === "members") {
          const ws = store.workspaces.get(segments[2]);
          if (!ws) throw new HttpError(404, "Workspace not found.");

          if (segments.length === 4 && method === "GET") {
            const members: AdminWorkspaceMember[] = Array.from(store.workspaceMembers.values())
              .filter((m) => m.workspace_id === ws.id)
              .sort((a, b) => a.created_at.localeCompare(b.created_at))
              .map((m) => {
                const u = store.users.get(m.user_id);
                return {
                  id: m.id,
                  workspace_id: m.workspace_id,
                  user_id: m.user_id,
                  user_name: u?.name ?? null,
                  user_email: u?.email ?? null,
                  role: m.role,
                  created_at: m.created_at,
                };
              });
            return NextResponse.json(members);
          }

          if (segments.length === 6 && segments[5] === "role" && method === "PATCH") {
            const member = store.workspaceMembers.get(segments[4]);
            if (!member || member.workspace_id !== ws.id) {
              throw new HttpError(404, "Workspace member not found.");
            }
            const body = await readJsonBody(req);
            const role = requireString(body, "role", "Role").toUpperCase() as WorkspaceRole;
            if (!VALID_WORKSPACE_ROLES.has(role)) {
              throw new HttpError(400, "Invalid workspace role.");
            }
            const oldRole = member.role;
            member.role = role;
            recordAdminLog({
              action: "workspace.member.role",
              actor,
              target_user_id: member.user_id,
              target_workspace_id: ws.id,
              data: { member_id: member.id, old_role: oldRole, new_role: role },
              ip_address: ip,
            });
            const u = store.users.get(member.user_id);
            return NextResponse.json({
              id: member.id,
              workspace_id: member.workspace_id,
              user_id: member.user_id,
              user_name: u?.name ?? null,
              user_email: u?.email ?? null,
              role: member.role,
              created_at: member.created_at,
            });
          }

          if (segments.length === 5 && method === "DELETE") {
            const member = store.workspaceMembers.get(segments[4]);
            if (!member || member.workspace_id !== ws.id) {
              throw new HttpError(404, "Workspace member not found.");
            }
            if (member.role === "OWNER") {
              throw new HttpError(400, "The workspace owner cannot be removed.");
            }
            store.workspaceMembers.delete(member.id);
            recordAdminLog({
              action: "workspace.member.remove",
              actor,
              target_user_id: member.user_id,
              target_workspace_id: ws.id,
              data: { member_id: member.id, role: member.role },
              ip_address: ip,
            });
            return new NextResponse(null, { status: 204 });
          }
        }
      }

      if (segments[1] === "invitations") {
        if (segments.length === 2 && method === "GET") {
          const pending = Array.from(store.invitations.values())
            .filter((i) => i.status === "PENDING")
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          return NextResponse.json({
            total: pending.length,
            items: pending.map(serializeAdminInvitation),
          });
        }

        if (segments.length >= 3) {
          const inv = store.invitations.get(segments[2]);
          if (!inv) throw new HttpError(404, "Invitation not found.");

          if (segments.length === 3 && method === "DELETE") {
            if (inv.status !== "PENDING") {
              throw new HttpError(409, "Only pending invitations can be cancelled.");
            }
            inv.status = "CANCELLED";
            inv.cancelled_at = nowIso();
            recordAdminLog({
              action: "invitation.cancel",
              actor,
              target_workspace_id: inv.workspace_id,
              data: { invitation_id: inv.id, email: inv.email },
              ip_address: ip,
            });
            return NextResponse.json(serializeAdminInvitation(inv));
          }

          if (segments.length === 4 && segments[3] === "accept" && method === "POST") {
            if (inv.status !== "PENDING") {
              throw new HttpError(409, "Only pending invitations can be accepted.");
            }
            const invitee = findUserByEmail(inv.email);
            if (!invitee) {
              throw new HttpError(409, "The invitee has no account yet; they must register first.");
            }
            const already = Array.from(store.workspaceMembers.values()).some(
              (m) => m.workspace_id === inv.workspace_id && m.user_id === invitee.id
            );
            if (!already) {
              const mId = crypto.randomUUID();
              store.workspaceMembers.set(mId, {
                id: mId,
                workspace_id: inv.workspace_id,
                user_id: invitee.id,
                role: inv.role,
                created_at: nowIso(),
              });
            }
            inv.status = "ACCEPTED";
            inv.accepted_at = nowIso();
            recordAdminLog({
              action: "invitation.accept",
              actor,
              target_user_id: invitee.id,
              target_workspace_id: inv.workspace_id,
              data: { invitation_id: inv.id, email: inv.email, role: inv.role },
              ip_address: ip,
            });
            return NextResponse.json(serializeAdminInvitation(inv));
          }

          if (segments.length === 3 && method === "PATCH") {
            if (inv.status !== "PENDING") {
              throw new HttpError(409, "Only pending invitations can be modified.");
            }
            const body = await readJsonBody(req);
            if (typeof body.role === "string") {
              const role = body.role.toUpperCase() as WorkspaceRole;
              if (!VALID_WORKSPACE_ROLES.has(role)) {
                throw new HttpError(400, "Invalid role.");
              }
              inv.role = role;
            }
            if (typeof body.email === "string" && body.email.trim()) {
              const newEmail = normalizeEmail(body.email);
              if (!isValidEmail(newEmail)) {
                throw new HttpError(422, "Please enter a valid email address.");
              }
              inv.email = newEmail;
            }
            inv.token = generateToken(32);
            inv.expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            recordAdminLog({
              action: "invitation.update",
              actor,
              target_workspace_id: inv.workspace_id,
              data: { invitation_id: inv.id, email: inv.email, role: inv.role },
              ip_address: ip,
            });
            return NextResponse.json(serializeAdminInvitation(inv));
          }
        }
      }

      if (segments[1] === "reviews") {
        if (segments.length === 2 && method === "GET") {
          const statusParam = req.nextUrl.searchParams.get("status")?.toUpperCase() as
            | ReviewStatus
            | undefined;
          const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 100)));
          const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset") ?? 0));
          let rows = Array.from(store.reviews.values()).sort((a, b) =>
            b.created_at.localeCompare(a.created_at)
          );
          if (statusParam && VALID_REVIEW_STATUSES.has(statusParam)) {
            rows = rows.filter((r) => r.status === statusParam);
          }
          return NextResponse.json({
            total: rows.length,
            items: rows.slice(offset, offset + limit).map(serializeAdminReview),
          });
        }

        if (segments.length >= 3) {
          const review = store.reviews.get(segments[2]);
          if (!review) throw new HttpError(404, "Review not found.");

          if (segments.length === 3 && method === "GET") {
            return NextResponse.json(serializeAdminReview(review));
          }

          if (segments.length === 4 && segments[3] === "approve" && method === "PATCH") {
            review.status = "APPROVED";
            review.updated_at = nowIso();
            recordAdminLog({
              action: "review.approve",
              actor,
              target_user_id: review.user_id,
              data: { review_id: review.id, rating: review.rating, status: review.status },
              ip_address: ip,
            });
            return NextResponse.json(serializeAdminReview(review));
          }

          if (segments.length === 4 && segments[3] === "hide" && method === "PATCH") {
            review.status = "HIDDEN";
            review.updated_at = nowIso();
            recordAdminLog({
              action: "review.hide",
              actor,
              target_user_id: review.user_id,
              data: { review_id: review.id, rating: review.rating, status: review.status },
              ip_address: ip,
            });
            return NextResponse.json(serializeAdminReview(review));
          }

          if (segments.length === 3 && method === "DELETE") {
            store.reviews.delete(review.id);
            recordAdminLog({
              action: "review.delete",
              actor,
              target_user_id: review.user_id,
              data: { review_id: review.id, rating: review.rating, status: review.status },
              ip_address: ip,
            });
            return new NextResponse(null, { status: 204 });
          }
        }
      }

      if (segments.length === 2 && segments[1] === "audit-logs" && method === "GET") {
        const actionFilter = req.nextUrl.searchParams.get("action")?.trim();
        const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 100)));
        const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset") ?? 0));
        const filtered: AdminAuditLog[] = actionFilter
          ? store.auditLogs.filter((l) => l.action === actionFilter)
          : store.auditLogs;
        return NextResponse.json({
          total: store.auditLogs.length,
          items: filtered.slice(offset, offset + limit),
        });
      }
    }

    return jsonError(404, `Route not found: ${method} /api/${segments.join("/")}`);
  } catch (err) {
    if (err instanceof HttpError) {
      return jsonError(err.status, err.message);
    }
    if (err instanceof SecurityError) {
      return jsonError(422, err.message);
    }
    console.error("[api] unexpected error:", err);
    return jsonError(500, "The server encountered an error. Please try again.");
  }
}

export async function GET(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleRequest(req, context);
}

export async function POST(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleRequest(req, context);
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleRequest(req, context);
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleRequest(req, context);
}
