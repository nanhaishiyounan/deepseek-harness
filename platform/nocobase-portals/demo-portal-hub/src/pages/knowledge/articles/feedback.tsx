import { type HttpError, useList, useShow, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useRouteSurfaceClose } from "@nocobase/portal-sdk/routing";
import {
  RouteDrawer,
  RouteDrawerFooter,
  useRefineUnsavedChangesGuard,
} from "@/extensions/nocobase-route-surfaces";
import { cn } from "@/lib/utils";
import { formatDate } from "../constants";
import { getArticleShowPath, knowledgeRoutes } from "../routes";
import { useContextualCloseTo } from "../route-surfaces";
import { DetailItems, useLocale } from "../shared";
import type { FeedbackFormValues, FeedbackRecord } from "../types";

/** Nested (2nd-level) drawer: leave feedback on an article, reached from the reader. */
export const ArticleFeedback = () => {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("knowledge.feedback.drawer.title", { ns: "starter" }, "Leave feedback")}
        description={translate(
          "knowledge.feedback.drawer.description",
          { ns: "starter" },
          "Tell the author whether this article was helpful."
        )}
        closeTo={id ? getArticleShowPath(id) : knowledgeRoutes.articles}
        closeLabel={translate("knowledge.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <ArticleFeedbackForm articleId={id} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

const toServerValues = (values: FeedbackFormValues, articleId?: string) =>
  ({
    ...values,
    article: articleId ? Number(articleId) : null,
  }) as unknown as FeedbackFormValues;

function ArticleFeedbackForm({ articleId }: { articleId?: string }) {
  const translate = useTranslate();
  const locale = useLocale();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<FeedbackRecord, HttpError, FeedbackFormValues>({
    refineCoreProps: {
      resource: "hub_kb_article_feedback",
      action: "create",
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: {
      rating: "helpful",
      comment: "",
    },
  });

  const feedback = useList<FeedbackRecord>({
    resource: "hub_kb_article_feedback",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    sorters: [{ field: "createdAt", order: "desc" }],
    filters: articleId
      ? [{ field: "article_id", operator: "eq", value: articleId }]
      : [],
    meta: { appends: ["author"] },
    errorNotification: false,
    queryOptions: { enabled: Boolean(articleId), retry: false },
  });

  const rating = form.watch("rating");

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values, articleId)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <FeedbackSummary
            rows={feedback.result.data ?? []}
            isLoading={feedback.query.isLoading}
            isError={feedback.query.isError}
            locale={locale}
          />

          <FormField
            control={form.control}
            name="rating"
            render={() => (
              <FormItem>
                <FormLabel>
                  {translate("knowledge.feedback.fields.rating", { ns: "starter" }, "Was this article helpful?")}
                </FormLabel>
                <FormControl
                  render={
                    <div className="flex gap-2">
                      {(["helpful", "not_helpful"] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => form.setValue("rating", value, { shouldDirty: true })}
                          className={cn(
                            "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                            rating === value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/70 text-muted-foreground hover:bg-accent"
                          )}
                        >
                          {value === "helpful"
                            ? translate("knowledge.feedback.rating.helpful", { ns: "starter" }, "Helpful")
                            : translate("knowledge.feedback.rating.notHelpful", { ns: "starter" }, "Not helpful")}
                        </button>
                      ))}
                    </div>
                  }
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="comment"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate("knowledge.feedback.fields.comment", { ns: "starter" }, "Comment (optional)")}
                </FormLabel>
                <FormControl
                  render={
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      rows={4}
                      placeholder={translate(
                        "knowledge.feedback.fields.comment.placeholder",
                        { ns: "starter" },
                        "What worked, or what's missing?"
                      )}
                    />
                  }
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("knowledge.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("knowledge.common.saving", { ns: "starter" }, "Saving...")
              : translate("knowledge.feedback.submit", { ns: "starter" }, "Submit feedback")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

function FeedbackSummary({
  rows,
  isLoading,
  isError,
  locale,
}: {
  rows: FeedbackRecord[];
  isLoading: boolean;
  isError: boolean;
  locale: string;
}) {
  const translate = useTranslate();
  const helpfulCount = rows.filter((row) => row.rating === "helpful").length;
  const notHelpfulCount = rows.filter(
    (row) => row.rating === "not_helpful"
  ).length;
  const comments = rows
    .filter((row) => Boolean(row.comment?.trim()))
    .slice(0, 3);
  const helpfulPercent =
    rows.length > 0 ? Math.round((helpfulCount / rows.length) * 100) : 0;

  return (
    <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <h3 className="text-sm font-medium">
        {translate(
          "knowledge.feedback.summary.title",
          { ns: "starter" },
          "Feedback summary"
        )}
      </h3>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">
          {translate(
            "knowledge.feedback.summary.loading",
            { ns: "starter" },
            "Loading feedback..."
          )}
        </p>
      ) : isError ? (
        <p className="text-sm text-muted-foreground">
          {translate(
            "knowledge.feedback.summary.error",
            { ns: "starter" },
            "Unable to load the feedback summary."
          )}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translate(
            "knowledge.feedback.panel.empty",
            { ns: "starter" },
            "No feedback yet. Be the first to weigh in."
          )}
        </p>
      ) : (
        <>
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
                {helpfulPercent}% ·{" "}
                {translate(
                  "knowledge.reader.ratingCount",
                  { ns: "starter", count: rows.length },
                  `${rows.length} ratings`
                )}
              </span>
            </div>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="bg-emerald-500"
                style={{ width: `${(helpfulCount / rows.length) * 100}%` }}
              />
              <div
                className="bg-red-500"
                style={{
                  width: `${(notHelpfulCount / rows.length) * 100}%`,
                }}
              />
            </div>
          </div>

          {comments.length > 0 ? (
            <div className="space-y-2 border-t border-border/60 pt-3">
              <p className="text-xs font-medium text-muted-foreground">
                {translate(
                  "knowledge.feedback.summary.recentComments",
                  { ns: "starter" },
                  "Recent comments"
                )}
              </p>
              <ul className="space-y-3">
                {comments.map((row) => {
                  const helpful = row.rating === "helpful";
                  return (
                    <li key={String(row.id)} className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
                            helpful
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : "bg-red-500/15 text-red-700 dark:text-red-300"
                          )}
                        >
                          {helpful ? (
                            <ThumbsUp className="size-3" />
                          ) : (
                            <ThumbsDown className="size-3" />
                          )}
                          {helpful
                            ? translate(
                                "knowledge.feedback.rating.helpful",
                                { ns: "starter" },
                                "Helpful"
                              )
                            : translate(
                                "knowledge.feedback.rating.notHelpful",
                                { ns: "starter" },
                                "Not helpful"
                              )}
                        </span>
                        <span className="text-xs font-medium">
                          {row.author?.nickname ??
                            translate(
                              "knowledge.reader.author.unknown",
                              { ns: "starter" },
                              "Unknown author"
                            )}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(row.createdAt, locale)}
                        </span>
                      </div>
                      <p className="text-sm leading-5 text-muted-foreground">
                        {row.comment}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * Nested (deeper) read-only drawer: view a single feedback entry, reached by
 * clicking a row in the reader's feedback panel.
 * Route: /articles/show/:id/feedback/view/:feedbackId
 */
export const FeedbackShow = ({ idParam = "feedbackId" }: { idParam?: string }) => {
  const translate = useTranslate();
  const locale = useLocale();
  const params = useParams<Record<string, string>>();
  const recordId = params[idParam];
  const closeTo = useContextualCloseTo();
  const { result: record, query } = useShow<FeedbackRecord>({
    resource: "hub_kb_article_feedback",
    id: recordId,
    meta: { appends: ["author"] },
    queryOptions: { enabled: Boolean(recordId), retry: false },
  });

  const isHelpful = record?.rating === "helpful";
  const ratingLabel = isHelpful
    ? translate("knowledge.feedback.rating.helpful", { ns: "starter" }, "Helpful")
    : translate("knowledge.feedback.rating.notHelpful", { ns: "starter" }, "Not helpful");

  return (
    <RouteDrawer
      title={translate("knowledge.feedback.show.title", { ns: "starter" }, "Feedback")}
      description={translate(
        "knowledge.feedback.show.description",
        { ns: "starter" },
        "A reader's response to this article."
      )}
      closeTo={closeTo}
      closeLabel={translate("knowledge.common.close", { ns: "starter" }, "Close")}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {query.isLoading ? (
          <LoadingState className="min-h-48" />
        ) : query.isError || !record ? (
          <Alert variant="destructive">
            <AlertTitle>
              {translate("knowledge.feedback.show.error.title", { ns: "starter" }, "Unable to load feedback")}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "knowledge.feedback.show.error.description",
                { ns: "starter" },
                "This feedback may no longer exist."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <DetailItems
              title={translate("knowledge.feedback.show.overview", { ns: "starter" }, "Overview")}
              items={[
                [
                  translate("knowledge.feedback.show.rating", { ns: "starter" }, "Rating"),
                  <span
                    key="rating"
                    className={cn(
                      "inline-flex w-fit items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium",
                      isHelpful
                        ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {isHelpful ? (
                      <ThumbsUp className="size-3.5" />
                    ) : (
                      <ThumbsDown className="size-3.5" />
                    )}
                    {ratingLabel}
                  </span>,
                ],
                [
                  translate("knowledge.feedback.show.author", { ns: "starter" }, "Reader"),
                  record.author?.nickname ??
                    translate("knowledge.reader.author.unknown", { ns: "starter" }, "Unknown author"),
                ],
                [
                  translate("knowledge.feedback.show.submitted", { ns: "starter" }, "Submitted"),
                  formatDate(record.createdAt, locale),
                ],
              ]}
            />
            <div className="space-y-1.5">
              <h3 className="text-sm font-medium">
                {translate("knowledge.feedback.show.comment", { ns: "starter" }, "Comment")}
              </h3>
              <p className="text-sm leading-6 text-muted-foreground whitespace-pre-line">
                {record.comment
                  ? record.comment
                  : translate("knowledge.feedback.show.noComment", { ns: "starter" }, "No comment left.")}
              </p>
            </div>
          </div>
        )}
      </div>
    </RouteDrawer>
  );
};
