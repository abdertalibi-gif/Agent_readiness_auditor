export type AuditStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "PARTIAL";
export type CheckStatus = "PASS" | "WARNING" | "FAIL" | "NOT_APPLICABLE";
export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type Category =
  | "discoverability"
  | "crawlability"
  | "semantic_structure"
  | "structured_data"
  | "content_accessibility"
  | "navigation_linking"
  | "technical_quality"
  | "performance_accessibility";

export interface ProgressStep {
  label: string;
  done: boolean;
}

export interface ProgressJson {
  stage: string;
  steps: ProgressStep[];
  pages_crawled: number;
  pages_total: number;
  percent?: number;
  message?: string;
}

export interface WebsiteOut {
  id: string;
  domain: string;
  base_url: string;
  created_at: string;
}

export interface AuditOut {
  id: string;
  target_url: string;
  status: AuditStatus;
  score: number | null;
  rating: string | null;
  error_message: string | null;
  failed_step: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  progress_json: ProgressJson | null;
  website: WebsiteOut | null;
}

export interface CategoryScore {
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

export interface AuditSummary {
  id: string;
  target_url: string;
  status: AuditStatus;
  score: number | null;
  rating: string | null;
  rating_label: string | null;
  overall_status: string | null;
  categories: CategoryScore[];
  counts: Record<string, number>;
  ai_summary: string | null;
  coverage: { pages?: number; sitemap_urls?: number; crawl_errors?: number; truncated?: boolean };
  platform: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Check {
  id: number;
  check_id: string;
  category: Category;
  name: string;
  description: string | null;
  status: CheckStatus;
  severity: Severity;
  score: number;
  weight: number;
  evidence: Record<string, unknown> | null;
  recommendation: string | null;
  why_matters: string | null;
  ai_explanation: string | null;
}

export interface IssuesOut {
  total: number;
  items: Check[];
}

export interface PageOut {
  id: number;
  url: string;
  final_url: string | null;
  status_code: number | null;
  depth: number;
  is_same_domain: boolean;
  content_type: string | null;
  response_time_ms: number | null;
  title: string | null;
  meta_description: string | null;
  canonical: string | null;
  robots_meta: { noindex?: boolean; nofollow?: boolean; content?: string } | null;
  headings: Record<string, string[]> | null;
  links_count: number;
  broken_links: { href: string; text: string }[] | null;
  images: { src: string; alt: string }[] | null;
  structured_data: Record<string, unknown>[] | null;
  open_graph: Record<string, string> | null;
  text_preview: string | null;
  word_count: number;
  lang: string | null;
  has_forms: boolean;
  has_buttons: boolean;
  js_dependency_count: number;
  crawled_at: string;
}

export interface Recommendation {
  id: number;
  check_id: string | null;
  priority: string;
  title: string;
  description: string | null;
  how_to_fix: string | null;
  effort: string | null;
  impact: string | null;
  source: string;
}

// ---------- Team & invitations ----------
export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
export type InvitationStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CANCELLED";

export interface WorkspaceMember {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  role: WorkspaceRole;
  created_at: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: WorkspaceRole;
  inviter_id: string | null;
  inviter_name: string | null;
  status: InvitationStatus;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  rejected_at: string | null;
  email_sent: boolean;
}

export interface Team {
  workspace_id: string;
  workspace_name: string;
  members: WorkspaceMember[];
  invitations: Invitation[];
}

export interface InvitationInfo {
  workspace_id: string;
  workspace_name: string;
  inviter_name: string | null;
  email: string;
  role: WorkspaceRole;
  status: InvitationStatus;
  expires_at: string;
}

export interface InvitationAcceptResult {
  ok: boolean;
  reason?: string | null;
  needs_registration?: boolean;
  email?: string | null;
  workspace_id?: string | null;
  workspace_name?: string | null;
  role?: WorkspaceRole | null;
}

export interface InvitationRejectResult {
  ok: boolean;
  reason?: string | null;
  workspace_name?: string | null;
}

// ---------- Super admin ----------
export type AdminUserStatus = "ACTIVE" | "SUSPENDED" | "DELETED";
export type PlatformRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "MEMBER";

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  company_name: string | null;
  role: PlatformRole;
  status: AdminUserStatus;
  suspended_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface AdminUserList {
  total: number;
  items: AdminUser[];
}

export interface AdminWorkspace {
  id: string;
  name: string;
  created_at: string;
  member_count: number;
}

export interface AdminWorkspaceList {
  total: number;
  items: AdminWorkspace[];
}

export interface AdminWorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  role: string;
  created_at: string;
}

export interface AdminInvitation {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
}

export interface AdminInvitationList {
  total: number;
  items: AdminInvitation[];
}

export interface AdminAuditLog {
  id: number;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_user_id: string | null;
  target_workspace_id: string | null;
  data: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface AdminAuditLogList {
  total: number;
  items: AdminAuditLog[];
}

export interface AdminDashboard {
  total_users: number;
  active_users: number;
  suspended_users: number;
  deleted_users: number;
  total_workspaces: number;
  total_audit_entries: number;
  recent_registrations: AdminUser[];
  recent_actions: AdminAuditLog[];
}

// ---------- Reviews ----------
export type ReviewStatus = "PENDING" | "APPROVED" | "HIDDEN";

export interface ReviewOut {
  id: string;
  user_id: string;
  audit_id: string;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  created_at: string;
  updated_at: string;
}

export interface MyReviewOut {
  id: string;
  audit_id: string;
  audit_url: string | null;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  created_at: string;
  updated_at: string;
}

export interface MyReviewListOut {
  total: number;
  items: MyReviewOut[];
}

export interface PublicReviewOut {
  id: string;
  rating: number;
  comment: string | null;
  user_name: string | null;
  audit_url: string | null;
  created_at: string;
}

export interface PublicReviewListOut {
  total: number;
  items: PublicReviewOut[];
}

export interface ReviewStatsOut {
  average_rating: number | null;
  total_reviews: number;
  rating_counts: Record<string, number>;
}

export interface AdminReviewOut {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  audit_id: string;
  audit_url: string | null;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  created_at: string;
  updated_at: string;
}

export interface AdminReviewListOut {
  total: number;
  items: AdminReviewOut[];
}

// ---------- Application feedback ----------
export interface FeedbackMe {
  has_feedback: boolean;
  rating: number | null;
  comment: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface FeedbackStats {
  total_ratings: number;
  average_rating: number | null;
  five_star_percentage: number;
  four_star_percentage: number;
  three_star_percentage: number;
  two_star_percentage: number;
  one_star_percentage: number;
  satisfaction_rate: number;
}

export interface AdminFeedback {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminFeedbackList {
  total: number;
  items: AdminFeedback[];
}
