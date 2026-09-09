import { useList, useNotification, useOne, useTranslate } from "@refinedev/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Copy,
  Eye,
  FileText,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { ListView } from "@/components/resources/views/list-view";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import { nocobaseClient } from "@nocobase/portal-sdk/client";
import { CrmAIContext, CrmAIShortcut, useQuoteDetailTasks } from "../ai-assistant";
import { AuditTrail, CopyLinkButton } from "../audit-trail";
import {
  QUOTE_STATUSES,
  formatCurrency,
  formatDate,
  formatDateTime,
  labelFor,
} from "../constants";
import { csvTimestamp, downloadCsv, type CsvColumn } from "../csv";
import { useCrmIdentity } from "../identity";
import { InlineDateCell, InlineEnumCell } from "../inline-edit";
import { EntityPicker, useCustomerOptions, useProductOptions } from "../pickers";
import {
  BulkActionBar,
  ExportCsvButton,
  KpiStrip,
  ListEmptyState,
  ListErrorState,
  SavedViewsMenu,
  SelectCell,
  SortableHeader,
  TableSkeleton,
  useActiveViewName,
  useBulkMutation,
  useListSorters,
  useRowSelection,
  useSavedViews,
  type BulkAction,
  type ListSorter,
  type ViewPreset,
} from "../list-toolkit";
import {
  ListDateRange,
  ListFilterSelect,
  ListPagination,
  ListSearchInput,
  ListToolbar,
  ListToolbarContent,
  dateRangeFilter,
  searchFilter,
  useDebouncedValue,
  useListPagination,
  useResetPageOnFilterChange,
} from "../list-controls";
import { MetricCard } from "../overview-cards";
import { useTrackRecentRecord } from "../recent-records";
import { useRecordCursorSource } from "../record-cursor";
import { RecordPager } from "../record-pager";
import { useContextualCloseTo, useOpenContextualChild } from "../route-surfaces";
import { DRAWER_WIDE, DetailItems, DrawerSection, EnumBadge, useLocale } from "../shared";
import { useUrlState } from "../url-state";
import type { QuoteItemRecord, QuoteRecord } from "../types";
import { QuotePrintDialog } from "./print";

const QUOTE_FILTER_DEFAULTS = {
  q: "",
  status: "all",
  customer: "all",
  from: "",
  to: "",
  sort: "",
  versions: "current",
};

type QuoteFilterState = typeof QUOTE_FILTER_DEFAULTS;

const todayIso = () => new Date().toISOString().slice(0, 10);
const QUOTE_DEFAULT_SORTERS: ListSorter[] = [
  { field: "issue_date", order: "desc" },
];

const isExpired = (quote: QuoteRecord) =>
  quote.status === "sent" &&
  Boolean(quote.valid_until) &&
  (quote.valid_until as string) < todayIso();

const daysLeft = (quote: QuoteRecord) =>
  quote.valid_until
    ? Math.ceil(
        (new Date(`${quote.valid_until}T00:00:00`).getTime() - Date.now()) /
          86_400_000
      )
    : null;

