import { useList, useShow, useTranslate } from "@refinedev/core";
import { Link2, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { useOutlet, useParams } from "react-router";

import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { LoadingState } from "@/components/app-shell/loading-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import { INVOICE_STATUSES, lookup, optionLabel } from "../constants";
import { escapeHtml, openPrintWindow } from "@/lib/table-kit";
import { useContextualCloseTo, useOpenContextualChild } from "../route-surfaces";
import {
  DetailItems,
  DrawerSection,
  EmptyRow,
  fmtDate,
  money,
  Pill,
  SimpleTable,
  StatusTimeline,
} from "../shared";
import type { Invoice, InvoiceLineItem } from "../types";
import {
  invoiceDisplayStatus,
  isInvoiceOverdue,
} from "../invoice-metrics";

const RESOURCE = "hub_fin_invoices";

const TIMELINE_STEPS_KEYS = [
  ["finance.invoices.timeline.draft", "Draft"],
  ["finance.invoices.timeline.sent", "Sent"],
  ["finance.invoices.timeline.paid", "Paid"],
] as const;

export function InvoiceShow() {
  const t = useTranslate();
  const openChild = useOpenContextualChild();
  const closeTo = useContextualCloseTo();
  const { id } = useParams<{ id: string }>();
  const nested = useOutlet();
  const { result: record, query } = useShow<Invoice>({
    resource: RESOURCE,
    id,
  });

  const { result: lineItems, query: lineItemsQuery } = useList<InvoiceLineItem>({
    resource: "hub_fin_invoice_items",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    sorters: [{ field: "id", order: "asc" }],
    filters: id ? [{ field: "invoice_id", operator: "eq", value: id }] : [],
    errorNotification: false,
    queryOptions: { enabled: Boolean(id), retry: false },
  });

  const overdue = record ? isInvoiceOverdue(record) : false;
  const statusOpt = lookup(
    INVOICE_STATUSES,
    record ? invoiceDisplayStatus(record) : undefined
  );
  const lineTotal = lineItems.data.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0
  );
  const displayAmount = lineItems.data.length > 0 ? lineTotal : Number(record?.amount ?? 0);
  const amountMismatch =
    Boolean(record && lineItems.data.length > 0) &&
    Math.abs(displayAmount - Number(record?.amount ?? 0)) > 0.5;
  const activeIndex =
    record?.status === "paid" ? 2 : overdue || record?.status === "sent" ? 1 : 0;
  const timelineSteps = TIMELINE_STEPS_KEYS.map(([key, fallback]) =>
    t(key, fallback)
  );
  const displayName =
    record?.invoice_number ||
    t("finance.invoices.detail.unnamed", "Invoice");

  return (
    <RouteDrawer
      title={
        query.isLoading && !record ? <Skeleton className="h-6 w-40" /> : displayName
      }
      description={t(
        "finance.invoices.drawer.show.desc",
        "Line items and collection status for this invoice."
      )}
      closeLabel={t("finance.common.close", "Close")}
      closeTo={closeTo}
      nested={nested}
      actions={
        record ? (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              title={t("finance.common.copyLink", "Copy link")}
              onClick={() => void navigator.clipboard?.writeText(window.location.href)}
            >
              <Link2 />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              title={t("finance.invoices.print.action", "Print invoice")}
              onClick={() => printInvoice({ invoice: record, items: lineItems.data, t })}
            >
              <Printer />
            </Button>
            <EditButton
              resource={RESOURCE}
              recordItemId={record.id}
              variant="outline"
              size="icon-sm"
              onClick={() => openChild("edit")}
            >
              <Pencil />
            </EditButton>
          </div>
        ) : null
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {query.isLoading ? (
          <LoadingState className="min-h-64" />
        ) : query.isError ? (
          <Alert variant="destructive">
            <AlertTitle>
              {t("finance.invoices.detail.loadError.title", "Unable to load invoice")}
            </AlertTitle>
            <AlertDescription>
              {t(
                "finance.invoices.detail.loadError.desc",
                "The invoice may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <div className="rounded-lg border bg-muted/20 px-4 py-4">
              <StatusTimeline
                steps={overdue ? [...timelineSteps.slice(0, 2), t("finance.invoices.timeline.overdue", "Overdue")] : timelineSteps}
                activeIndex={activeIndex}
                danger={overdue}
              />
            </div>
            <DetailItems
              title={t("finance.invoices.detail.profile", "Invoice")}
              items={[
                [t("finance.invoices.field.client", "Client"), record?.client_name || "—"],
                [
                  t("finance.invoices.field.status", "Status"),
                  <Pill key="status" option={statusOpt} label={optionLabel(statusOpt, t)} />,
                ],
                [t("finance.invoices.field.issueDate", "Issue date"), fmtDate(record?.issue_date)],
                [
                  t("finance.invoices.field.dueDate", "Due date"),
                  <span
                    key="due"
                    className={overdue ? "font-medium text-red-600 dark:text-red-400" : undefined}
                  >
                    {fmtDate(record?.due_date)}
                  </span>,
                ],
                [
                  t("finance.invoices.field.amount", "Amount"),
                  <span key="amount" className="tabular-nums">
                    {lineItemsQuery.isError ? "—" : money(displayAmount, true)}
                  </span>,
                ],
              ]}
            />
            {amountMismatch ? (
              <Alert variant="destructive">
                <AlertTitle>{t("finance.invoices.amountMismatch.title", "Invoice total mismatch")}</AlertTitle>
                <AlertDescription>
                  {t(
                    "finance.invoices.amountMismatch.description",
                    "The line-item total is shown as authoritative. The stored header amount requires server reconciliation."
                  )}
                </AlertDescription>
              </Alert>
            ) : null}
            {id ? (
              <>
                <Separator />
                <LineItemsSection invoiceId={id} total={record?.amount} />
              </>
            ) : null}
          </div>
        )}
      </div>
    </RouteDrawer>
  );
}

/** Client-ready printable invoice, styled independently of the app theme. */
function printInvoice({
  invoice,
  items,
  t,
}: {
  invoice: Invoice;
  items: InvoiceLineItem[];
  t: ReturnType<typeof useTranslate>;
}) {
  const subtotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const total = items.length > 0 ? subtotal : Number(invoice.amount) || 0;
  const field = (label: string, value: string) =>
    `<div><span class="label">${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;

  const body = `
    <div class="doc-head">
      <div>
        <h1>${escapeHtml(t("finance.invoices.print.heading", "Invoice"))} ${escapeHtml(
          invoice.invoice_number ?? ""
        )}</h1>
        <p class="muted">${escapeHtml(invoice.client_name ?? "")}</p>
      </div>
      <span class="badge">${escapeHtml(invoiceDisplayStatus(invoice) ?? "")}</span>
    </div>
    <h2>${escapeHtml(t("finance.invoices.print.details", "Details"))}</h2>
    <div class="grid">
      ${field(t("finance.invoices.field.client", "Client"), invoice.client_name ?? "—")}
      ${field(t("finance.invoices.field.issueDate", "Issue date"), fmtDate(invoice.issue_date))}
      ${field(t("finance.invoices.field.dueDate", "Due date"), fmtDate(invoice.due_date))}
      ${field(t("finance.invoices.field.amount", "Amount"), money(total, true))}
    </div>
    <h2>${escapeHtml(t("finance.invoices.items.title", "Line items"))}</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>${escapeHtml(t("finance.invoices.items.description", "Description"))}</th>
          <th class="num">${escapeHtml(t("finance.invoices.items.qty", "Qty"))}</th>
          <th class="num">${escapeHtml(t("finance.invoices.items.unitPrice", "Unit price"))}</th>
          <th class="num">${escapeHtml(t("finance.invoices.items.lineTotal", "Line total"))}</th>
        </tr>
      </thead>
      <tbody>
        ${
          items.length === 0
            ? `<tr><td colspan="5" class="muted">${escapeHtml(
                t("finance.invoices.items.empty", "No line items recorded.")
              )}</td></tr>`
            : items
                .map(
                  (item, index) =>
                    `<tr><td>${index + 1}</td><td>${escapeHtml(
                      item.description ?? ""
                    )}</td><td class="num">${escapeHtml(
                      item.quantity ?? 0
                    )}</td><td class="num">${escapeHtml(
                      money(item.unit_price, true)
                    )}</td><td class="num">${escapeHtml(
                      money(item.amount, true)
                    )}</td></tr>`
                )
                .join("")
        }
      </tbody>
      <tfoot>
        <tr><td colspan="4" class="num">${escapeHtml(
          t("finance.invoices.print.total", "Total due")
        )}</td><td class="num">${escapeHtml(money(total, true))}</td></tr>
      </tfoot>
    </table>
    <footer>${escapeHtml(
      t("finance.invoices.print.footer", "Please quote the invoice number with your payment.")
    )}</footer>
  `;

  openPrintWindow(invoice.invoice_number ?? "invoice", body);
}

function LineItemsSection({
  invoiceId,
  total,
}: {
  invoiceId: string;
  total: number | undefined;
}) {
  const t = useTranslate();
  const openChild = useOpenContextualChild();
  const { result } = useList<InvoiceLineItem>({
    resource: "hub_fin_invoice_items",
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    sorters: [{ field: "id", order: "asc" }],
    filters: [{ field: "invoice_id", operator: "eq", value: invoiceId }],
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const items = result.data;
  const subtotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  return (
    <DrawerSection
      title={t("finance.invoices.items.title", "Line items")}
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={() => openChild("items/create")}
        >
          <Plus />
          {t("finance.invoices.items.add", "Add line item")}
        </Button>
      }
    >
      <SimpleTable
        headers={[
          t("finance.invoices.items.description", "Description"),
          t("finance.invoices.items.qty", "Qty"),
          t("finance.invoices.items.unitPrice", "Unit price"),
          t("finance.invoices.items.lineTotal", "Line total"),
          t("finance.common.actions", "Actions"),
        ]}
        align={["left", "right", "right", "right", "right"]}
      >
        {items.length === 0 ? (
          <EmptyRow colSpan={5} text={t("finance.invoices.items.empty", "No line items recorded.")} />
        ) : (
          items.map((item) => (
            <tr
              key={String(item.id)}
              role="button"
              tabIndex={0}
              onClick={() => openChild(`items/edit/${encodeURIComponent(String(item.id))}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openChild(`items/edit/${encodeURIComponent(String(item.id))}`);
                }
              }}
              className="cursor-pointer"
            >
              <td className="px-3 py-2 font-medium">{item.description || "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{item.quantity ?? 0}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {money(item.unit_price, true)}
              </td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">
                {money(item.amount, true)}
              </td>
              <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("finance.invoices.items.edit", "Edit line item")}
                    title={t("finance.invoices.items.edit", "Edit line item")}
                    onClick={() =>
                      openChild(`items/edit/${encodeURIComponent(String(item.id))}`)
                    }
                  >
                    <Pencil />
                  </Button>
                  <DeleteButton
                    resource="hub_fin_invoice_items"
                    recordItemId={item.id}
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    aria-label={t("finance.invoices.items.delete", "Delete line item")}
                    title={t("finance.invoices.items.delete", "Delete line item")}
                  >
                    <Trash2 />
                  </DeleteButton>
                </div>
              </td>
            </tr>
          ))
        )}
      </SimpleTable>
      {items.length > 0 ? (
        <div className="flex justify-end px-1 text-xs text-muted-foreground">
          <span>
            {t("finance.invoices.items.subtotal", "Items subtotal")}:{" "}
            <span className="font-medium tabular-nums text-foreground">
              {money(subtotal, true)}
            </span>
            {typeof total === "number" && Math.abs(subtotal - total) > 0.5 ? (
              <span className="ml-1">
                ({t("finance.invoices.items.invoiceTotal", "invoice total")}{" "}
                {money(total, true)})
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
    </DrawerSection>
  );
}
