import { useTranslate, type CrudFilter } from "@refinedev/core";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const DEFAULT_PAGE_SIZE = 20;

/**
 * Page/pageSize state for the hand-written CRM tables. Any filter change has
 * to reset the cursor, otherwise a narrowed result set keeps the old page
 * number and renders empty.
 */
export function useListPagination(initialPageSize = DEFAULT_PAGE_SIZE) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  return {
    currentPage,
    pageSize,
    setCurrentPage,
    setPageSize: (size: number) => {
      setPageSize(size);
      setCurrentPage(1);
    },
  };
}

/** Resets to page 1 whenever the serialized filter state changes. */
export function useResetPageOnFilterChange(
  fingerprint: string,
  setCurrentPage: (page: number) => void
) {
  useEffect(() => {
    setCurrentPage(1);
  }, [fingerprint, setCurrentPage]);
}

/** Debounces free-text search so each keystroke does not hit the API. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Builds a NocoBase `$or` filter across the given text columns. */
export function searchFilter(
  fields: string[],
  term: string
): CrudFilter[] {
  const needle = term.trim();
  if (!needle) return [];
  return [
    {
      operator: "or",
      value: fields.map((field) => ({
        field,
        operator: "contains" as const,
        value: needle,
      })),
    },
  ];
}

/** Inclusive `[from, to]` filter for a date or datetime column. */
export function dateRangeFilter(
  field: string,
  from: string,
  to: string
): CrudFilter[] {
  const filters: CrudFilter[] = [];
  if (from) filters.push({ field, operator: "gte", value: from });
  if (to) filters.push({ field, operator: "lte", value: to });
  return filters;
}

/**
 * Inclusive `[from, to]` filter for a datetime column. Unlike
 * `dateRangeFilter`, the `<input type="date">` day is expanded to the full
 * local-day boundary (00:00:00.000 → 23:59:59.999) before being serialized to
 * ISO, so a datetime field is matched across the whole day in the browser's
 * timezone instead of just at midnight UTC.
 */
export function dateTimeRangeFilter(
  field: string,
  from: string,
  to: string
): CrudFilter[] {
  const startOfDay = (day: string) => {
    const [year, month, date] = day.split("-").map(Number);
    return new Date(year, month - 1, date, 0, 0, 0, 0).toISOString();
  };
  const endOfDay = (day: string) => {
    const [year, month, date] = day.split("-").map(Number);
    return new Date(year, month - 1, date, 23, 59, 59, 999).toISOString();
  };
  return dateRangeFilter(
    field,
    from ? startOfDay(from) : "",
    to ? endOfDay(to) : ""
  );
}

export function ListSearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={className ?? "relative sm:max-w-sm sm:flex-1"}>
      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="pl-9"
        placeholder={placeholder}
      />
    </div>
  );
}

export type ListFilterOption = { value: string; label: string };

export function ListFilterSelect({
  value,
  onChange,
  options,
  allLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ListFilterOption[];
  allLabel: string;
  className?: string;
}) {
  const selected = options.find((option) => option.value === value);
  return (
    <Select value={value} onValueChange={(next) => onChange(next ?? "all")}>
      <SelectTrigger className={className ?? "w-full sm:w-52"}>
        <SelectValue>{value === "all" ? allLabel : selected?.label ?? allLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ListToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:flex-wrap lg:items-center">
      {children}
    </div>
  );
}

export type ListToolbarContentProps = {
  children: ReactNode;
  actions?: ReactNode;
};

/**
 * Standard toolbar body: a left-aligned filter group and an optional
 * right-aligned actions slot. The left group wraps its filters; the actions
 * slot (currently only the Leads AI shortcut) is pushed to the right on wide
 * screens. This is not a home for the "New" button — that is rendered by the
 * ListView page header from the resource's create route.
 */
export function ListToolbarContent({ children, actions }: ListToolbarContentProps) {
  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {children}
      </div>
      {actions ? <div className="shrink-0 lg:ml-auto">{actions}</div> : null}
    </>
  );
}

export function ListDateRange({
  from,
  to,
  onFromChange,
  onToChange,
  label,
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <Input
        type="date"
        value={from}
        onChange={(event) => onFromChange(event.target.value)}
        className="w-40"
      />
      <span className="text-muted-foreground">–</span>
      <Input
        type="date"
        value={to}
        onChange={(event) => onToChange(event.target.value)}
        className="w-40"
      />
    </div>
  );
}

export function ListPagination({
  currentPage,
  pageSize,
  total,
  setCurrentPage,
  setPageSize,
}: {
  currentPage: number;
  pageSize: number;
  total: number;
  setCurrentPage: (page: number) => void;
  setPageSize: (size: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  return (
    <div className="border-t p-2">
      <DataTablePagination
        currentPage={currentPage}
        pageCount={pageCount}
        setCurrentPage={setCurrentPage}
        pageSize={pageSize}
        setPageSize={setPageSize}
        total={total}
      />
    </div>
  );
}

export function useListEmptyMessage() {
  const translate = useTranslate();
  return useMemo(
    () =>
      translate(
        "crm.common.noResults",
        { ns: "starter" },
        "No records match the current filters."
      ),
    [translate]
  );
}
