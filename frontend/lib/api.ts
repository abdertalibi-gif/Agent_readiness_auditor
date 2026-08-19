import type {
  AdminAuditLogList,
  AdminDashboard,
  AdminFeedbackList,
  AdminInvitation,
  AdminInvitationList,
  AdminReviewListOut,
  AdminReviewOut,
  AdminUser,
  AdminUserList,
  AdminWorkspaceList,
  AdminWorkspaceMember,
  AuditOut,
  AuditSummary,
  FeedbackMe,
  FeedbackStats,
  Invitation,
  InvitationAcceptResult,
  InvitationInfo,
  InvitationRejectResult,
  IssuesOut,
  MyReviewListOut,
  MyReviewOut,
  PageOut,
  PublicReviewListOut,
  Recommendation,
  ReviewStatsOut,
  Team,
  WorkspaceMember,
  WorkspaceRole,
} from "@/lib/types";
import type { LoginInput, RegisterInput, TokenResponse, User } from "@/lib/auth";
import { clearSession, getToken } from "@/lib/auth";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

const REQUEST_TIMEOUT_MS = 30_000;

export const CONNECTION_ERROR_MESSAGE =
  "Unable to connect to the server. Please make sure the backend is running.";

function isConnectionError(err: unknown): boolean {
  // AbortError = our timeout fired. TypeError = fetch network failure
  // (connection refused / DNS failure / ERR_CONNECTION_TIMED_OUT).
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    err instanceof TypeError
  );
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const anonId = getAnonymousAuditId();
  if (anonId) headers["x-anonymous-audit-id"] = anonId;
  return headers;
}

// Persist the most recent anonymous audit id (client-side only) so it can be
// claimed after the visitor creates a free account.
const ANON_AUDIT_KEY = "ara_anonymous_audit_id";

export function getAnonymousAuditId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ANON_AUDIT_KEY);
  } catch {
    return null;
  }
}

export function setAnonymousAuditId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ANON_AUDIT_KEY, id);
  } catch {
    // ignore storage failures
  }
}

