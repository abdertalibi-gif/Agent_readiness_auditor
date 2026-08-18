import { AuditChecks } from "@/components/audit/audit-checks";

export default async function AuditChecksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AuditChecks auditId={id} />;
}
