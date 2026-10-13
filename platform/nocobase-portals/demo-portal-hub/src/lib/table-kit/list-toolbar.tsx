import { useTranslate } from "@refinedev/core";
import type { BaseRecord, HttpError } from "@refinedev/core";
import type { UseTableReturnType } from "@refinedev/react-table";
import {
  Bookmark,
  BookmarkPlus,
  Check,
  Columns3,
  Download,
  ListFilter,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Rows2,
  Rows3,
  Search,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { Density } from "./density";
import type { SavedViewsApi } from "./use-saved-views";

export type ListToolbarProps<TData extends BaseRecord> = {
  table: UseTableReturnType<TData, HttpError>;
  state?: never;
  savedViews?: SavedViewsApi;
  density: Density;
  onDensityChange: (density: Density) => void;
  columnLabels: Record<string, string>;
  onExport?: () => void;
  isExporting?: boolean;
  children?: ReactNode;
  i18nPrefix?: string;
};

export type ToolbarView = { id: string; label: string };
export type ToolbarCustomView = { id: string; name: string };
export type ToolbarColumn<TRecord> = {
  id: string;
  header: string;
  locked?: boolean;
} & Partial<Record<keyof TRecord & string, unknown>>;
export type ToolbarFacet = {
  field: string;
  label: string;
  single?: boolean;
  options: Array<{ value: string; label: string }>;
};

export type ToolbarState<
  TRecord,
  TCustomView extends ToolbarCustomView = ToolbarCustomView,
> = {
  search: string;
  setSearch: (value: string) => void;
  facets: Record<string, string[]>;
  setFacet: (field: string, values: string[]) => void;
  clearFilters: () => void;
  filterCount: number;
  views: ToolbarView[];
  customViews: TCustomView[];
  viewId: string;
  applyView: (id: string, custom?: TCustomView) => void;
  saveView: (name: string) => void;
  deleteView: (id: string) => void;
  density: Density;
  setDensity: (density: Density) => void;
  hiddenColumns: string[];
  toggleColumn: (columnId: string) => void;
  query: { isFetching: boolean; refetch: () => unknown };
  total: number;
  columns: Array<ToolbarColumn<TRecord>>;
};

export type SalesListToolbarProps<
  TRecord,
  TCustomView extends ToolbarCustomView = ToolbarCustomView,
> = {
  state: ToolbarState<TRecord, TCustomView>;
  table?: never;
  facets?: ToolbarFacet[];
  searchPlaceholder?: string;
  onExport?: () => void;
  exporting?: boolean;
  actions?: ReactNode;
  i18nPrefix?: string;
};

interface ListToolbarComponent {
  <TData extends BaseRecord>(props: ListToolbarProps<TData>): ReactNode;
  <
    TRecord,
    TCustomView extends ToolbarCustomView = ToolbarCustomView,
  >(props: SalesListToolbarProps<TRecord, TCustomView>): ReactNode;
}

/** Full toolbar union: Refine tables and the Sales grid keep their native UX. */
function ListToolbarImpl(
  props:
    | ListToolbarProps<BaseRecord>
    | SalesListToolbarProps<unknown, ToolbarCustomView>
) {
  if ("state" in props && props.state) {
    return <SalesToolbar {...props} />;
  }
  return <RefineToolbar {...props} />;
}

export const ListToolbar = ListToolbarImpl as ListToolbarComponent;

function RefineToolbar<TData extends BaseRecord>({
  table,
  savedViews,
  density,
  onDensityChange,
  columnLabels,
  onExport,
  isExporting,
  children,
  i18nPrefix = "finance.ops",
}: ListToolbarProps<TData>) {
  const translate = useTranslate();
  const [newViewLabel, setNewViewLabel] = useState("");
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const columnFilters = table.reactTable.getState().columnFilters;
  const hasFilters = columnFilters.length > 0;
  const hideableColumns = table.reactTable
    .getAllLeafColumns()
    .filter((column) => column.id !== "select" && column.id !== "actions");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {savedViews?.views.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => savedViews.apply(view)}
              className={cn(
                "group inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                savedViews.activeId === view.id
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/70 text-muted-foreground hover:bg-muted"
              )}
            >
              {!view.preset && <Bookmark className="size-3" />}
              {view.label}
              {!view.preset && (
                <X
                  className="size-3 opacity-0 transition-opacity group-hover:opacity-70"
                  onClick={(event) => {
                    event.stopPropagation();
                    savedViews.remove(view.id);
                  }}
                />
              )}
            </button>
          ))}
          {children}
        </div>

        <div className="flex items-center gap-1.5">
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => table.reactTable.resetColumnFilters()}
            >
              <RotateCcw className="size-3.5" />
              {translate(
                `${i18nPrefix}.clearFilters`,
                { ns: "starter" },
                "Clear filters"
              )}
            </Button>
          )}

          {savedViews && hasFilters && (
            <Popover open={isSaveOpen} onOpenChange={setIsSaveOpen}>
              <PopoverTrigger
                render={
                  <Button variant="outline" size="sm" className="text-xs">
                    <BookmarkPlus className="size-3.5" />
                    {translate(
                      `${i18nPrefix}.saveView`,
                      { ns: "starter" },
                      "Save view"
                    )}
                  </Button>
                }
              />
              <PopoverContent align="end" className="w-64 space-y-2 p-3">
                <p className="text-xs font-medium">
                  {translate(
                    `${i18nPrefix}.saveViewTitle`,
                    { ns: "starter" },
                    "Save current filters"
                  )}
                </p>
                <Input
                  autoFocus
                  value={newViewLabel}
                  placeholder={translate(
                    `${i18nPrefix}.saveViewPlaceholder`,
                    { ns: "starter" },
                    "View name"
                  )}
                  className="h-8"
                  onChange={(event) => setNewViewLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && newViewLabel.trim()) {
                      savedViews.save(newViewLabel.trim());
                      setNewViewLabel("");
                      setIsSaveOpen(false);
                    }
                  }}
                />
                <Button
                  size="sm"
                  className="w-full text-xs"
                  disabled={!newViewLabel.trim()}
                  onClick={() => {
                    savedViews.save(newViewLabel.trim());
                    setNewViewLabel("");
                    setIsSaveOpen(false);
                  }}
                >
                  {translate(
                    `${i18nPrefix}.saveViewConfirm`,
                    { ns: "starter" },
                    "Save"
                  )}
                </Button>
              </PopoverContent>
            </Popover>
          )}

          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() =>
              onDensityChange(density === "compact" ? "comfortable" : "compact")
            }
            title={translate(
              `${i18nPrefix}.density`,
              { ns: "starter" },
              "Row density"
            )}
          >
            {density === "compact" ? (
              <Rows2 className="size-3.5" />
            ) : (
              <Rows3 className="size-3.5" />
            )}
            {density === "compact"
              ? translate(
                  `${i18nPrefix}.densityCompact`,
                  { ns: "starter" },
                  "Compact"
                )
              : translate(
                  `${i18nPrefix}.densityComfortable`,
                  { ns: "starter" },
                  "Comfortable"
                )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" className="text-xs">
                  <Columns3 className="size-3.5" />
                  {translate(
                    `${i18nPrefix}.columns`,
                    { ns: "starter" },
                    "Columns"
                  )}
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>
                {translate(
                  `${i18nPrefix}.columnsTitle`,
                  { ns: "starter" },
                  "Visible columns"
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {hideableColumns.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  closeOnClick={false}
                  onCheckedChange={(value) =>
                    column.toggleVisibility(Boolean(value))
                  }
                >
                  {columnLabels[column.id] ?? column.id}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => table.reactTable.resetColumnVisibility()}
              >
                {translate(
                  `${i18nPrefix}.columnsReset`,
                  { ns: "starter" },
                  "Reset columns"
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {onExport && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              disabled={isExporting}
              onClick={onExport}
            >
              <Download className="size-3.5" />
              {isExporting
                ? translate(
                    `${i18nPrefix}.exporting`,
                    { ns: "starter" },
                    "Exporting..."
                  )
                : translate(
                    `${i18nPrefix}.exportCsv`,
                    { ns: "starter" },
                    "Export CSV"
                  )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function SalesToolbar<
  TRecord,
  TCustomView extends ToolbarCustomView = ToolbarCustomView,
>({
  state,
  facets = [],
  searchPlaceholder,
  onExport,
  exporting,
  actions,
  i18nPrefix = "sales.toolbar",
}: SalesListToolbarProps<TRecord, TCustomView>) {
  const translate = useTranslate();
  const configurable = state.columns.filter((column) => !column.locked);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {state.views.map((view) => (
          <Button
            key={view.id}
            variant={state.viewId === view.id ? "secondary" : "ghost"}
            size="sm"
            onClick={() => state.applyView(view.id)}
          >
            {view.label}
          </Button>
        ))}
        {state.customViews.map((view) => (
          <span
            key={view.id}
            className={cn(
              "inline-flex items-center rounded-lg",
              state.viewId === view.id ? "bg-secondary" : "hover:bg-muted"
            )}
          >
            <Button
              variant="ghost"
              size="sm"
              className="hover:bg-transparent"
              onClick={() => state.applyView(view.id, view)}
            >
              {view.name}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className="mr-1 text-muted-foreground hover:bg-transparent"
              onClick={() => state.deleteView(view.id)}
              aria-label={translate(
                `${i18nPrefix}.views.delete`,
                { ns: "starter" },
                "Delete view"
              )}
            >
              <X />
            </Button>
          </span>
        ))}
        <SaveViewButton onSave={state.saveView} i18nPrefix={i18nPrefix} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={state.search}
            onChange={(event) => state.setSearch(event.currentTarget.value)}
            placeholder={
              searchPlaceholder ??
              translate(`${i18nPrefix}.search`, { ns: "starter" }, "Search…")
            }
            className="pl-8"
          />
          {state.search ? (
            <button
              type="button"
              onClick={() => state.setSearch("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={translate(
                `${i18nPrefix}.clearSearch`,
                { ns: "starter" },
                "Clear search"
              )}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        {facets.map((facet) => (
          <FacetFilter
            key={facet.field}
            facet={facet}
            selected={state.facets[facet.field] ?? []}
            onChange={(values) => state.setFacet(facet.field, values)}
            i18nPrefix={i18nPrefix}
          />
        ))}

        {state.filterCount > 0 ? (
          <Button variant="ghost" size="sm" onClick={state.clearFilters}>
            <X />
            {translate(`${i18nPrefix}.clearAll`, { ns: "starter" }, "Clear")}
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-1.5">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {translate(
              `${i18nPrefix}.resultCount`,
              { ns: "starter" },
              "{{count}} records"
            ).replace("{{count}}", String(state.total))}
          </span>

          <Popover>
            <PopoverTrigger render={<Button variant="outline" size="icon-sm" />}>
              <Rows3 />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-1">
              {(["comfortable", "compact"] as const).map((density) => (
                <button
                  key={density}
                  type="button"
                  onClick={() => state.setDensity(density)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                >
                  {density === "comfortable"
                    ? translate(
                        `${i18nPrefix}.density.comfortable`,
                        { ns: "starter" },
                        "Comfortable"
                      )
                    : translate(
                        `${i18nPrefix}.density.compact`,
                        { ns: "starter" },
                        "Compact"
                      )}
                  {state.density === density ? (
                    <Check className="size-3.5" />
                  ) : null}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger render={<Button variant="outline" size="icon-sm" />}>
              <Columns3 />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-1">
              <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {translate(`${i18nPrefix}.columns`, { ns: "starter" }, "Columns")}
              </p>
              <Separator className="my-1" />
              <div className="max-h-72 overflow-y-auto">
                {configurable.map((column) => {
                  const visible = !state.hiddenColumns.includes(column.id);
                  return (
                    <button
                      key={column.id}
                      type="button"
                      onClick={() => state.toggleColumn(column.id)}
                      className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <span className="truncate">{column.header}</span>
                      {visible ? <Check className="size-3.5" /> : null}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>

          {onExport ? (
            <Button
              variant="outline"
              size="icon-sm"
              onClick={onExport}
              disabled={exporting}
              aria-label={translate(
                `${i18nPrefix}.export`,
                { ns: "starter" },
                "Export CSV"
              )}
            >
              {exporting ? <Loader2 className="animate-spin" /> : <Download />}
            </Button>
          ) : null}

          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => state.query.refetch()}
            aria-label={translate(
              `${i18nPrefix}.refresh`,
              { ns: "starter" },
              "Refresh"
            )}
          >
            <RefreshCcw className={cn(state.query.isFetching && "animate-spin")} />
          </Button>
          {actions}
        </div>
      </div>
    </div>
  );
}

function FacetFilter({
  facet,
  selected,
  onChange,
  i18nPrefix,
}: {
  facet: ToolbarFacet;
  selected: string[];
  onChange: (values: string[]) => void;
  i18nPrefix: string;
}) {
  const translate = useTranslate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const searchable = facet.options.length > 8;
  const options = searchable
    ? facet.options.filter((option) =>
        option.label.toLowerCase().includes(typed.trim().toLowerCase())
      )
    : facet.options;
  const summary =
    selected.length === 0
      ? null
      : selected.length === 1
        ? (facet.options.find((option) => option.value === selected[0])?.label ??
          selected[0])
        : translate(
            `${i18nPrefix}.facet.selected`,
            { ns: "starter" },
            "{{count}} selected"
          ).replace("{{count}}", String(selected.length));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant={selected.length > 0 ? "secondary" : "outline"}
            size="sm"
          />
        }
      >
        <ListFilter />
        {facet.label}
        {summary ? (
          <span className="ml-1 rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary">
            {summary}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        {searchable ? (
          <div className="p-1">
            <Input
              value={typed}
              onChange={(event) => setTyped(event.currentTarget.value)}
              placeholder={translate(
                `${i18nPrefix}.facet.search`,
                { ns: "starter" },
                "Filter options…"
              )}
              className="h-8"
            />
          </div>
        ) : null}
        <div className="max-h-64 overflow-y-auto">
          {options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  if (facet.single) {
                    onChange(checked ? [] : [option.value]);
                    setOpen(false);
                    return;
                  }
                  onChange(
                    checked
                      ? selected.filter((value) => value !== option.value)
                      : [...selected, option.value]
                  );
                }}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              >
                <span className="truncate">{option.label}</span>
                {checked ? <Check className="size-3.5" /> : null}
              </button>
            );
          })}
        </div>
        {selected.length > 0 ? (
          <>
            <Separator className="my-1" />
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
            >
              {translate(
                `${i18nPrefix}.facet.clear`,
                { ns: "starter" },
                "Clear"
              )}
            </button>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function SaveViewButton({
  onSave,
  i18nPrefix,
}: {
  onSave: (name: string) => void;
  i18nPrefix: string;
}) {
  const translate = useTranslate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="sm" />}>
        <BookmarkPlus />
        {translate(
          `${i18nPrefix}.views.save`,
          { ns: "starter" },
          "Save view"
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-2">
        <p className="text-xs text-muted-foreground">
          {translate(
            `${i18nPrefix}.views.saveHint`,
            { ns: "starter" },
            "Saves the current filters, search and sort."
          )}
        </p>
        <Input
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          placeholder={translate(
            `${i18nPrefix}.views.namePlaceholder`,
            { ns: "starter" },
            "My open deals"
          )}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            {translate("sales.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button
            size="sm"
            disabled={!name.trim()}
            onClick={() => {
              onSave(name.trim());
              setName("");
              setOpen(false);
            }}
          >
            {translate(
              `${i18nPrefix}.views.saveAction`,
              { ns: "starter" },
              "Save"
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
