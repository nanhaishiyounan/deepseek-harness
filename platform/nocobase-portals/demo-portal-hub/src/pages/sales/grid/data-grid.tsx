import { useTranslate } from "@refinedev/core";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Inbox,
  RefreshCcw,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { GridColumn, GridDensity, ListSort } from "./types";

/** The slice of `useSalesList` the grid needs — kept narrow so it stays testable. */
export type DataGridState<TRecord> = {
  rows: TRecord[];
  total: number;
  query: { isLoading: boolean; isError: boolean; refetch: () => unknown };
  page: number;
  setPage: (page: number) => void;
  pageCount: number;
  pageSize: number;
  setPageSize: (size: number) => void;
  sort: ListSort;
  toggleSort: (field: string) => void;
  density: GridDensity;
  hiddenColumns: string[];
  selected: Array<string | number>;
  toggleRow: (id: string | number) => void;
  toggleAllRows: () => void;
  filterCount: number;
  clearFilters: () => void;
};

type DataGridProps<TRecord extends { id: string | number }> = {
  state: DataGridState<TRecord>;
  columns: Array<GridColumn<TRecord>>;
  /** Rendered at the end of every row; revealed on hover on pointer devices. */
  rowActions?: (record: TRecord) => ReactNode;
  onRowOpen?: (record: TRecord) => void;
  selectable?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
};

const PAGE_SIZES = [10, 20, 50, 100];