export function QuotesPage() {
  const translate = useTranslate();
  const identity = useCrmIdentity();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const { state, setState, replaceState, reset, fingerprint, isDirty } =
    useUrlState<QuoteFilterState>(QUOTE_FILTER_DEFAULTS);
  const debouncedSearch = useDebouncedValue(state.q);
  const listSorters = useListSorters(
    state.sort,
    (next) => setState({ sort: next }),
    QUOTE_DEFAULT_SORTERS
  );
  const { currentPage, pageSize, setCurrentPage, setPageSize } =
    useListPagination();
  const { options: customerOptions } = useCustomerOptions();
  const bulk = useBulkMutation("crm_quotes");

  const filters = useMemo(
    () => [
      ...searchFilter(["quote_number"], debouncedSearch),
      ...(state.status === "all"
        ? []
        : [{ field: "status", operator: "eq" as const, value: state.status }]),
      ...(state.customer === "all"
        ? []
        : [{ field: "customer_id", operator: "eq" as const, value: state.customer }]),
      ...(state.versions === "all"
        ? []
        : [{ field: "is_current", operator: "eq" as const, value: true }]),
      ...dateRangeFilter("issue_date", state.from, state.to),
    ],
    [debouncedSearch, state.customer, state.from, state.status, state.to, state.versions]
  );
  useResetPageOnFilterChange(`${debouncedSearch}|${fingerprint}`, setCurrentPage);

  const { result, query } = useList<QuoteRecord>({
    resource: "crm_quotes",
    filters,
    pagination: { mode: "server", currentPage, pageSize },
    sorters: listSorters.sorters,
    meta: { appends: ["customer", "deal"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });
  // Headline numbers cover every quote, not just the current page.
  const summary = useList<QuoteRecord>({
    resource: "crm_quotes",
    filters: [{ field: "is_current", operator: "eq", value: true }],
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    meta: { fields: ["id", "status", "total", "valid_until", "version"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const versionSummary = useList<QuoteRecord>({
    resource: "crm_quotes",
    pagination: { mode: "server", currentPage: 1, pageSize: 1000 },
    meta: { fields: ["id", "root_quote_id", "version"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const visible = result.data;
  useRecordCursorSource("quote", visible.map((row) => row.id));
  const quotes = summary.result.data;
  const chainMaxVersions = useMemo(() => {
    const result = new Map<string, number>();
    for (const candidate of versionSummary.result.data) {
      const rootId = candidate.root_quote_id ?? candidate.id;
      const key = String(rootId);
      result.set(key, Math.max(result.get(key) ?? 1, Number(candidate.version ?? 1)));
    }
    return result;
  }, [versionSummary.result.data]);
  const totalValue = quotes.reduce((sum, quote) => sum + Number(quote.total ?? 0), 0);
  const acceptedValue = quotes
    .filter((quote) => quote.status === "accepted")
    .reduce((sum, quote) => sum + Number(quote.total ?? 0), 0);
  const openQuotes = quotes.filter((quote) =>
    ["draft", "sent"].includes(quote.status ?? "")
  ).length;
  const expiringSoon = quotes.filter(
    (quote) =>
      quote.status === "sent" &&
      (quote.valid_until ?? "") <=
        new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
  ).length;
  const expiredCount = quotes.filter(isExpired).length;
  const winRate = quotes.filter((quote) =>
    ["accepted", "rejected"].includes(quote.status ?? "")
  ).length;
  const acceptRate = winRate
    ? Math.round(
        (quotes.filter((quote) => quote.status === "accepted").length / winRate) * 100
      )
    : 0;

  const editableIds = visible
    .filter((quote) => quote.is_current !== false && quote.status !== "superseded")
    .map((quote) => quote.id);
  const selection = useRowSelection(editableIds);

  const statusOptions = useMemo(
    () =>
      QUOTE_STATUSES.map((item) => ({
        value: item.value,
        label: labelFor(QUOTE_STATUSES, item.value, translate),
      })),
    [translate]
  );

  const presets = useMemo<ViewPreset<QuoteFilterState>[]>(
    () => [
      {
        id: "awaiting",
        name: translate("crm.quotes.views.awaiting", { ns: "starter" }, "Awaiting response"),
        state: { status: "sent" },
      },
      {
        id: "drafts",
        name: translate("crm.quotes.views.drafts", { ns: "starter" }, "Unsent drafts"),
        state: { status: "draft" },
      },
      {
        id: "accepted",
        name: translate("crm.quotes.views.accepted", { ns: "starter" }, "Accepted"),
        state: { status: "accepted" },
      },
    ],
    [translate]
  );
  const savedViews = useSavedViews<QuoteFilterState>("quotes");
  const activeView = useActiveViewName(
    state,
    QUOTE_FILTER_DEFAULTS,
    presets,
    savedViews.views
  );

  const csvColumns = useMemo<CsvColumn<QuoteRecord>[]>(
    () => [
      { header: translate("crm.quotes.fields.number", { ns: "starter" }, "Quote"), value: (quote) => quote.quote_number },
      { header: translate("crm.quotes.fields.customer", { ns: "starter" }, "Customer"), value: (quote) => quote.customer?.company_name },
      { header: translate("crm.quotes.fields.deal", { ns: "starter" }, "Deal"), value: (quote) => quote.deal?.title },
      { header: translate("crm.quotes.fields.status", { ns: "starter" }, "Status"), value: (quote) => labelFor(QUOTE_STATUSES, quote.status, translate) },
      { header: translate("crm.quotes.fields.issueDate", { ns: "starter" }, "Issue date"), value: (quote) => quote.issue_date ?? "" },
      { header: translate("crm.quotes.fields.validUntil", { ns: "starter" }, "Valid until"), value: (quote) => quote.valid_until ?? "" },
      { header: translate("crm.quotes.fields.total", { ns: "starter" }, "Total"), value: (quote) => Number(quote.total ?? 0) },
    ],
    [translate]
  );

  const bulkActions = useMemo<BulkAction[]>(
    () => {
      const actions: BulkAction[] = [
        {
          id: "send",
          label: translate("crm.quotes.bulk.send", { ns: "starter" }, "Mark as sent"),
          icon: <Send className="size-4" />,
          onRun: (ids) =>
            bulk.run(
              ids,
              { status: "sent" },
              translate("crm.quotes.bulk.sent", { ns: "starter" }, "Quotes marked as sent")
            ),
        },
        {
          id: "extend",
          label: translate("crm.quotes.bulk.extend", { ns: "starter" }, "Extend validity 30 days"),
          icon: <CalendarPlus className="size-4" />,
          onRun: (ids) =>
            bulk.run(
              ids,
              {
                valid_until: new Date(Date.now() + 30 * 86_400_000)
                  .toISOString()
                  .slice(0, 10),
              },
              translate("crm.quotes.bulk.extended", { ns: "starter" }, "Validity extended")
            ),
        },
        {
          id: "delete",
          label: translate("crm.bulk.delete", { ns: "starter" }, "Delete"),
          icon: <Trash2 className="size-4" />,
          destructive: true,
          confirm: translate(
            "crm.bulk.deleteConfirm",
            { ns: "starter" },
            "The selected records are removed permanently. This cannot be undone."
          ),
          onRun: async (ids) => {
            const done = await bulk.remove(
              ids,
              translate("crm.bulk.deleted", { ns: "starter" }, "Records deleted")
            );
            if (done) selection.clear();
          },
        },
      ];
      return actions.filter(
        (action) => identity.isAdmin || action.id !== "delete"
      );
    },
    [bulk, identity.isAdmin, selection, translate]
  );

  return (
    <ListView resource="crm_quotes">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={translate("crm.quotes.metrics.total", { ns: "starter" }, "Quote value")} value={formatCurrency(totalValue, locale)} icon={<ReceiptText className="size-5" />} loading={summary.query.isLoading} />
        <MetricCard label={translate("crm.quotes.metrics.accepted", { ns: "starter" }, "Accepted value")} value={formatCurrency(acceptedValue, locale)} detail={translate("crm.quotes.metrics.acceptRate", { ns: "starter" }, "Acceptance rate") + `: ${acceptRate}%`} icon={<CheckCircle2 className="size-5" />} loading={summary.query.isLoading} />
        <MetricCard label={translate("crm.quotes.metrics.open", { ns: "starter" }, "Open quotes")} value={openQuotes} icon={<FileText className="size-5" />} loading={summary.query.isLoading} />
        <MetricCard label={translate("crm.quotes.metrics.expiring", { ns: "starter" }, "Expiring soon")} value={expiringSoon} detail={translate("crm.quotes.metrics.expiringDetail", { ns: "starter" }, "Sent quotes valid for 30 days or less")} icon={<CalendarClock className="size-5" />} loading={summary.query.isLoading} />
      </div>
      <div className="rounded-xl border bg-card shadow-sm">
        <KpiStrip
          loading={summary.query.isLoading}
          chips={[
            {
              id: "all",
              label: translate("crm.quotes.kpi.all", { ns: "starter" }, "All quotes"),
              value: summary.result.total ?? quotes.length,
              active: !isDirty,
              onClick: reset,
            },
            {
              id: "draft",
              label: translate("crm.quotes.kpi.draft", { ns: "starter" }, "Drafts"),
              value: quotes.filter((quote) => quote.status === "draft").length,
              active: state.status === "draft",
              onClick: () => replaceState({ status: "draft" }),
            },
            {
              id: "sent",
              label: translate("crm.quotes.kpi.sent", { ns: "starter" }, "Awaiting response"),
              value: quotes.filter((quote) => quote.status === "sent").length,
              tone: "warning",
              active: state.status === "sent",
              onClick: () => replaceState({ status: "sent" }),
            },
            {
              id: "expired",
              label: translate("crm.quotes.kpi.expired", { ns: "starter" }, "Past validity"),
              value: expiredCount,
              tone: expiredCount > 0 ? "danger" : "default",
            },
            {
              id: "accepted",
              label: translate("crm.quotes.kpi.accepted", { ns: "starter" }, "Accepted"),
              value: quotes.filter((quote) => quote.status === "accepted").length,
              tone: "success",
              active: state.status === "accepted",
              onClick: () => replaceState({ status: "accepted" }),
            },
          ]}
        />
        <ListToolbar>
          <ListToolbarContent
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <SavedViewsMenu
                  presets={presets}
                  views={savedViews.views}
                  activeName={activeView}
                  isDirty={isDirty}
                  onApply={(next) => replaceState(next)}
                  onSave={(name) => savedViews.save(name, state)}
                  onDelete={savedViews.remove}
                  onReset={reset}
                />
                <ExportCsvButton
                  disabled={visible.length === 0}
                  onExport={() =>
                    downloadCsv(`crm-quotes-${csvTimestamp()}.csv`, csvColumns, visible)
                  }
                />
              </div>
            }
          >
            <ListSearchInput
              value={state.q}
              onChange={(value) => setState({ q: value })}
              placeholder={translate("crm.quotes.search", { ns: "starter" }, "Search quote number")}
            />
            <ListFilterSelect
              value={state.status}
              onChange={(value) => setState({ status: value })}
              options={statusOptions}
              allLabel={translate("crm.quotes.allStatuses", { ns: "starter" }, "All quotes")}
            />
            <ListFilterSelect
              value={state.customer}
              onChange={(value) => setState({ customer: value })}
              options={customerOptions}
              allLabel={translate("crm.common.allCustomers", { ns: "starter" }, "All customers")}
            />
            <ListDateRange
              from={state.from}
              to={state.to}
              onFromChange={(value) => setState({ from: value })}
              onToChange={(value) => setState({ to: value })}
              label={translate("crm.quotes.fields.issueDate", { ns: "starter" }, "Issue date")}
            />
            <label className="flex h-9 items-center gap-2 rounded-lg border px-3 text-sm">
              <Switch
                size="sm"
                checked={state.versions === "all"}
                onCheckedChange={(checked) =>
                  setState({ versions: checked ? "all" : "current" })
                }
              />
              {translate(
                "crm.quotes.versions.showAll",
                { ns: "starter" },
                "Show all versions"
              )}
            </label>
          </ListToolbarContent>
        </ListToolbar>

        <BulkActionBar
          count={selection.selected.length}
          ids={selection.selected}
          actions={bulkActions}
          busy={bulk.running}
          onClear={selection.clear}
        />

        {query.isLoading ? (
          <TableSkeleton columns={8} />
        ) : query.isError ? (
          <ListErrorState onRetry={() => void query.refetch()} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-10">
                    <SelectCell
                      checked={selection.allSelected}
                      onToggle={selection.toggleAll}
                      label={translate("crm.bulk.selectAll", { ns: "starter" }, "Select all rows")}
                    />
                  </TableHead>
                  <TableHead>
                    <div className="flex flex-col items-start">
                      <SortableHeader field="quote_number" label={translate("crm.quotes.fields.number", { ns: "starter" }, "Quote")} sorters={listSorters} />
                      <SortableHeader field="issue_date" label={translate("crm.quotes.fields.issueDate", { ns: "starter" }, "Issue date")} sorters={listSorters} />
                    </div>
                  </TableHead>
                  <TableHead>{translate("crm.quotes.fields.customer", { ns: "starter" }, "Customer")}</TableHead>
                  <TableHead>{translate("crm.quotes.fields.deal", { ns: "starter" }, "Deal")}</TableHead>
                  <TableHead>{translate("crm.quotes.fields.version", { ns: "starter" }, "Version")}</TableHead>
                  <TableHead><SortableHeader field="status" label={translate("crm.quotes.fields.status", { ns: "starter" }, "Status")} sorters={listSorters} /></TableHead>
                  <TableHead><SortableHeader field="valid_until" label={translate("crm.quotes.fields.validUntil", { ns: "starter" }, "Valid until")} sorters={listSorters} /></TableHead>
                  <TableHead className="text-right"><SortableHeader field="total" label={translate("crm.quotes.fields.total", { ns: "starter" }, "Total")} sorters={listSorters} align="right" /></TableHead>
                  <TableHead className="w-16"><span className="sr-only">{translate("crm.common.actions", { ns: "starter" }, "Actions")}</span></TableHead>
                </TableRow></TableHeader>
                <TableBody>{visible.map((quote) => {
                  const expired = isExpired(quote);
                  const readOnly = quote.is_current === false || quote.status === "superseded";
                  const version = Number(quote.version ?? 1);
                  const chainMax = chainMaxVersions.get(
                    String(quote.root_quote_id ?? quote.id)
                  ) ?? version;
                  return (
                    <TableRow
                      key={String(quote.id)}
                      className="group cursor-pointer"
                      data-state={selection.isSelected(quote.id) ? "selected" : undefined}
                      onClick={() => openChild(`show/${quote.id}`)}
                    >
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        {!readOnly ? (
                          <SelectCell
                            checked={selection.isSelected(quote.id)}
                            onToggle={() => selection.toggle(quote.id)}
                            label={translate("crm.bulk.selectRow", { ns: "starter" }, "Select row")}
                          />
                        ) : null}
                      </TableCell>
                      <TableCell><div className="font-mono text-sm font-semibold">{quote.quote_number}</div><div className="text-xs text-muted-foreground">{formatDate(quote.issue_date, locale)}</div></TableCell>
                      <TableCell className="font-medium">{quote.customer?.company_name ?? "—"}</TableCell>
                      <TableCell className="max-w-64 truncate">{quote.deal?.title ?? "—"}</TableCell>
                      <TableCell>
                        <span className="whitespace-nowrap font-medium tabular-nums">
                          {chainMax > 1
                            ? translate(
                                "crm.quotes.versions.position",
                                { ns: "starter", version, total: chainMax },
                                `v${version} of ${chainMax}`
                              )
                            : `v${version}`}
                        </span>
                      </TableCell>
                      <TableCell
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <div className="flex items-center gap-1.5">
                          {readOnly ? (
                            <EnumBadge
                              value={quote.status ?? "superseded"}
                              label={labelFor(
                                QUOTE_STATUSES,
                                quote.status ?? "superseded",
                                translate
                              )}
                            />
                          ) : (
                            <InlineEnumCell
                              resource="crm_quotes"
                              id={quote.id}
                              field="status"
                              value={quote.status}
                              options={QUOTE_STATUSES.filter(
                                (option) => option.value !== "superseded"
                              )}
                              badge
                            />
                          )}
                          {expired ? (
                            <span className="rounded-md bg-red-500/15 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
                              {translate("crm.quotes.expired", { ns: "starter" }, "Expired")}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {readOnly ? (
                          formatDate(quote.valid_until, locale)
                        ) : (
                          <InlineDateCell
                            resource="crm_quotes"
                            id={quote.id}
                            field="valid_until"
                            value={quote.valid_until}
                            isAlert={(nextValue) =>
                              quote.status === "sent" &&
                              Boolean(nextValue) &&
                              String(nextValue) < todayIso()
                            }
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(quote.total, locale)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                          <Button variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); openChild(`show/${quote.id}`); }}><Eye /><span className="sr-only">{translate("crm.quotes.actions.view", { ns: "starter" }, "View quote")}</span></Button>
                          {!readOnly ? (
                            <Button variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); openChild(`edit/${quote.id}`); }}><Pencil /><span className="sr-only">{translate("crm.quotes.actions.edit", { ns: "starter" }, "Edit quote")}</span></Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}</TableBody>
              </Table>
              {visible.length === 0 ? (
                <ListEmptyState
                  title={translate("crm.quotes.empty", { ns: "starter" }, "No quotes match the current filters.")}
                  description={translate(
                    "crm.quotes.emptyDescription",
                    { ns: "starter" },
                    "Quotes are created from a deal, or straight from this page."
                  )}
                  filtered={isDirty}
                  onClearFilters={reset}
                />
              ) : null}
            </div>
            <ListPagination
              currentPage={currentPage}
              pageSize={pageSize}
              total={result.total ?? visible.length}
              setCurrentPage={setCurrentPage}
              setPageSize={setPageSize}
            />
          </>
        )}
      </div>
    </ListView>
  );
}

/** Status moves a quote is allowed to make from where it is. */
const QUOTE_TRANSITIONS: Record<string, string[]> = {
  draft: ["sent"],
  sent: ["accepted", "rejected"],
  accepted: [],
  rejected: [],
};

export function QuoteShow({ idParam = "id" }: { idParam?: string }) {
  const params = useParams<Record<string, string>>();
  const id = params[idParam];
  const translate = useTranslate();
  const locale = useLocale();
  const closeTo = useContextualCloseTo();
  const openChild = useOpenContextualChild();
  const { open } = useNotification();
  const queryClient = useQueryClient();
  const { options: productOptions } = useProductOptions();
  const [productId, setProductId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [saving, setSaving] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const { result: quote, query } = useOne<QuoteRecord>({
    resource: "crm_quotes",
    id,
    meta: { appends: ["customer", "deal", "createdBy", "updatedBy"] },
    queryOptions: { enabled: Boolean(id), retry: false },
  });
  const rootQuoteId = quote?.root_quote_id ?? quote?.id;
  const historyQuery = useList<QuoteRecord>({
    resource: "crm_quotes",
    filters: rootQuoteId
      ? [{ field: "root_quote_id", operator: "eq", value: rootQuoteId }]
      : [],
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    sorters: [{ field: "version", order: "desc" }],
    meta: {
      fields: [
        "id",
        "quote_number",
        "version",
        "root_quote_id",
        "is_current",
        "revision_note",
        "status",
        "total",
        "createdAt",
      ],
    },
    errorNotification: false,
    queryOptions: { enabled: Boolean(rootQuoteId), retry: false },
  });
  useTrackRecentRecord("quote", quote?.id, quote?.quote_number);
  const itemsQuery = useList<QuoteItemRecord>({
    resource: "crm_quote_items",
    filters: id ? [{ field: "quote_id", operator: "eq", value: id }] : [],
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    sorters: [{ field: "createdAt", order: "asc" }],
    meta: { appends: ["product"] },
    errorNotification: false,
    queryOptions: { enabled: Boolean(id), retry: false },
  });
  const items = itemsQuery.result.data;
  const calculatedTotal = items.reduce(
    (sum, item) => sum + Number(item.qty ?? 0) * Number(item.unit_price ?? 0),
    0
  );
  const aiTasks = useQuoteDetailTasks(translate);
  const expired = quote ? isExpired(quote) : false;
  const remaining = quote ? daysLeft(quote) : null;
  const readOnly = quote?.is_current === false || quote?.status === "superseded";
  const allowedStatuses = readOnly
    ? []
    : (QUOTE_TRANSITIONS[quote?.status ?? "draft"] ?? []);

  const viewVersion = (versionId: string | number) => {
    const encoded = encodeURIComponent(String(versionId));
    openChild(
      idParam === "id" ? `../show/${encoded}` : `../quotes/show/${encoded}`
    );
  };

  const selectProduct = (value: string | null) => {
    setProductId(value);
    const selected = productOptions.find((option) => option.value === value)?.product;
    setUnitPrice(Number(selected?.unit_price ?? 0));
  };
  const syncTotal = async (nextItems: QuoteItemRecord[]) => {
    const total = nextItems.reduce(
      (sum, item) => sum + Number(item.qty ?? 0) * Number(item.unit_price ?? 0),
      0
    );
    if (!quote) return;
    await nocobaseClient.action("crm_quotes", "update", {
      query: { filterByTk: quote.id },
      body: { total },
    });
    await query.refetch();
  };
  const addItem = async () => {
    const selected = productOptions.find((option) => option.value === productId)?.product;
    if (!id || !selected || qty < 1 || readOnly) return;
    setSaving(true);
    try {
      const created = await nocobaseClient.action<QuoteItemRecord>("crm_quote_items", "create", {
        body: {
          quote: id,
          product: selected.id,
          product_name: selected.name,
          qty,
          unit_price: unitPrice,
        },
      });
      await syncTotal([...items, created]);
      await itemsQuery.query.refetch();
      setProductId(null);
      setQty(1);
      setUnitPrice(0);
      open?.({ type: "success", message: translate("crm.quotes.items.added", { ns: "starter" }, "Line item added") });
    } catch (error) {
      open?.({ type: "error", message: translate("crm.quotes.items.addError", { ns: "starter" }, "Unable to add line item"), description: error instanceof Error ? error.message : undefined });
    } finally {
      setSaving(false);
    }
  };
  const removeItem = async (item: QuoteItemRecord) => {
    if (readOnly) return;
    try {
      await nocobaseClient.action("crm_quote_items", "destroy", { query: { filterByTk: item.id } });
      await syncTotal(items.filter((current) => current.id !== item.id));
      await itemsQuery.query.refetch();
    } catch (error) {
      open?.({ type: "error", message: translate("crm.quotes.items.deleteError", { ns: "starter" }, "Unable to remove line item"), description: error instanceof Error ? error.message : undefined });
    }
  };
  /** Inline edit of a line item; the quote total is recalculated from the rows. */
  const updateItem = async (
    item: QuoteItemRecord,
    values: { qty?: number; unit_price?: number }
  ) => {
    if (readOnly) return;
    if (
      (values.qty !== undefined && values.qty === Number(item.qty ?? 0)) ||
      (values.unit_price !== undefined &&
        values.unit_price === Number(item.unit_price ?? 0))
    ) {
      return;
    }
    try {
      await nocobaseClient.action("crm_quote_items", "update", {
        query: { filterByTk: item.id },
        body: values,
      });
      const next = items.map((current) =>
        current.id === item.id ? { ...current, ...values } : current
      );
      await syncTotal(next);
      await itemsQuery.query.refetch();
    } catch (error) {
      open?.({
        type: "error",
        message: translate("crm.quotes.items.updateError", { ns: "starter" }, "Unable to update line item"),
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const setStatus = async (status: string) => {
    if (!quote || readOnly) return;
    try {
      await nocobaseClient.action("crm_quotes", "update", {
        query: { filterByTk: quote.id },
        body: { status },
      });
      await query.refetch();
      await queryClient.invalidateQueries();
      open?.({
        type: "success",
        message: translate("crm.quotes.status.updated", { ns: "starter" }, "Quote status updated"),
        description: labelFor(QUOTE_STATUSES, status, translate),
      });
    } catch (error) {
      open?.({
        type: "error",
        message: translate("crm.quotes.status.error", { ns: "starter" }, "Unable to update the quote"),
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const extendValidity = async () => {
    if (!quote || readOnly) return;
    const next = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    await nocobaseClient.action("crm_quotes", "update", {
      query: { filterByTk: quote.id },
      body: { valid_until: next },
    });
    await query.refetch();
    open?.({
      type: "success",
      message: translate("crm.quotes.validity.extended", { ns: "starter" }, "Validity extended by 30 days"),
    });
  };

  const loadChain = (chainRootId: string | number) =>
    nocobaseClient.action<QuoteRecord[]>("crm_quotes", "list", {
      query: {
        page: 1,
        pageSize: 1000,
        filter: JSON.stringify({ root_quote_id: chainRootId }),
        sort: "-version",
      },
    });

  const loadQuoteItems = (quoteId: string | number) =>
    nocobaseClient.action<QuoteItemRecord[]>("crm_quote_items", "list", {
      query: {
        page: 1,
        pageSize: 1000,
        filter: JSON.stringify({ quote_id: quoteId }),
        sort: "createdAt",
      },
    });

  const discardStagedVersion = async (quoteId: string | number) => {
    const stagedItems = await loadQuoteItems(quoteId);
    if (stagedItems.length > 0) {
      await nocobaseClient.action("crm_quote_items", "destroy", {
        query: { filterByTk: stagedItems.map((item) => item.id) },
      });
    }
    await nocobaseClient.action("crm_quotes", "destroy", {
      query: { filterByTk: quoteId },
    });
  };

  /**
   * Stage the new row as non-current, copy and verify every line, then switch
   * the chain. Compensation always deactivates the staged row before deciding
   * whether it is safe to restore the source, so an interrupted request cannot
   * leave both rows current.
   */
  const createRevision = async () => {
    const note = revisionNote.trim();
    if (!quote || readOnly || !note) return;
    setSaving(true);
    let stagedId: string | number | null = null;
    let chainRootId: string | number | null = null;
    let sourceStatus = quote.status ?? "draft";
    try {
      const source = await nocobaseClient.action<QuoteRecord>(
        "crm_quotes",
        "get",
        { query: { filterByTk: quote.id } }
      );
      sourceStatus = source.status ?? "draft";
      if (source.is_current !== true || source.status === "superseded") {
        throw new Error(
          translate(
            "crm.quotes.versions.sourceNotCurrent",
            { ns: "starter" },
            "Return to the current version before creating a new one."
          )
        );
      }

      chainRootId = source.root_quote_id ?? source.id;
      const [initialChain, sourceItems] = await Promise.all([
        loadChain(chainRootId),
        loadQuoteItems(source.id),
      ]);
      const currentRows = initialChain.filter((candidate) => candidate.is_current === true);
      if (
        currentRows.length !== 1 ||
        String(currentRows[0]?.id) !== String(source.id)
      ) {
        throw new Error(
          translate(
            "crm.quotes.versions.chainConflict",
            { ns: "starter" },
            "The version chain changed. Refresh and try again."
          )
        );
      }
      const maxVersion = initialChain.reduce(
        (max, candidate) => Math.max(max, Number(candidate.version ?? 1)),
        1
      );
      const nextVersion = maxVersion + 1;
      const created = await nocobaseClient.action<QuoteRecord>("crm_quotes", "create", {
        body: {
          quote_number: source.quote_number,
          version: nextVersion,
          root_quote_id: chainRootId,
          is_current: false,
          revision_note: note,
          status: "draft",
          issue_date: todayIso(),
          valid_until: source.valid_until ?? null,
          total: source.total ?? calculatedTotal,
          customer: source.customer_id ?? null,
          deal: source.deal_id ?? null,
        },
      });
      stagedId = created.id;

      for (const item of sourceItems) {
        await nocobaseClient.action("crm_quote_items", "create", {
          body: {
            quote: created.id,
            product: item.product_id ?? null,
            product_name: item.product_name,
            qty: item.qty,
            unit_price: item.unit_price,
          },
        });
      }

      const copiedItems = await loadQuoteItems(created.id);
      if (copiedItems.length !== sourceItems.length) {
        throw new Error(
          translate(
            "crm.quotes.versions.itemCountMismatch",
            { ns: "starter" },
            "The copied line-item count did not match the source quote."
          )
        );
      }

      // Recheck immediately before the current-version switch. This catches a
      // competing revision that completed while line items were being copied.
      const beforeSwitch = await loadChain(chainRootId);
      const beforeSwitchCurrent = beforeSwitch.filter(
        (candidate) => candidate.is_current === true
      );
      const beforeSwitchMax = beforeSwitch.reduce(
        (max, candidate) => Math.max(max, Number(candidate.version ?? 1)),
        1
      );
      const expectedIds = new Set([
        ...initialChain.map((candidate) => String(candidate.id)),
        String(created.id),
      ]);
      if (
        beforeSwitchCurrent.length !== 1 ||
        String(beforeSwitchCurrent[0]?.id) !== String(source.id) ||
        beforeSwitchMax !== nextVersion ||
        beforeSwitch.length !== expectedIds.size ||
        beforeSwitch.some((candidate) => !expectedIds.has(String(candidate.id)))
      ) {
        throw new Error(
          translate(
            "crm.quotes.versions.chainConflict",
            { ns: "starter" },
            "The version chain changed. Refresh and try again."
          )
        );
      }

      await nocobaseClient.action("crm_quotes", "update", {
        query: { filterByTk: source.id },
        body: { is_current: false, status: "superseded" },
      });
      const supersededSource = await nocobaseClient.action<QuoteRecord>(
        "crm_quotes",
        "get",
        { query: { filterByTk: source.id } }
      );
      if (
        supersededSource.is_current !== false ||
        supersededSource.status !== "superseded"
      ) {
        throw new Error(
          translate(
            "crm.quotes.versions.switchFailed",
            { ns: "starter" },
            "The previous version could not be superseded safely."
          )
        );
      }

      await nocobaseClient.action("crm_quotes", "update", {
        query: { filterByTk: created.id },
        body: { is_current: true },
      });

      const [verifiedChain, verifiedItems] = await Promise.all([
        loadChain(chainRootId),
        loadQuoteItems(created.id),
      ]);
      const verifiedCurrent = verifiedChain.filter(
        (candidate) => candidate.is_current === true
      );
      if (
        verifiedCurrent.length !== 1 ||
        String(verifiedCurrent[0]?.id) !== String(created.id) ||
        verifiedItems.length !== sourceItems.length
      ) {
        throw new Error(
          translate(
            "crm.quotes.versions.verifyFailed",
            { ns: "starter" },
            "The new version could not be verified."
          )
        );
      }

      // The data transition is committed and verified at this point. Cache
      // refresh failure must not trigger compensation of a valid new version.
      stagedId = null;
      await queryClient.invalidateQueries().catch(() => undefined);
      setRevisionOpen(false);
      setRevisionNote("");
      viewVersion(created.id);
      open?.({
        type: "success",
        message: translate(
          "crm.quotes.versions.created",
          { ns: "starter" },
          "New version created"
        ),
        description: `v${nextVersion}`,
      });
    } catch (error) {
      let recoveryFailed = false;
      if (stagedId !== null && chainRootId !== null) {
        try {
          // This idempotent deactivation must succeed before any restoration.
          await nocobaseClient.action("crm_quotes", "update", {
            query: { filterByTk: stagedId },
            body: { is_current: false },
          });
          const remainingChain = await loadChain(chainRootId);
          const remainingCurrent = remainingChain.filter(
            (candidate) => candidate.is_current === true
          );
          if (remainingCurrent.length === 0) {
            await nocobaseClient.action("crm_quotes", "update", {
              query: { filterByTk: quote.id },
              body: { is_current: true, status: sourceStatus },
            });
          }
          await discardStagedVersion(stagedId);
        } catch {
          recoveryFailed = true;
        }
      }
      open?.({
        type: "error",
        message: translate(
          "crm.quotes.versions.error",
          { ns: "starter" },
          "Unable to create a new version"
        ),
        description: recoveryFailed
          ? translate(
              "crm.quotes.versions.recoveryFailed",
              { ns: "starter" },
              "Automatic recovery was incomplete. Refresh and review the version chain."
            )
          : error instanceof Error
            ? error.message
            : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <CrmAIContext
      id="crm-quote-detail"
      title={translate("crm.ai.context.quote", { ns: "starter" }, "Quote detail")}
      getContext={() => ({
        resource: "crm_quotes",
        record: quote
          ? {
              id: quote.id,
              quote_number: quote.quote_number,
              status: quote.status,
              issue_date: quote.issue_date,
              valid_until: quote.valid_until,
              expired,
              total: calculatedTotal,
              customer: quote.customer?.company_name ?? null,
              deal: quote.deal?.title ?? null,
            }
          : null,
        items: items.map((item) => ({
          product: item.product_name,
          qty: item.qty,
          unit_price: item.unit_price,
          line_total: Number(item.qty ?? 0) * Number(item.unit_price ?? 0),
        })),
      })}
    >
    <RouteDrawer
      className={DRAWER_WIDE}
      title={quote ? (
        <span className="flex flex-wrap items-center gap-2">
          <span>{quote.quote_number}</span>
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums">
            v{Number(quote.version ?? 1)}
          </span>
          <span
            className={
              quote.is_current === true
                ? "rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"
                : "rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
            }
          >
            {quote.is_current === true
              ? translate(
                  "crm.quotes.versions.current",
                  { ns: "starter" },
                  "Current version"
                )
              : translate(
                  "crm.quotes.versions.previous",
                  { ns: "starter" },
                  "Previous version"
                )}
          </span>
        </span>
      ) : translate("crm.quotes.detail.title", { ns: "starter" }, "Quote details")}
      description={translate("crm.quotes.detail.description", { ns: "starter" }, "Commercial summary and priced line items.")}
      closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
      closeTo={closeTo}
      actions={
        <div className="flex items-center gap-2">
          {idParam === "id" ? (
            <RecordPager
              kind="quote"
              id={id}
              buildPath={(next) => `../show/${next}`}
            />
          ) : null}
          <CrmAIShortcut tasks={aiTasks} />
          <CopyLinkButton />
          <Button variant="outline" size="sm" onClick={() => setPrintOpen(true)}>
            <Printer />
            {translate("crm.quotes.print.open", { ns: "starter" }, "Print view")}
          </Button>
        </div>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {query.isLoading ? (
          <TableSkeleton columns={2} rows={6} />
        ) : query.isError ? (
          <ListErrorState onRetry={() => void query.refetch()} />
        ) : quote ? (
          <div className="space-y-6">
            {readOnly ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                {translate(
                  "crm.quotes.versions.readOnly",
                  { ns: "starter" },
                  "This previous version is read-only. Return to the current version to make changes or create a new version."
                )}
              </div>
            ) : null}
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-gradient-to-br from-blue-500/10 via-sky-500/5 to-transparent p-5">
              <div>
                <p className="text-sm text-muted-foreground">{translate("crm.quotes.fields.total", { ns: "starter" }, "Quote total")}</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">{formatCurrency(calculatedTotal, locale)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {translate(
                    "crm.quotes.items.count",
                    { ns: "starter", count: items.length },
                    `${items.length} line items`
                  )}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <EnumBadge value={quote.status} label={labelFor(QUOTE_STATUSES, quote.status, translate)} />
                {expired ? (
                  <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
                    {translate("crm.quotes.expired", { ns: "starter" }, "Expired")}
                  </span>
                ) : remaining !== null && remaining >= 0 && quote.status === "sent" ? (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {translate(
                      "crm.quotes.validity.remaining",
                      { ns: "starter", count: remaining },
                      `${remaining} days left`
                    )}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 rounded-xl border p-4">
              {allowedStatuses.includes("sent") ? (
                <Button size="sm" disabled={items.length === 0} onClick={() => void setStatus("sent")}>
                  <Send />
                  {translate("crm.quotes.actions.send", { ns: "starter" }, "Mark as sent")}
                </Button>
              ) : null}
              {allowedStatuses.includes("accepted") ? (
                <Button size="sm" onClick={() => void setStatus("accepted")}>
                  <CheckCircle2 />
                  {translate("crm.quotes.actions.accept", { ns: "starter" }, "Mark accepted")}
                </Button>
              ) : null}
              {allowedStatuses.includes("rejected") ? (
                <Button size="sm" variant="outline" onClick={() => void setStatus("rejected")}>
                  <XCircle />
                  {translate("crm.quotes.actions.reject", { ns: "starter" }, "Mark rejected")}
                </Button>
              ) : null}
              {expired ? (
                <Button size="sm" variant="outline" onClick={() => void extendValidity()}>
                  <CalendarPlus />
                  {translate("crm.quotes.actions.extend", { ns: "starter" }, "Extend 30 days")}
                </Button>
              ) : null}
              {!readOnly ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setRevisionOpen(true)}
                >
                  <Copy />
                  {translate(
                    "crm.quotes.versions.new",
                    { ns: "starter" },
                    "New version"
                  )}
                </Button>
              ) : null}
              {allowedStatuses.length === 0 && !expired && !readOnly ? (
                <p className="self-center text-xs text-muted-foreground">
                  {translate(
                    "crm.quotes.status.closed",
                    { ns: "starter" },
                    "This quote is closed. Create a revision to re-quote."
                  )}
                </p>
              ) : null}
            </div>

            <DetailItems title={translate("crm.quotes.detail.summary", { ns: "starter" }, "Quote summary")} items={[
              [translate("crm.quotes.fields.customer", { ns: "starter" }, "Customer"), quote.customer?.company_name ?? "—"],
              [translate("crm.quotes.fields.deal", { ns: "starter" }, "Deal"), quote.deal?.title ?? "—"],
              [translate("crm.quotes.fields.issueDate", { ns: "starter" }, "Issue date"), formatDate(quote.issue_date, locale)],
              [translate("crm.quotes.fields.validUntil", { ns: "starter" }, "Valid until"), formatDate(quote.valid_until, locale)],
            ]} />
            <Separator />
            <DrawerSection
              title={translate(
                "crm.quotes.versions.history",
                { ns: "starter" },
                "Version history"
              )}
            >
              <div className="overflow-hidden rounded-xl border">
                {historyQuery.query.isLoading ? (
                  <div className="p-4">
                    <TableSkeleton columns={4} rows={3} />
                  </div>
                ) : (
                  <div className="divide-y">
                    {historyQuery.result.data.map((historyItem) => {
                      const isViewed = String(historyItem.id) === String(quote.id);
                      return (
                        <button
                          key={String(historyItem.id)}
                          type="button"
                          className="grid w-full gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50 sm:grid-cols-[5rem_8rem_8rem_minmax(0,1fr)] sm:items-center"
                          aria-current={isViewed ? "true" : undefined}
                          onClick={() => viewVersion(historyItem.id)}
                        >
                          <span className="flex items-center gap-2 font-semibold tabular-nums">
                            v{Number(historyItem.version ?? 1)}
                            {historyItem.is_current === true ? (
                              <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                                {translate(
                                  "crm.quotes.versions.currentShort",
                                  { ns: "starter" },
                                  "Current"
                                )}
                              </span>
                            ) : null}
                          </span>
                          <EnumBadge
                            value={historyItem.status ?? "draft"}
                            label={labelFor(
                              QUOTE_STATUSES,
                              historyItem.status ?? "draft",
                              translate
                            )}
                          />
                          <span className="font-medium tabular-nums">
                            {formatCurrency(historyItem.total, locale)}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-xs text-muted-foreground">
                              {formatDateTime(historyItem.createdAt, locale)}
                            </span>
                            <span className="block truncate text-sm">
                              {historyItem.revision_note || "—"}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </DrawerSection>
            <Separator />
            <DrawerSection title={translate("crm.quotes.items.title", { ns: "starter" }, "Line items")}>
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>{translate("crm.quotes.items.product", { ns: "starter" }, "Product")}</TableHead>
                    <TableHead className="w-24 text-right">{translate("crm.quotes.items.qty", { ns: "starter" }, "Qty")}</TableHead>
                    <TableHead className="w-32 text-right">{translate("crm.quotes.items.unitPrice", { ns: "starter" }, "Unit price")}</TableHead>
                    <TableHead className="text-right">{translate("crm.quotes.items.lineTotal", { ns: "starter" }, "Line total")}</TableHead>
                    <TableHead className="w-12" />
                  </TableRow></TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={String(item.id)}>
                        <TableCell className="font-medium">
                          {item.product_name}
                          {item.product?.sku ? (
                            <span className="ml-2 font-mono text-xs text-muted-foreground">{item.product.sku}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={1}
                            disabled={readOnly}
                            defaultValue={Number(item.qty ?? 0)}
                            className="h-8 w-20 text-right tabular-nums"
                            onBlur={(event) =>
                              void updateItem(item, {
                                qty: Math.max(1, Number(event.target.value)),
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            disabled={readOnly}
                            defaultValue={Number(item.unit_price ?? 0)}
                            className="h-8 w-28 text-right tabular-nums"
                            onBlur={(event) =>
                              void updateItem(item, {
                                unit_price: Math.max(0, Number(event.target.value)),
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatCurrency(Number(item.qty ?? 0) * Number(item.unit_price ?? 0), locale)}
                        </TableCell>
                        <TableCell>
                          {!readOnly ? (
                            <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => void removeItem(item)}>
                              <Trash2 />
                              <span className="sr-only">{translate("crm.quotes.items.remove", { ns: "starter" }, "Remove line item")}</span>
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                          {translate("crm.quotes.items.empty", { ns: "starter" }, "No line items yet.")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={3} className="text-right text-sm font-medium">
                          {translate("crm.quotes.print.subtotal", { ns: "starter" }, "Subtotal")}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatCurrency(calculatedTotal, locale)}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {!readOnly ? (
                <div className="grid gap-3 rounded-xl border border-dashed bg-muted/20 p-4 sm:grid-cols-[minmax(0,1fr)_6rem_8rem_auto] sm:items-end">
                  <div className="space-y-2"><Label>{translate("crm.quotes.items.product", { ns: "starter" }, "Product")}</Label><EntityPicker value={productId} onChange={selectProduct} options={productOptions} placeholder={translate("crm.quotes.items.selectProduct", { ns: "starter" }, "Select from price book")} /></div>
                  <div className="space-y-2"><Label>{translate("crm.quotes.items.qty", { ns: "starter" }, "Qty")}</Label><Input type="number" min={1} value={qty} onChange={(event) => setQty(Math.max(1, Number(event.target.value)))} /></div>
                  <div className="space-y-2"><Label>{translate("crm.quotes.items.unitPrice", { ns: "starter" }, "Unit price")}</Label><Input type="number" min={0} step="0.01" value={unitPrice} onChange={(event) => setUnitPrice(Math.max(0, Number(event.target.value)))} /></div>
                  <Button disabled={!productId || saving} onClick={() => void addItem()}><Plus />{saving ? translate("crm.quotes.items.adding", { ns: "starter" }, "Adding...") : translate("crm.quotes.items.add", { ns: "starter" }, "Add item")}</Button>
                </div>
              ) : null}
            </DrawerSection>
            <Separator />
            <AuditTrail record={quote} locale={locale} />
          </div>
        ) : null}
      </div>
    </RouteDrawer>

    <QuotePrintDialog
      quote={quote}
      items={items}
      open={printOpen}
      onOpenChange={setPrintOpen}
    />
    <Dialog
      open={revisionOpen}
      onOpenChange={(nextOpen) => {
        if (saving) return;
        setRevisionOpen(nextOpen);
        if (!nextOpen) setRevisionNote("");
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {translate(
              "crm.quotes.versions.dialog.title",
              { ns: "starter" },
              "Create new version"
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              "crm.quotes.versions.dialog.description",
              { ns: "starter" },
              "The current quote and all its line items will be copied into a new draft."
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="quote-revision-note">
            {translate(
              "crm.quotes.fields.revisionNote",
              { ns: "starter" },
              "Revision note"
            )}
          </Label>
          <Textarea
            id="quote-revision-note"
            value={revisionNote}
            disabled={saving}
            required
            aria-required="true"
            placeholder={translate(
              "crm.quotes.versions.dialog.placeholder",
              { ns: "starter" },
              "Explain what changed and why this version is needed"
            )}
            onChange={(event) => setRevisionNote(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => {
              setRevisionOpen(false);
              setRevisionNote("");
            }}
          >
            {translate("crm.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button
            type="button"
            disabled={saving || !revisionNote.trim()}
            onClick={() => void createRevision()}
          >
            <Copy />
            {saving
              ? translate(
                  "crm.quotes.versions.creating",
                  { ns: "starter" },
                  "Creating version..."
                )
              : translate(
                  "crm.quotes.versions.create",
                  { ns: "starter" },
                  "Create version"
                )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </CrmAIContext>
  );
}
