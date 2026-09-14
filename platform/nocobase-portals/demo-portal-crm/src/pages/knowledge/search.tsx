import { useList, useTranslate } from "@refinedev/core";
import { Eye, FileText, Search as SearchIcon } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Link } from "react-router";
import { Breadcrumb } from "@/components/app-shell/breadcrumb";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ARTICLE_STATUSES, formatDate, formatNumber, labelFor } from "./constants";
import { getArticleShowPath } from "./routes";
import { StatusPill, useLocale } from "./shared";
import { ErrorState, useUrlState } from "@/lib/table-kit";
import type { ArticleRecord } from "./types";

const URL_DEFAULTS: Record<"q" | "category" | "status" | "sort", string> = {
  q: "",
  category: "",
  status: "",
  sort: "relevance",
};

const SNIPPET_RADIUS = 90;

/** Where a term was found, weighted so title hits rank above body hits. */
type Hit = {
  article: ArticleRecord;
  score: number;
  inTitle: boolean;
  inSummary: boolean;
  inBody: boolean;
  snippet: string | null;
};

const countOccurrences = (haystack: string, needle: string) => {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
};

/** A body excerpt centred on the first hit, so results explain themselves. */
function buildSnippet(body: string, needle: string): string | null {
  const index = body.toLowerCase().indexOf(needle);
  if (index === -1) return null;
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(body.length, index + needle.length + SNIPPET_RADIUS);
  return `${start > 0 ? "…" : ""}${body.slice(start, end).replace(/\s+/g, " ")}${
    end < body.length ? "…" : ""
  }`;
}

