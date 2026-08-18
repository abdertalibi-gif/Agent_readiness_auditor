import Link from "next/link";
import { ScanSearch } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({
  href = "/",
  className,
  compact = false,
}: {
  href?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <ScanSearch className="h-4 w-4" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-sm font-bold tracking-tight">AGENT-READINESS</span>
        {!compact && <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Auditor</span>}
      </span>
    </Link>
  );
}
