"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Crown, Mail, RefreshCw, Shield, Trash2, UserPlus, Users, XCircle } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { getCachedUser } from "@/lib/auth";
import type { Invitation, Team, WorkspaceMember, WorkspaceRole } from "@/lib/types";
import { useI18n } from "@/components/i18n-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const MANAGER_ROLES: WorkspaceRole[] = ["OWNER", "ADMIN"];
const INVITABLE_ROLES: Exclude<WorkspaceRole, "OWNER">[] = ["ADMIN", "MEMBER", "VIEWER"];

const ROLE_VARIANT: Record<WorkspaceRole, "default" | "secondary" | "outline"> = {
  OWNER: "default",
  ADMIN: "secondary",
  MEMBER: "outline",
  VIEWER: "outline",
};

const STATUS_VARIANT: Record<Invitation["status"], "success" | "warning" | "destructive" | "secondary"> = {
  PENDING: "warning",
  ACCEPTED: "success",
  REJECTED: "destructive",
  EXPIRED: "secondary",
  CANCELLED: "secondary",
};

const ROLE_KEY: Record<WorkspaceRole, string> = {
  OWNER: "team.owner",
  ADMIN: "team.admin",
  MEMBER: "team.member",
  VIEWER: "team.viewer",
};

function initials(name: string | null, email: string | null): string {
  const source = name || email || "?";
  return source
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function TeamPage() {
  const { t, formatDate, statusLabel, formatNumber } = useI18n();
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("MEMBER");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const currentEmail = useMemo(() => getCachedUser()?.email ?? "", []);

  const reload = useCallback(async () => {
    try {
      setTeam(await api.getTeam());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("teamDetail.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const data = await api.getTeam();
        if (!cancelled) setTeam(data);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : t("teamDetail.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadInitial();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const isManager = useMemo(() => {
    const me = team?.members.find((m) => m.email === currentEmail);
    return me ? MANAGER_ROLES.includes(me.role) : true;
  }, [team, currentEmail]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      await api.inviteMember(email, role);
      toast.success(t("team.invitationSent"), { description: t("teamDetail.inviteSentDesc", { email }) });
      setEmail("");
      setRole("MEMBER");
      setInviteOpen(false);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("teamDetail.sendFailed"));
    } finally {
      setInviting(false);
    }
  }

  async function resend(inv: Invitation) {
    setBusyId(inv.id);
    try {
      await api.resendInvitation(inv.id);
      toast.success(t("team.invitationResent"), { description: t("teamDetail.resendDesc", { email: inv.email }) });
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("teamDetail.resendFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(inv: Invitation) {
    setBusyId(inv.id);
    try {
      await api.cancelInvitation(inv.id);
      toast.success(t("team.invitationCancelled"), { description: t("teamDetail.cancelDesc", { email: inv.email }) });
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("teamDetail.cancelFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function changeRole(member: WorkspaceMember, next: WorkspaceRole) {
    setBusyId(member.id);
    try {
      await api.changeMemberRole(member.id, next);
      toast.success(t("team.roleUpdated"), {
        description: t("teamDetail.roleUpdatedDesc", { name: member.email ?? t("teamDetail.memberFallback"), role: t(ROLE_KEY[next]) }),
      });
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("teamDetail.roleUpdateFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(member: WorkspaceMember) {
    setBusyId(member.id);
    try {
      await api.removeMember(member.id);
      toast.success(t("team.memberRemoved"), {
        description: t("teamDetail.memberRemovedDesc", { name: member.email ?? t("teamDetail.memberFallback") }),
      });
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("teamDetail.memberRemoveFailed"));
    } finally {
      setBusyId(null);
    }
  }

  const pending = team?.invitations.filter((i) => i.status === "PENDING") ?? [];
  const history = team?.invitations.filter((i) => i.status !== "PENDING") ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{team?.workspace_name ?? t("team.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("team.subtitle")}</p>
        </div>
        {isManager && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4" /> {t("team.inviteMember")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("team.inviteTitle")}</DialogTitle>
                <DialogDescription>{t("teamDetail.inviteDialogDesc")}</DialogDescription>
              </DialogHeader>
              <form onSubmit={invite} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="invite-email">{t("team.email")}</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder={t("teamDetail.emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("team.role")}</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as WorkspaceRole)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVITABLE_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {t(ROLE_KEY[r])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button type="submit" disabled={inviting}>
                    {inviting ? t("team.sendingInvite") : t("team.sendInvite")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("team.members")}</CardTitle>
          <CardDescription>{team ? t("teamDetail.memberCount", { count: formatNumber(team.members.length) }) : t("teamDetail.loadingMembers")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">{t("common.loading")}…</div>
          ) : (
            <ul className="divide-y">
              {(team?.members ?? []).map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>{initials(m.name, m.email)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      {m.name ?? "—"}
                      {m.role === "OWNER" && <Crown className="h-4 w-4 text-amber-500" />}
                      {m.role === "ADMIN" && <Shield className="h-4 w-4 text-primary" />}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{m.email}</p>
                  </div>
                  <Badge variant="success">{t("team.active")}</Badge>
                  {isManager && m.role !== "OWNER" ? (
                    <>
                      <Select
                        value={m.role}
                        onValueChange={(v) => changeRole(m, v as WorkspaceRole)}
                        disabled={busyId === m.id}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INVITABLE_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {t(ROLE_KEY[r])}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("teamDetail.removeAria", { name: m.email ?? t("teamDetail.memberFallback") })}
                        disabled={busyId === m.id}
                        onClick={() => remove(m)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  ) : (
                    <Badge variant={ROLE_VARIANT[m.role]}>{t(ROLE_KEY[m.role])}</Badge>
                  )}
                </li>
              ))}
              {team?.members.length === 0 && (
                <li className="flex flex-col items-center gap-3 px-6 py-12 text-center text-sm text-muted-foreground">
                  <Users className="h-6 w-6" />
                  {t("teamDetail.noMembers")}
                </li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("team.pendingInvitations")}</CardTitle>
          <CardDescription>
            {pending.length > 0
              ? t("teamDetail.pendingSummary", { count: formatNumber(pending.length) })
              : t("teamDetail.noPending")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {pending.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center text-sm text-muted-foreground">
              <Mail className="h-6 w-6" />
              {t("teamDetail.noInvitationsPending")}
            </div>
          ) : (
            <ul className="divide-y">
              {pending.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{inv.email}</p>
                    <p className="text-sm text-muted-foreground">
                      {t(ROLE_KEY[inv.role])} · {t("teamDetail.invitedBy")} {inv.inviter_name ?? "—"} · {t("teamDetail.expires")} {formatDate(inv.expires_at)}
                      {!inv.email_sent && ` · ${t("teamDetail.emailDeliveryFailed")}`}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[inv.status]}>{statusLabel(inv.status)}</Badge>
                  {!inv.email_sent && (
                    <Badge variant="destructive">
                      <XCircle className="mr-1 h-3 w-3" /> {t("team.notDelivered")}
                    </Badge>
                  )}
                  {isManager && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === inv.id}
                        onClick={() => resend(inv)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> {t("common.resend")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === inv.id}
                        onClick={() => cancel(inv)}
                      >
                        {t("common.cancel")}
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("team.invitationHistory")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {history.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-4 px-6 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(ROLE_KEY[inv.role])} · {formatDate(inv.created_at)}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[inv.status]}>{statusLabel(inv.status)}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
