"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";

export function AuditForm({
  size = "default",
  onCreated,
}: {
  size?: "default" | "lg";
  onCreated?: (id: string) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error(t("marketing.auditForm.urlRequired"));
      return;
    }
    setLoading(true);
    try {
      const audit = await api.createAudit(trimmed);
      onCreated?.(audit.id);
      router.push(`/audits/${audit.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("marketing.auditForm.startFailed"));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-xl flex-col gap-3 sm:flex-row">
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://yourwebsite.com"
        inputMode="url"
        aria-label={t("marketing.auditForm.urlAria")}
        className={size === "lg" ? "h-12 px-4 text-base" : "h-11"}
        disabled={loading}
      />
      <Button type="submit" size={size === "lg" ? "lg" : "default"} className="shrink-0" disabled={loading}>
        {loading ? <Loader2 className="animate-spin" /> : <ArrowRight />}
        {loading ? t("common.loading") : t("marketing.auditForm.run")}
      </Button>
    </form>
  );
}
