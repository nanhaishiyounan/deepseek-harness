const PRINT_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
         color: #111827; margin: 0; padding: 40px; font-size: 13px; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.02em; }
  h2 { font-size: 13px; margin: 28px 0 8px; text-transform: uppercase;
       letter-spacing: 0.08em; color: #6b7280; }
  .muted { color: #6b7280; }
  .doc-head { display: flex; justify-content: space-between; align-items: flex-start;
              border-bottom: 2px solid #111827; padding-bottom: 16px; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 32px; }
  .grid div span { display: block; }
  .grid .label { font-size: 11px; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase;
       letter-spacing: 0.06em; color: #6b7280; border-bottom: 1px solid #d1d5db;
       padding: 6px 8px; }
  td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 600; border-top: 2px solid #111827; border-bottom: none; }
  .badge { display: inline-block; border: 1px solid #d1d5db; border-radius: 999px;
           padding: 2px 10px; font-size: 11px; }
  footer { margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 12px;
           font-size: 11px; color: #9ca3af; }
  @page { margin: 16mm; }
`;

export function openPrintWindow(title: string, bodyHtml: string) {
  const printWindow = window.open("", "_blank", "width=920,height=1100");
  if (!printWindow) return;
  printWindow.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
      `<style>${PRINT_STYLES}</style></head><body>${bodyHtml}</body></html>`
  );
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 250);
}

export const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char] ?? char
  );