export function DataGrid<TRecord extends { id: string | number }>({
  state,
  columns,
  rowActions,
  onRowOpen,
  selectable = true,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: DataGridProps<TRecord>) {
  const translate = useTranslate();
  const visible = columns.filter(
    (column) => !state.hiddenColumns.includes(column.id)
  );
  const cellPadding =
    state.density === "compact" ? "px-3 py-1.5" : "px-3 py-2.5";
  const columnSpan = visible.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0);
  const allSelected =
    state.rows.length > 0 && state.selected.length === state.rows.length;

  if (state.query.isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center">
        <p className="text-sm font-medium">
          {translate(
            "sales.grid.error.title",
            { ns: "starter" },
            "Couldn't load this list"
          )}
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {translate(
            "sales.grid.error.description",
            { ns: "starter" },
            "The request failed. This is usually a connection hiccup — try again."
          )}
        </p>
        <Button variant="outline" size="sm" onClick={() => state.query.refetch()}>
          <RefreshCcw />
          {translate("sales.grid.error.retry", { ns: "starter" }, "Retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <table className="w-full text-sm">
          <thead className="bg-muted/45">
            <tr className="border-b">
              {selectable ? (
                <th className={cn("w-10", cellPadding)}>
                  <Checkbox
                    checked={allSelected}
                    indeterminate={
                      state.selected.length > 0 && !allSelected
                    }
                    onCheckedChange={() => state.toggleAllRows()}
                    aria-label={translate(
                      "sales.grid.selectAll",
                      { ns: "starter" },
                      "Select all rows on this page"
                    )}
                  />
                </th>
              ) : null}
              {visible.map((column) => (
                <th
                  key={column.id}
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(
                    cellPadding,
                    "text-left text-xs font-medium text-muted-foreground",
                    column.align === "right" && "text-right"
                  )}
                >
                  {column.sortField ? (
                    <button
                      type="button"
                      onClick={() => state.toggleSort(column.sortField as string)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md hover:text-foreground",
                        state.sort.field === column.sortField && "text-foreground"
                      )}
                    >
                      {column.header}
                      {state.sort.field !== column.sortField ? (
                        <ChevronsUpDown className="size-3 opacity-50" />
                      ) : state.sort.order === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
              {rowActions ? (
                <th
                  className={cn(
                    cellPadding,
                    "w-36 text-right text-xs font-medium text-muted-foreground"
                  )}
                >
                  {translate("sales.common.actions", { ns: "starter" }, "Actions")}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {state.query.isLoading ? (
              Array.from({ length: Math.min(state.pageSize, 8) }).map(
                (_, rowIndex) => (
                  <tr key={`skeleton-${rowIndex}`} aria-hidden="true">
                    {Array.from({ length: columnSpan }).map((__, cellIndex) => (
                      <td key={cellIndex} className={cellPadding}>
                        <Skeleton className="h-4 w-full max-w-40" />
                      </td>
                    ))}
                  </tr>
                )
              )
            ) : state.rows.length === 0 ? (
              <tr>
                <td colSpan={columnSpan} className="px-6 py-16">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <Inbox className="size-5" />
                    </span>
                    <p className="text-sm font-medium">
                      {emptyTitle ??
                        translate(
                          "sales.grid.empty.title",
                          { ns: "starter" },
                          "Nothing here yet"
                        )}
                    </p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      {state.filterCount > 0
                        ? translate(
                            "sales.grid.empty.filtered",
                            { ns: "starter" },
                            "No records match the current filters."
                          )
                        : (emptyDescription ??
                          translate(
                            "sales.grid.empty.description",
                            { ns: "starter" },
                            "Records you create will show up here."
                          ))}
                    </p>
                    {state.filterCount > 0 ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={state.clearFilters}
                      >
                        {translate(
                          "sales.grid.empty.clearFilters",
                          { ns: "starter" },
                          "Clear filters"
                        )}
                      </Button>
                    ) : (
                      emptyAction
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              state.rows.map((record) => {
                const isSelected = state.selected.some(
                  (value) => String(value) === String(record.id)
                );
                return (
                  <tr
                    key={String(record.id)}
                    className={cn(
                      "group/row transition-colors hover:bg-muted/40",
                      isSelected && "bg-primary/5"
                    )}
                    onDoubleClick={
                      onRowOpen ? () => onRowOpen(record) : undefined
                    }
                  >
                    {selectable ? (
                      <td className={cellPadding}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => state.toggleRow(record.id)}
                          aria-label={translate(
                            "sales.grid.selectRow",
                            { ns: "starter" },
                            "Select row"
                          )}
                        />
                      </td>
                    ) : null}
                    {visible.map((column) => (
                      <td
                        key={column.id}
                        className={cn(
                          cellPadding,
                          "align-middle",
                          column.align === "right" &&
                            "text-right tabular-nums"
                        )}
                      >
                        {column.cell(record)}
                      </td>
                    ))}
                    {rowActions ? (
                      <td className={cn(cellPadding, "text-right")}>
                        <div className="flex items-center justify-end gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover/row:opacity-100 md:focus-within:opacity-100">
                          {rowActions(record)}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <GridPagination state={state} />
    </div>
  );
}

function GridPagination<TRecord extends { id: string | number }>({
  state,
}: {
  state: DataGridState<TRecord>;
}) {
  const translate = useTranslate();
  const first = state.total === 0 ? 0 : (state.page - 1) * state.pageSize + 1;
  const last = Math.min(state.page * state.pageSize, state.total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1">
      <p className="text-sm text-muted-foreground">
        {translate(
          "sales.grid.range",
          { ns: "starter" },
          "Showing {{first}}–{{last}} of {{total}}"
        )
          .replace("{{first}}", String(first))
          .replace("{{last}}", String(last))
          .replace("{{total}}", String(state.total))}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {translate("sales.grid.rowsPerPage", { ns: "starter" }, "Rows")}
          </span>
          <Select
            value={String(state.pageSize)}
            onValueChange={(value) => state.setPageSize(Number(value))}
          >
            <SelectTrigger className="h-8 w-[76px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={state.page === 1}
            onClick={() => state.setPage(1)}
            aria-label={translate(
              "sales.grid.firstPage",
              { ns: "starter" },
              "First page"
            )}
          >
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={state.page === 1}
            onClick={() => state.setPage(state.page - 1)}
            aria-label={translate(
              "sales.grid.prevPage",
              { ns: "starter" },
              "Previous page"
            )}
          >
            <ChevronLeft />
          </Button>
          <span className="px-1 text-sm tabular-nums">
            {translate("sales.grid.pageOf", { ns: "starter" }, "{{page}} / {{count}}")
              .replace("{{page}}", String(state.page))
              .replace("{{count}}", String(state.pageCount))}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={state.page >= state.pageCount}
            onClick={() => state.setPage(state.page + 1)}
            aria-label={translate(
              "sales.grid.nextPage",
              { ns: "starter" },
              "Next page"
            )}
          >
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={state.page >= state.pageCount}
            onClick={() => state.setPage(state.pageCount)}
            aria-label={translate(
              "sales.grid.lastPage",
              { ns: "starter" },
              "Last page"
            )}
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
