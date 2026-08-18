import { AuditProgress } from "@/components/audit/audit-progress";

export default async function AuditProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AuditProgress auditId={id} />;
}
