/**
 * CSV export for the hand-written CRM tables. Every list exports exactly what
 * the visitor is looking at — the current filter set, resolved labels rather
 * than raw enum values — which is what a sales team expects when they hand a
 * list to finance.
 */
export type CsvColumn<T> = {
  header: string;
  value: (record: T) => string | number | null | undefined;
};

const escapeCell = (value: string | number | null | undefined) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const head = columns.map((column) => escapeCell(column.header)).join(",");
  const body = rows.map((row) =>
    columns.map((column) => escapeCell(column.value(row))).join(",")
  );
  return [head, ...body].join("\n");
}

/** Triggers a browser download. The BOM keeps Excel from mangling UTF-8. */
export function downloadCsv<T>(
  filename: string,
  columns: CsvColumn<T>[],
  rows: T[]
) {
  const blob = new Blob(["﻿", toCsv(columns, rows)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const csvTimestamp = () => new Date().toISOString().slice(0, 10);
