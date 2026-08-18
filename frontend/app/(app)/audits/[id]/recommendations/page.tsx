import { AuditRecommendations } from "@/components/audit/audit-recommendations";

export default async function AuditRecommendationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AuditRecommendations auditId={id} />;
}
