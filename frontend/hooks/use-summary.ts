import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { AuditSummary } from "@/lib/types";

export function useAuditSummary(auditId: string, enabled: boolean) {
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      const data = await api.getSummary(auditId);
      if (cancelledRef.current) return;
      setSummary(data);
      setError(null);
    } catch (e) {
      if (cancelledRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to load summary");
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [auditId, enabled]);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh]);

  return { summary, loading, error, refresh };
}
