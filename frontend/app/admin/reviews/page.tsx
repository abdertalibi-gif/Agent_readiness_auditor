"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, EyeOff, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { useI18n } from "@/components/i18n-provider";
import { Stars } from "@/components/reviews/rating-widget";
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
import type { AdminReviewOut } from "@/lib/types";

const STATUS_VARIANT: Record<string, "secondary" | "success" | "destructive" | "warning"> = {
  PENDING: "secondary",
  APPROVED: "success",
  HIDDEN: "destructive",
};

type FilterStatus = "ALL" | "PENDING" | "APPROVED" | "HIDDEN";

export default function AdminReviewsPage() {
  const { t, formatDate } = useI18n();
  const [reviews, setReviews] = useState<AdminReviewOut[]>([]);
  const [filter, setFilter] = useState<FilterStatus>("ALL");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AdminReviewOut | null>(null);

  const load = useCallback(async (status?: string) => {
    setLoading(true);
    try {
      const data = await api.adminReviews(status);
      setReviews(data.items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.reviews.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const data = await api.adminReviews();
        if (!cancelled) setReviews(data.items);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : t("admin.reviews.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadInitial();
    return () => {
      cancelled = true;
    };
  }, [t]);

  function changeFilter(next: FilterStatus) {
    setFilter(next);
    void load(next === "ALL" ? undefined : next);
  }

  async function approve(review: AdminReviewOut) {
    setBusy(true);
    try {
      await api.adminApproveReview(review.id);
      toast.success(t("admin.reviews.approved"));
      await load(filter === "ALL" ? undefined : filter);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.reviews.actionFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function hide(review: AdminReviewOut) {
    setBusy(true);
    try {
      await api.adminHideReview(review.id);
      toast.success(t("admin.reviews.hidden"));
      await load(filter === "ALL" ? undefined : filter);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.reviews.actionFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await api.adminDeleteReview(confirmDelete.id);
      toast.success(t("admin.reviews.deleted"));
      setConfirmDelete(null);
      await load(filter === "ALL" ? undefined : filter);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.reviews.actionFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t("admin.reviews.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("admin.reviews.subtitle")}</p>
      </div>

      <div className="flex items-center gap-2">
        <Select value={filter} onValueChange={(v) => changeFilter(v as FilterStatus)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("admin.reviews.all")}</SelectItem>
            <SelectItem value="PENDING">{t("admin.reviews.pending")}</SelectItem>
            <SelectItem value="APPROVED">{t("admin.reviews.approved")}</SelectItem>
            <SelectItem value="HIDDEN">{t("admin.reviews.hidden")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground">{t("admin.reviews.shown", { count: reviews.length })}</div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">{t("admin.reviews.loading")}</div>
          ) : reviews.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">{t("admin.reviews.none")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-6 py-3 font-medium">{t("admin.reviews.user")}</th>
                    <th className="px-6 py-3 font-medium">{t("admin.reviews.audit")}</th>
                    <th className="px-6 py-3 font-medium">{t("admin.reviews.rating")}</th>
                    <th className="px-6 py-3 font-medium">{t("admin.reviews.comment")}</th>
                    <th className="px-6 py-3 font-medium">{t("admin.reviews.status")}</th>
                    <th className="px-6 py-3 font-medium">{t("admin.reviews.created")}</th>
                    <th className="px-6 py-3 text-end font-medium">{t("admin.reviews.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {reviews.map((review) => (
                    <tr key={review.id} className="hover:bg-muted/50">
                      <td className="max-w-[200px] px-6 py-3">
                        <div className="truncate font-medium">{review.user_name ?? "—"}</div>
                        <div className="truncate text-xs text-muted-foreground">{review.user_email}</div>
                      </td>
                      <td className="max-w-[240px] truncate px-6 py-3 text-muted-foreground">
                        {review.audit_url ?? "—"}
                      </td>
                      <td className="px-6 py-3">
                        <Stars rating={review.rating} />
                      </td>
                      <td className="max-w-[280px] px-6 py-3">
                        <span className="line-clamp-2 text-muted-foreground">{review.comment ?? "—"}</span>
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant={STATUS_VARIANT[review.status] ?? "secondary"}>
                          {t(`reviews.status.${review.status}`)}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-xs text-muted-foreground">
                        {formatDate(review.created_at)}
                      </td>
                      <td className="px-6 py-3 text-end">
                        <div className="flex justify-end gap-1">
                          {review.status !== "APPROVED" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t("admin.reviews.approve")}
                              onClick={() => approve(review)}
                              disabled={busy}
                            >
                              <Check className="h-4 w-4 text-success" />
                            </Button>
                          )}
                          {review.status !== "HIDDEN" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t("admin.reviews.hide")}
                              onClick={() => hide(review)}
                              disabled={busy}
                            >
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t("admin.reviews.delete")}
                            onClick={() => setConfirmDelete(review)}
                            disabled={busy}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t("admin.reviews.deleteConfirm")}
            </DialogTitle>
            <DialogDescription>{t("admin.reviews.deleteDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmDelete(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" disabled={busy} onClick={remove}>
              {busy ? t("admin.reviews.working") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
