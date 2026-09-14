import { useList, useTranslate } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import {
  BookText,
  Clock,
  Eye,
  FileEdit,
  FileText,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useChartTheme } from "@/pages/home/theme";
import { nocobaseClient } from "@nocobase/portal-sdk/client";
import { useCategoryTree } from "./category-tree";
import { ARTICLE_STATUSES, formatNumber, labelFor } from "./constants";
import { getArticleShowPath } from "./routes";
import { StatusPill, useLocale } from "./shared";
import type { ArticleRecord, FeedbackRecord } from "./types";

type AggregateRow = Record<string, string | number | null>;

function useArticleStats() {
  return useQuery({
    queryKey: ["knowledge", "article-stats"],
    queryFn: async () => {
      const [byStatus, views] = await Promise.all([
        nocobaseClient.action<AggregateRow[]>("hub_kb_articles", "query", {
          body: {
            measures: [{ field: ["id"], aggregation: "count", alias: "count" }],
            dimensions: [{ field: ["status"], alias: "status" }],
          },
        }),
        nocobaseClient.action<AggregateRow[]>("hub_kb_articles", "query", {
          body: {
            measures: [
              { field: ["views"], aggregation: "sum", alias: "total_views" },
              { field: ["id"], aggregation: "count", alias: "count" },
            ],
          },
        }),
      ]);
      const statusCounts = new Map<string, number>();
      for (const row of byStatus ?? []) {
        statusCounts.set(String(row.status ?? "draft"), Number(row.count ?? 0));
      }
      return {
        statusCounts,
        totalViews: Number(views?.[0]?.total_views ?? 0),
        totalArticles: Number(views?.[0]?.count ?? 0),
      };
    },
  });
}

