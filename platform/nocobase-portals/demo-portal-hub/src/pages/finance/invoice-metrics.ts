import { nocobaseClient } from "@nocobase/portal-sdk/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
type InvoiceAmountSource = {
  id: string | number;
  amount?: number | null;
};
type InvoiceStatusSource = {
  status?: string | null;
  due_date?: string | null;
};

type AggregateRow = {
  invoiceId?: string | number | null;
  amount?: string | number | null;
};

/** Line-item totals keyed by invoice. Header amount is only a fallback for invoices with no lines. */
export function useInvoiceAmounts() {
  const query = useQuery({
    queryKey: ["finance", "invoice-line-totals"],
    queryFn: () =>
      nocobaseClient.action<AggregateRow[]>("hub_fin_invoice_items", "query", {
        body: {
          measures: [{ field: ["amount"], aggregation: "sum", alias: "amount" }],
          dimensions: [{ field: ["invoice_id"], alias: "invoiceId" }],
        },
      }),
    retry: false,
  });

  const byInvoice = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of query.data ?? []) {
      if (row.invoiceId == null) continue;
      totals.set(String(row.invoiceId), Number(row.amount ?? 0));
    }
    return totals;
  }, [query.data]);

  return {
    byInvoice,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function invoiceAmount(
  invoice: InvoiceAmountSource,
  byInvoice: Map<string, number>
) {
  return byInvoice.has(String(invoice.id))
    ? (byInvoice.get(String(invoice.id)) ?? 0)
    : Number(invoice.amount) || 0;
}

export function invoiceDaysPastDue(invoice: InvoiceStatusSource, now = new Date()) {
  if (invoice.status === "paid" || invoice.status === "draft") return 0;
  if (!invoice.due_date) return 0;
  const due = new Date(`${invoice.due_date.slice(0, 10)}T00:00:00`).getTime();
  if (Number.isNaN(due)) return 0;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - due) / 86400000));
}

export function isInvoiceOverdue(invoice: InvoiceStatusSource, now = new Date()) {
  return (
    invoice.status !== "paid" &&
    invoice.status !== "draft" &&
    invoiceDaysPastDue(invoice, now) > 0
  );
}

/** Display status is derived from due date; a stale stored overdue flag never wins. */
export function invoiceDisplayStatus(invoice: InvoiceStatusSource, now = new Date()) {
  if (isInvoiceOverdue(invoice, now)) return "overdue";
  return invoice.status === "overdue" ? "sent" : invoice.status;
}

/** `overdue` is not user-writable; old records normalize back to the issued state. */
export function writableInvoiceStatus(status: string) {
  return status === "overdue" ? "sent" : status;
}
