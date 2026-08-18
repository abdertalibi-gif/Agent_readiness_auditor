"use client";

import { useState } from "react";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ApiKey {
  id: string;
  name: string;
  key: string;
  scope: "read" | "write";
  created: string;
}

export default function ApiSettingsPage() {
  const { t } = useI18n();
  const [keys, setKeys] = useState<ApiKey[]>([
    { id: "1", name: "Production crawler", key: "ara_live_••••••••3f9a", scope: "write", created: "Jan 12, 2026" },
  ]);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "write">("write");

  function createKey(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(t("settingsApi.nameRequired"));
      return;
    }
    const key: ApiKey = {
      id: crypto.randomUUID(),
      name,
      key: `ara_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      scope,
      created: new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }),
    };
    setKeys((k) => [key, ...k]);
    setName("");
    toast.success(t("settings.apiKeyCreated"), { description: key.key });
  }

  function removeKey(id: string) {
    setKeys((k) => k.filter((x) => x.id !== id));
    toast.success(t("settings.apiKeyRevoked"));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.apiKeys")}</h1>
        <p className="text-sm text-muted-foreground">{t("settingsApi.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.createKey")}</CardTitle>
          <CardDescription>{t("settingsApi.createKeyDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createKey} className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1 space-y-1.5">
              <Label htmlFor="key-name">{t("settings.keyName")}</Label>
              <Input id="key-name" placeholder={t("settingsApi.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="w-36 space-y-1.5">
              <Label>{t("settings.scope")}</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as "read" | "write")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">{t("settings.readOnly")}</SelectItem>
                  <SelectItem value="write">{t("settings.readWrite")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit">
              <Plus className="h-4 w-4" /> {t("settings.createKeyButton")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.yourKeys")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("settings.name")}</TableHead>
                <TableHead>{t("settingsApi.keyHeading")}</TableHead>
                <TableHead>{t("settings.scope")}</TableHead>
                <TableHead>{t("common.created")}</TableHead>
                <TableHead className="text-right">{t("settingsApi.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell className="font-mono text-xs">{k.key}</TableCell>
                  <TableCell>
                    <Badge variant={k.scope === "write" ? "secondary" : "outline"}>{k.scope}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{k.created}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard?.writeText(k.key); toast.success(t("settingsApi.keyCopied")); }}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => removeKey(k.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {keys.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    {t("settingsApi.noKeys")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-lg border p-4 text-sm text-muted-foreground">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{t("settings.apiKeyNote")}</p>
      </div>
    </div>
  );
}
