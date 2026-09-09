import { useList, useShow, useTranslate } from "@refinedev/core";
import { Copy, Link2, Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useOutlet, useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { EditButton } from "@/components/resources/buttons/edit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import { descendantIdsOf, useCategoryTree } from "../category-tree";
import { ARTICLE_STATUSES, formatDate, formatNumber, labelFor } from "../constants";
import { getArticleShowPath } from "../routes";
import {
  useContextualCloseTo,
  useOpenContextualChild,
} from "../route-surfaces";
import {
  DetailItems,
  EmptyRow,
  SimpleTable,
  StatusPill,
  useLocale,
} from "../shared";
import type { ArticleRecord, CategoryRecord } from "../types";

type Tab = "overview" | "articles";

export function CategoryShow({ idParam = "id" }: { idParam?: string }) {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const closeTo = useContextualCloseTo();
  const params = useParams<Record<string, string>>();
  const id = params[idParam];
  const nested = useOutlet();
  const [tab, setTab] = useState<Tab>("overview");
  const [copied, setCopied] = useState(false);
  const { tree } = useCategoryTree();

  const { result: record, query } = useShow<CategoryRecord>({
    resource: "hub_kb_categories",
    id,
    meta: { appends: ["parent"] },
  });

  const categoryIds = useMemo(
    () => (id ? descendantIdsOf(tree, id) : []),
    [id, tree]
  );
  const articles = useList<ArticleRecord>({
    resource: "hub_kb_articles",
    pagination: { mode: "server", currentPage: 1, pageSize: 50 },
    sorters: [{ field: "views", order: "desc" }],
    filters: id
      ? [{ field: "category_id", operator: "in", value: categoryIds }]
      : [],
    meta: { appends: ["author"] },
    errorNotification: false,
    queryOptions: { enabled: Boolean(id), retry: false },
  });
  const articleRows = articles.result.data ?? [];

  const stats = useMemo(() => {
    const direct = articleRows.filter(
      (article) => String(article.category_id) === String(id)
    ).length;
    const published = articleRows.filter(
      (article) => article.status === "published"
    ).length;
    const views = articleRows.reduce(
      (sum, article) => sum + Number(article.views ?? 0),
      0
    );
    return {
      direct,
      tree: articleRows.length,
      publishedShare:
        articleRows.length > 0
          ? Math.round((published / articleRows.length) * 100)
          : 0,
      views,
    };
  }, [articleRows, id]);

  const displayName =
    record?.name ||
    translate("knowledge.common.untitled", { ns: "starter" }, "Untitled");

  const copyLink = () => {
    if (typeof window === "undefined") return;
    void navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <RouteDrawer
      title={
        query.isLoading && !record ? (
          <Skeleton className="h-6 w-40" />
        ) : (
          displayName
        )
      }
      description={translate(
        "knowledge.categories.drawer.show.description",
        { ns: "starter" },
        "Category details and the articles filed under it."
      )}
      closeLabel={translate(
        "knowledge.common.close",
        { ns: "starter" },
        "Close"
      )}
      closeTo={closeTo}
      nested={nested}
      actions={
        record ? (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={copyLink}
              title={translate(
                "knowledge.reader.copyLink",
                { ns: "starter" },
                "Copy link"
              )}
            >
              {copied ? (
                <Copy className="size-4" />
              ) : (
                <Link2 className="size-4" />
              )}
            </Button>
            <EditButton
              resource="hub_kb_categories"
              recordItemId={record.id}
              variant="outline"
              size="icon-sm"
              onClick={() => openChild("edit")}
            >
              <Pencil />
            </EditButton>
          </div>
        ) : null
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {query.isLoading ? (
          <LoadingState className="min-h-64" />
        ) : query.isError || !record ? (
          <Alert variant="destructive">
            <AlertTitle>
              {translate(
                "knowledge.categories.show.error.title",
                { ns: "starter" },
                "Unable to load category"
              )}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "knowledge.categories.show.error.description",
                { ns: "starter" },
                "The category may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
              <TabsList className="w-full">
                <TabsTrigger value="overview">
                  {translate(
                    "knowledge.categories.show.tabs.overview",
                    { ns: "starter" },
                    "Overview"
                  )}
                </TabsTrigger>
                <TabsTrigger value="articles">
                  {translate(
                    "knowledge.categories.show.tabs.articles",
                    { ns: "starter" },
                    "Articles"
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {tab === "overview" ? (
              <CategoryOverview
                record={record}
                locale={locale}
                stats={stats}
                statsLoading={articles.query.isLoading}
              />
            ) : null}

            {tab === "articles" ? (
              <CategoryArticles
                articles={articleRows}
                isLoading={articles.query.isLoading}
                isError={articles.query.isError}
                locale={locale}
                openChild={openChild}
              />
            ) : null}
          </div>
        )}
      </div>
    </RouteDrawer>
  );
}

function CategoryOverview({
  record,
  locale,
  stats,
  statsLoading,
}: {
  record: CategoryRecord;
  locale: string;
  stats: {
    direct: number;
    tree: number;
    publishedShare: number;
    views: number;
  };
  statsLoading: boolean;
}) {
  const translate = useTranslate();
  const loadingValue = statsLoading ? "—" : null;
  const statItems = [
    {
      key: "direct",
      label: translate(
        "knowledge.categories.show.stats.direct",
        { ns: "starter" },
        "Articles"
      ),
      value: loadingValue ?? formatNumber(stats.direct, locale),
    },
    {
      key: "tree",
      label: translate(
        "knowledge.categories.show.stats.tree",
        { ns: "starter" },
        "Articles in tree"
      ),
      value: loadingValue ?? formatNumber(stats.tree, locale),
    },
    {
      key: "published",
      label: translate(
        "knowledge.categories.show.stats.publishedShare",
        { ns: "starter" },
        "Published share"
      ),
      value: loadingValue ?? `${stats.publishedShare}%`,
    },
    {
      key: "views",
      label: translate(
        "knowledge.categories.show.stats.views",
        { ns: "starter" },
        "Total views"
      ),
      value: loadingValue ?? formatNumber(stats.views, locale),
    },
  ];

  return (
    <div className="space-y-6">
      <DetailItems
        title={translate(
          "knowledge.categories.show.overview",
          { ns: "starter" },
          "Overview"
        )}
        items={[
          [
            translate(
              "knowledge.categories.fields.parent",
              { ns: "starter" },
              "Parent category"
            ),
            record.parent?.name ??
              translate(
                "knowledge.categories.show.noParent",
                { ns: "starter" },
                "Top level"
              ),
          ],
          [
            translate(
              "knowledge.categories.fields.description",
              { ns: "starter" },
              "Description"
            ),
            record.description || "—",
          ],
        ]}
      />

      <div className="grid grid-cols-2 gap-3">
        {statItems.map((item) => (
          <div key={item.key} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="inline">
            {translate(
              "knowledge.categories.show.created",
              { ns: "starter" },
              "Created"
            )}
            :{" "}
          </dt>
          <dd className="inline tabular-nums">
            {formatDate(record.createdAt, locale)}
          </dd>
        </div>
        <div>
          <dt className="inline">
            {translate(
              "knowledge.categories.show.updated",
              { ns: "starter" },
              "Last updated"
            )}
            :{" "}
          </dt>
          <dd className="inline tabular-nums">
            {formatDate(record.updatedAt, locale)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function CategoryArticles({
  articles,
  isLoading,
  isError,
  locale,
  openChild,
}: {
  articles: ArticleRecord[];
  isLoading: boolean;
  isError: boolean;
  locale: string;
  openChild: (to: string) => void;
}) {
  const translate = useTranslate();

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          {translate(
            "knowledge.categories.show.articles",
            { ns: "starter", count: articles.length },
            `Articles (${articles.length})`
          )}
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => openChild("articles/create")}
        >
          <Plus />
          {translate(
            "knowledge.categories.show.addArticle",
            { ns: "starter" },
            "Add article"
          )}
        </Button>
      </div>
      <SimpleTable
        headers={[
          translate(
            "knowledge.categories.show.columns.title",
            { ns: "starter" },
            "Title"
          ),
          translate(
            "knowledge.categories.show.columns.status",
            { ns: "starter" },
            "Status"
          ),
          translate(
            "knowledge.categories.show.columns.author",
            { ns: "starter" },
            "Author"
          ),
          translate(
            "knowledge.categories.show.columns.views",
            { ns: "starter" },
            "Views"
          ),
          translate(
            "knowledge.categories.show.columns.updated",
            { ns: "starter" },
            "Updated"
          ),
        ]}
      >
        {isLoading ? (
          <EmptyRow
            colSpan={5}
            text={translate(
              "knowledge.categories.show.articles.loading",
              { ns: "starter" },
              "Loading articles..."
            )}
          />
        ) : isError ? (
          <EmptyRow
            colSpan={5}
            text={translate(
              "knowledge.categories.show.articles.error",
              { ns: "starter" },
              "Unable to load articles."
            )}
          />
        ) : articles.length === 0 ? (
          <EmptyRow
            colSpan={5}
            text={translate(
              "knowledge.categories.show.articles.empty",
              { ns: "starter" },
              "No articles in this category tree yet."
            )}
          />
        ) : (
          articles.map((article) => (
            <tr key={String(article.id)}>
              <td className="px-3 py-2">
                <Link
                  to={getArticleShowPath(article.id)}
                  onClick={(event) => {
                    if (
                      event.button === 0 &&
                      !event.metaKey &&
                      !event.ctrlKey &&
                      !event.shiftKey &&
                      !event.altKey
                    ) {
                      event.preventDefault();
                      openChild(
                        `articles/show/${encodeURIComponent(String(article.id))}`
                      );
                    }
                  }}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  {article.title ||
                    translate(
                      "knowledge.common.untitled",
                      { ns: "starter" },
                      "Untitled"
                    )}
                </Link>
              </td>
              <td className="px-3 py-2">
                <StatusPill
                  value={article.status ?? "draft"}
                  label={labelFor(
                    ARTICLE_STATUSES,
                    article.status ?? "draft",
                    translate
                  )}
                />
              </td>
              <td className="px-3 py-2">
                {article.author?.nickname ??
                  translate(
                    "knowledge.reader.author.unknown",
                    { ns: "starter" },
                    "Unknown author"
                  )}
              </td>
              <td className="px-3 py-2 tabular-nums">
                {formatNumber(article.views, locale)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {formatDate(article.updatedAt, locale)}
              </td>
            </tr>
          ))
        )}
      </SimpleTable>
    </section>
  );
}
