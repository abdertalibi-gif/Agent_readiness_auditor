"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { AuditOut } from "@/lib/types";

// Polling backoff: start fast so the progress page feels live, then settle at a
// slower cadence for long crawls. Cap at 5s so polling never becomes abusive.
const MAX_POLL_MS = 5000;

/**
 * Polls an audit's status until it reaches a terminal state.
 * Progress is real — it comes from backend job state, never simulated.
 */
export function useAuditStatus(auditId: string, pollMs = 1500) {
  const [audit, setAudit] = useState<AuditOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  const stop = useCallback(() => {
    done.current = true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let interval = 0;
    done.current = false;

    async function poll() {
      try {
        const data = await api.getStatus(auditId);
        if (cancelled) return;
        setAudit(data);
        setError(null);
        if (["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"].includes(data.status)) {
          done.current = true;
          return;
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unable to reach the audit service.");
      }
      if (!cancelled && !done.current) {
        interval = Math.min(interval + pollMs, MAX_POLL_MS);
        window.setTimeout(poll, interval);
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [auditId, pollMs]);

  return { audit, error, stop };
}
