import { useList, useTranslate } from "@refinedev/core";
import {
  Boxes,
  DollarSign,
  Eye,
  PackageCheck,
  Pencil,
  PowerOff,
  Trash2,
  Zap,
} from "lucide-react";
import { useMemo } from "react";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { ListView } from "@/components/resources/views/list-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PRODUCT_CATEGORIES, formatCurrency, labelFor } from "../constants";
import { csvTimestamp, downloadCsv, type CsvColumn } from "../csv";
import { useCrmIdentity } from "../identity";
import { InlineBooleanCell, InlineNumberCell } from "../inline-edit";
import {
  BulkActionBar,
  ColumnSettingsMenu,
  ExportCsvButton,
  ListEmptyState,
  ListErrorState,
  SavedViewsMenu,
  SelectCell,
  SortableHeader,
  TableSkeleton,
  densityClass,
  useActiveViewName,
  useBulkMutation,
  useColumnPreferences,
  useListSorters,
  useRowSelection,
  useSavedViews,
  type BulkAction,
  type ListSorter,
  type ViewPreset,
} from "../list-toolkit";
import {
  ListFilterSelect,
  ListPagination,
  ListSearchInput,
  ListToolbar,
  ListToolbarContent,
  searchFilter,
  useDebouncedValue,
  useListPagination,
  useResetPageOnFilterChange,
} from "../list-controls";
import { MetricCard } from "../overview-cards";
import { useRecordCursorSource } from "../record-cursor";
import { useOpenContextualChild } from "../route-surfaces";
import { EnumBadge, useLocale } from "../shared";
import { useUrlState } from "../url-state";
import type { ProductRecord } from "../types";

const PRODUCT_FILTER_DEFAULTS = {
  q: "",
  category: "all",
  availability: "all",
  sort: "",
};

type ProductFilterState = typeof PRODUCT_FILTER_DEFAULTS;
const PRODUCT_DEFAULT_SORTERS: ListSorter[] = [{ field: "name", order: "asc" }];

