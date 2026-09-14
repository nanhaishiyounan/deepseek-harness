import { type HttpError, useList, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import { AlertTriangle } from "lucide-react";
import type { PropsWithChildren } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useParams } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useRouteSurfaceClose } from "@nocobase/portal-sdk/routing";
import {
  RouteDrawer,
  RouteDrawerFooter,
  useRefineUnsavedChangesGuard,
} from "@/extensions/nocobase-route-surfaces";
import { ARTICLE_STATUSES, labelFor } from "../constants";
import { AuthorPicker, CategoryPicker } from "../pickers";
import { useContextualCloseTo } from "../route-surfaces";
import type { ArticleFormValues, ArticleRecord } from "../types";

const WORDS_PER_MINUTE = 220;

const toServerValues = (values: ArticleFormValues) => {
  const { category_id, author_id, ...rest } = values;
  return {
    ...rest,
    category: category_id,
    author: author_id,
  } as unknown as ArticleFormValues;
};

function FormSection({
  title,
  description,
  children,
}: PropsWithChildren<{ title: string; description?: string }>) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ArticleFormFields({
  form,
  presetCategoryId,
  articleId,
}: {
  form: UseFormReturn<ArticleFormValues>;
  presetCategoryId?: string;
  articleId?: string;
}) {
  const translate = useTranslate();
  const title = form.watch("title") ?? "";
  const summary = form.watch("summary") ?? "";
  const body = form.watch("body") ?? "";
  const status = form.watch("status");
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  const readingMinutes = Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
  const duplicateResult = useList<ArticleRecord>({
    resource: "hub_kb_articles",
    pagination: { mode: "server", currentPage: 1, pageSize: 10 },
    filters: [{ field: "title", operator: "eq", value: title }],
    errorNotification: false,
    queryOptions: { enabled: Boolean(title.trim()), retry: false },
  });
  const duplicate = (duplicateResult.result.data ?? []).find(
    (row) => String(row.id) !== String(articleId ?? "")
  );
  const publishingIncomplete =
    status === "published" && (body.length < 200 || !summary.trim());

  return (
    <>
      <FormSection
        title={translate(
          "knowledge.articles.form.sections.article",
          { ns: "starter" },
          "Article"
        )}
      >
        <FormField
          control={form.control}
          name="title"
          rules={{
            validate: (value) =>
              Boolean(value?.trim()) ||
              translate(
                "knowledge.articles.fields.title.required",
                { ns: "starter" },
                "Title is required"
              ),
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("knowledge.articles.fields.title", { ns: "starter" }, "Title")}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder={translate(
                      "knowledge.articles.fields.title.placeholder",
                      { ns: "starter" },
                      "e.g. Incident response runbook"
                    )}
                  />
                }
              />
              <FormMessage />
            </FormItem>
          )}
        />

        {duplicate ? (
          <Alert className="border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400">
            <AlertTriangle />
            <AlertDescription className="text-amber-700 dark:text-amber-400">
              {translate(
                "knowledge.articles.form.duplicateTitle",
                { ns: "starter", title: duplicate.title ?? title },
                "Another article already uses this title: {{title}}"
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        <FormField
          control={form.control}
          name="summary"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate(
                  "knowledge.articles.fields.summary",
                  { ns: "starter" },
                  "Summary"
                )}
              </FormLabel>
              <FormControl
                render={
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    rows={2}
                    placeholder={translate(
                      "knowledge.articles.fields.summary.placeholder",
                      { ns: "starter" },
                      "A one-line teaser shown on the article card."
                    )}
                  />
                }
              />
              <p
                className={
                  summary.length > 200
                    ? "text-xs text-amber-700 dark:text-amber-400"
                    : "text-xs text-muted-foreground"
                }
              >
                {translate(
                  "knowledge.articles.form.summaryCount",
                  { ns: "starter", count: summary.length },
                  "{{count}} / 200"
                )}
              </p>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormSection>

      <Separator />

      <FormSection
        title={translate(
          "knowledge.articles.form.sections.content",
          { ns: "starter" },
          "Content"
        )}
      >
        <FormField
          control={form.control}
          name="body"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("knowledge.articles.fields.body", { ns: "starter" }, "Body")}
              </FormLabel>
              <FormControl
                render={
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    rows={12}
                    placeholder={translate(
                      "knowledge.articles.fields.body.placeholder",
                      { ns: "starter" },
                      "Write the article. Separate paragraphs with a blank line."
                    )}
                  />
                }
              />
              <p className="text-xs text-muted-foreground">
                {translate(
                  "knowledge.articles.form.bodyCount",
                  { ns: "starter", words: wordCount, minutes: readingMinutes },
                  "{{words}} words · {{minutes}} min read"
                )}
              </p>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormSection>

      <Separator />

      <FormSection
        title={translate(
          "knowledge.articles.form.sections.publishing",
          { ns: "starter" },
          "Publishing"
        )}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="category_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate(
                    "knowledge.articles.fields.category",
                    { ns: "starter" },
                    "Category"
                  )}
                </FormLabel>
                <FormControl
                  render={
                    <CategoryPicker
                      value={field.value}
                      onChange={field.onChange}
                      disabled={Boolean(presetCategoryId)}
                    />
                  }
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="author_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate(
                    "knowledge.articles.fields.author",
                    { ns: "starter" },
                    "Author"
                  )}
                </FormLabel>
                <FormControl
                  render={<AuthorPicker value={field.value} onChange={field.onChange} />}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate(
                  "knowledge.articles.fields.status",
                  { ns: "starter" },
                  "Status"
                )}
              </FormLabel>
              <FormControl
                render={
                  <Select
                    value={field.value ?? "draft"}
                    onValueChange={(value) => field.onChange(value ?? "draft")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={translate(
                          "knowledge.articles.fields.status.placeholder",
                          { ns: "starter" },
                          "Select status"
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {ARTICLE_STATUSES.map((articleStatus) => (
                        <SelectItem key={articleStatus.value} value={articleStatus.value}>
                          {labelFor(ARTICLE_STATUSES, articleStatus.value, translate)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              />
              <FormMessage />
            </FormItem>
          )}
        />

        {publishingIncomplete ? (
          <Alert className="border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400">
            <AlertTriangle />
            <AlertDescription className="text-amber-700 dark:text-amber-400">
              {translate(
                "knowledge.articles.form.publishingIncomplete",
                { ns: "starter" },
                "This article looks incomplete for publishing. Add a summary and at least 200 characters of body content."
              )}
            </AlertDescription>
          </Alert>
        ) : null}
      </FormSection>
    </>
  );
}

type ArticleSurfaceProps = { presetCategoryId?: string };

export const ArticleCreate = ({ presetCategoryId }: ArticleSurfaceProps) => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("knowledge.articles.drawer.create.title", { ns: "starter" }, "New article")}
        description={translate(
          "knowledge.articles.drawer.create.description",
          { ns: "starter" },
          "Draft a knowledge base article."
        )}
        closeTo={closeTo}
        closeLabel={translate("knowledge.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <ArticleCreateForm presetCategoryId={presetCategoryId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function ArticleCreateForm({ presetCategoryId }: ArticleSurfaceProps) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<ArticleRecord, HttpError, ArticleFormValues>({
    refineCoreProps: {
      resource: "hub_kb_articles",
      action: "create",
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: {
      title: "",
      summary: "",
      body: "",
      status: "draft",
      category_id: presetCategoryId ? String(presetCategoryId) : null,
      author_id: null,
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <ArticleFormFields form={form} presetCategoryId={presetCategoryId} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("knowledge.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("knowledge.articles.form.publishing", { ns: "starter" }, "Publishing...")
              : translate("knowledge.articles.form.save", { ns: "starter" }, "Save article")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const ArticleEdit = ({
  presetCategoryId,
  idParam = "id",
}: ArticleSurfaceProps & { idParam?: string }) => {
  const translate = useTranslate();
  const params = useParams<Record<string, string>>();
  const recordId = params[idParam];
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("knowledge.articles.drawer.edit.title", { ns: "starter" }, "Edit article")}
        description={translate(
          "knowledge.articles.drawer.edit.description",
          { ns: "starter" },
          "Update this article's content or status."
        )}
        closeTo={closeTo}
        closeLabel={translate("knowledge.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <ArticleEditForm id={recordId} presetCategoryId={presetCategoryId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function ArticleEditForm({
  id,
  presetCategoryId,
}: ArticleSurfaceProps & { id?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<ArticleRecord, HttpError, ArticleFormValues>({
    refineCoreProps: {
      resource: "hub_kb_articles",
      action: "edit",
      id,
      redirect: false,
      meta: { appends: ["category", "author"] },
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <ArticleFormFields
            form={form}
            presetCategoryId={presetCategoryId}
            articleId={id}
          />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("knowledge.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("knowledge.common.saving", { ns: "starter" }, "Saving...")
              : translate("knowledge.common.save", { ns: "starter" }, "Save changes")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}
