import { AuditOverview } from "@/components/audit/audit-overview";

export default async function AuditOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AuditOverview auditId={id} />;
}
