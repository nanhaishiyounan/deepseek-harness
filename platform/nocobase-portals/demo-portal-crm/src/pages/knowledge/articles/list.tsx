import {
  useList,
  useTranslate,
  useUpdate,
  type CrudFilters,
} from "@refinedev/core";
import {
  BookText,
  Eye,
  FileEdit,
  FileText,
  LayoutGrid,
  Pencil,
  Plus,
  Table2,
  ThumbsDown,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router";
import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { Breadcrumb } from "@/components/app-shell/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  CategoryTreeFilter,
  descendantIdsOf,
  useCategoryTree,
} from "../category-tree";
import {
  ARTICLE_STATUSES,
  formatDate,
  formatNumber,
  labelFor,
} from "../constants";
import {
  getArticleEditPath,
  getArticleShowPath,
  knowledgeRoutes,
} from "../routes";
import { StatusPill, useLocale } from "../shared";
import {
  BulkBar,
  EmptyState,
  ErrorState,
  ExportCsvButton,
  KpiBar,
  SavedViewBar,
  Toolbar,
  ToolbarSearch,
  downloadCsv,
  useSavedViews,
  useUrlState,
} from "@/lib/table-kit";
import type { ArticleRecord, FeedbackRecord } from "../types";

const STORAGE_KEY = "hub.kb.articles";
const PAGE_SIZE = 24;

const URL_DEFAULTS: Record<
  "q" | "status" | "category" | "sort" | "view" | "page",
  string
> = {
  q: "",
  status: "",
  category: "",
  sort: "updatedAt",
  view: "cards",
  page: "1",
};

export function ArticlesLayout() {
  return (
    <CanAccess resource="hub_kb_articles" action="list" fallback={<AccessDenied />}>
      <ArticlesBrowser />
    </CanAccess>
  );
}

