import { AuditIssues } from "@/components/audit/audit-issues";

export default async function AuditIssuesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AuditIssues auditId={id} />;
}
