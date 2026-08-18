"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, CheckCircle2, LogIn, UserPlus } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { InvitationAcceptResult, InvitationInfo } from "@/lib/types";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ViewState = "loading" | "error" | "ready" | "accepted" | "terminal";

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const token = searchParams.get("token") ?? "";

  const [view, setView] = useState<ViewState>(() => (token ? "loading" : "error"));
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [result, setResult] = useState<InvitationAcceptResult | null>(null);
  const [error, setError] = useState<string>(() => (token ? "" : t("invite.accept.invalidOrExpired")));
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
        setError(err instanceof ApiError ? err.message : t("invite.accept.invalidOrExpired"));
        setView("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  // After a successful accept, a logged-in recipient is sent to their team
  // page (the invitation already left Pending and they appear in Members).
  useEffect(() => {
    if (view === "accepted" && result?.ok && getToken()) {
      router.replace("/team");
    }
  }, [view, result, router]);

  const onAccept = useCallback(async () => {
    setActing(true);
    try {
      const res = await api.acceptInvitation(token);
      setResult(res);
      if (res.ok) {
        setView("accepted");
      } else if (res.needs_registration) {
        setView("terminal");
        toast.info(t("invite.accept.createAccountToast"));
      } else {
        setView("terminal");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("invite.accept.couldNotAccept"));
    } finally {
      setActing(false);
    }
  }, [token, t]);

  if (view === "loading") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          {t("invite.accept.checking")}
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
          <CardDescription>{t("invite.accept.askResend")}</CardDescription>
        </CardContent>
      </Card>
    );
  }

  if (view === "accepted" && result) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-success" />
          <CardTitle className="text-lg">{t("invite.accept.acceptedTitle")}</CardTitle>
          <CardDescription>
            {t("invite.accept.joinedAs", {
              workspace: result.workspace_name ?? t("invite.accept.theWorkspace"),
              role: result.role?.toLowerCase() ?? t("invite.accept.member"),
            })}
          </CardDescription>
          {getToken() ? (
            <Button onClick={() => router.push("/team")}>
              {t("invite.accept.goToTeam")} <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button asChild>
              <Link href="/login?next=/team">
                <LogIn className="h-4 w-4" /> {t("invite.accept.logInToContinue")}
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (view === "terminal") {
    const reason =
      result?.needs_registration
        ? t("invite.accept.createAccountToJoin", {
            email: result.email ?? info?.email ?? t("invite.accept.yourEmail"),
            workspace: result.workspace_name ?? info?.workspace_name ?? t("invite.accept.theWorkspace"),
          })
        : result?.reason
          ? statusReason(t, result.reason)
          : statusReason(t, info?.status);
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          {result?.needs_registration ? (
            <>
              <UserPlus className="h-10 w-10 text-primary" />
              <CardTitle className="text-lg">{t("invite.accept.youveBeenInvited")}</CardTitle>
              <CardDescription className="max-w-sm">{reason}</CardDescription>
              <div className="flex w-full flex-col gap-2">
                <Button asChild>
                  <Link
                    href={`/register?email=${encodeURIComponent(result.email ?? info?.email ?? "")}&token=${encodeURIComponent(token)}`}
                  >
                    <UserPlus className="h-4 w-4" /> {t("invite.accept.createFreeAccount")}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/login?next=/team">
                    <LogIn className="h-4 w-4" /> {t("invite.accept.haveAccount")}
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <>
              <AlertTriangle className="h-8 w-8 text-muted-foreground" />
              <CardTitle className="text-lg">{reason}</CardTitle>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{t("invite.accept.youveBeenInvited")}</CardTitle>
        <CardDescription>
          {t("invite.accept.joinAs", {
            workspace: info?.workspace_name ?? "",
            role: info?.role?.toLowerCase() ?? t("invite.accept.member"),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {info?.inviter_name && (
          <p className="text-center text-sm text-muted-foreground">
            {t("invite.accept.invitedBy", { name: info.inviter_name })}
          </p>
        )}
        <Button onClick={onAccept} disabled={acting} className="w-full">
          {acting ? t("invite.accept.accepting") : t("invite.accept.acceptInvitation")}
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href={`/invite/reject?token=${encodeURIComponent(token)}`}>{t("invite.accept.decline")}</Link>
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
    ACCEPTED: "invite.accept.reasonAccepted",
    REJECTED: "invite.accept.reasonRejected",
    EXPIRED: "invite.accept.reasonExpired",
    CANCELLED: "invite.accept.reasonCancelled",
  };
  const key = keyMap[reason ?? ""];
  return key ? t(key) : t("invite.accept.noLongerActive");
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteForm />
    </Suspense>
  );
}
