"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, Eye, RotateCcw, Search, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { getCachedUser } from "@/lib/auth";
import type { AdminUser, AdminUserStatus, PlatformRole } from "@/lib/types";
import { useI18n } from "@/components/i18n-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_VARIANT: Record<AdminUserStatus, "success" | "destructive" | "secondary"> = {
  ACTIVE: "success",
  SUSPENDED: "destructive",
  DELETED: "secondary",
};

const PLATFORM_ROLES: PlatformRole[] = ["SUPER_ADMIN", "OWNER", "ADMIN", "MEMBER"];

function initials(name: string | null, email: string | null): string {
  const source = name || email || "?";
  return source.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

function fmtDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

export default function AdminUsersPage() {
  const { t, statusLabel } = useI18n();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: "suspend" | "delete" | "remove" | null;
    user: AdminUser;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const currentUserId = useMemo(() => getCachedUser()?.id ?? "", []);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const data = await api.adminUsers(q || undefined);
      setUsers(data.items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.users.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const data = await api.adminUsers();
        if (!cancelled) setUsers(data.items);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : t("admin.users.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadInitial();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const visible = useMemo(() => {
    if (!query.trim()) return users;
    const term = query.trim().toLowerCase();
    return users.filter((u) => u.email.toLowerCase().includes(term) || (u.name ?? "").toLowerCase().includes(term));
  }, [users, query]);

  async function runAction() {
    if (!confirmAction) return;
    const { type, user } = confirmAction;
    setBusy(true);
    try {
      if (type === "suspend") {
        await api.suspendUser(user.id);
        toast.success(t("admin.users.suspended", { email: user.email }));
      } else if (type === "delete") {
        await api.deleteUser(user.id);
        toast.success(t("admin.users.deletedSoft", { email: user.email }));
      }
      setSelected(null);
      setConfirmAction(null);
      await load(query);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("admin.users.actionFailed");
      toast.error(msg);
      if (msg.toLowerCase().includes("suspended")) setConfirmAction(null);
    } finally {
      setBusy(false);
    }
  }

  async function unsuspend(u: AdminUser) {
    setBusy(true);
    try {
      await api.unsuspendUser(u.id);
      toast.success(t("admin.users.unsuspended", { email: u.email }));
      await load(query);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.users.unsuspendFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function restore(u: AdminUser) {
    setBusy(true);
    try {
      await api.restoreUser(u.id);
      toast.success(t("admin.users.restored", { email: u.email }));
      await load(query);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.users.restoreFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(u: AdminUser, role: string) {
    setBusy(true);
    try {
      await api.adminChangeUserRole(u.id, role);
      toast.success(t("admin.users.roleUpdated", { email: u.email, role }));
      setSelected((s) => (s && s.id === u.id ? { ...s, role: role as PlatformRole } : s));
      await load(query);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.users.changeRoleFailed"));
    } finally {
      setBusy(false);
    }
  }

  const confirmLabel =
    confirmAction?.type === "suspend"
      ? t("admin.users.confirmSuspend", { email: confirmAction.user.email })
      : confirmAction?.type === "delete"
        ? t("admin.users.confirmDelete", { email: confirmAction.user.email })
        : "";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t("admin.users.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("admin.users.subtitle")}</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="ps-9"
            placeholder={t("admin.users.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="text-sm text-muted-foreground">{t("admin.users.shown", { count: visible.length })}</div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">{t("admin.users.loading")}</div>
          ) : visible.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">{t("admin.users.none")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-6 py-3 font-medium">{t("admin.users.name")}</th>
                    <th className="px-6 py-3 font-medium">{t("admin.users.email")}</th>
                    <th className="px-6 py-3 font-medium">{t("admin.users.role")}</th>
                    <th className="px-6 py-3 font-medium">{t("admin.users.status")}</th>
                    <th className="px-6 py-3 font-medium">{t("admin.users.created")}</th>
                    <th className="px-6 py-3 text-end font-medium">{t("admin.users.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visible.map((u) => {
                    const isSelf = u.id === currentUserId;
                    const canSuspend = u.status === "ACTIVE" && !isSelf;
                    const canDelete = u.status !== "DELETED" && !isSelf;
                    return (
                      <tr key={u.id} className="hover:bg-muted/50">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>{initials(u.name, u.email)}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{u.name ?? "—"}</span>
                          </div>
                        </td>
                        <td className="px-6 py-3 text-muted-foreground">{u.email}</td>
                        <td className="px-6 py-3">
                          <Badge variant={u.role === "SUPER_ADMIN" ? "default" : "outline"}>{u.role}</Badge>
                        </td>
                        <td className="px-6 py-3">
                          <Badge variant={STATUS_VARIANT[u.status]}>{statusLabel(u.status)}</Badge>
                        </td>
                        <td className="px-6 py-3 text-muted-foreground">{fmtDate(u.created_at)}</td>
                        <td className="px-6 py-3 text-end">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" aria-label={t("common.view")} onClick={() => setSelected(u)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {canSuspend && (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={t("admin.users.suspend")}
                                onClick={() => setConfirmAction({ type: "suspend", user: u })}
                              >
                                <Ban className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                            {u.status === "SUSPENDED" && (
                              <Button variant="ghost" size="icon" aria-label={t("admin.users.unsuspend")} onClick={() => unsuspend(u)} disabled={busy}>
                                <RotateCcw className="h-4 w-4 text-primary" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={t("common.delete")}
                                onClick={() => setConfirmAction({ type: "delete", user: u })}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                            {u.status === "DELETED" && (
                              <Button variant="ghost" size="icon" aria-label={t("admin.users.restore")} onClick={() => restore(u)} disabled={busy}>
                                <Undo2 className="h-4 w-4 text-primary" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* User detail dialog */}
      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.name ?? t("admin.users.details")}</DialogTitle>
            <DialogDescription>{selected?.email}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-muted-foreground">{t("admin.users.accountStatus")}</span>
                <Badge variant={STATUS_VARIANT[selected.status]}>{statusLabel(selected.status)}</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-muted-foreground">{t("common.created")}</span>
                <span>{fmtDate(selected.created_at)}</span>
              </div>
              {selected.deleted_at && (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-muted-foreground">{t("admin.users.deleted")}</span>
                  <span>{fmtDate(selected.deleted_at)}</span>
                </div>
              )}
              {selected.suspended_at && (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-muted-foreground">{t("admin.users.suspended")}</span>
                  <span>{fmtDate(selected.suspended_at)}</span>
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-muted-foreground">{t("admin.users.platformRole")}</span>
                <Select
                  value={selected.role}
                  disabled={busy}
                  onValueChange={(v) => changeRole(selected, v)}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog */}
      <Dialog open={confirmAction !== null} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {confirmLabel}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.type === "suspend"
                ? t("admin.users.suspendDescription")
                : t("admin.users.deleteDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmAction(null)}>{t("common.cancel")}</Button>
            <Button
              variant={confirmAction?.type === "suspend" ? "destructive" : "destructive"}
              disabled={busy}
              onClick={runAction}
            >
              {busy ? t("admin.users.working") : confirmAction?.type === "suspend" ? t("admin.users.suspend") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
