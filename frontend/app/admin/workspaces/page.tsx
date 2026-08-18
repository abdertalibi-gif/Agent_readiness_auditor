"use client";

import { useEffect, useState } from "react";
import { Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type { AdminWorkspace, AdminWorkspaceMember } from "@/lib/types";
import { useI18n } from "@/components/i18n-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];

function initials(name: string | null, email: string | null): string {
  const source = name || email || "?";
  return source.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

export default function AdminWorkspacesPage() {
  const { t } = useI18n();
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminWorkspace | null>(null);
  const [members, setMembers] = useState<AdminWorkspaceMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<AdminWorkspaceMember | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const data = await api.adminWorkspaces();
        if (!cancelled) setWorkspaces(data.items);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : t("admin.workspaces.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadInitial();
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function openWorkspace(ws: AdminWorkspace) {
    setSelected(ws);
    setMembersLoading(true);
    setMembers([]);
    try {
      setMembers(await api.adminWorkspaceMembers(ws.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.workspaces.loadMembersFailed"));
    } finally {
      setMembersLoading(false);
    }
  }

  async function changeRole(ws: AdminWorkspace, member: AdminWorkspaceMember, role: string) {
    setBusy(true);
    try {
      await api.adminWorkspaceMemberRole(ws.id, member.id, role);
      toast.success(t("admin.workspaces.memberRoleUpdated", { member: member.user_email ?? t("admin.workspaces.member"), role }));
      setMembers(await api.adminWorkspaceMembers(ws.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.workspaces.changeRoleFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeMember() {
    if (!selected || !removeTarget) return;
    setBusy(true);
    try {
      await api.adminRemoveWorkspaceMember(selected.id, removeTarget.id);
      toast.success(t("admin.workspaces.memberRemoved", { member: removeTarget.user_email ?? t("admin.workspaces.member") }));
      setRemoveTarget(null);
      setMembers(await api.adminWorkspaceMembers(selected.id));
      // Refresh the member count in the list.
      const updated = (await api.adminWorkspaces()).items;
      setWorkspaces((prev) =>
        updated.find((w) => w.id === selected.id)
          ? prev.map((w) => (w.id === selected.id ? updated.find((x) => x.id === selected.id)! : w))
          : prev
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.workspaces.removeMemberFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t("admin.workspaces.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("admin.workspaces.subtitle")}</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">{t("admin.workspaces.loading")}</div>
          ) : workspaces.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">{t("admin.workspaces.none")}</div>
          ) : (
            <ul className="divide-y">
              {workspaces.map((ws) => (
                <li
                  key={ws.id}
                  className="flex cursor-pointer items-center gap-4 px-6 py-4 hover:bg-muted/50"
                  onClick={() => openWorkspace(ws)}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
                    <Users className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{ws.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {t("admin.workspaces.meta", { count: ws.member_count, date: new Date(ws.created_at).toLocaleDateString() })}
                    </p>
                  </div>
                  <Button variant="outline" size="sm">{t("admin.workspaces.viewMembers")}</Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Members dialog */}
      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>{t("admin.workspaces.manageMembers")}</DialogDescription>
          </DialogHeader>
          {membersLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t("admin.workspaces.loadingMembers")}</div>
          ) : members.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t("admin.workspaces.noMembers")}</div>
          ) : (
            <ul className="divide-y">
              {members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>{initials(m.user_name, m.user_email)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.user_name ?? "—"}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.user_email}</p>
                  </div>
                  <Badge variant={m.role === "OWNER" ? "default" : "outline"}>{m.role}</Badge>
                  {m.role !== "OWNER" ? (
                    <>
                      <Select
                        value={m.role}
                        disabled={busy}
                        onValueChange={(v) => changeRole(selected!, m, v)}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("admin.workspaces.removeMember")}
                        disabled={busy}
                        onClick={() => setRemoveTarget(m)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("team.owner")}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove-member confirmation */}
      <Dialog open={removeTarget !== null} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.workspaces.removeMemberTitle")}</DialogTitle>
            <DialogDescription>
              {t("admin.workspaces.removeMemberConfirm", {
                member: removeTarget?.user_email ?? t("admin.workspaces.member"),
                workspace: selected?.name ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setRemoveTarget(null)}>{t("common.cancel")}</Button>
            <Button variant="destructive" disabled={busy} onClick={removeMember}>
              {busy ? t("admin.workspaces.removing") : t("common.remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
