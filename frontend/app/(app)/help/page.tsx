"use client";

import Link from "next/link";
import {
  BookOpen,
  FileQuestion,
  FileText,
  Mail,
  MessageCircle,
  Search,
  Video,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";

const TOPICS = [
  { icon: FileQuestion, titleKey: "helpTopics.gettingStarted", descKey: "helpTopics.gettingStartedDesc", href: "/audit/new" },
  { icon: BookOpen, titleKey: "helpTopics.understandingScores", descKey: "helpTopics.understandingScoresDesc", href: "/audits" },
  { icon: FileText, titleKey: "helpTopics.readingReport", descKey: "helpTopics.readingReportDesc", href: "/reports" },
];

const CHANNELS = [
  { icon: MessageCircle, titleKey: "helpChannels.liveChat", descKey: "helpChannels.liveChatDesc" },
  { icon: Video, titleKey: "helpChannels.videoGuides", descKey: "helpChannels.videoGuidesDesc" },
  { icon: Mail, titleKey: "helpChannels.emailSupport", descKey: "helpChannels.emailSupportDesc" },
];

export default function HelpPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("help.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("help.subtitle")}</p>
      </div>

      <Card className="bg-primary text-primary-foreground">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-8">
          <div>
            <div className="flex items-center gap-2 text-2xl font-bold">
              <Search className="h-6 w-6" /> {t("help.hero")}
            </div>
            <p className="mt-1 text-sm text-primary-foreground/80">
              {t("help.searchHint")}
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/audit/new">{t("help.runAudit")}</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {TOPICS.map((topic) => (
          <Link key={topic.titleKey} href={topic.href}>
            <Card className="h-full transition-colors hover:border-primary/50 hover:bg-accent/30">
              <CardHeader>
                <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <topic.icon className="h-5 w-5" />
                </span>
                <CardTitle className="text-base">{t(topic.titleKey)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{t(topic.descKey)}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">{t("help.contactSupport")}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {CHANNELS.map((channel) => (
            <Card key={channel.titleKey}>
              <CardHeader>
                <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <channel.icon className="h-5 w-5" />
                </span>
                <CardTitle className="text-base">{t(channel.titleKey)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{t(channel.descKey)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
