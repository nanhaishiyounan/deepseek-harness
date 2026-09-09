import { useNotification, useTranslate } from "@refinedev/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  BookmarkPlus,
  Check,
  ChevronsUpDown,
  Columns3,
  Download,
  RotateCcw,
  Rows2,
  Rows3,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { nocobaseClient } from "@nocobase/portal-sdk/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { OwnerPicker } from "./pickers";
import type { UrlState } from "./url-state";

export type ListSorter = { field: string; order: "asc" | "desc" };

const SORT_FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const parseSorters = (value: string): ListSorter[] => {
  const seen = new Set<string>();
  const parsed: ListSorter[] = [];

  for (const rawSegment of value.split(",")) {
    const segment = rawSegment.trim();
    const order = segment.startsWith("-") ? "desc" : "asc";
    const field = order === "desc" ? segment.slice(1) : segment;
    if (!SORT_FIELD_PATTERN.test(field) || seen.has(field)) continue;
    seen.add(field);
    parsed.push({ field, order });
  }

  return parsed;
};

const serializeSorters = (sorters: ListSorter[]) =>
  sorters
    .map(({ field, order }) => `${order === "desc" ? "-" : ""}${field}`)
    .join(",");

/**
 * Sort state is compact in the URL so a sorted list can be shared and survives
 * a refresh. Invalid hand-edited segments are skipped before reaching Refine.
 */
export function useListSorters(
  value: string,
  onChange: (next: string) => void,
  fallback: ListSorter[]
): {
  sorters: ListSorter[];
  toggle: (field: string, additive: boolean) => void;
  directionOf: (field: string) => "asc" | "desc" | null;
  indexOf: (field: string) => number;
  isDefault: boolean;
} {
  const fallbackValue = serializeSorters(fallback);
  const isDefault = value.trim() === "";
  const sorters = useMemo(() => {
    const parsed = parseSorters(value);
    return parsed.length > 0 ? parsed : parseSorters(fallbackValue);
  }, [fallbackValue, value]);

  const directionOf = useCallback(
    (field: string) => sorters.find((sorter) => sorter.field === field)?.order ?? null,
    [sorters]
  );
  const indexOf = useCallback(
    (field: string) => sorters.findIndex((sorter) => sorter.field === field),
    [sorters]
  );
  const toggle = useCallback(
    (field: string, additive: boolean) => {
      if (!SORT_FIELD_PATTERN.test(field)) return;
      const current = directionOf(field);
      const nextOrder = current === null ? "asc" : current === "asc" ? "desc" : null;
      let next: ListSorter[];
      if (!additive) {
        next = nextOrder ? [{ field, order: nextOrder }] : [];
      } else if (current === null) {
        next = [...sorters, { field, order: "asc" }];
      } else if (nextOrder) {
        // An existing key keeps its precedence while its direction changes.
        next = sorters.map((sorter) =>
          sorter.field === field ? { ...sorter, order: nextOrder } : sorter
        );
      } else {
        next = sorters.filter((sorter) => sorter.field !== field);
      }
      onChange(serializeSorters(next));
    },
    [directionOf, onChange, sorters]
  );

  return useMemo(
    () => ({ sorters, toggle, directionOf, indexOf, isDefault }),
    [directionOf, indexOf, isDefault, sorters, toggle]
  );
}

export function SortableHeader({
  field,
  label,
  sorters,
  align = "left",
}: {
  field: string;
  label: string;
  sorters: ReturnType<typeof useListSorters>;
  align?: "left" | "right";
}): ReactNode {
  const translate = useTranslate();
  const direction = sorters.directionOf(field);
  const index = sorters.indexOf(field);
  const nextAction =
    direction === null
      ? translate("crm.sort.ascending", { ns: "starter" }, "Sort ascending")
      : direction === "asc"
        ? translate("crm.sort.descending", { ns: "starter" }, "Sort descending")
        : translate("crm.sort.clear", { ns: "starter" }, "Clear sorting");
  const multiHint = translate(
    "crm.sort.multiHint",
    { ns: "starter" },
    "Shift-click to add a second sort"
  );

  return (
    <button
      type="button"
      className={cn(
        "group/sort inline-flex min-h-8 items-center gap-1 rounded-sm font-medium outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        align === "right" && "ml-auto justify-end"
      )}
      aria-label={`${label}: ${nextAction}. ${multiHint}`}
      title={multiHint}
      onClick={(event) => sorters.toggle(field, event.shiftKey || event.altKey)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.shiftKey || event.altKey)) {
          event.preventDefault();
          sorters.toggle(field, true);
        }
      }}
    >
      <span>{label}</span>
      {direction === "desc" ? (
        <ArrowDown className="size-3.5 text-primary" />
      ) : direction === "asc" ? (
        <ArrowUp className="size-3.5 text-primary" />
      ) : (
        <ChevronsUpDown className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/sort:opacity-100 group-focus-visible/sort:opacity-100" />
      )}
      {index >= 0 && sorters.sorters.length > 1 ? (
        <sup className="text-[10px] leading-none text-muted-foreground">{index + 1}</sup>
      ) : null}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Saved views                                                                 */