export function ProductsPage() {
  const translate = useTranslate();
  const identity = useCrmIdentity();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const { state, setState, replaceState, reset, fingerprint, isDirty } =
    useUrlState<ProductFilterState>(PRODUCT_FILTER_DEFAULTS);
  const debouncedSearch = useDebouncedValue(state.q);
  const listSorters = useListSorters(
    state.sort,
    (next) => setState({ sort: next }),
    PRODUCT_DEFAULT_SORTERS
  );
  const { currentPage, pageSize, setCurrentPage, setPageSize } =
    useListPagination();
  const bulk = useBulkMutation("crm_products");

  const filters = useMemo(
    () => [
      ...searchFilter(["name", "sku"], debouncedSearch),
      ...(state.category === "all"
        ? []
        : [{ field: "category", operator: "eq" as const, value: state.category }]),
      ...(state.availability === "all"
        ? []
        : [
            {
              field: "active",
              operator: "eq" as const,
              value: state.availability === "active",
            },
          ]),
    ],
    [state.availability, state.category, debouncedSearch]
  );
  useResetPageOnFilterChange(`${debouncedSearch}|${fingerprint}`, setCurrentPage);

  const { result, query } = useList<ProductRecord>({
    resource: "crm_products",
    filters,
    pagination: { mode: "server", currentPage, pageSize },
    sorters: listSorters.sorters,
    errorNotification: false,
    queryOptions: { retry: false },
  });
  // Price-book metrics stay whole-catalogue while the table is filtered.
  const summary = useList<ProductRecord>({
    resource: "crm_products",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    meta: { fields: ["id", "active", "unit_price"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const visible = result.data;
  useRecordCursorSource("product", visible.map((row) => row.id));
  const products = summary.result.data;
  const active = products.filter((product) => product.active).length;
  const averagePrice = products.length
    ? products.reduce((sum, product) => sum + Number(product.unit_price ?? 0), 0) /
      products.length
    : 0;

  const selection = useRowSelection(visible.map((product) => product.id));

  const categoryOptions = useMemo(
    () =>
      PRODUCT_CATEGORIES.map((item) => ({
        value: item.value,
        label: labelFor(PRODUCT_CATEGORIES, item.value, translate),
      })),
    [translate]
  );
  const availabilityOptions = useMemo(
    () => [
      { value: "active", label: translate("crm.products.active", { ns: "starter" }, "Active") },
      { value: "inactive", label: translate("crm.products.inactive", { ns: "starter" }, "Inactive") },
    ],
    [translate]
  );

  const columnOptions = useMemo(
    () => [
      { id: "sku", label: translate("crm.products.fields.sku", { ns: "starter" }, "SKU"), locked: true },
      { id: "name", label: translate("crm.products.fields.name", { ns: "starter" }, "Product"), locked: true },
      { id: "category", label: translate("crm.products.fields.category", { ns: "starter" }, "Category") },
      { id: "unit_price", label: translate("crm.products.fields.price", { ns: "starter" }, "Unit price") },
      { id: "active", label: translate("crm.products.fields.active", { ns: "starter" }, "Availability") },
    ],
    [translate]
  );
  const columnPrefs = useColumnPreferences("products", columnOptions);

  const presets = useMemo<ViewPreset<ProductFilterState>[]>(
    () => [
      {
        id: "active",
        name: translate("crm.products.views.active", { ns: "starter" }, "Sellable catalogue"),
        state: { availability: "active" },
      },
      {
        id: "retired",
        name: translate("crm.products.views.retired", { ns: "starter" }, "Retired SKUs"),
        state: { availability: "inactive" },
      },
      {
        id: "services",
        name: translate("crm.products.views.services", { ns: "starter" }, "Services"),
        state: { category: "services" },
      },
    ],
    [translate]
  );
  const savedViews = useSavedViews<ProductFilterState>("products");
  const activeView = useActiveViewName(
    state,
    PRODUCT_FILTER_DEFAULTS,
    presets,
    savedViews.views
  );

  const csvColumns = useMemo<CsvColumn<ProductRecord>[]>(
    () => [
      { header: translate("crm.products.fields.sku", { ns: "starter" }, "SKU"), value: (product) => product.sku },
      { header: translate("crm.products.fields.name", { ns: "starter" }, "Product"), value: (product) => product.name },
      { header: translate("crm.products.fields.category", { ns: "starter" }, "Category"), value: (product) => labelFor(PRODUCT_CATEGORIES, product.category, translate) },
      { header: translate("crm.products.fields.price", { ns: "starter" }, "Unit price"), value: (product) => Number(product.unit_price ?? 0) },
      {
        header: translate("crm.products.fields.active", { ns: "starter" }, "Availability"),
        value: (product) =>
          product.active
            ? translate("crm.products.active", { ns: "starter" }, "Active")
            : translate("crm.products.inactive", { ns: "starter" }, "Inactive"),
      },
    ],
    [translate]
  );

  const bulkActions = useMemo<BulkAction[]>(
    () => {
      const actions: BulkAction[] = [
        {
          id: "activate",
          label: translate("crm.products.bulk.activate", { ns: "starter" }, "Make sellable"),
          icon: <Zap className="size-4" />,
          onRun: (ids) =>
            bulk.run(
              ids,
              { active: true },
              translate("crm.products.bulk.activated", { ns: "starter" }, "Products are sellable")
            ),
        },
        {
          id: "retire",
          label: translate("crm.products.bulk.retire", { ns: "starter" }, "Retire from price book"),
          icon: <PowerOff className="size-4" />,
          onRun: (ids) =>
            bulk.run(
              ids,
              { active: false },
              translate("crm.products.bulk.retired", { ns: "starter" }, "Products retired")
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
    <ListView resource="crm_products">
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label={translate("crm.products.metrics.skus", { ns: "starter" }, "Price book SKUs")} value={summary.result.total ?? products.length} icon={<Boxes className="size-5" />} loading={summary.query.isLoading} />
        <MetricCard label={translate("crm.products.metrics.active", { ns: "starter" }, "Active products")} value={active} detail={translate("crm.products.metrics.activeDetail", { ns: "starter" }, "Available for new quote items")} icon={<PackageCheck className="size-5" />} loading={summary.query.isLoading} />
        <MetricCard label={translate("crm.products.metrics.average", { ns: "starter" }, "Average list price")} value={formatCurrency(averagePrice, locale)} icon={<DollarSign className="size-5" />} loading={summary.query.isLoading} />
      </div>
      <div className="rounded-xl border bg-card shadow-sm">
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
                <ColumnSettingsMenu
                  columns={columnOptions}
                  isVisible={columnPrefs.isVisible}
                  toggle={columnPrefs.toggle}
                  density={columnPrefs.density}
                  setDensity={columnPrefs.setDensity}
                  reset={columnPrefs.reset}
                />
                <ExportCsvButton
                  disabled={visible.length === 0}
                  onExport={() =>
                    downloadCsv(`crm-products-${csvTimestamp()}.csv`, csvColumns, visible)
                  }
                />
              </div>
            }
          >
            <ListSearchInput
              value={state.q}
              onChange={(value) => setState({ q: value })}
              placeholder={translate("crm.products.search", { ns: "starter" }, "Search product or SKU")}
            />
            <ListFilterSelect
              value={state.availability}
              onChange={(value) => setState({ availability: value })}
              options={availabilityOptions}
              allLabel={translate("crm.products.allAvailability", { ns: "starter" }, "Any availability")}
            />
            <ListFilterSelect
              value={state.category}
              onChange={(value) => setState({ category: value })}
              options={categoryOptions}
              allLabel={translate("crm.products.allCategories", { ns: "starter" }, "All categories")}
            />
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
          <TableSkeleton columns={6} />
        ) : query.isError ? (
          <ListErrorState onRetry={() => void query.refetch()} />
        ) : (
          <>
            <div className={cn("overflow-x-auto", densityClass(columnPrefs.density))}>
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-10">
                    <SelectCell
                      checked={selection.allSelected}
                      onToggle={selection.toggleAll}
                      label={translate("crm.bulk.selectAll", { ns: "starter" }, "Select all rows")}
                    />
                  </TableHead>
                  <TableHead><SortableHeader field="sku" label={translate("crm.products.fields.sku", { ns: "starter" }, "SKU")} sorters={listSorters} /></TableHead>
                  <TableHead><SortableHeader field="name" label={translate("crm.products.fields.name", { ns: "starter" }, "Product")} sorters={listSorters} /></TableHead>
                  {columnPrefs.isVisible("category") ? (
                    <TableHead><SortableHeader field="category" label={translate("crm.products.fields.category", { ns: "starter" }, "Category")} sorters={listSorters} /></TableHead>
                  ) : null}
                  {columnPrefs.isVisible("unit_price") ? (
                    <TableHead className="text-right"><SortableHeader field="unit_price" label={translate("crm.products.fields.price", { ns: "starter" }, "Unit price")} sorters={listSorters} align="right" /></TableHead>
                  ) : null}
                  {columnPrefs.isVisible("active") ? (
                    <TableHead><SortableHeader field="active" label={translate("crm.products.fields.active", { ns: "starter" }, "Availability")} sorters={listSorters} /></TableHead>
                  ) : null}
                  <TableHead className="w-24"><span className="sr-only">{translate("crm.common.actions", { ns: "starter" }, "Actions")}</span></TableHead>
                </TableRow></TableHeader>
                <TableBody>{visible.map((product) => (
                  <TableRow
                    key={String(product.id)}
                    className="group cursor-pointer"
                    data-state={selection.isSelected(product.id) ? "selected" : undefined}
                    onClick={() => openChild(`show/${product.id}`)}
                  >
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <SelectCell
                        checked={selection.isSelected(product.id)}
                        onToggle={() => selection.toggle(product.id)}
                        label={translate("crm.bulk.selectRow", { ns: "starter" }, "Select row")}
                      />
                    </TableCell>
                    <TableCell><Badge variant="outline" className="font-mono text-xs">{product.sku}</Badge></TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    {columnPrefs.isVisible("category") ? (
                      <TableCell><EnumBadge value={product.category} label={labelFor(PRODUCT_CATEGORIES, product.category, translate)} /></TableCell>
                    ) : null}
                    {columnPrefs.isVisible("unit_price") ? (
                      <TableCell
                        className="text-right font-semibold tabular-nums"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <InlineNumberCell
                          resource="crm_products"
                          id={product.id}
                          field="unit_price"
                          value={product.unit_price}
                          min={0}
                          step={0.01}
                          format={(nextValue) => formatCurrency(nextValue, locale)}
                        />
                      </TableCell>
                    ) : null}
                    {columnPrefs.isVisible("active") ? (
                      <TableCell
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <InlineBooleanCell
                          resource="crm_products"
                          id={product.id}
                          field="active"
                          value={product.active}
                          trueLabel={translate("crm.products.active", { ns: "starter" }, "Active")}
                          falseLabel={translate("crm.products.inactive", { ns: "starter" }, "Inactive")}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <div className="flex items-center gap-1 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                        <Button variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); openChild(`show/${product.id}`); }}>
                          <Eye /><span className="sr-only">{translate("crm.products.actions.view", { ns: "starter" }, "View product")}</span>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); openChild(`edit/${product.id}`); }}>
                          <Pencil /><span className="sr-only">{translate("crm.products.actions.edit", { ns: "starter" }, "Edit product")}</span>
                        </Button>
                        <DeleteButton resource="crm_products" recordItemId={product.id} variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                          <Trash2 />
                        </DeleteButton>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
              {visible.length === 0 ? (
                <ListEmptyState
                  title={translate("crm.products.empty", { ns: "starter" }, "No products match the current filters.")}
                  description={translate(
                    "crm.products.emptyDescription",
                    { ns: "starter" },
                    "Only active SKUs can be added to a quote, so check the availability filter first."
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
