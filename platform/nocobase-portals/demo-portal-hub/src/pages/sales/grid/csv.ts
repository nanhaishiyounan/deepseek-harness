import { useList, type CrudFilter } from "@refinedev/core";
import { useCallback, useState } from "react";
import { downloadCsvContents } from "@/lib/table-kit";
import type { GridColumn, ListSort } from "./types";

const escapeCell = (value: string) =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export function toCsv<TRecord>(
  columns: Array<GridColumn<TRecord>>,
  rows: TRecord[]
): string {
  const exportable = columns.filter((column) => column.csv);
  const header = exportable.map((column) => escapeCell(column.header)).join(",");
  const body = rows.map((row) =>
    exportable
      .map((column) => escapeCell(column.csv?.(row) ?? ""))
      .join(",")
  );
  // BOM keeps Excel from mangling non-ASCII account names.
  return `\uFEFF${[header, ...body].join("\r\n")}`;
}

/**
 * Exports the *whole* filtered result set, not just the visible page — the
 * request is kept disabled until the user actually clicks Export.
 */
export function useCsvExport<TRecord extends { id: string | number }>({
  resource,
  filters,
  sorters,
  appends,
  columns,
  filename,
}: {
  resource: string;
  filters: CrudFilter[];
  sorters: ListSort[];
  appends?: string[];
  columns: Array<GridColumn<TRecord>>;
  filename: string;
}) {
  const [exporting, setExporting] = useState(false);
  const { query } = useList<TRecord>({
    resource,
    filters,
    sorters,
    pagination: { mode: "server", currentPage: 1, pageSize: 1000 },
    meta: appends ? { appends } : undefined,
    errorNotification: false,
    queryOptions: { enabled: false, retry: false },
  });

  const exportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const response = await query.refetch();
      const rows = (response.data?.data ?? []) as TRecord[];
      downloadCsvContents(filename, toCsv(columns, rows));
    } finally {
      setExporting(false);
    }
  }, [columns, filename, query]);

  return { exportCsv, exporting };
}
