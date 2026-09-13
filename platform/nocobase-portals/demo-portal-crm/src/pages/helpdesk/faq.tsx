import { type HttpError, useList, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import {
  BookOpenText,
  CircleAlert,
  Download,
  FolderTree,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useParams } from "react-router";
import { Breadcrumb } from "@/components/app-shell/breadcrumb";
import { DeleteButton } from "@/components/resources/buttons/delete";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { Textarea } from "@/components/ui/textarea";
import { useRouteSurfaceClose } from "@nocobase/portal-sdk/routing";
import {
  RouteDrawer,
  RouteDrawerFooter,
  useRefineUnsavedChangesGuard,
} from "@/extensions/nocobase-route-surfaces";
import { AsyncPanel, KpiStrip, exportCsv, type KpiTile } from "@/lib/table-kit";
import { getFaqEditPath, helpdeskRoutes } from "./routes";
import { CategoryBadge } from "./shared";
import type { FaqFormValues, FaqRecord } from "./types";

const RESOURCE = "hub_hd_faqs";

export function FaqPage() {
  return (
    <>
      <FaqContent />
      <Outlet />
    </>
  );
}

// ---------------------------------------------------------------------------
// FAQ / self-service — a search box over an accordion grouped by category.
// Read-only, no drawers: the whole point is a fast scan-and-answer surface.
// ---------------------------------------------------------------------------

function FaqContent() {
  const translate = useTranslate();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const { result, query } = useList<FaqRecord>({
    resource: RESOURCE,
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    sorters: [{ field: "category", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const faqs = result.data ?? [];

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const faq of faqs) {
      const category = faq.category?.trim();
      if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [faqs]);

  const uncategorisedCount = useMemo(
    () => faqs.filter((faq) => !faq.category?.trim()).length,
    [faqs]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return faqs.filter((faq) => {
      const matchesCategory =
        selectedCategory === null || faq.category?.trim() === selectedCategory;
      const matchesSearch =
        !term ||
        faq.question?.toLowerCase().includes(term) ||
        faq.answer?.toLowerCase().includes(term) ||
        faq.category?.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [faqs, search, selectedCategory]);

  const grouped = useMemo(() => {
    const map = new Map<string, FaqRecord[]>();
    const otherLabel = translate("helpdesk.faq.categoryOther", { ns: "starter" }, "Other");
    for (const faq of filtered) {
      const key = faq.category?.trim() || otherLabel;
      const bucket = map.get(key);
      if (bucket) bucket.push(faq);
      else map.set(key, [faq]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, translate]);

  const kpiTiles = useMemo<KpiTile[]>(
    () => [
      {
        key: "articles",
        label: translate("helpdesk.faq.kpi.articles", { ns: "starter" }, "Articles"),
        value: String(faqs.length),
        icon: BookOpenText,
        tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
      },
      {
        key: "categories",
        label: translate("helpdesk.faq.kpi.categories", { ns: "starter" }, "Categories"),
        value: String(categoryCounts.length),
        icon: FolderTree,
        tone: "text-violet-600 bg-violet-500/12 dark:text-violet-400",
      },
      {
        key: "uncategorised",
        label: translate(
          "helpdesk.faq.kpi.uncategorised",
          { ns: "starter" },
          "Uncategorised"
        ),
        value: String(uncategorisedCount),
        icon: CircleAlert,
        tone:
          uncategorisedCount > 0
            ? "text-red-600 bg-red-500/12 dark:text-red-400"
            : "text-emerald-600 bg-emerald-500/12 dark:text-emerald-400",
      },
    ],
    [categoryCounts.length, faqs.length, translate, uncategorisedCount]
  );

  const handleExport = () => {
    exportCsv(
      "helpdesk-faq",
      [
        {
          header: translate("helpdesk.faq.export.question", { ns: "starter" }, "Question"),
          value: (faq) => faq.question,
        },
        {
          header: translate("helpdesk.faq.export.answer", { ns: "starter" }, "Answer"),
          value: (faq) => faq.answer,
        },
        {
          header: translate("helpdesk.faq.export.category", { ns: "starter" }, "Category"),
          value: (faq) => faq.category,
        },
      ],
      filtered
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center text-muted-foreground">
          <Breadcrumb />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {translate("helpdesk.faq.title", { ns: "starter" }, "Frequently asked questions")}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {translate(
                "helpdesk.faq.subtitle",
                { ns: "starter" },
                "Quick answers to the questions the helpdesk sees most often."
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="size-4" />
              {translate("helpdesk.ops.exportCsv", { ns: "starter" }, "Export CSV")}
            </Button>
            <Button render={<Link to={helpdeskRoutes.faqCreate} />}>
              <Plus className="size-4" />
              {translate("helpdesk.faq.new", { ns: "starter" }, "New question")}
            </Button>
          </div>
        </div>
      </div>

      <KpiStrip tiles={kpiTiles} />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={translate(
                "helpdesk.faq.search.placeholder",
                { ns: "starter" },
                "Search questions and answers..."
              )}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={selectedCategory === null ? "default" : "outline"}
              size="sm"
              className="rounded-full"
              onClick={() => setSelectedCategory(null)}
            >
              {translate("helpdesk.faq.filters.all", { ns: "starter" }, "All")}
              <span className="tabular-nums">{faqs.length}</span>
            </Button>
            {categoryCounts.map(([category, count]) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                className="rounded-full"
                onClick={() => setSelectedCategory(category)}
              >
                <CategoryBadge value={category} label={category} />
                <span className="tabular-nums">{count}</span>
              </Button>
            ))}
          </div>
        </div>
        {search.trim() || selectedCategory !== null ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {translate(
              "helpdesk.faq.resultCount",
              { ns: "starter", count: filtered.length },
              `${filtered.length} results`
            )}
          </span>
        ) : null}
      </div>

      <AsyncPanel i18nPrefix="helpdesk.ops"
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={grouped.length === 0}
        onRetry={() => void query.refetch()}
        emptyTitle={translate(
          "helpdesk.faq.empty",
          { ns: "starter" },
          "No questions match your search."
        )}
        emptyDescription={translate(
          "helpdesk.faq.empty.description",
          { ns: "starter" },
          "Try another search or category."
        )}
        skeletonRows={3}
      >
        <div className="space-y-6">
          {grouped.map(([category, items]) => (
            <div key={category} className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">{category}</h3>
              <Accordion multiple className="rounded-xl border border-border/70 px-2">
                {items.map((faq) => (
                  <AccordionItem key={faq.id} value={String(faq.id)}>
                    <AccordionTrigger className="px-4 text-sm font-medium">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="px-4 text-sm leading-6 text-muted-foreground">
                      <p className="whitespace-pre-wrap">{faq.answer}</p>
                      <div className="mt-3 flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          render={<Link to={getFaqEditPath(faq.id)} />}
                        >
                          <Pencil className="size-3.5" />
                          {translate("helpdesk.faq.edit", { ns: "starter" }, "Edit")}
                        </Button>
                        <DeleteButton
                          resource={RESOURCE}
                          recordItemId={faq.id}
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                          {translate("helpdesk.faq.delete", { ns: "starter" }, "Delete")}
                        </DeleteButton>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ))}
        </div>
      </AsyncPanel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / edit drawers — URL-addressable at /faq/create and /faq/edit/:id.
// FAQ entries are a maintained collection; admins add and revise them here.
// ---------------------------------------------------------------------------

function FaqFormFields({
  form,
}: {
  form: ReturnType<typeof useForm<FaqRecord, HttpError, FaqFormValues>>;
}) {
  const translate = useTranslate();
  return (
    <>
      <FormField
        control={form.control}
        name="question"
        rules={{
          required: translate(
            "helpdesk.faq.fields.question.required",
            { ns: "starter" },
            "Question is required"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("helpdesk.faq.fields.question", { ns: "starter" }, "Question")}
            </FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "helpdesk.faq.fields.question.placeholder",
                    { ns: "starter" },
                    "e.g. How do I reset my password?"
                  )}
                  autoFocus
                />
              }
            />
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="answer"
        rules={{
          required: translate(
            "helpdesk.faq.fields.answer.required",
            { ns: "starter" },
            "Answer is required"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("helpdesk.faq.fields.answer", { ns: "starter" }, "Answer")}
            </FormLabel>
            <FormControl
              render={
                <Textarea
                  {...field}
                  value={field.value ?? ""}
                  className="min-h-32"
                  placeholder={translate(
                    "helpdesk.faq.fields.answer.placeholder",
                    { ns: "starter" },
                    "Write a clear, self-service answer."
                  )}
                />
              }
            />
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="category"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("helpdesk.faq.fields.category", { ns: "starter" }, "Category")}
            </FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={field.value ?? ""}
                  onChange={(event) => field.onChange(event.target.value || null)}
                  placeholder={translate(
                    "helpdesk.faq.fields.category.placeholder",
                    { ns: "starter" },
                    "e.g. Accounts"
                  )}
                />
              }
            />
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}

export function FaqCreate() {
  const translate = useTranslate();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("helpdesk.faq.create.title", { ns: "starter" }, "New question")}
        description={translate(
          "helpdesk.faq.create.description",
          { ns: "starter" },
          "Add a self-service answer to the knowledge base."
        )}
        closeLabel={translate("buttons.close", "Close")}
        closeTo={helpdeskRoutes.faq}
        beforeClose={beforeClose}
      >
        <FaqCreateForm />
      </RouteDrawer>
      {confirmation}
    </>
  );
}

function FaqCreateForm() {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const form = useForm<FaqRecord, HttpError, FaqFormValues>({
    refineCoreProps: {
      resource: RESOURCE,
      action: "create",
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: { question: "", answer: "", category: null },
  });
  const {
    refineCore: { onFinish },
  } = form;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(values))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <FaqFormFields form={form} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("buttons.cancel", "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("helpdesk.faq.create.submitting", { ns: "starter" }, "Creating...")
              : translate("helpdesk.faq.create.submit", { ns: "starter" }, "Create question")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export function FaqEdit() {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("helpdesk.faq.edit.title", { ns: "starter" }, "Edit question")}
        description={translate(
          "helpdesk.faq.edit.description",
          { ns: "starter" },
          "Update the question, answer or category."
        )}
        closeLabel={translate("buttons.close", "Close")}
        closeTo={helpdeskRoutes.faq}
        beforeClose={beforeClose}
      >
        <FaqEditForm id={id} />
      </RouteDrawer>
      {confirmation}
    </>
  );
}

function FaqEditForm({ id }: { id?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const form = useForm<FaqRecord, HttpError, FaqFormValues>({
    refineCoreProps: {
      resource: RESOURCE,
      action: "edit",
      id,
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
  });
  const {
    refineCore: { onFinish, query },
  } = form;

  const record = query?.data?.data;
  const seeded = useRef(false);
  useEffect(() => {
    if (!record || seeded.current) return;
    seeded.current = true;
    form.reset({
      question: record.question ?? "",
      answer: record.answer ?? "",
      category: record.category ?? null,
    });
  }, [record, form]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(values))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <FaqFormFields form={form} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("buttons.cancel", "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("helpdesk.faq.edit.submitting", { ns: "starter" }, "Saving...")
              : translate("helpdesk.faq.edit.submit", { ns: "starter" }, "Save changes")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}
