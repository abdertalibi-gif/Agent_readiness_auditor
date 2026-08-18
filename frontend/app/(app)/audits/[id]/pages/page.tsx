import { AuditPages } from "@/components/audit/audit-pages";

export default async function AuditPagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AuditPages auditId={id} />;
}