export function KnowledgeOverview() {
  const translate = useTranslate();
  const locale = useLocale();
  const theme = useChartTheme();
  const stats = useArticleStats();
  const { tree, isLoading: treeLoading } = useCategoryTree();

  const feedback = useList<FeedbackRecord>({
    resource: "hub_kb_article_feedback",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    meta: { appends: ["article"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const recentlyUpdated = useList<ArticleRecord>({
    resource: "hub_kb_articles",
    pagination: { mode: "server", currentPage: 1, pageSize: 6 },
    sorters: [{ field: "updatedAt", order: "desc" }],
    meta: { appends: ["category", "author"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const mostViewed = useList<ArticleRecord>({
    resource: "hub_kb_articles",
    pagination: { mode: "server", currentPage: 1, pageSize: 6 },
    sorters: [{ field: "views", order: "desc" }],
    meta: { appends: ["category"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  // Reader sentiment per article — the basis of the "needs improvement" queue.
  const sentiment = useMemo(() => {
    const byArticle = new Map<
      string,
      { title: string; helpful: number; notHelpful: number }
    >();
    let helpful = 0;
    let notHelpful = 0;
    for (const row of feedback.result.data) {
      const key = String(row.article_id ?? row.article?.id ?? "");
      if (!key) continue;
      const entry =
        byArticle.get(key) ??
        { title: row.article?.title ?? "", helpful: 0, notHelpful: 0 };
      if (row.rating === "helpful") {
        entry.helpful += 1;
        helpful += 1;
      } else {
        entry.notHelpful += 1;
        notHelpful += 1;
      }
      if (!entry.title && row.article?.title) entry.title = row.article.title;
      byArticle.set(key, entry);
    }
    const needsWork = [...byArticle.entries()]
      .map(([id, entry]) => ({
        id,
        ...entry,
        total: entry.helpful + entry.notHelpful,
        ratio:
          entry.helpful + entry.notHelpful > 0
            ? entry.helpful / (entry.helpful + entry.notHelpful)
            : 1,
      }))
      .filter((entry) => entry.notHelpful > 0 && entry.ratio < 0.6)
      .sort((a, b) => a.ratio - b.ratio || b.notHelpful - a.notHelpful)
      .slice(0, 6);
    const rated = helpful + notHelpful;
    return {
      helpful,
      notHelpful,
      rated,
      score: rated ? Math.round((helpful / rated) * 100) : 0,
      needsWork,
    };
  }, [feedback.result.data]);

  const published = stats.data?.statusCounts.get("published") ?? 0;
  const drafts = stats.data?.statusCounts.get("draft") ?? 0;
  const totalArticles = stats.data?.totalArticles ?? 0;
  const totalViews = stats.data?.totalViews ?? 0;

  const uncategorized = translate(
    "knowledge.common.uncategorized",
    { ns: "starter" },
    "Uncategorized"
  );
  const untitled = translate(
    "knowledge.common.untitled",
    { ns: "starter" },
    "Untitled"
  );

  const statusOption = useMemo(() => {
    const data = ARTICLE_STATUSES.map((status, index) => ({
      name: labelFor(ARTICLE_STATUSES, status.value, translate),
      value: stats.data?.statusCounts.get(status.value) ?? 0,
      itemStyle: { color: theme.palette[index % theme.palette.length] },
    }));
    return {
      tooltip: {
        trigger: "item",
        backgroundColor: theme.tooltipBg,
        borderColor: theme.tooltipBorder,
        textStyle: { color: theme.tooltipText },
      },
      legend: {
        bottom: 0,
        textStyle: { color: theme.axis },
        icon: "circle",
      },
      series: [
        {
          type: "pie",
          radius: ["55%", "78%"],
          center: ["50%", "44%"],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 6, borderColor: theme.tooltipBg, borderWidth: 2 },
          label: { show: false },
          data,
        },
      ],
    };
  }, [stats.data, theme, translate]);

  const categoryOption = useMemo(() => {
    const rows = tree
      .map((node) => ({ name: node.name ?? untitled, value: node.articleCount }))
      .sort((a, b) => b.value - a.value);
    return {
      grid: { left: 8, right: 16, top: 12, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: theme.tooltipBg,
        borderColor: theme.tooltipBorder,
        textStyle: { color: theme.tooltipText },
      },
      xAxis: {
        type: "value",
        axisLabel: { color: theme.axis },
        splitLine: { lineStyle: { color: theme.grid } },
      },
      yAxis: {
        type: "category",
        data: rows.map((row) => row.name).reverse(),
        axisLabel: { color: theme.axis },
        axisLine: { lineStyle: { color: theme.grid } },
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          barWidth: "55%",
          data: rows.map((row) => row.value).reverse(),
          itemStyle: { color: theme.palette[0], borderRadius: [0, 6, 6, 0] },
        },
      ],
    };
  }, [tree, theme, untitled]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-3xl font-semibold tracking-[-0.035em]">
          {translate("knowledge.overview.title", { ns: "starter" }, "Knowledge base")}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {translate(
            "knowledge.overview.subtitle",
            { ns: "starter" },
            "What's documented, what's still in draft, and the articles people read most."
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          loading={stats.isLoading}
          icon={<BookText className="size-4" />}
          label={translate("knowledge.overview.kpi.total", { ns: "starter" }, "Total articles")}
          value={formatNumber(totalArticles, locale)}
          sub={translate("knowledge.overview.kpi.total.sub", { ns: "starter" }, "Across every category")}
        />
        <KpiCard
          loading={stats.isLoading}
          icon={<FileText className="size-4" />}
          label={translate("knowledge.overview.kpi.published", { ns: "starter" }, "Published")}
          value={formatNumber(published, locale)}
          sub={translate("knowledge.overview.kpi.published.sub", { ns: "starter" }, "Live for everyone")}
        />
        <KpiCard
          loading={stats.isLoading}
          icon={<FileEdit className="size-4" />}
          label={translate("knowledge.overview.kpi.drafts", { ns: "starter" }, "Drafts")}
          value={formatNumber(drafts, locale)}
          sub={translate("knowledge.overview.kpi.drafts.sub", { ns: "starter" }, "Not yet published")}
        />
        <KpiCard
          loading={stats.isLoading}
          icon={<Eye className="size-4" />}
          label={translate("knowledge.overview.kpi.views", { ns: "starter" }, "Total views")}
          value={formatNumber(totalViews, locale)}
          sub={translate("knowledge.overview.kpi.views.sub", { ns: "starter" }, "All-time reads")}
        />
        <KpiCard
          loading={feedback.query.isLoading}
          icon={<ThumbsUp className="size-4" />}
          label={translate("knowledge.overview.kpi.helpful", { ns: "starter" }, "Helpfulness")}
          value={`${sentiment.score}%`}
          sub={translate(
            "knowledge.overview.kpi.helpful.sub",
            { ns: "starter", count: sentiment.rated },
            `From ${sentiment.rated} ratings`
          )}
        />
        <KpiCard
          loading={feedback.query.isLoading}
          icon={<ThumbsDown className="size-4" />}
          label={translate(
            "knowledge.overview.kpi.needsWork",
            { ns: "starter" },
            "Needs improvement"
          )}
          value={formatNumber(sentiment.needsWork.length, locale)}
          sub={translate(
            "knowledge.overview.kpi.needsWork.sub",
            { ns: "starter" },
            "Rated unhelpful more often than not"
          )}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader>
            <CardTitle>
              {translate("knowledge.overview.byStatus.title", { ns: "starter" }, "Articles by status")}
            </CardTitle>
            <CardDescription>
              {translate("knowledge.overview.byStatus.description", { ns: "starter" }, "Published versus draft.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ReactECharts option={statusOption} style={{ height: 256 }} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {translate("knowledge.overview.byCategory.title", { ns: "starter" }, "Articles by category")}
            </CardTitle>
            <CardDescription>
              {translate(
                "knowledge.overview.byCategory.description",
                { ns: "starter" },
                "How coverage is spread across top-level topics."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {treeLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ReactECharts option={categoryOption} style={{ height: 256 }} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              {translate(
                "knowledge.overview.needsWork.title",
                { ns: "starter" },
                "Needs improvement"
              )}
            </CardTitle>
            <CardDescription>
              {translate(
                "knowledge.overview.needsWork.description",
                { ns: "starter" },
                "Articles readers marked unhelpful more often than helpful."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {feedback.query.isLoading ? (
              <LoadingState className="min-h-40" />
            ) : sentiment.needsWork.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {translate(
                  "knowledge.overview.needsWork.empty",
                  { ns: "starter" },
                  "Nothing is scoring badly right now."
                )}
              </p>
            ) : (
              <div className="space-y-1">
                {sentiment.needsWork.map((entry) => (
                  <Link
                    key={entry.id}
                    to={getArticleShowPath(entry.id)}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-accent"
                  >
                    <p className="min-w-0 truncate text-sm font-medium">
                      {entry.title || untitled}
                    </p>
                    <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
                      <span className="rounded-md bg-red-500/15 px-1.5 py-0.5 font-medium text-red-700 dark:text-red-300">
                        {Math.round(entry.ratio * 100)}%
                      </span>
                      <span className="text-muted-foreground">
                        {translate(
                          "knowledge.overview.needsWork.ratings",
                          { ns: "starter", count: entry.total },
                          `${entry.total} ratings`
                        )}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {translate(
                "knowledge.overview.recent.title",
                { ns: "starter" },
                "Recently updated"
              )}
            </CardTitle>
            <CardDescription>
              {translate(
                "knowledge.overview.recent.description",
                { ns: "starter" },
                "What changed in the knowledge base last."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentlyUpdated.query.isLoading ? (
              <LoadingState className="min-h-40" />
            ) : (
              <div className="space-y-1">
                {recentlyUpdated.result.data.map((article) => (
                  <Link
                    key={String(article.id)}
                    to={getArticleShowPath(article.id)}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {article.title || untitled}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {article.author?.nickname ?? ""}
                        {article.category?.name ? ` · ${article.category.name}` : ""}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
                      <Clock className="size-3.5" />
                      {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                        new Date(article.updatedAt ?? Date.now())
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {translate("knowledge.overview.mostViewed.title", { ns: "starter" }, "Most viewed")}
          </CardTitle>
          <CardDescription>
            {translate("knowledge.overview.mostViewed.description", { ns: "starter" }, "The articles your team reads most.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mostViewed.query.isLoading ? (
            <LoadingState className="min-h-40" />
          ) : mostViewed.result.data.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {translate("knowledge.overview.mostViewed.empty", { ns: "starter" }, "No articles yet.")}
            </p>
          ) : (
            <div className="space-y-1">
              {mostViewed.result.data.map((article, index) => (
                <Link
                  key={String(article.id)}
                  to={getArticleShowPath(article.id)}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-accent"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-5 shrink-0 text-right text-sm font-semibold tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {article.title || untitled}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {article.category?.name ?? uncategorized}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <StatusPill
                      value={article.status ?? "draft"}
                      label={labelFor(ARTICLE_STATUSES, article.status ?? "draft", translate)}
                    />
                    <span className="flex items-center gap-1 text-sm tabular-nums text-muted-foreground">
                      <Eye className="size-3.5" />
                      {formatNumber(article.views, locale)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  loading,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  loading: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="flex size-7 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-300">
            {icon}
          </span>
          <p className="text-sm">{label}</p>
        </div>
        {loading ? (
          <Skeleton className="mt-2 h-8 w-24" />
        ) : (
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
            {value}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
