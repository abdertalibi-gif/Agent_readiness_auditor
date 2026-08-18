"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CreditCard,
  KeyRound,
  ShieldCheck,
  Bell,
  Building2,
  User,
  ScrollText,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { isMonetizationEnabled } from "@/lib/config";
import { useI18n } from "@/components/i18n-provider";

type SettingsItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type SettingsSection = {
  label: string;
  items: SettingsItem[];
};

type Translator = (key: string) => string;

function getSections(t: Translator): SettingsSection[] {
  const sections: SettingsSection[] = [
    {
      label: t("settings.account"),
      items: [
        { href: "/settings/profile", label: t("settings.profile"), icon: User },
        { href: "/settings/security", label: t("settings.security"), icon: ShieldCheck },
        { href: "/settings/notifications", label: t("settings.notifications"), icon: Bell },
      ],
    },
    {
      label: t("settings.workspace"),
      items: [
        { href: "/settings/organization", label: t("settings.organization"), icon: Building2 },
        { href: "/settings/api", label: t("settings.apiKeys"), icon: KeyRound },
        { href: "/settings/audit-log", label: t("settings.auditLog"), icon: ScrollText },
      ],
    },
  ];

  if (isMonetizationEnabled()) {
    sections[1].items.splice(1, 0, { href: "/settings/billing", label: t("settings.billing"), icon: CreditCard });
  }

  return sections;
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const sections = getSections(t);

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <aside className="w-full shrink-0 md:w-56">
        <div className="flex items-center gap-2 px-1 pb-2 text-sm font-semibold text-muted-foreground">
          <SettingsIcon className="h-4 w-4" /> {t("settings.title")}
        </div>
        <nav className="space-y-4">
          {sections.map((section) => (
            <div key={section.label}>
              <div className="px-3 pb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                {section.label}
              </div>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