/** Wraps every case-insensitive occurrence of `term` in a highlight span. */
function Highlight({ text, term }: { text: string; term: string }): ReactNode {
  if (!term) return text;
  const needle = term.toLowerCase();
  const haystack = text.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let index = haystack.indexOf(needle);
  let key = 0;
  while (index !== -1) {
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(
      <mark
        key={`hit-${key++}`}
        className="rounded-[3px] bg-amber-300/50 px-0.5 text-inherit dark:bg-amber-400/30"
      >
        {text.slice(index, index + term.length)}
      </mark>
    );
    cursor = index + term.length;
    index = haystack.indexOf(needle, cursor);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

export function KnowledgeSearch() {
  const translate = useTranslate();
  const locale = useLocale();
  const { state, setState, reset } = useUrlState(URL_DEFAULTS);

  // Fetch the full corpus once; filtering happens client-side so the search
  // box can match title, summary, and body in a single pass.
  const { result, query } = useList<ArticleRecord>({
    resource: "hub_kb_articles",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    sorters: [{ field: "updatedAt", order: "desc" }],
    meta: { appends: ["category", "author"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const articles = result.data ?? [];
  const term = state.q.trim();

  const hits = useMemo<Hit[]>(() => {
    if (!term) return [];
    const needle = term.toLowerCase();
    return articles
      .map((article) => {
        const title = (article.title ?? "").toLowerCase();
        const summary = (article.summary ?? "").toLowerCase();
        const body = (article.body ?? "").toLowerCase();
        const titleHits = countOccurrences(title, needle);
        const summaryHits = countOccurrences(summary, needle);
        const bodyHits = countOccurrences(body, needle);
        const score = titleHits * 10 + summaryHits * 4 + bodyHits;
        return {
          article,
          score,
          inTitle: titleHits > 0,
          inSummary: summaryHits > 0,
          inBody: bodyHits > 0,
          snippet: bodyHits ? buildSnippet(article.body ?? "", needle) : null,
        };
      })
      .filter((hit) => hit.score > 0);
  }, [articles, term]);

  /** Facet counts are computed before the facets themselves are applied. */
  const facets = useMemo(() => {
    const categories = new Map<string, { label: string; count: number }>();
    let published = 0;
    let draft = 0;
    for (const hit of hits) {
      const key = String(hit.article.category?.id ?? "");
      const label =
        hit.article.category?.name ??
        translate("knowledge.common.uncategorized", { ns: "starter" }, "Uncategorized");
      const entry = categories.get(key) ?? { label, count: 0 };
      entry.count += 1;
      categories.set(key, entry);
      if (hit.article.status === "published") published += 1;
      else draft += 1;
    }
    return {
      categories: [...categories.entries()].sort((a, b) => b[1].count - a[1].count),
      published,
      draft,
    };
  }, [hits, translate]);

  const visible = useMemo(() => {
    const filtered = hits.filter((hit) => {
      if (
        state.category &&
        String(hit.article.category?.id ?? "") !== state.category
      ) {
        return false;
      }
      if (state.status && (hit.article.status ?? "draft") !== state.status) {
        return false;
      }
      return true;
    });
    if (state.sort === "recent") {
      return [...filtered].sort((a, b) =>
        String(b.article.updatedAt ?? "").localeCompare(
          String(a.article.updatedAt ?? "")
        )
      );
    }
    if (state.sort === "views") {
      return [...filtered].sort(
        (a, b) => Number(b.article.views ?? 0) - Number(a.article.views ?? 0)
      );
    }
    return [...filtered].sort((a, b) => b.score - a.score);
  }, [hits, state]);

  const sortOptions = [
    {
      value: "relevance",
      label: translate("knowledge.search.sort.relevance", { ns: "starter" }, "Best match"),
    },
    {
      value: "recent",
      label: translate("knowledge.search.sort.recent", { ns: "starter" }, "Recently updated"),
    },
    {
      value: "views",
      label: translate("knowledge.search.sort.views", { ns: "starter" }, "Most read"),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center text-muted-foreground">
          <Breadcrumb />
        </div>
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.035em]">
            {translate("knowledge.search.title", { ns: "starter" }, "Search")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {translate(
              "knowledge.search.subtitle",
              { ns: "starter" },
              "Search across every article's title, summary, and body."
            )}
          </p>
        </div>
      </div>

      <Card className="p-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={state.q}
            onChange={(event) => setState({ q: event.currentTarget.value })}
            placeholder={translate(
              "knowledge.search.placeholder",
              { ns: "starter" },
              "Search articles by title, summary, or body..."
            )}
            className="h-11 pl-9 text-base"
          />
        </div>
      </Card>

      {query.isError ? (
        <ErrorState i18nPrefix="knowledge.toolkit" onRetry={() => query.refetch()} />
      ) : !term ? (
        <Card className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <SearchIcon className="size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">
            {translate(
              "knowledge.search.empty.prompt.title",
              { ns: "starter" },
              "Start typing to search"
            )}
          </p>
          <p className="max-w-xs text-sm text-muted-foreground">
            {translate(
              "knowledge.search.empty.prompt.description",
              { ns: "starter" },
              "Search matches article titles, summaries, and body text."
            )}
          </p>
        </Card>
      ) : query.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : hits.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <FileText className="size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">
            {translate(
              "knowledge.search.empty.noResults.title",
              { ns: "starter" },
              "No matches found"
            )}
          </p>
          <p className="max-w-xs text-sm text-muted-foreground">
            {translate(
              "knowledge.search.empty.noResults.description",
              { ns: "starter" },
              "Try a shorter or different search term."
            )}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <Card className="space-y-4 p-3">
              <div>
                <p className="px-1 pb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {translate("knowledge.search.facet.status", { ns: "starter" }, "Status")}
                </p>
                <FacetButton
                  label={translate("knowledge.articles.filter.all", { ns: "starter" }, "All")}
                  count={hits.length}
                  active={!state.status}
                  onClick={() => setState({ status: "" })}
                />
                <FacetButton
                  label={labelFor(ARTICLE_STATUSES, "published", translate)}
                  count={facets.published}
                  active={state.status === "published"}
                  onClick={() => setState({ status: "published" })}
                />
                <FacetButton
                  label={labelFor(ARTICLE_STATUSES, "draft", translate)}
                  count={facets.draft}
                  active={state.status === "draft"}
                  onClick={() => setState({ status: "draft" })}
                />
              </div>
              <div>
                <p className="px-1 pb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {translate("knowledge.tree.title", { ns: "starter" }, "Categories")}
                </p>
                <FacetButton
                  label={translate("knowledge.articles.filter.all", { ns: "starter" }, "All")}
                  count={hits.length}
                  active={!state.category}
                  onClick={() => setState({ category: "" })}
                />
                {facets.categories.map(([id, entry]) => (
                  <FacetButton
                    key={id || "none"}
                    label={entry.label}
                    count={entry.count}
                    active={state.category === id}
                    onClick={() => setState({ category: id })}
                  />
                ))}
              </div>
            </Card>
          </aside>

          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {translate(
                  "knowledge.search.resultsCount",
                  { ns: "starter", count: visible.length },
                  `${visible.length} result${visible.length === 1 ? "" : "s"}`
                )}
                {visible.length !== hits.length ? (
                  <button
                    type="button"
                    onClick={() => reset()}
                    className="ml-2 text-primary underline-offset-2 hover:underline"
                  >
                    {translate(
                      "knowledge.search.clearFacets",
                      { ns: "starter" },
                      "Clear filters"
                    )}
                  </button>
                ) : null}
              </p>
              <select
                value={state.sort}
                onChange={(event) => setState({ sort: event.currentTarget.value })}
                className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-3">
              {visible.map((hit) => (
                <ResultRow
                  key={String(hit.article.id)}
                  hit={hit}
                  term={term}
                  locale={locale}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function FacetButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      )}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-xs tabular-nums">{count}</span>
    </button>
  );
}

function ResultRow({
  hit,
  term,
  locale,
}: {
  hit: Hit;
  term: string;
  locale: string;
}) {
  const translate = useTranslate();
  const uncategorized = translate(
    "knowledge.common.uncategorized",
    { ns: "starter" },
    "Uncategorized"
  );
  const untitled = translate("knowledge.common.untitled", { ns: "starter" }, "Untitled");

  const where = [
    hit.inTitle
      ? translate("knowledge.search.in.title", { ns: "starter" }, "title")
      : null,
    hit.inSummary
      ? translate("knowledge.search.in.summary", { ns: "starter" }, "summary")
      : null,
    hit.inBody
      ? translate("knowledge.search.in.body", { ns: "starter" }, "body")
      : null,
  ].filter(Boolean);

  return (
    <Link to={getArticleShowPath(hit.article.id)} className="min-w-0">
      <Card className="group flex flex-col gap-2 p-4 transition-shadow hover:shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex w-fit items-center rounded-md bg-blue-500/10 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
            {hit.article.category?.name ?? uncategorized}
          </span>
          <StatusPill
            value={hit.article.status ?? "draft"}
            label={labelFor(ARTICLE_STATUSES, hit.article.status ?? "draft", translate)}
          />
          <span className="text-xs text-muted-foreground">
            {translate(
              "knowledge.search.matchedIn",
              { ns: "starter", where: where.join(", ") },
              `matched in ${where.join(", ")}`
            )}
          </span>
        </div>

        <h3 className="text-base font-semibold leading-snug tracking-tight group-hover:text-primary">
          <Highlight text={hit.article.title || untitled} term={term} />
        </h3>

        {hit.article.summary ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            <Highlight text={hit.article.summary} term={term} />
          </p>
        ) : null}

        {hit.snippet ? (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-sm leading-6 text-muted-foreground">
            <Highlight text={hit.snippet} term={term} />
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
          <span>{formatDate(hit.article.updatedAt, locale)}</span>
          <span className="flex shrink-0 items-center gap-1 tabular-nums">
            <Eye className="size-3.5" />
            {formatNumber(hit.article.views, locale)}
          </span>
        </div>
      </Card>
    </Link>
  );
}
