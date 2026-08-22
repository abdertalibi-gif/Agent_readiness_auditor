"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { AuditOut } from "@/lib/types";

// Polling backoff: start fast so the progress page feels live, then settle at a
// slower cadence for long crawls. Cap at 5s so polling never becomes abusive.
const MAX_POLL_MS = 5000;

// Stop polling after this many consecutive errors (backend unreachable).
const MAX_CONSECUTIVE_ERRORS = 5;

/**
 * Polls an audit's status until it reaches a terminal state.
 * Progress is real — it comes from backend job state, never simulated.
 */
export function useAuditStatus(auditId: string, pollMs = 1500) {
  const [audit, setAudit] = useState<AuditOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);
  const consecutiveErrors = useRef(0);

  const stop = useCallback(() => {
    done.current = true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let interval = 0;
    done.current = false;
    consecutiveErrors.current = 0;

    async function poll() {
      try {
        const data = await api.getStatus(auditId);
        if (cancelled) return;
        setAudit(data);
        setError(null);
        consecutiveErrors.current = 0;
        if (["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"].includes(data.status)) {
          done.current = true;
          return;
        }
      } catch (e) {
        if (cancelled) return;
        consecutiveErrors.current += 1;
        setError(
          consecutiveErrors.current >= MAX_CONSECUTIVE_ERRORS
            ? "Lost connection to the server. Please refresh the page."
            : e instanceof Error
              ? e.message
              : "Unable to reach the audit service."
        );
        // Stop polling after too many consecutive failures — the user needs
        // to refresh manually rather than spamming a dead backend.
        if (consecutiveErrors.current >= MAX_CONSECUTIVE_ERRORS) {
          done.current = true;
          return;
        }
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
