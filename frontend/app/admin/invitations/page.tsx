"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Check, Mail, Pencil } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type { AdminInvitation } from "@/lib/types";
import { useI18n } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLES = ["MEMBER", "ADMIN", "OWNER", "VIEWER"] as const;

export default function AdminInvitationsPage() {
  const { t } = useI18n();
  const [invitations, setInvitations] = useState<AdminInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editing, setEditing] = useState<AdminInvitation | null>(null);
  const [editRole, setEditRole] = useState<string>(ROLES[0]);
  const [editEmail, setEditEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setInvitations((await api.adminInvitations()).items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.invitations.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const data = await api.adminInvitations();
        if (!cancelled) setInvitations(data.items);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : t("admin.invitations.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadInitial();
    return () => {
      cancelled = true;
    };
  }, [t]);

  function openEdit(inv: AdminInvitation) {
    setEditing(inv);
    setEditRole(inv.role);
    setEditEmail(inv.email);
  }

  async function accept(inv: AdminInvitation) {
    setBusyId(inv.id);
    try {
      await api.adminAcceptInvitation(inv.id);
      toast.success(t("admin.invitations.accepted", { email: inv.email }));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.invitations.acceptFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(inv: AdminInvitation) {
    setBusyId(inv.id);
    try {
      await api.adminCancelInvitation(inv.id);
      toast.success(t("admin.invitations.cancelled", { email: inv.email }));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.invitations.cancelFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const email = editEmail.trim();
    if (!email) {
      toast.error(t("admin.invitations.emailRequired"));
      return;
    }
    setSaving(true);
    try {
      await api.adminUpdateInvitation(editing.id, { role: editRole, email });
      toast.success(t("admin.invitations.updated", { email }));
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.invitations.updateFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t("admin.invitations.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("admin.invitations.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.invitations.pendingCount", { count: invitations.length })}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">{t("admin.invitations.loading")}</div>
          ) : invitations.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center text-sm text-muted-foreground">
              <Mail className="h-6 w-6" />
              {t("admin.invitations.none")}
            </div>
          ) : (
            <ul className="divide-y">
              {invitations.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-3 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{inv.email}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("admin.invitations.meta", { role: inv.role, date: new Date(inv.expires_at).toLocaleDateString() })}
                    </p>
                  </div>
                  <Badge variant="warning">{inv.status}</Badge>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      disabled={busyId === inv.id}
                      onClick={() => accept(inv)}
                    >
                      <Check className="h-3.5 w-3.5" /> {t("admin.invitations.acceptButton")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === inv.id}
                      onClick={() => openEdit(inv)}
                    >
                      <Pencil className="h-3.5 w-3.5" /> {t("admin.invitations.editButton")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyId === inv.id}
                      onClick={() => cancel(inv)}
                    >
                      <Ban className="h-3.5 w-3.5" /> {t("common.cancel")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.invitations.editTitle")}</DialogTitle>
            <DialogDescription>
              {t("admin.invitations.editDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="invite-email">{t("auth.email")}</Label>
              <Input
                id="invite-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="colleague@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("team.role")}</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r.toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("common.cancel")}</Button>
            </DialogClose>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? t("admin.invitations.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
