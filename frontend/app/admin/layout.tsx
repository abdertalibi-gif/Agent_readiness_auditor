"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { LayoutDashboard, MessageSquareHeart, ScrollText, ShieldCheck, Star, Users, Workflow } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const NAV = [
    { label: t("admin.nav.overview"), href: "/admin", icon: LayoutDashboard },
    { label: t("admin.nav.users"), href: "/admin/users", icon: Users },
    { label: t("admin.nav.workspaces"), href: "/admin/workspaces", icon: Workflow },
    { label: t("admin.nav.invitations"), href: "/admin/invitations", icon: ScrollText },
    { label: t("admin.nav.reviews"), href: "/admin/reviews", icon: Star },
    { label: t("admin.nav.feedback"), href: "/admin/feedback", icon: MessageSquareHeart },
    { label: t("admin.nav.auditLogs"), href: "/admin/audit-logs", icon: ShieldCheck },
  ];

  useEffect(() => {
    if (!loading && !isSuperAdmin) {
      router.replace("/dashboard");
    }
  }, [loading, isSuperAdmin, router]);

  if (loading || !isSuperAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Logo className="animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-muted/20">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-e bg-background lg:flex">
        <div className="flex h-16 items-center border-b px-4">
          <Logo href="/dashboard" />
        </div>
        <div className="flex items-center gap-2 border-b px-4 py-3 text-xs font-medium text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          {t("admin.platformAdministrator")}
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((item) => {
            const active = item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3">
          <Button asChild variant="outline" className="w-full justify-start" size="sm">
            <Link href="/dashboard">{t("admin.backToApp")}</Link>
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:px-8">
          <h1 className="text-lg font-bold tracking-tight">{t("admin.title")}</h1>
          <div className="ms-auto flex items-center gap-2 text-sm text-muted-foreground">
            {/* Mobile nav is a simple select-free pill row for small screens */}
            <div className="flex gap-1 lg:hidden">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium",
                  pathname.startsWith(item.href) ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                )}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
