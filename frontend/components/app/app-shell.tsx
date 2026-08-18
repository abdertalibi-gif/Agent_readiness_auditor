"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  ChevronsUpDown,
  CreditCard,
  FileText,
  Gauge,
  Globe,
  HelpCircle,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  PlusCircle,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/components/i18n-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { isMonetizationEnabled } from "@/lib/config";

function getNavItems(
  t: (key: string) => string,
  user: { company_name?: string | null; email?: string } | null
) {
  // Anonymous visitors in FREE MODE only see the audit flow entry points.
  if (!user) {
    return [
      { label: t("navigation.newAudit"), href: "/audit/new", icon: PlusCircle },
      { label: t("navigation.myAudit"), href: "/audits", icon: ListChecks },
    ];
  }

  const items = [
    { label: t("navigation.dashboard"), href: "/dashboard", icon: LayoutDashboard },
    { label: t("navigation.websites"), href: "/websites", icon: Globe },
    { label: t("navigation.audits"), href: "/audits", icon: ListChecks },
    { label: t("navigation.reports"), href: "/reports", icon: FileText },
    { label: t("navigation.team"), href: "/team", icon: Users },
    { label: t("navigation.usage"), href: "/usage", icon: Gauge },
    { label: t("navigation.settings"), href: "/settings/profile", icon: Settings },
    { label: t("navigation.help"), href: "/help", icon: HelpCircle },
  ];

  if (isMonetizationEnabled()) {
    items.splice(5, 0, { label: t("navigation.billing"), href: "/settings/billing", icon: CreditCard });
  }

  return items;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, loading, logout } = useAuth();
  const { t } = useI18n();

  const userName = user?.name || user?.email?.split("@")[0] || "there";
  const orgName = user?.company_name || "My Workspace";
  const freeMode = !isMonetizationEnabled();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Logo className="justify-center animate-pulse" />
      </div>
    );
  }

  // In FREE MODE, allow access to the audit flow without auth (for anonymous
  // visitors) but show a prominent "Create Free Account" prompt.
  const isAnonymousAccessibleRoute = 
    pathname === "/audit/new" ||
    pathname.startsWith("/audits/");

  if (!user && (!freeMode || !isAnonymousAccessibleRoute)) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm rounded-xl border bg-card p-8 text-center">
          <Logo className="justify-center" />
          <h1 className="mt-6 text-lg font-bold">{t("signinGate.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("signinGate.subtitle")}
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2">
            <Button asChild>
              <Link href="/register">{t("auth.createFreeAccount")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/login">{t("auth.login")}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function handleLogout() {
    await logout();
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string) {
    if (href === "/settings/profile") return pathname.startsWith("/settings");
    return pathname === href || pathname.startsWith(href + "/");
  }

  const NAV = getNavItems(t, user);

  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b px-4">
        <Logo href="/dashboard" />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <Button asChild variant="default" className="mb-4 w-full justify-start" size="sm">
          <Link href="/audit/new">
            <PlusCircle className="h-4 w-4" /> {t("navigation.newAudit")}
          </Link>
        </Button>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive(item.href)
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
        {isSuperAdmin && (
          <Link
            href="/admin"
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              pathname.startsWith("/admin")
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            )}
          >
            <ShieldCheck className="h-4 w-4" />
            Admin
          </Link>
        )}
      </nav>
      <div className="border-t p-3">
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-md p-2 text-start transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{userName}</div>
                <div className="truncate text-xs text-muted-foreground">{orgName}</div>
              </div>
              <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="h-4 w-4" /> {t("auth.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="space-y-2">
            <p className="px-1 text-xs text-muted-foreground">
              {t("app.saveYourAudits")}
            </p>
            <Button asChild size="sm" className="w-full">
              <Link href="/register">{t("auth.createFreeAccount")}</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="w-full">
              <Link href="/login">{t("auth.login")}</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-muted/20">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-e bg-background lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-72 bg-background shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute end-3 top-4 rounded-md p-1 text-muted-foreground hover:bg-accent"
              aria-label={t("app.closeMenu")}
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label={t("app.openMenu")}>
            <Menu className="h-5 w-5" />
          </Button>

          <div className="relative hidden max-w-md flex-1 sm:block">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="ps-9" placeholder={t("app.searchPlaceholder")} />
          </div>

          <div className="ms-auto flex items-center gap-2">
            <LanguageSwitcher />
            {user ? (
              <>
                <Badge variant="outline" className="hidden sm:inline-flex">{orgName}</Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={t("app.notifications")}>
                      <Bell className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuLabel>{t("app.notifications")}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                      {t("app.allCaughtUp")}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full" aria-label={t("app.profile")}>
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <div className="font-medium">{userName}</div>
                      <div className="text-xs font-normal text-muted-foreground">{user.email}</div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/settings/profile">{t("app.profileAndSettings")}</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleLogout}>
                      <LogOut className="h-4 w-4" /> {t("auth.logout")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <Badge variant="secondary" className="hidden sm:inline-flex">
                  {t("app.freeMode")}
                </Badge>
                <Button asChild size="sm">
                  <Link href="/register">{t("auth.createFreeAccount")}</Link>
                </Button>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}