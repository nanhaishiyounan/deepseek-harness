import { useList, useTranslate } from "@refinedev/core";
import { Eye, FileText, Tags as TagsIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Breadcrumb } from "@/components/app-shell/breadcrumb";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { descendantIdsOf, useCategoryTree } from "./category-tree";
import { ARTICLE_STATUSES, formatDate, formatNumber, labelFor } from "./constants";
import { getArticleShowPath } from "./routes";
import { StatusPill, useLocale } from "./shared";
import type { CategoryNode, ArticleRecord } from "./types";

type FlatTag = { id: string; name: string; articleCount: number };

/** Flatten the category tree into a single list of chips (topic + count). */
function flattenTags(nodes: CategoryNode[], untitled: string): FlatTag[] {
  const out: FlatTag[] = [];
  for (const node of nodes) {
    out.push({
      id: String(node.id),
      name: node.name || untitled,
      articleCount: node.articleCount,
    });
    out.push(...flattenTags(node.children, untitled));
  }
  return out;
}

export function KnowledgeTags() {
  const translate = useTranslate();
  const locale = useLocale();
  const { tree, total, isLoading: treeLoading } = useCategoryTree();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const untitled = translate("knowledge.common.untitled", { ns: "starter" }, "Untitled");
  const uncategorized = translate(
    "knowledge.common.uncategorized",
    { ns: "starter" },
    "Uncategorized"
  );

  const tags = useMemo(
    () => flattenTags(tree, untitled).sort((a, b) => b.articleCount - a.articleCount),
    [tree, untitled]
  );

  const maxCount = useMemo(
    () => tags.reduce((max, tag) => Math.max(max, tag.articleCount), 0),
    [tags]
  );

  const filterIds = useMemo(
    () => (selectedId ? descendantIdsOf(tree, selectedId) : null),
    [tree, selectedId]
  );

  const { result, query } = useList<ArticleRecord>({
    resource: "hub_kb_articles",
    pagination: { mode: "server", currentPage: 1, pageSize: 60 },
    sorters: [{ field: "updatedAt", order: "desc" }],
    filters: filterIds
      ? [{ field: "category_id", operator: "in", value: filterIds }]
      : [],
    meta: { appends: ["category"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const articles = result.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center text-muted-foreground">
          <Breadcrumb />
        </div>
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.035em]">
            {translate("knowledge.tags.title", { ns: "starter" }, "Topics")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {translate(
              "knowledge.tags.subtitle",
              { ns: "starter" },
              "Browse articles by topic. Click a topic to filter the list below."
            )}
          </p>
        </div>
      </div>

      <Card className="p-4">
        {treeLoading ? (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-24 rounded-full" />
            ))}
          </div>
        ) : tags.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <TagsIcon className="size-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">
              {translate("knowledge.tags.empty.title", { ns: "starter" }, "No categories yet")}
            </p>
            <p className="max-w-xs text-sm text-muted-foreground">
              {translate(
                "knowledge.tags.empty.description",
                { ns: "starter" },
                "Create a category to start grouping articles by topic."
              )}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <TagChip
              label={translate("knowledge.tags.all", { ns: "starter" }, "All topics")}
              count={total}
              selected={selectedId === null}
              weight={1}
              onClick={() => setSelectedId(null)}
            />
            {tags.map((tag) => (
              <TagChip
                key={tag.id}
                label={tag.name}
                count={tag.articleCount}
                selected={selectedId === tag.id}
                weight={maxCount > 0 ? tag.articleCount / maxCount : 0}
                onClick={() => setSelectedId(tag.id)}
              />
            ))}
          </div>
        )}
      </Card>

      {query.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <FileText className="size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">
            {translate(
              "knowledge.tags.results.empty.title",
              { ns: "starter" },
              "No articles in this topic"
            )}
          </p>
          <p className="max-w-xs text-sm text-muted-foreground">
            {translate(
              "knowledge.tags.results.empty.description",
              { ns: "starter" },
              "Pick a different topic, or view all articles."
            )}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {articles.map((article) => (
            <Link key={String(article.id)} to={getArticleShowPath(article.id)} className="min-w-0">
              <Card className="group flex h-full flex-col gap-2 p-4 transition-shadow hover:shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-flex w-fit items-center rounded-md bg-blue-500/10 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                    {article.category?.name ?? uncategorized}
                  </span>
                  <StatusPill
                    value={article.status ?? "draft"}
                    label={labelFor(ARTICLE_STATUSES, article.status ?? "draft", translate)}
                  />
                </div>
                <h3 className="line-clamp-2 text-base font-semibold leading-snug tracking-tight group-hover:text-primary">
                  {article.title || untitled}
                </h3>
                {article.summary ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{article.summary}</p>
                ) : null}
                <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
                  <span>{formatDate(article.updatedAt, locale)}</span>
                  <span className="flex shrink-0 items-center gap-1 tabular-nums">
                    <Eye className="size-3.5" />
                    {formatNumber(article.views, locale)}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function TagChip({
  label,
  count,
  selected,
  weight,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  /** 0..1 relative size within the cloud, drives font weight/size. */
  weight: number;
  onClick: () => void;
}) {
  const scaled = 0.8 + weight * 0.35;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ fontSize: `${scaled}rem` }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 transition-colors",
        selected
          ? "border-primary bg-primary/10 font-semibold text-primary"
          : "border-border/70 text-foreground hover:bg-accent"
      )}
    >
      {label}
      <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
    </button>
  );
}