function ArticlesBrowser() {
  const translate = useTranslate();
  const locale = useLocale();
  const { tree, total, isLoading: treeLoading } = useCategoryTree();
  const { mutate: updateArticle } = useUpdate<ArticleRecord>();

  const { state, setState, query: urlQuery, applyQuery, reset } =
    useUrlState(URL_DEFAULTS);
  const { views, save: saveView, remove: removeView } = useSavedViews(STORAGE_KEY);
  const [activeView, setActiveView] = useState<string | null>("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const page = Math.max(1, Number(state.page) || 1);

  const categoryIds = useMemo(
    () => (state.category ? descendantIdsOf(tree, state.category) : null),
    [tree, state.category]
  );

  const filters = useMemo<CrudFilters>(() => {
    const out: CrudFilters = [];
    if (categoryIds) {
      out.push({ field: "category_id", operator: "in", value: categoryIds });
    }
    if (state.status) {
      out.push({ field: "status", operator: "eq", value: state.status });
    }
    const term = state.q.trim();
    if (term) {
      out.push({ field: "title", operator: "contains", value: term });
    }
    return out;
  }, [categoryIds, state.q, state.status]);

  const sorters = useMemo(() => {
    if (state.sort === "views") return [{ field: "views", order: "desc" as const }];
    if (state.sort === "title") return [{ field: "title", order: "asc" as const }];
    if (state.sort === "created")
      return [{ field: "createdAt", order: "desc" as const }];
    return [{ field: "updatedAt", order: "desc" as const }];
  }, [state.sort]);

  const { result, query } = useList<ArticleRecord>({
    resource: "hub_kb_articles",
    pagination: { mode: "server", currentPage: page, pageSize: PAGE_SIZE },
    sorters,
    filters,
    meta: { appends: ["category", "author"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const articles = result.data ?? [];
  const totalCount = result.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  /* ---------------------- headline numbers + feedback --------------------- */
  const { result: allResult } = useList<ArticleRecord>({
    resource: "hub_kb_articles",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const { result: feedbackResult } = useList<FeedbackRecord>({
    resource: "hub_kb_article_feedback",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const summary = useMemo(() => {
    const rows = allResult.data;
    const notHelpful = new Set(
      feedbackResult.data
        .filter((row) => row.rating === "not_helpful")
        .map((row) => String(row.article_id ?? ""))
    );
    return {
      total: rows.length,
      published: rows.filter((row) => row.status === "published").length,
      draft: rows.filter((row) => row.status !== "published").length,
      views: rows.reduce((sum, row) => sum + Number(row.views ?? 0), 0),
      flagged: notHelpful.size,
    };
  }, [allResult.data, feedbackResult.data]);

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  const toggle = (id: string, checked: boolean) =>
    setSelected((prev) => ({ ...prev, [id]: checked }));

  const bulkStatus = (status: string) => {
    selectedIds.forEach((id) =>
      updateArticle({
        resource: "hub_kb_articles",
        id,
        values: { status },
        successNotification: false,
        invalidates: ["list"],
      })
    );
    setSelected({});
  };

  const exportList = useList<ArticleRecord>({
    resource: "hub_kb_articles",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    filters,
    sorters,
    meta: { appends: ["category", "author"] },
    errorNotification: false,
    queryOptions: { enabled: false, retry: false },
  });

  const handleExport = useCallback(async () => {
    const response = await exportList.query.refetch();
    const rows = response.data?.data ?? [];
    downloadCsv(
      `articles-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        translate("knowledge.articles.columns.title", { ns: "starter" }, "Title"),
        translate("knowledge.articles.columns.category", { ns: "starter" }, "Category"),
        translate("knowledge.articles.columns.status", { ns: "starter" }, "Status"),
        translate("knowledge.articles.columns.author", { ns: "starter" }, "Author"),
        translate("knowledge.articles.columns.views", { ns: "starter" }, "Views"),
        translate("knowledge.articles.columns.updated", { ns: "starter" }, "Updated"),
      ],
      rows.map((row) => [
        row.title,
        row.category?.name,
        labelFor(ARTICLE_STATUSES, row.status ?? "draft", translate),
        row.author?.nickname,
        row.views ?? 0,
        row.updatedAt ? String(row.updatedAt).slice(0, 10) : "",
      ])
    );
  }, [exportList.query, translate]);

  const presets = useMemo(
    () => [
      {
        key: "all",
        label: translate("knowledge.views.all", { ns: "starter" }, "All articles"),
        query: "",
      },
      {
        key: "published",
        label: translate("knowledge.views.published", { ns: "starter" }, "Published"),
        query: "status=published",
      },
      {
        key: "drafts",
        label: translate("knowledge.views.drafts", { ns: "starter" }, "Drafts"),
        query: "status=draft",
      },
      {
        key: "popular",
        label: translate("knowledge.views.popular", { ns: "starter" }, "Most read"),
        query: "sort=views",
      },
      {
        key: "recent",
        label: translate("knowledge.views.recent", { ns: "starter" }, "Recently updated"),
        query: "sort=updatedAt",
      },
    ],
    [translate]
  );

  const sortOptions = [
    {
      value: "updatedAt",
      label: translate("knowledge.sort.updated", { ns: "starter" }, "Recently updated"),
    },
    {
      value: "created",
      label: translate("knowledge.sort.created", { ns: "starter" }, "Newest"),
    },
    {
      value: "views",
      label: translate("knowledge.sort.views", { ns: "starter" }, "Most read"),
    },
    {
      value: "title",
      label: translate("knowledge.sort.title", { ns: "starter" }, "Title A–Z"),
    },
  ];

  const kpiItems = [
    {
      key: "total",
      label: translate("knowledge.overview.kpi.total", { ns: "starter" }, "Total articles"),
      value: formatNumber(summary.total, locale),
      hint: translate(
        "knowledge.overview.kpi.total.sub",
        { ns: "starter" },
        "Across every category"
      ),
      icon: <BookText className="size-4" />,
      tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
      active: !state.status,
      onClick: () => {
        setState({ status: "", page: "1" });
        setActiveView("all");
      },
    },
    {
      key: "published",
      label: translate("knowledge.overview.kpi.published", { ns: "starter" }, "Published"),
      value: formatNumber(summary.published, locale),
      hint: translate(
        "knowledge.overview.kpi.published.sub",
        { ns: "starter" },
        "Live for everyone"
      ),
      icon: <FileText className="size-4" />,
      tone: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-400",
      active: state.status === "published",
      onClick: () => {
        setState({ status: "published", page: "1" });
        setActiveView("published");
      },
    },
    {
      key: "drafts",
      label: translate("knowledge.overview.kpi.drafts", { ns: "starter" }, "Drafts"),
      value: formatNumber(summary.draft, locale),
      hint: translate(
        "knowledge.overview.kpi.drafts.sub",
        { ns: "starter" },
        "Not yet published"
      ),
      icon: <FileEdit className="size-4" />,
      tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
      active: state.status === "draft",
      onClick: () => {
        setState({ status: "draft", page: "1" });
        setActiveView("drafts");
      },
    },
    {
      key: "flagged",
      label: translate("knowledge.kpi.flagged", { ns: "starter" }, "Flagged by readers"),
      value: formatNumber(summary.flagged, locale),
      hint: translate(
        "knowledge.kpi.flaggedHint",
        { ns: "starter" },
        "Have at least one 'not helpful'"
      ),
      icon: <ThumbsDown className="size-4" />,
      tone: "text-red-600 bg-red-500/12 dark:text-red-400",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center text-muted-foreground">
          <Breadcrumb />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.035em]">
              {translate("knowledge.articles.title", { ns: "starter" }, "Articles")}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {translate(
                "knowledge.articles.subtitle",
                { ns: "starter" },
                "Browse the knowledge base by category, or search across every article."
              )}
            </p>
          </div>
          <Button nativeButton={false} render={<Link to={knowledgeRoutes.articlesCreate} />}>
            <Plus />
            {translate("knowledge.articles.new", { ns: "starter" }, "New article")}
          </Button>
        </div>
      </div>

      <KpiBar items={kpiItems} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <Card className="p-3">
            <p className="px-2.5 pt-1 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {translate("knowledge.tree.title", { ns: "starter" }, "Categories")}
            </p>
            <CategoryTreeFilter
              tree={tree}
              total={total}
              isLoading={treeLoading}
              selectedId={state.category || null}
              onSelect={(id) => {
                setState({ category: id ?? "", page: "1" });
                setActiveView(null);
              }}
            />
          </Card>
        </aside>

        <section className="flex flex-col gap-4">
          <Toolbar>
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <ToolbarSearch i18nPrefix="knowledge.toolkit"
                value={state.q}
                onChange={(value) => {
                  setState({ q: value, page: "1" });
                  setActiveView(null);
                }}
                placeholder={translate(
                  "knowledge.articles.search",
                  { ns: "starter" },
                  "Search articles..."
                )}
              />
              <select
                value={state.sort}
                onChange={(event) =>
                  setState({ sort: event.currentTarget.value, page: "1" })
                }
                className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {filters.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => {
                    reset();
                    setActiveView("all");
                  }}
                >
                  {translate("knowledge.toolkit.resetFilters", { ns: "starter" }, "Reset")}
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <ExportCsvButton i18nPrefix="knowledge.toolkit" onExport={handleExport} />
              <Tabs
                value={state.view}
                onValueChange={(value) => setState({ view: value })}
              >
                <TabsList>
                  <TabsTrigger value="cards">
                    <LayoutGrid className="size-3.5" />
                    {translate("knowledge.view.cards", { ns: "starter" }, "Cards")}
                  </TabsTrigger>
                  <TabsTrigger value="table">
                    <Table2 className="size-3.5" />
                    {translate("knowledge.view.table", { ns: "starter" }, "Table")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </Toolbar>

          <SavedViewBar i18nPrefix="knowledge.toolkit"
            presets={presets}
            views={views}
            activeKey={activeView}
            onApply={(viewQuery, key) => {
              applyQuery(viewQuery);
              setActiveView(key);
              setSelected({});
            }}
            onSave={(name) => {
              const view = saveView(name, urlQuery);
              setActiveView(view.id);
            }}
            onDelete={removeView}
          />

          {query.isError ? (
            <ErrorState i18nPrefix="knowledge.toolkit" onRetry={() => query.refetch()} />
          ) : query.isLoading ? (
            <div
              className={cn(
                state.view === "table"
                  ? "space-y-2"
                  : "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
              )}
            >
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton
                  key={index}
                  className={cn(
                    "w-full rounded-xl",
                    state.view === "table" ? "h-12" : "h-44"
                  )}
                />
              ))}
            </div>
          ) : articles.length === 0 ? (
            <EmptyState
              icon={<FileText className="size-8" />}
              title={translate(
                "knowledge.articles.empty.title",
                { ns: "starter" },
                "No articles found"
              )}
              description={translate(
                "knowledge.articles.empty.description",
                { ns: "starter" },
                "Try a different category or search term, or write a new article."
              )}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link to={knowledgeRoutes.articlesCreate} />}
                >
                  <Plus />
                  {translate("knowledge.articles.new", { ns: "starter" }, "New article")}
                </Button>
              }
            />
          ) : state.view === "table" ? (
            <ArticleTable
              articles={articles}
              locale={locale}
              selected={selected}
              onToggle={toggle}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {articles.map((article) => (
                <ArticleCard
                  key={String(article.id)}
                  article={article}
                  locale={locale}
                  selected={Boolean(selected[String(article.id)])}
                  onToggle={(checked) => toggle(String(article.id), checked)}
                />
              ))}
            </div>
          )}

          {totalCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground tabular-nums">
                {translate(
                  "knowledge.articles.pageInfo",
                  {
                    ns: "starter",
                    from: (page - 1) * PAGE_SIZE + 1,
                    to: Math.min(page * PAGE_SIZE, totalCount),
                    total: totalCount,
                  },
                  `${(page - 1) * PAGE_SIZE + 1}–${Math.min(
                    page * PAGE_SIZE,
                    totalCount
                  )} of ${totalCount}`
                )}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setState({ page: String(page - 1) })}
                >
                  {translate("knowledge.articles.prev", { ns: "starter" }, "Previous")}
                </Button>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {page} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount}
                  onClick={() => setState({ page: String(page + 1) })}
                >
                  {translate("knowledge.articles.next", { ns: "starter" }, "Next")}
                </Button>
              </div>
            </div>
          ) : null}

          <BulkBar i18nPrefix="knowledge.toolkit" count={selectedIds.length} onClear={() => setSelected({})}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkStatus("published")}
            >
              {translate("knowledge.bulk.publish", { ns: "starter" }, "Publish")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => bulkStatus("draft")}>
              {translate("knowledge.bulk.unpublish", { ns: "starter" }, "Move to draft")}
            </Button>
          </BulkBar>
        </section>
      </div>
    </div>
  );
}

function ArticleTable({
  articles,
  locale,
  selected,
  onToggle,
}: {
  articles: ArticleRecord[];
  locale: string;
  selected: Record<string, boolean>;
  onToggle: (id: string, checked: boolean) => void;
}) {
  const translate = useTranslate();
  const allSelected = articles.every((article) => selected[String(article.id)]);

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/45 text-left text-xs text-muted-foreground">
            <th className="w-10 px-3 py-2">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) =>
                  articles.forEach((article) =>
                    onToggle(String(article.id), Boolean(checked))
                  )
                }
                aria-label={translate(
                  "knowledge.toolkit.selectAll",
                  { ns: "starter" },
                  "Select all rows"
                )}
              />
            </th>
            <th className="px-3 py-2 font-medium">
              {translate("knowledge.articles.columns.title", { ns: "starter" }, "Title")}
            </th>
            <th className="px-3 py-2 font-medium">
              {translate(
                "knowledge.articles.columns.category",
                { ns: "starter" },
                "Category"
              )}
            </th>
            <th className="px-3 py-2 font-medium">
              {translate("knowledge.articles.columns.status", { ns: "starter" }, "Status")}
            </th>
            <th className="px-3 py-2 font-medium">
              {translate("knowledge.articles.columns.author", { ns: "starter" }, "Author")}
            </th>
            <th className="px-3 py-2 text-right font-medium">
              {translate("knowledge.articles.columns.views", { ns: "starter" }, "Views")}
            </th>
            <th className="px-3 py-2 font-medium">
              {translate(
                "knowledge.articles.columns.updated",
                { ns: "starter" },
                "Updated"
              )}
            </th>
            <th className="px-3 py-2 font-medium">
              {translate("knowledge.articles.columns.actions", { ns: "starter" }, "Actions")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {articles.map((article) => (
            <tr key={String(article.id)} className="group hover:bg-accent/30">
              <td className="px-3 py-2">
                <Checkbox
                  checked={Boolean(selected[String(article.id)])}
                  onCheckedChange={(checked) =>
                    onToggle(String(article.id), Boolean(checked))
                  }
                  aria-label={translate(
                    "knowledge.toolkit.selectRow",
                    { ns: "starter" },
                    "Select row"
                  )}
                />
              </td>
              <td className="max-w-md px-3 py-2">
                <Link
                  to={getArticleShowPath(article.id)}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  {article.title ||
                    translate("knowledge.common.untitled", { ns: "starter" }, "Untitled")}
                </Link>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {article.category?.name ??
                  translate(
                    "knowledge.common.uncategorized",
                    { ns: "starter" },
                    "Uncategorized"
                  )}
              </td>
              <td className="px-3 py-2">
                <StatusPill
                  value={article.status ?? "draft"}
                  label={labelFor(ARTICLE_STATUSES, article.status ?? "draft", translate)}
                />
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {article.author?.nickname ??
                  translate("knowledge.common.unknown", { ns: "starter" }, "Unknown")}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatNumber(article.views, locale)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                {formatDate(article.updatedAt, locale)}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    nativeButton={false}
                    render={<Link to={getArticleShowPath(article.id)} />}
                  >
                    <Eye />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    nativeButton={false}
                    render={<Link to={getArticleEditPath(article.id)} />}
                  >
                    <Pencil />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ArticleCard({
  article,
  locale,
  selected,
  onToggle,
}: {
  article: ArticleRecord;
  locale: string;
  selected: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const translate = useTranslate();
  const uncategorized = translate(
    "knowledge.common.uncategorized",
    { ns: "starter" },
    "Uncategorized"
  );
  const untitled = translate("knowledge.common.untitled", { ns: "starter" }, "Untitled");
  const unknown = translate("knowledge.common.unknown", { ns: "starter" }, "Unknown");

  return (
    <Card
      className={cn(
        "group relative flex flex-col gap-3 p-5 transition-shadow hover:shadow-[0_2px_12px_rgba(0,0,0,0.08)]",
        selected && "border-primary ring-1 ring-primary/25"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex w-fit items-center rounded-md bg-blue-500/10 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
          {article.category?.name ?? uncategorized}
        </span>
        <div className="flex items-center gap-2">
          <StatusPill
            value={article.status ?? "draft"}
            label={labelFor(ARTICLE_STATUSES, article.status ?? "draft", translate)}
          />
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) => onToggle(Boolean(checked))}
            aria-label={translate(
              "knowledge.toolkit.selectRow",
              { ns: "starter" },
              "Select row"
            )}
            className={cn(
              "transition-opacity",
              !selected && "opacity-0 group-hover:opacity-100"
            )}
          />
        </div>
      </div>

      <Link to={getArticleShowPath(article.id)} className="min-w-0">
        <h3 className="line-clamp-2 text-base leading-snug font-semibold tracking-tight group-hover:text-primary">
          {article.title || untitled}
        </h3>
        {article.summary ? (
          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
            {article.summary}
          </p>
        ) : null}
      </Link>

      <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
        <span className="truncate">
          {article.author?.nickname ?? unknown} ·{" "}
          {formatDate(article.updatedAt, locale)}
        </span>
        <span className="flex shrink-0 items-center gap-1 tabular-nums">
          <Eye className="size-3.5" />
          {formatNumber(article.views, locale)}
        </span>
      </div>

      <div className="flex items-center gap-1 border-t border-border/60 pt-3">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to={getArticleShowPath(article.id)} />}
        >
          <Eye />
          {translate("knowledge.articles.card.read", { ns: "starter" }, "Read")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to={getArticleEditPath(article.id)} />}
        >
          <Pencil />
          {translate("knowledge.articles.card.edit", { ns: "starter" }, "Edit")}
        </Button>
      </div>
    </Card>
  );
}