/* -------------------------------------------------------------------------- */

export type SavedView<T extends UrlState> = {
  id: string;
  name: string;
  state: Partial<T>;
};

/** Views shipped with the module, e.g. "My open items", "Due this week". */
export type ViewPreset<T extends UrlState> = {
  id: string;
  name: string;
  state: Partial<T>;
};

const readStore = <T,>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeStore = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage disabled — views simply stop persisting */
  }
};

/**
 * Named filter sets, persisted per browser. Applying a view rewrites the URL
 * state, so a saved view is also a shareable link.
 */
export function useSavedViews<T extends UrlState>(storageKey: string) {
  const key = `crm.views.${storageKey}`;
  const [views, setViews] = useState<SavedView<T>[]>(() => readStore(key, []));

  const save = useCallback(
    (name: string, state: Partial<T>) => {
      setViews((current) => {
        const next = [
          ...current.filter((view) => view.name !== name),
          { id: `${Date.now()}`, name, state },
        ];
        writeStore(key, next);
        return next;
      });
    },
    [key]
  );

  const remove = useCallback(
    (id: string) => {
      setViews((current) => {
        const next = current.filter((view) => view.id !== id);
        writeStore(key, next);
        return next;
      });
    },
    [key]
  );

  return { views, save, remove };
}

