export type CsvColumn<TData> = {
  header: string;
  value: (row: TData) => string | number | null | undefined;
};

const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Downloads structured records with a dated filename. */
export function exportCsv<TData>(
  filename: string,
  columns: CsvColumn<TData>[],
  rows: TData[]
) {
  const lines = [
    columns.map((column) => csvCell(column.header)).join(","),
    ...rows.map((row) =>
      columns.map((column) => csvCell(column.value(row))).join(",")
    ),
  ];
  downloadCsvContents(
    `${filename}-${new Date().toISOString().slice(0, 10)}.csv`,
    lines.join("\r\n"),
    true
  );
}

/** Downloads a matrix as CSV, preserving the caller-supplied filename. */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<unknown>>
) {
  const body = [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
  downloadCsvContents(filename, body, true);
}

export function downloadCsvContents(
  filename: string,
  contents: string,
  includeBom = false
) {
  const blob = new Blob([includeBom ? `\uFEFF${contents}` : contents], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
