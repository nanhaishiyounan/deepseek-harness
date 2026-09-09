import { useTranslate } from "@refinedev/core";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CURRENCY, formatCurrency, formatDate, labelFor, QUOTE_STATUSES } from "../constants";
import { useLocale } from "../shared";
import type { QuoteItemRecord, QuoteRecord } from "../types";

/**
 * Print-ready quote document. A commercial proposal is the one CRM screen that
 * leaves the building, so it gets a real letter layout — header, bill-to block,
 * priced lines, totals and validity terms — instead of a screenshot of a table.
 *
 * Printing is scoped with a `@media print` rule so only the document reaches
 * the printer, which also makes "Save as PDF" produce a clean file.
 */
const PRINT_STYLES = `
@media print {
  body * { visibility: hidden !important; }
  [data-quote-print], [data-quote-print] * { visibility: visible !important; }
  [data-quote-print] {
    position: fixed !important;
    inset: 0 !important;
    margin: 0 !important;
    max-height: none !important;
    width: 100% !important;
    max-width: none !important;
    overflow: visible !important;
    border: 0 !important;
    box-shadow: none !important;
    background: #fff !important;
    color: #000 !important;
    padding: 24px !important;
    transform: none !important;
  }
  [data-quote-print-hide] { display: none !important; }
}
`;

export function QuotePrintDialog({
  quote,
  items,
  open,
  onOpenChange,
}: {
  quote: QuoteRecord | undefined;
  items: QuoteItemRecord[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const translate = useTranslate();
  const locale = useLocale();
  if (!quote) return null;

  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.qty ?? 0) * Number(item.unit_price ?? 0),
    0
  );
  const expired =
    Boolean(quote.valid_until) &&
    (quote.valid_until as string) < new Date().toISOString().slice(0, 10);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        data-quote-print
        className="max-h-[92vh] max-w-3xl overflow-y-auto bg-white p-8 text-black sm:max-w-3xl dark:bg-white dark:text-black"
      >
        <style>{PRINT_STYLES}</style>

        <div
          data-quote-print-hide
          className="flex items-center justify-end gap-2 border-b border-neutral-200 pb-3"
        >
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            <X />
            {translate("crm.common.close", { ns: "starter" }, "Close")}
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer />
            {translate("crm.quotes.print.action", { ns: "starter" }, "Print / Save as PDF")}
          </Button>
        </div>

        <header className="flex items-start justify-between gap-6 pt-2">
          <div>
            <p className="text-xl font-semibold tracking-tight">
              {translate("crm.quotes.print.company", { ns: "starter" }, "Northwind Workspace Furniture")}
            </p>
            <p className="mt-1 text-xs leading-5 text-neutral-600">
              {translate(
                "crm.quotes.print.companyAddress",
                { ns: "starter" },
                "120 Harbour Street, Suite 400 · sales@northwind.example.com"
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold uppercase tracking-wide">
              {translate("crm.quotes.print.title", { ns: "starter" }, "Quotation")}
            </p>
            <p className="mt-1 font-mono text-sm">{quote.quote_number}</p>
            <p className="mt-1 text-xs text-neutral-600">
              {labelFor(QUOTE_STATUSES, quote.status, translate)}
              {expired
                ? ` · ${translate("crm.quotes.print.expired", { ns: "starter" }, "Expired")}`
                : ""}
            </p>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {translate("crm.quotes.print.billTo", { ns: "starter" }, "Prepared for")}
            </p>
            <p className="mt-1.5 font-medium">{quote.customer?.company_name ?? "—"}</p>
            {quote.customer?.phone ? (
              <p className="text-xs text-neutral-600">{quote.customer.phone}</p>
            ) : null}
            {quote.deal?.title ? (
              <p className="mt-1 text-xs text-neutral-600">
                {translate("crm.quotes.fields.deal", { ns: "starter" }, "Deal")}: {quote.deal.title}
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <dl className="space-y-1 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-500">
                  {translate("crm.quotes.fields.issueDate", { ns: "starter" }, "Issue date")}
                </dt>
                <dd>{formatDate(quote.issue_date, locale)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-500">
                  {translate("crm.quotes.fields.validUntil", { ns: "starter" }, "Valid until")}
                </dt>
                <dd>{formatDate(quote.valid_until, locale)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-500">
                  {translate("crm.quotes.print.currency", { ns: "starter" }, "Currency")}
                </dt>
                <dd>{CURRENCY}</dd>
              </div>
              {quote.createdBy?.nickname ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-neutral-500">
                    {translate("crm.quotes.print.preparedBy", { ns: "starter" }, "Prepared by")}
                  </dt>
                  <dd>{quote.createdBy.nickname}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </section>

        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-neutral-300 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-2 font-medium">
                {translate("crm.quotes.items.product", { ns: "starter" }, "Product")}
              </th>
              <th className="py-2 text-right font-medium">
                {translate("crm.quotes.items.qty", { ns: "starter" }, "Qty")}
              </th>
              <th className="py-2 text-right font-medium">
                {translate("crm.quotes.items.unitPrice", { ns: "starter" }, "Unit price")}
              </th>
              <th className="py-2 text-right font-medium">
                {translate("crm.quotes.items.lineTotal", { ns: "starter" }, "Line total")}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={String(item.id)} className="border-b border-neutral-200">
                <td className="py-2">
                  {item.product_name}
                  {item.product?.sku ? (
                    <span className="ml-2 font-mono text-xs text-neutral-500">
                      {item.product.sku}
                    </span>
                  ) : null}
                </td>
                <td className="py-2 text-right tabular-nums">{item.qty}</td>
                <td className="py-2 text-right tabular-nums">
                  {formatCurrency(item.unit_price, locale)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatCurrency(
                    Number(item.qty ?? 0) * Number(item.unit_price ?? 0),
                    locale
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-neutral-500">
                  {translate("crm.quotes.items.empty", { ns: "starter" }, "No line items yet.")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <dl className="w-64 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-500">
                {translate("crm.quotes.print.subtotal", { ns: "starter" }, "Subtotal")}
              </dt>
              <dd className="tabular-nums">{formatCurrency(subtotal, locale)}</dd>
            </div>
            <div className="flex justify-between border-t border-neutral-300 pt-1.5 text-base font-semibold">
              <dt>{translate("crm.quotes.fields.total", { ns: "starter" }, "Total")}</dt>
              <dd className="tabular-nums">{formatCurrency(subtotal, locale)}</dd>
            </div>
          </dl>
        </div>

        <footer className="mt-8 border-t border-neutral-200 pt-4 text-xs leading-5 text-neutral-600">
          <p className="font-medium text-neutral-700">
            {translate("crm.quotes.print.terms", { ns: "starter" }, "Terms")}
          </p>
          <p>
            {translate(
              "crm.quotes.print.termsBody",
              { ns: "starter" },
              "Prices are valid until the date above. Lead times are confirmed on order. Delivery and installation are quoted separately unless listed as a line item."
            )}
          </p>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