export function SavedViewsMenu<T extends UrlState>({
  presets,
  views,
  activeName,
  onApply,
  onSave,
  onDelete,
  onReset,
  isDirty,
}: {
  presets: ViewPreset<T>[];
  views: SavedView<T>[];
  activeName?: string;
  onApply: (state: Partial<T>) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
  onReset: () => void;
  isDirty: boolean;
}) {
  const translate = useTranslate();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="sm" className="gap-1.5" />}
        >
          <Bookmark className="size-4" />
          <span className="max-w-32 truncate">
            {activeName ??
              translate("crm.views.all", { ns: "starter" }, "All records")}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          <DropdownMenuLabel>
            {translate("crm.views.standard", { ns: "starter" }, "Standard views")}
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={onReset}>
            <Check
              className={cn("size-4", activeName ? "opacity-0" : "opacity-100")}
            />
            {translate("crm.views.all", { ns: "starter" }, "All records")}
          </DropdownMenuItem>
          {presets.map((preset) => (
            <DropdownMenuItem
              key={preset.id}
              onClick={() => onApply(preset.state)}
            >
              <Check
                className={cn(
                  "size-4",
                  activeName === preset.name ? "opacity-100" : "opacity-0"
                )}
              />
              {preset.name}
            </DropdownMenuItem>
          ))}
          {views.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>
                {translate("crm.views.saved", { ns: "starter" }, "My views")}
              </DropdownMenuLabel>
              {views.map((view) => (
                <DropdownMenuItem
                  key={view.id}
                  onClick={() => onApply(view.state)}
                  className="justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Check
                      className={cn(
                        "size-4",
                        activeName === view.name ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {view.name}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={translate(
                      "crm.views.delete",
                      { ns: "starter" },
                      "Delete view"
                    )}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(view.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") onDelete(view.id);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </span>
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!isDirty}
            onClick={() => {
              setName("");
              setSaving(true);
            }}
          >
            <BookmarkPlus className="size-4" />
            {translate("crm.views.save", { ns: "starter" }, "Save current view")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={saving} onOpenChange={setSaving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {translate("crm.views.save", { ns: "starter" }, "Save current view")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {translate(
                "crm.views.saveDescription",
                { ns: "starter" },
                "The current filters are stored under a name you can pick from the view menu."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={name}
            autoFocus
            placeholder={translate(
              "crm.views.namePlaceholder",
              { ns: "starter" },
              "My open items"
            )}
            onChange={(event) => setName(event.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>
              {translate("crm.common.cancel", { ns: "starter" }, "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!name.trim()}
              onClick={() => {
                onSave(name.trim());
                setSaving(false);
              }}
            >
              {translate("crm.common.save", { ns: "starter" }, "Save changes")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Matches the current filter state against presets and saved views. */
export function useActiveViewName<T extends UrlState>(
  state: T,
  defaults: T,
  presets: ViewPreset<T>[],
  views: SavedView<T>[]
) {
  return useMemo(() => {
    const matches = (candidate: Partial<T>) =>
      Object.keys(defaults).every((key) => {
        const expected = candidate[key as keyof T] ?? defaults[key as keyof T];
        return state[key as keyof T] === expected;
      });
    return (
      [...presets, ...views].find((entry) => matches(entry.state))?.name ??
      undefined
    );
  }, [defaults, presets, state, views]);
}

/* -------------------------------------------------------------------------- */
/* Column configuration + density                                              */
/* -------------------------------------------------------------------------- */

export type ColumnOption = { id: string; label: string; locked?: boolean };
export type Density = "compact" | "comfortable";

export function useColumnPreferences(
  storageKey: string,
  columns: ColumnOption[]
) {
  const key = `crm.columns.${storageKey}`;
  const [hidden, setHidden] = useState<string[]>(() =>
    readStore<string[]>(`${key}.hidden`, [])
  );
  const [density, setDensityState] = useState<Density>(() =>
    readStore<Density>(`${key}.density`, "comfortable")
  );

  const toggle = useCallback(
    (id: string) => {
      setHidden((current) => {
        const next = current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id];
        writeStore(`${key}.hidden`, next);
        return next;
      });
    },
    [key]
  );

  const setDensity = useCallback(
    (value: Density) => {
      setDensityState(value);
      writeStore(`${key}.density`, value);
    },
    [key]
  );

  const reset = useCallback(() => {
    setHidden([]);
    writeStore(`${key}.hidden`, []);
  }, [key]);

  const visibility = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const column of columns) map[column.id] = !hidden.includes(column.id);
    return map;
  }, [columns, hidden]);

  const isVisible = useCallback(
    (id: string) => !hidden.includes(id),
    [hidden]
  );

  return { columns, visibility, isVisible, toggle, density, setDensity, reset };
}

/** Row padding for the hand-written tables; also usable as a wrapper class. */
export const densityClass = (density: Density) =>
  density === "compact"
    ? "[&_td]:py-1 [&_th]:py-1.5 [&_td]:text-[13px]"
    : "";

export function ColumnSettingsMenu({
  columns,
  isVisible,
  toggle,
  density,
  setDensity,
  reset,
}: {
  columns: ColumnOption[];
  isVisible: (id: string) => boolean;
  toggle: (id: string) => void;
  density: Density;
  setDensity: (value: Density) => void;
  reset: () => void;
}) {
  const translate = useTranslate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" className="gap-1.5" />}
      >
        <Columns3 className="size-4" />
        {translate("crm.columns.title", { ns: "starter" }, "Columns")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel>
          {translate("crm.columns.visible", { ns: "starter" }, "Visible columns")}
        </DropdownMenuLabel>
        {columns.map((column) => (
          <DropdownMenuItem
            key={column.id}
            closeOnClick={false}
            disabled={column.locked}
            onClick={() => !column.locked && toggle(column.id)}
          >
            <Check
              className={cn(
                "size-4",
                isVisible(column.id) ? "opacity-100" : "opacity-0"
              )}
            />
            {column.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>
          {translate("crm.columns.density", { ns: "starter" }, "Row density")}
        </DropdownMenuLabel>
        <DropdownMenuItem
          closeOnClick={false}
          onClick={() => setDensity("comfortable")}
        >
          <Rows3
            className={cn(
              "size-4",
              density === "comfortable" ? "opacity-100" : "opacity-40"
            )}
          />
          {translate("crm.columns.comfortable", { ns: "starter" }, "Comfortable")}
        </DropdownMenuItem>
        <DropdownMenuItem
          closeOnClick={false}
          onClick={() => setDensity("compact")}
        >
          <Rows2
            className={cn(
              "size-4",
              density === "compact" ? "opacity-100" : "opacity-40"
            )}
          />
          {translate("crm.columns.compact", { ns: "starter" }, "Compact")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={reset}>
          <RotateCcw className="size-4" />
          {translate("crm.columns.reset", { ns: "starter" }, "Reset columns")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* -------------------------------------------------------------------------- */
/* Export                                                                      */
/* -------------------------------------------------------------------------- */

export function ExportCsvButton({
  onExport,
  disabled,
  label,
}: {
  onExport: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const translate = useTranslate();
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={disabled}
      onClick={onExport}
    >
      <Download className="size-4" />
      {label ?? translate("crm.common.exportCsv", { ns: "starter" }, "Export CSV")}
    </Button>
  );
}

/* -------------------------------------------------------------------------- */
/* Row selection + bulk actions                                                */
/* -------------------------------------------------------------------------- */

export type RecordId = string | number;

export function useRowSelection(pageIds: RecordId[]) {
  const [selected, setSelected] = useState<RecordId[]>([]);

  // Rows that left the current result set can never be acted on again, so the
  // selection is trimmed whenever the page or filters change.
  useEffect(() => {
    setSelected((current) =>
      current.filter((id) => pageIds.some((pageId) => String(pageId) === String(id)))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIds.map(String).join(",")]);

  const isSelected = useCallback(
    (id: RecordId) => selected.some((item) => String(item) === String(id)),
    [selected]
  );
  const toggle = useCallback((id: RecordId) => {
    setSelected((current) =>
      current.some((item) => String(item) === String(id))
        ? current.filter((item) => String(item) !== String(id))
        : [...current, id]
    );
  }, []);
  const toggleAll = useCallback(() => {
    setSelected((current) => (current.length === pageIds.length ? [] : pageIds));
  }, [pageIds]);
  const clear = useCallback(() => setSelected([]), []);

  return {
    selected,
    isSelected,
    toggle,
    toggleAll,
    clear,
    allSelected: pageIds.length > 0 && selected.length === pageIds.length,
    someSelected: selected.length > 0 && selected.length < pageIds.length,
  };
}

export function SelectCell({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <Checkbox
      checked={checked}
      aria-label={label}
      onClick={(event) => event.stopPropagation()}
      onCheckedChange={() => onToggle()}
    />
  );
}

/**
 * Writes one value set across every selected record. NocoBase has no batch
 * update endpoint for arbitrary primary keys, so the ids are written in
 * parallel and the result is reported as a single outcome.
 */
export function useBulkMutation(resource: string) {
  const translate = useTranslate();
  const { open } = useNotification();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);

  const run = useCallback(
    async (
      ids: RecordId[],
      values: Record<string, unknown>,
      successMessage: string
    ) => {
      if (ids.length === 0) return false;
      setRunning(true);
      try {
        await Promise.all(
          ids.map((id) =>
            nocobaseClient.action(resource, "update", {
              query: { filterByTk: id },
              body: values,
            })
          )
        );
        await queryClient.invalidateQueries();
        open?.({ type: "success", message: successMessage });
        return true;
      } catch (error) {
        open?.({
          type: "error",
          message: translate(
            "crm.bulk.error",
            { ns: "starter" },
            "Bulk update failed"
          ),
          description: error instanceof Error ? error.message : undefined,
        });
        return false;
      } finally {
        setRunning(false);
      }
    },
    [open, queryClient, resource, translate]
  );

  const remove = useCallback(
    async (ids: RecordId[], successMessage: string) => {
      if (ids.length === 0) return false;
      setRunning(true);
      try {
        await nocobaseClient.action(resource, "destroy", {
          query: { filterByTk: ids },
        });
        await queryClient.invalidateQueries();
        open?.({ type: "success", message: successMessage });
        return true;
      } catch (error) {
        open?.({
          type: "error",
          message: translate(
            "crm.bulk.deleteError",
            { ns: "starter" },
            "Bulk delete failed"
          ),
          description: error instanceof Error ? error.message : undefined,
        });
        return false;
      } finally {
        setRunning(false);
      }
    },
    [open, queryClient, resource, translate]
  );

  return { run, remove, running };
}

export type BulkAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  /** Shown in a confirmation dialog before the action runs. */
  confirm?: string;
  onRun: (ids: RecordId[]) => void | Promise<unknown>;
};

export function BulkActionBar({
  count,
  actions,
  onClear,
  ids,
  busy,
}: {
  count: number;
  actions: BulkAction[];
  onClear: () => void;
  ids: RecordId[];
  busy?: boolean;
}) {
  const translate = useTranslate();
  const [pending, setPending] = useState<BulkAction | null>(null);
  if (count === 0) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b bg-primary/5 px-4 py-2.5">
        <span className="text-sm font-medium">
          {translate(
            "crm.bulk.selected",
            { ns: "starter", count },
            `${count} selected`
          )}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((action) => (
            <Button
              key={action.id}
              size="sm"
              variant={action.destructive ? "outline" : "secondary"}
              disabled={busy}
              className={cn(
                "gap-1.5",
                action.destructive && "text-destructive hover:text-destructive"
              )}
              onClick={() => {
                if (action.confirm) setPending(action);
                else void action.onRun(ids);
              }}
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto gap-1.5"
          onClick={onClear}
        >
          <X className="size-4" />
          {translate("crm.bulk.clear", { ns: "starter" }, "Clear selection")}
        </Button>
      </div>

      <AlertDialog
        open={Boolean(pending)}
        onOpenChange={(next) => !next && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.label}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.confirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {translate("crm.common.cancel", { ns: "starter" }, "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const action = pending;
                setPending(null);
                if (action) void action.onRun(ids);
              }}
            >
              {translate("crm.bulk.confirm", { ns: "starter" }, "Confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* KPI strip + list states                                                     */
/* -------------------------------------------------------------------------- */

export type KpiChip = {
  id: string;
  label: string;
  value: ReactNode;
  tone?: "default" | "warning" | "danger" | "success";
  active?: boolean;
  onClick?: () => void;
};

const toneClass = {
  default: "text-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
} as const;

/**
 * Summary row above a list. Every chip is a filter shortcut, so the numbers a
 * manager reads are the same ones they can click into.
 */
export function KpiStrip({ chips, loading }: { chips: KpiChip[]; loading?: boolean }) {
  return (
    <div className="flex flex-wrap items-stretch gap-2 border-b px-4 py-3">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          disabled={!chip.onClick}
          onClick={chip.onClick}
          className={cn(
            "min-w-32 flex-1 rounded-lg border px-3 py-2 text-left transition-colors",
            chip.onClick && "hover:border-primary/50 hover:bg-accent/50",
            chip.active && "border-primary/60 bg-primary/5",
            !chip.onClick && "cursor-default"
          )}
        >
          <span className="block text-xs text-muted-foreground">{chip.label}</span>
          {loading ? (
            <Skeleton className="mt-1.5 h-5 w-16" />
          ) : (
            <span
              className={cn(
                "mt-0.5 block text-lg font-semibold tabular-nums",
                toneClass[chip.tone ?? "default"]
              )}
            >
              {chip.value}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Skeleton rows that keep the table's shape while the first page loads. */
export function TableSkeleton({
  rows = 8,
  columns,
}: {
  rows?: number;
  columns: number;
}) {
  return (
    <Table>
      <TableBody>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <TableRow key={`skeleton-${rowIndex}`} aria-hidden="true">
            {Array.from({ length: columns }).map((__, cellIndex) => (
              <TableCell key={`skeleton-${rowIndex}-${cellIndex}`}>
                <Skeleton className="h-4 w-full max-w-40" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ListErrorState({
  onRetry,
  title,
  description,
}: {
  onRetry: () => void;
  title?: string;
  description?: string;
}) {
  const translate = useTranslate();
  return (
    <Alert variant="destructive" className="m-4 w-auto">
      <AlertTitle>
        {title ??
          translate("crm.common.loadError", { ns: "starter" }, "Unable to load records")}
      </AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>
          {description ??
            translate(
              "crm.common.loadErrorDescription",
              { ns: "starter" },
              "The request failed. Check your connection and try again."
            )}
        </span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw className="size-4" />
          {translate("crm.common.retry", { ns: "starter" }, "Retry")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Reassignment dialog shared by every list that has an owner column. Territory
 * hand-overs are the most common bulk edit in a sales org, so it gets a proper
 * picker rather than a free-text id.
 */
export function BulkOwnerDialog({
  open,
  onOpenChange,
  onAssign,
  count,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssign: (ownerId: string | null) => void;
  count: number;
}) {
  const translate = useTranslate();
  const [ownerId, setOwnerId] = useState<string | null>(null);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {translate("crm.bulk.assignOwner", { ns: "starter" }, "Assign owner")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {translate(
              "crm.bulk.assignOwnerDescription",
              { ns: "starter", count },
              `${count} records will be reassigned.`
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <OwnerPicker value={ownerId} onChange={setOwnerId} />
        <AlertDialogFooter>
          <AlertDialogCancel>
            {translate("crm.common.cancel", { ns: "starter" }, "Cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={!ownerId}
            onClick={() => {
              onAssign(ownerId);
              onOpenChange(false);
            }}
          >
            {translate("crm.bulk.assign", { ns: "starter" }, "Assign")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ListEmptyState({
  title,
  description,
  action,
  filtered,
  onClearFilters,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  filtered?: boolean;
  onClearFilters?: () => void;
}) {
  const translate = useTranslate();
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <p className="text-base font-medium">{title}</p>
      {description ? (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      <div className="flex items-center gap-2">
        {filtered && onClearFilters ? (
          <Button variant="outline" size="sm" onClick={onClearFilters}>
            <X className="size-4" />
            {translate("crm.common.clearFilters", { ns: "starter" }, "Clear filters")}
          </Button>
        ) : null}
        {action}
      </div>
    </div>
  );
}
