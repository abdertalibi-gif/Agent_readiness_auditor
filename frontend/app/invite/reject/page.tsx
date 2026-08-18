"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ThumbsDown } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { InvitationInfo } from "@/lib/types";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ViewState = "loading" | "error" | "ready" | "declined" | "terminal";

function RejectInviteForm() {
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const token = searchParams.get("token") ?? "";

  const [view, setView] = useState<ViewState>(() => (token ? "loading" : "error"));
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [error, setError] = useState<string>(() => (token ? "" : t("invite.reject.invalidOrExpired")));
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .getInvitation(token)
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        setView(data.status === "PENDING" ? "ready" : "terminal");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : t("invite.reject.invalidOrExpired"));
        setView("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  const onDecline = useCallback(async () => {
    setActing(true);
    try {
      const res = await api.rejectInvitation(token);
      if (res.ok) {
        setView("declined");
      } else {
        setView("terminal");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("invite.reject.couldNotDecline"));
    } finally {
      setActing(false);
    }
  }, [token, t]);

  if (view === "loading") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          {t("invite.reject.checking")}
        </CardContent>
      </Card>
    );
  }

  if (view === "error") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <CardTitle className="text-lg">{error}</CardTitle>
        </CardContent>
      </Card>
    );
  }

  if (view === "declined") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-success" />
          <CardTitle className="text-lg">{t("invite.reject.declinedTitle")}</CardTitle>
          <CardDescription>
            {t("invite.reject.wontJoin", { workspace: info?.workspace_name ?? "" })}
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  if (view === "terminal") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground" />
          <CardTitle className="text-lg">{statusReason(t, info?.status)}</CardTitle>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{t("invite.reject.title")}</CardTitle>
        <CardDescription>
          {t("invite.reject.wontJoinAs", {
            workspace: info?.workspace_name ?? "",
            role: info?.role?.toLowerCase() ?? t("invite.accept.member"),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button variant="destructive" onClick={onDecline} disabled={acting} className="w-full">
          <ThumbsDown className="h-4 w-4" />
          {acting ? t("invite.reject.declining") : t("invite.reject.declineInvitation")}
        </Button>
      </CardContent>
    </Card>
  );
}

function statusReason(
  t: ReturnType<typeof useI18n>["t"],
  reason?: string
): string {
  const keyMap: Record<string, string> = {
    ACCEPTED: "invite.reject.reasonAccepted",
    REJECTED: "invite.reject.reasonRejected",
    EXPIRED: "invite.reject.reasonExpired",
    CANCELLED: "invite.reject.reasonCancelled",
  };
  const key = keyMap[reason ?? ""];
  return key ? t(key) : t("invite.reject.noLongerActive");
}

export default function RejectInvitePage() {
  return (
    <Suspense fallback={null}>
      <RejectInviteForm />
    </Suspense>
  );
}
