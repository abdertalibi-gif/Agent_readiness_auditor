import { AuditReport } from "@/components/audit/audit-report";

export default async function AuditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AuditReport auditId={id} />;
}
