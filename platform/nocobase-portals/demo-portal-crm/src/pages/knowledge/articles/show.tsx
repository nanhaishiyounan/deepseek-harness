import { useList, useShow, useTranslate, useUpdate } from "@refinedev/core";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Eye,
  Link2,
  ListTree,
  MessageSquareText,
  Pencil,
  Printer,
  Send,
  ThumbsDown,
  ThumbsUp,
  Undo2,
  User,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useOutlet, useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import {
  ARTICLE_STATUSES,
  formatDate,
  formatNumber,
  labelFor,
  toParagraphs,
} from "../constants";
import { getArticleShowPath, knowledgeRoutes } from "../routes";
import {
  useContextualCloseTo,
  useOpenContextualChild,
} from "../route-surfaces";
import {
  DetailItems,
  DrawerSection,
  EmptyRow,
  SimpleTable,
  StatusPill,
  useLocale,
} from "../shared";
import { cn } from "@/lib/utils";
import type { ArticleRecord, FeedbackRecord } from "../types";

const WORDS_PER_MINUTE = 220;

/** Minutes to read, from the raw body word count. */
function readingMinutes(body: string | null | undefined): number {
  const words = (body ?? "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/**
 * Markdown-style headings in the body become a jump list. Bodies without
 * headings simply get no table of contents rather than a fabricated one.
 */
function extractHeadings(body: string | null | undefined) {
  const out: Array<{ id: string; text: string; level: number }> = [];
  for (const line of (body ?? "").split("\n")) {
    const match = /^(#{1,3})\s+(.*\S)\s*$/.exec(line);
    if (!match) continue;
    const text = match[2];
    out.push({
      id: `section-${out.length}-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      text,
      level: match[1].length,
    });
  }
  return out;
}

export function ArticleShow({ idParam = "id" }: { idParam?: string }) {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const params = useParams<Record<string, string>>();
  const id = params[idParam];
  const nested = useOutlet();
  const { result: record, query } = useShow<ArticleRecord>({
    resource: "hub_kb_articles",
    id,
    meta: { appends: ["category", "author"] },
  });

  // Count a view once per mount.
  const { mutate: update } = useUpdate();
  const counted = useRef(false);
  useEffect(() => {
    if (record && id && !counted.current) {
      counted.current = true;
      update({
        resource: "hub_kb_articles",
        id,
        values: { views: Number(record.views ?? 0) + 1 },
        successNotification: false,
        errorNotification: false,
        mutationMode: "optimistic",
      });
    }
  }, [record, id, update]);

  const paragraphs = useMemo(() => toParagraphs(record?.body), [record?.body]);
  const headings = useMemo(() => extractHeadings(record?.body), [record?.body]);
  const minutes = readingMinutes(record?.body);
  const [copied, setCopied] = useState(false);

  const isPublished = (record?.status ?? "draft") === "published";
  const togglePublished = () => {
    if (!record || !id) return;
    update({
      resource: "hub_kb_articles",
      id,
      values: { status: isPublished ? "draft" : "published" },
      successNotification: {
        type: "success",
        message: isPublished
          ? translate("knowledge.reader.unpublished", { ns: "starter" }, "Moved to draft")
          : translate("knowledge.reader.published", { ns: "starter" }, "Article published"),
      },
    });
  };

  const feedback = useList<FeedbackRecord>({
    resource: "hub_kb_article_feedback",
    pagination: { mode: "server", currentPage: 1, pageSize: 20 },
    sorters: [{ field: "createdAt", order: "desc" }],
    filters: id ? [{ field: "article_id", operator: "eq", value: id }] : [],
    meta: { appends: ["author"] },
    errorNotification: false,
    queryOptions: { enabled: Boolean(id), retry: false },
  });
  const feedbackRows = feedback.result.data ?? [];
  const helpfulCount = feedbackRows.filter((row) => row.rating === "helpful").length;
  const notHelpfulCount = feedbackRows.filter((row) => row.rating === "not_helpful").length;

  const related = useList<ArticleRecord>({
    resource: "hub_kb_articles",
    pagination: { mode: "server", currentPage: 1, pageSize: 4 },
    sorters: [{ field: "views", order: "desc" }],
    filters: record?.category_id
      ? [
          { field: "category_id", operator: "eq", value: record.category_id },
          { field: "id", operator: "ne", value: record.id },
        ]
      : [],
    meta: { appends: ["category"] },
    errorNotification: false,
    queryOptions: { enabled: Boolean(record?.category_id), retry: false },
  });
  const relatedRows = related.result.data ?? [];

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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to={knowledgeRoutes.articles} />}
        >
          <ArrowLeft />
          {translate("knowledge.reader.back", { ns: "starter" }, "Back to articles")}
        </Button>
        {record ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={isPublished ? "outline" : "default"}
              size="sm"
              onClick={togglePublished}
            >
              {isPublished ? <Undo2 /> : <Send />}
              {isPublished
                ? translate("knowledge.reader.unpublish", { ns: "starter" }, "Move to draft")
                : translate("knowledge.reader.publish", { ns: "starter" }, "Publish")}
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              title={translate("knowledge.reader.copyLink", { ns: "starter" }, "Copy link")}
              onClick={() => {
                if (typeof window === "undefined") return;
                void navigator.clipboard?.writeText(window.location.href);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
            >
              <Link2 className={cn("size-4", copied && "text-emerald-600")} />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              title={translate("knowledge.reader.print", { ns: "starter" }, "Print")}
              onClick={() => window.print()}
            >
              <Printer className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to="feedback" />}
            >
              <MessageSquareText />
              {translate("knowledge.reader.giveFeedback", { ns: "starter" }, "Give feedback")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to="edit" />}
            >
              <Pencil />
              {translate("knowledge.reader.edit", { ns: "starter" }, "Edit")}
            </Button>
          </div>
        ) : null}
      </div>

      {query.isLoading ? (
        <LoadingState className="min-h-64" />
      ) : query.isError || !record ? (
        <Alert variant="destructive">
          <AlertTitle>
            {translate("knowledge.reader.error.title", { ns: "starter" }, "Unable to load article")}
          </AlertTitle>
          <AlertDescription>
            {translate(
              "knowledge.reader.error.description",
              { ns: "starter" },
              "The article may no longer exist, or you may not have permission to view it."
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <article className="flex flex-col gap-5">
          <header className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex w-fit items-center rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                {record.category?.name ?? uncategorized}
              </span>
              <StatusPill
                value={record.status ?? "draft"}
                label={labelFor(ARTICLE_STATUSES, record.status ?? "draft", translate)}
              />
            </div>
            <h1 className="text-3xl font-semibold leading-tight tracking-[-0.02em]">
              {record.title || untitled}
            </h1>
            {record.summary ? (
              <p className="text-lg leading-7 text-muted-foreground">
                {record.summary}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <User className="size-4" />
                {record.author?.nickname ??
                  translate("knowledge.reader.author.unknown", { ns: "starter" }, "Unknown author")}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="size-4" />
                {translate("knowledge.reader.updatedPrefix", { ns: "starter" }, "Updated")}{" "}
                {formatDate(record.updatedAt, locale)}
              </span>
              <span className="flex items-center gap-1.5 tabular-nums">
                <Eye className="size-4" />
                {formatNumber(record.views, locale)}{" "}
                {translate("knowledge.reader.views", { ns: "starter" }, "views")}
              </span>
              <span className="flex items-center gap-1.5 tabular-nums">
                <Clock className="size-4" />
                {translate(
                  "knowledge.reader.readingTime",
                  { ns: "starter", count: minutes },
                  `${minutes} min read`
                )}
              </span>
            </div>
          </header>

          {feedbackRows.length > 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {translate(
                    "knowledge.reader.helpfulness",
                    { ns: "starter" },
                    "Reader helpfulness"
                  )}
                </span>
                <span className="tabular-nums">
                  {Math.round((helpfulCount / feedbackRows.length) * 100)}% ·{" "}
                  {translate(
                    "knowledge.reader.ratingCount",
                    { ns: "starter", count: feedbackRows.length },
                    `${feedbackRows.length} ratings`
                  )}
                </span>
              </div>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="bg-emerald-500"
                  style={{
                    width: `${(helpfulCount / feedbackRows.length) * 100}%`,
                  }}
                />
                <div
                  className="bg-red-500"
                  style={{
                    width: `${(notHelpfulCount / feedbackRows.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          ) : null}

          {headings.length > 1 ? (
            <nav className="rounded-lg border bg-muted/30 p-4">
              <p className="flex items-center gap-1.5 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <ListTree className="size-3.5" />
                {translate("knowledge.reader.toc", { ns: "starter" }, "On this page")}
              </p>
              <ol className="space-y-1">
                {headings.map((heading) => (
                  <li key={heading.id} style={{ paddingLeft: (heading.level - 1) * 12 }}>
                    <a
                      href={`#${heading.id}`}
                      className="text-sm text-primary underline-offset-2 hover:underline"
                    >
                      {heading.text}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}

          <Separator />

          <div className="flex flex-col gap-4 text-[15px] leading-7 text-foreground/90">
            {paragraphs.length === 0 ? (
              <p className="text-muted-foreground">
                {translate("knowledge.reader.empty", { ns: "starter" }, "This article has no content yet.")}
              </p>
            ) : (
              paragraphs.map((paragraph, index) => (
                <p key={index} className="whitespace-pre-line">
                  {paragraph}
                </p>
              ))
            )}
          </div>

          <Separator />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base">
                {translate("knowledge.feedback.panel.title", { ns: "starter" }, "Feedback")}
              </CardTitle>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5 tabular-nums">
                  <ThumbsUp className="size-3.5 text-blue-600 dark:text-blue-300" />
                  {formatNumber(helpfulCount, locale)}
                </span>
                <span className="flex items-center gap-1.5 tabular-nums">
                  <ThumbsDown className="size-3.5" />
                  {formatNumber(notHelpfulCount, locale)}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {feedback.query.isLoading ? (
                <LoadingState className="min-h-24" />
              ) : feedbackRows.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {translate("knowledge.feedback.panel.empty", { ns: "starter" }, "No feedback yet. Be the first to weigh in.")}
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {feedbackRows.map((row) => (
                    <li key={String(row.id)} className="border-b border-border/50 last:border-b-0">
                      <button
                        type="button"
                        onClick={() =>
                          openChild(`feedback/view/${encodeURIComponent(String(row.id))}`)
                        }
                        className="flex w-full gap-3 rounded-md pb-3 text-left transition-colors hover:bg-accent/50 last:pb-0"
                      >
                        <span
                          className={
                            row.rating === "helpful"
                              ? "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-300"
                              : "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                          }
                        >
                          {row.rating === "helpful" ? (
                            <ThumbsUp className="size-3.5" />
                          ) : (
                            <ThumbsDown className="size-3.5" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {row.author?.nickname ??
                              translate("knowledge.reader.author.unknown", { ns: "starter" }, "Unknown author")}
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              {formatDate(row.createdAt, locale)}
                            </span>
                          </p>
                          {row.comment ? (
                            <p className="mt-0.5 text-sm text-muted-foreground">{row.comment}</p>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {relatedRows.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {translate("knowledge.reader.related.title", { ns: "starter" }, "Related articles")}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {relatedRows.map((item) => (
                  <Link
                    key={String(item.id)}
                    to={getArticleShowPath(item.id)}
                    className="flex flex-col gap-1 rounded-lg border border-border/60 p-3 transition-colors hover:bg-accent"
                  >
                    <span className="line-clamp-1 text-sm font-medium">
                      {item.title || untitled}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Eye className="size-3.5" />
                      {formatNumber(item.views, locale)}{" "}
                      {translate("knowledge.reader.views", { ns: "starter" }, "views")}
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </article>
      )}

      {nested ? <Outlet /> : null}
    </div>
  );
}

/**
 * Compact drawer variant of the article reader, used when an article is opened
 * one level deeper — e.g. from a category detail drawer.
 * Route: /categories/show/:id/articles/show/:articleId
 */
export function ArticleShowDrawer({ idParam = "articleId" }: { idParam?: string }) {
  const translate = useTranslate();
  const locale = useLocale();
  const params = useParams<Record<string, string>>();
  const id = params[idParam];
  const nested = useOutlet();
  const closeTo = useContextualCloseTo();

  const { result: record, query } = useShow<ArticleRecord>({
    resource: "hub_kb_articles",
    id,
    meta: { appends: ["category", "author"] },
    queryOptions: { enabled: Boolean(id), retry: false },
  });

  const paragraphs = useMemo(() => toParagraphs(record?.body), [record?.body]);
  const minutes = readingMinutes(record?.body);
  const { mutate: update } = useUpdate();

  const isPublished = (record?.status ?? "draft") === "published";
  const togglePublished = () => {
    if (!record || !id) return;
    update({
      resource: "hub_kb_articles",
      id,
      values: { status: isPublished ? "draft" : "published" },
      successNotification: {
        type: "success",
        message: isPublished
          ? translate("knowledge.reader.unpublished", { ns: "starter" }, "Moved to draft")
          : translate("knowledge.reader.published", { ns: "starter" }, "Article published"),
      },
    });
  };

  const feedback = useList<FeedbackRecord>({
    resource: "hub_kb_article_feedback",
    pagination: { mode: "server", currentPage: 1, pageSize: 20 },
    sorters: [{ field: "createdAt", order: "desc" }],
    filters: id ? [{ field: "article_id", operator: "eq", value: id }] : [],
    meta: { appends: ["author"] },
    errorNotification: false,
    queryOptions: { enabled: Boolean(id), retry: false },
  });
  const feedbackRows = feedback.result.data ?? [];

  const untitled = translate("knowledge.common.untitled", { ns: "starter" }, "Untitled");
  const uncategorized = translate(
    "knowledge.common.uncategorized",
    { ns: "starter" },
    "Uncategorized"
  );

  return (
    <RouteDrawer
      title={
        query.isLoading && !record ? (
          <Skeleton className="h-6 w-40" />
        ) : (
          record?.title || untitled
        )
      }
      description={translate(
        "knowledge.articles.drawer.show.description",
        { ns: "starter" },
        "Article details and reader feedback."
      )}
      closeLabel={translate("knowledge.common.close", { ns: "starter" }, "Close")}
      closeTo={closeTo}
      nested={nested}
      actions={
        record ? (
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1 text-xs text-muted-foreground tabular-nums sm:flex">
              <Clock className="size-3.5" />
              {translate(
                "knowledge.reader.readingTime",
                { ns: "starter", count: minutes },
                `${minutes} min read`
              )}
            </span>
            <Button variant="outline" size="sm" onClick={togglePublished}>
              {isPublished ? <Undo2 /> : <Send />}
              {isPublished
                ? translate("knowledge.reader.unpublish", { ns: "starter" }, "Move to draft")
                : translate("knowledge.reader.publish", { ns: "starter" }, "Publish")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to={getArticleShowPath(record.id)} />}
            >
              <Eye />
              {translate("knowledge.articles.drawer.show.openFull", { ns: "starter" }, "Open full")}
            </Button>
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
              {translate("knowledge.reader.error.title", { ns: "starter" }, "Unable to load article")}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "knowledge.reader.error.description",
                { ns: "starter" },
                "The article may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <DetailItems
              title={translate("knowledge.articles.drawer.show.overview", { ns: "starter" }, "Overview")}
              items={[
                [
                  translate("knowledge.articles.fields.category", { ns: "starter" }, "Category"),
                  record.category?.name ?? uncategorized,
                ],
                [
                  translate("knowledge.articles.fields.status", { ns: "starter" }, "Status"),
                  <StatusPill
                    key="status"
                    value={record.status ?? "draft"}
                    label={labelFor(ARTICLE_STATUSES, record.status ?? "draft", translate)}
                  />,
                ],
                [
                  translate("knowledge.articles.fields.author", { ns: "starter" }, "Author"),
                  record.author?.nickname ??
                    translate("knowledge.reader.author.unknown", { ns: "starter" }, "Unknown author"),
                ],
                [
                  translate("knowledge.reader.views", { ns: "starter" }, "views"),
                  formatNumber(record.views, locale),
                ],
              ]}
            />
            {record.summary ? (
              <p className="text-sm leading-6 text-muted-foreground">{record.summary}</p>
            ) : null}
            <Separator />
            <div className="flex flex-col gap-3 text-sm leading-6 text-foreground/90">
              {paragraphs.length === 0 ? (
                <p className="text-muted-foreground">
                  {translate("knowledge.reader.empty", { ns: "starter" }, "This article has no content yet.")}
                </p>
              ) : (
                paragraphs.map((paragraph, index) => (
                  <p key={index} className="whitespace-pre-line">
                    {paragraph}
                  </p>
                ))
              )}
            </div>
            <Separator />
            <DrawerSection
              title={translate("knowledge.feedback.panel.title", { ns: "starter" }, "Feedback")}
            >
              <SimpleTable
                headers={[
                  translate("knowledge.feedback.show.rating", { ns: "starter" }, "Rating"),
                  translate("knowledge.feedback.show.author", { ns: "starter" }, "Reader"),
                  translate("knowledge.feedback.show.comment", { ns: "starter" }, "Comment"),
                ]}
              >
                {feedbackRows.length === 0 ? (
                  <EmptyRow
                    colSpan={3}
                    text={translate(
                      "knowledge.feedback.panel.empty",
                      { ns: "starter" },
                      "No feedback yet. Be the first to weigh in."
                    )}
                  />
                ) : (
                  feedbackRows.map((row) => (
                    <tr key={String(row.id)}>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                          {row.rating === "helpful" ? (
                            <ThumbsUp className="size-3.5 text-blue-600 dark:text-blue-300" />
                          ) : (
                            <ThumbsDown className="size-3.5 text-muted-foreground" />
                          )}
                          {row.rating === "helpful"
                            ? translate("knowledge.feedback.rating.helpful", { ns: "starter" }, "Helpful")
                            : translate("knowledge.feedback.rating.notHelpful", { ns: "starter" }, "Not helpful")}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {row.author?.nickname ??
                          translate("knowledge.reader.author.unknown", { ns: "starter" }, "Unknown author")}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {row.comment || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </SimpleTable>
            </DrawerSection>
          </div>
        )}
      </div>
    </RouteDrawer>
  );
}

// Re-export for the edit-from-show route wiring.
export { getArticleShowPath };
