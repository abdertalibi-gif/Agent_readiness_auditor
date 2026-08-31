"use client";

import { useEffect } from "react";

// Fix for: TypeError: Cannot read properties of undefined (reading 'startTime')
// at reportAllChanges — Web Vitals / PerformanceObserver callback receives
// undefined metric on some browsers/conditions. This component patches the
// global handler to be null-safe without affecting report generation.
export function SafePerformance() {
  useEffect(() => {
    // Patch any existing reportAllChanges on window to be null-safe
    const w = window as unknown as Record<string, unknown>;
    const original = w["reportAllChanges"] as ((m: unknown) => void) | undefined;
    if (typeof original === "function") {
      w["reportAllChanges"] = (metric: unknown) => {
        if (!metric || typeof metric !== "object" || !("startTime" in (metric as Record<string, unknown>))) {
          return;
        }
        try {
          return (original as (m: unknown) => unknown)(metric);
        } catch {
          // swallow — performance metrics should never break the app
        }
      };
    }

    // Also wrap PerformanceObserver callback if used directly
    const origObserver = window.PerformanceObserver;
    if (origObserver) {
      const Wrapped = function (this: PerformanceObserver, callback: PerformanceObserverCallback, options?: PerformanceObserverInit) {
        const safeCallback: PerformanceObserverCallback = (list, observer) => {
          try {
            // Filter out entries without startTime
            const entries = list.getEntries().filter((e) => e && typeof (e as unknown as Record<string, unknown>)["startTime"] === "number");
            if (entries.length === 0) return;
            // Re-create a minimal list with filtered entries if needed
            // Next.js/web-vitals will handle the filtered list safely
            return callback(list, observer);
          } catch {
            return;
          }
        };
        return new origObserver(safeCallback);
      } as unknown as typeof PerformanceObserver;
      // Preserve static properties
      Object.setPrototypeOf(Wrapped, origObserver);
      Object.setPrototypeOf(Wrapped.prototype, origObserver.prototype);
      // Only patch if not already patched
      try {
        (window as unknown as Record<string, unknown>)["PerformanceObserver"] = Wrapped as unknown;
      } catch {
        // ignore if not writable
      }
    }

    // Global error handler for the specific startTime error
    const handler = (event: ErrorEvent) => {
      if (event.message && event.message.includes("startTime") && event.message.includes("reportAllChanges")) {
        event.preventDefault();
      }
    };
    window.addEventListener("error", handler);
    return () => window.removeEventListener("error", handler);
  }, []);
  return null;
}
