"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";

const LINKS: { href: string; key: string }[] = [
  { href: "", key: "auditNav.overview" },
  { href: "/checks", key: "auditNav.checks" },
  { href: "/pages", key: "auditNav.pages" },
  { href: "/issues", key: "auditNav.issues" },
  { href: "/recommendations", key: "auditNav.recommendations" },
  { href: "/report", key: "auditNav.report" },
];

export function AuditNav({ auditId, status }: { auditId: string; status?: string }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const isReady = status ? ["COMPLETED", "PARTIAL", "FAILED"].includes(status) : false;
  const base = `/audits/${auditId}`;

  return (
    <nav className="mb-6 flex flex-wrap gap-1 overflow-x-auto rounded-lg border bg-card p-1">
      {LINKS.map((link) => {
        const href = `${base}${link.href}`;
        const label = t(link.key);
        const active = link.href === "" ? pathname === base : pathname.endsWith(link.href);
        const disabled = !isReady && link.href !== "";
        return (
          <Link
            key={link.key}
            href={disabled ? "#" : href}
            aria-disabled={disabled}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : disabled
                  ? "cursor-not-allowed text-muted-foreground/50"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