export function clearAnonymousAuditId(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ANON_AUDIT_KEY);
  } catch {
    // ignore storage failures
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...(init?.headers ?? {}),
      },
    });

    if (!res.ok) {
      // Expired/invalid sessions are cleared and sent to the login page. Auth
      // endpoints (login/me) are excluded so they can surface their own errors.
      if (res.status === 401 && !path.startsWith("/auth/")) {
        clearSession();
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
          window.location.assign("/login");
        }
      }
      let detail = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        if (typeof body?.detail === "string") detail = body.detail;
      } catch {
        // keep default message
      }
      // A suspended account must be clearly told why and signed out so they are
      // not left half-logged-in.
      if (
        res.status === 403 &&
        detail.toLowerCase().includes("suspended") &&
        !path.startsWith("/auth/")
      ) {
        clearSession();
        if (
          typeof window !== "undefined" &&
          !window.location.pathname.includes("/admin") &&
          !window.location.pathname.startsWith("/login")
        ) {
          window.location.assign("/login?suspended=1");
        }
      }
      throw new ApiError(res.status, detail);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (err) {
    if (isConnectionError(err)) {
      throw new ApiError(0, CONNECTION_ERROR_MESSAGE);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  // ---------- Auth ----------
  register(input: RegisterInput): Promise<User> {
    return request<User>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  login(input: LoginInput): Promise<TokenResponse> {
    return request<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  logout(): Promise<void> {
    return request<void>("/auth/logout", { method: "POST" });
  },

  me(): Promise<User> {
    return request<User>("/auth/me");
  },

  forgotPassword(email: string): Promise<{ detail: string }> {
    return request<{ detail: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  resetPassword(token: string, new_password: string): Promise<{ detail: string }> {
    return request<{ detail: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password }),
    });
  },

  updatePreferences(prefs: { preferred_language: string }): Promise<User> {
    return request<User>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify(prefs),
    });
  },

  // ---------- Audits ----------
  createAudit(url: string, maxPages?: number): Promise<AuditOut> {
    return request<AuditOut>("/audits", {
      method: "POST",
      body: JSON.stringify(maxPages ? { url, max_pages: maxPages } : { url }),
    }).then((audit) => {
      // If there's no auth token, remember this audit so it can be claimed later.
      if (!getToken()) setAnonymousAuditId(audit.id);
      return audit;
    });
  },

  listAudits(): Promise<AuditOut[]> {
    return request<AuditOut[]>("/audits");
  },

  getAudit(id: string): Promise<AuditOut> {
    return request<AuditOut>(`/audits/${id}`);
  },

  getStatus(id: string): Promise<AuditOut> {
    return request<AuditOut>(`/audits/${id}/status`);
  },

  getSummary(id: string): Promise<AuditSummary> {
    return request<AuditSummary>(`/audits/${id}/summary`);
  },

  getIssues(id: string, filters?: { status?: string; severity?: string }): Promise<IssuesOut> {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.severity) params.set("severity", filters.severity);
    const qs = params.toString();
    return request<IssuesOut>(`/audits/${id}/issues${qs ? `?${qs}` : ""}`);
  },

  getPages(id: string): Promise<PageOut[]> {
    return request<PageOut[]>(`/audits/${id}/pages`);
  },

  getRecommendations(id: string): Promise<Recommendation[]> {
    return request<Recommendation[]>(`/audits/${id}/recommendations`);
  },

  cancel(id: string): Promise<AuditOut> {
    return request<AuditOut>(`/audits/${id}/cancel`, { method: "POST" });
  },

  claimAnonymousAudits(): Promise<{ claimed: number }> {
    return request<{ claimed: number }>("/audits/claim-anonymous", { method: "POST" }).then(
      (res) => {
        if (res.claimed > 0) clearAnonymousAuditId();
        return res;
      }
    );
  },

  // ---------- Team & invitations ----------
  getTeam(): Promise<Team> {
    return request<Team>("/team");
  },

  inviteMember(email: string, role: WorkspaceRole): Promise<Invitation> {
    return request<Invitation>("/team/invitations", {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
  },

  resendInvitation(id: string): Promise<Invitation> {
    return request<Invitation>(`/team/invitations/${id}/resend`, { method: "POST" });
  },

  cancelInvitation(id: string): Promise<void> {
    return request<void>(`/team/invitations/${id}`, { method: "DELETE" });
  },

  changeMemberRole(id: string, role: WorkspaceRole): Promise<WorkspaceMember> {
    return request<WorkspaceMember>(`/team/members/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  },

  removeMember(id: string): Promise<void> {
    return request<void>(`/team/members/${id}`, { method: "DELETE" });
  },

  getInvitation(token: string): Promise<InvitationInfo> {
    return request<InvitationInfo>(`/invitations/${encodeURIComponent(token)}`);
  },

  acceptInvitation(token: string): Promise<InvitationAcceptResult> {
    return request<InvitationAcceptResult>(`/invitations/${encodeURIComponent(token)}/accept`, {
      method: "POST",
    });
  },

  rejectInvitation(token: string): Promise<InvitationRejectResult> {
    return request<InvitationRejectResult>(`/invitations/${encodeURIComponent(token)}/reject`, {
      method: "POST",
    });
  },

  // ---------- Super admin ----------
  adminDashboard(): Promise<AdminDashboard> {
    return request<AdminDashboard>("/admin/dashboard");
  },

  adminUsers(q?: string): Promise<AdminUserList> {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const qs = params.toString();
    return request<AdminUserList>(`/admin/users${qs ? `?${qs}` : ""}`);
  },

  adminUser(id: string): Promise<AdminUser> {
    return request<AdminUser>(`/admin/users/${id}`);
  },

  suspendUser(id: string): Promise<AdminUser> {
    return request<AdminUser>(`/admin/users/${id}/suspend`, { method: "PATCH" });
  },

  unsuspendUser(id: string): Promise<AdminUser> {
    return request<AdminUser>(`/admin/users/${id}/unsuspend`, { method: "PATCH" });
  },

  deleteUser(id: string): Promise<AdminUser> {
    return request<AdminUser>(`/admin/users/${id}`, { method: "DELETE" });
  },

  restoreUser(id: string): Promise<AdminUser> {
    return request<AdminUser>(`/admin/users/${id}/restore`, { method: "POST" });
  },

  adminChangeUserRole(id: string, role: string): Promise<AdminUser> {
    return request<AdminUser>(`/admin/users/${id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  },

  adminWorkspaces(): Promise<AdminWorkspaceList> {
    return request<AdminWorkspaceList>("/admin/workspaces");
  },

  adminWorkspaceMembers(workspaceId: string): Promise<AdminWorkspaceMember[]> {
    return request<AdminWorkspaceMember[]>(`/admin/workspaces/${workspaceId}/members`);
  },

  adminWorkspaceMemberRole(workspaceId: string, memberId: string, role: string): Promise<AdminWorkspaceMember> {
    return request<AdminWorkspaceMember>(`/admin/workspaces/${workspaceId}/members/${memberId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  },

  adminRemoveWorkspaceMember(workspaceId: string, memberId: string): Promise<void> {
    return request<void>(`/admin/workspaces/${workspaceId}/members/${memberId}`, { method: "DELETE" });
  },

  adminInvitations(): Promise<AdminInvitationList> {
    return request<AdminInvitationList>("/admin/invitations");
  },

  adminCancelInvitation(id: string): Promise<AdminInvitation> {
    return request<AdminInvitation>(`/admin/invitations/${id}`, { method: "DELETE" });
  },

  adminAcceptInvitation(id: string): Promise<AdminInvitation> {
    return request<AdminInvitation>(`/admin/invitations/${id}/accept`, { method: "POST" });
  },

  adminUpdateInvitation(id: string, payload: { role?: string; email?: string }): Promise<AdminInvitation> {
    return request<AdminInvitation>(`/admin/invitations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  adminAuditLogs(action?: string): Promise<AdminAuditLogList> {
    const params = new URLSearchParams();
    if (action) params.set("action", action);
    const qs = params.toString();
    return request<AdminAuditLogList>(`/admin/audit-logs${qs ? `?${qs}` : ""}`);
  },

  // ---------- Reviews ----------
  createReview(payload: { audit_id: string; rating: number; comment?: string | null }): Promise<MyReviewOut> {
    return request<MyReviewOut>("/reviews", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateReview(id: string, payload: { rating?: number; comment?: string | null }): Promise<MyReviewOut> {
    return request<MyReviewOut>(`/reviews/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  deleteReview(id: string): Promise<void> {
    return request<void>(`/reviews/${id}`, { method: "DELETE" });
  },

  listPublicReviews(limit = 20, offset = 0): Promise<PublicReviewListOut> {
    return request<PublicReviewListOut>(`/reviews?limit=${limit}&offset=${offset}`);
  },

  listMyReviews(limit = 20, offset = 0): Promise<MyReviewListOut> {
    return request<MyReviewListOut>(`/reviews/my?limit=${limit}&offset=${offset}`);
  },

  reviewStats(): Promise<ReviewStatsOut> {
    return request<ReviewStatsOut>("/reviews/stats");
  },

  adminReviews(status?: string): Promise<AdminReviewListOut> {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const qs = params.toString();
    return request<AdminReviewListOut>(`/admin/reviews${qs ? `?${qs}` : ""}`);
  },

  adminApproveReview(id: string): Promise<AdminReviewOut> {
    return request<AdminReviewOut>(`/admin/reviews/${id}/approve`, { method: "PATCH" });
  },

  adminHideReview(id: string): Promise<AdminReviewOut> {
    return request<AdminReviewOut>(`/admin/reviews/${id}/hide`, { method: "PATCH" });
  },

  adminDeleteReview(id: string): Promise<void> {
    return request<void>(`/admin/reviews/${id}`, { method: "DELETE" });
  },

  // ---------- Application feedback ----------
  getMyFeedback(): Promise<FeedbackMe> {
    return request<FeedbackMe>("/feedback/me");
  },

  submitFeedback(payload: { rating: number; comment?: string | null }): Promise<FeedbackMe> {
    return request<FeedbackMe>("/feedback", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  deleteMyFeedback(): Promise<void> {
    return request<void>("/feedback/me", { method: "DELETE" });
  },

  adminFeedbackStats(): Promise<FeedbackStats> {
    return request<FeedbackStats>("/feedback/stats");
  },

  adminFeedback(params?: {
    rating?: number;
    search?: string;
    sort?: "newest" | "highest" | "lowest";
    limit?: number;
    offset?: number;
  }): Promise<AdminFeedbackList> {
    const qs = new URLSearchParams();
    if (params?.rating != null) qs.set("rating", String(params.rating));
    if (params?.search) qs.set("search", params.search);
    if (params?.sort) qs.set("sort", params.sort);
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.offset != null) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return request<AdminFeedbackList>(`/feedback${query ? `?${query}` : ""}`);
  },
};

export async function downloadReport(id: string, lang: string = "en") {
  // The report endpoint requires authentication, so it is fetched with the
  // bearer token and served as a local blob download. `lang` selects the PDF
  // language (en | fr | ar); the server falls back to English for unknown values.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/audits/${id}/report?lang=${encodeURIComponent(lang)}`, {
      headers: { ...authHeaders() },
      signal: controller.signal,
    });
  } catch (err) {
    if (isConnectionError(err)) {
      throw new ApiError(0, CONNECTION_ERROR_MESSAGE);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // keep default message
    }
    throw new ApiError(res.status, detail);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `agent-readiness-report-${id.slice(0, 8)}-${lang}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}