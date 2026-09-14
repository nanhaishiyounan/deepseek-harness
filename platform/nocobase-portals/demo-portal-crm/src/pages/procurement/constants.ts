import type { useTranslate } from "@refinedev/core";
export { formatCurrency, formatDate, toDateInputValue } from "@/lib/table-kit";
import type { PurchaseOrderStatus, SupplierStatus } from "./types";

export const CURRENCY = "USD";

export const PO_STATUSES = [
  { value: "draft", label: "Draft", i18nKey: "procurement.enums.poStatus.draft" },
  { value: "sent", label: "Sent", i18nKey: "procurement.enums.poStatus.sent" },
  {
    value: "received",
    label: "Received",
    i18nKey: "procurement.enums.poStatus.received",
  },
  {
    value: "cancelled",
    label: "Cancelled",
    i18nKey: "procurement.enums.poStatus.cancelled",
  },
] as const;

/** Statuses that still represent committed / in-flight spend. */
export const OPEN_PO_STATUSES: PurchaseOrderStatus[] = ["draft", "sent"];

export const SUPPLIER_STATUSES = [
  {
    value: "active",
    label: "Active",
    i18nKey: "procurement.enums.supplierStatus.active",
  },
  {
    value: "inactive",
    label: "Inactive",
    i18nKey: "procurement.enums.supplierStatus.inactive",
  },
] as const;

const BADGE_CLASSES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  received: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  cancelled: "bg-red-500/15 text-red-700 dark:text-red-300",
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  inactive: "bg-muted text-muted-foreground",
};

export const badgeClassFor = (value: string | null | undefined) =>
  BADGE_CLASSES[value ?? ""] ?? "bg-muted text-muted-foreground";

export const labelFor = (
  options: ReadonlyArray<{ value: string; label: string; i18nKey?: string }>,
  value: string | null | undefined,
  translate?: ReturnType<typeof useTranslate>
) => {
  const option = options.find((item) => item.value === value);
  if (!option) return "—";
  return option.i18nKey && translate
    ? translate(option.i18nKey, { ns: "starter" }, option.label)
    : option.label;
};

export const statusLabel = (
  value: PurchaseOrderStatus | null | undefined,
  translate?: ReturnType<typeof useTranslate>
) => labelFor(PO_STATUSES, value, translate);

export const supplierStatusLabel = (
  value: SupplierStatus | null | undefined,
  translate?: ReturnType<typeof useTranslate>
) => labelFor(SUPPLIER_STATUSES, value, translate);

// --- PO workflow -------------------------------------------------------------
// The requisition ladder a buyer walks: draft is edited, sent is committed with
// the supplier, received closes it out. Cancel is available until goods land.
// Only these moves are offered, and the UI blocks anything else.
export const PO_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["received", "cancelled"],
  received: [],
  cancelled: ["draft"],
};

/** Ordered workflow stages for the stepper on the order detail. */
export const PO_WORKFLOW: PurchaseOrderStatus[] = ["draft", "sent", "received"];

export const canTransitionPo = (
  from: PurchaseOrderStatus | null | undefined,
  to: PurchaseOrderStatus
) => (PO_TRANSITIONS[from ?? "draft"] ?? []).includes(to);

/** Verb shown on the button that performs a transition. */
export const PO_TRANSITION_LABELS: Record<PurchaseOrderStatus, { i18nKey: string; label: string }> = {
  draft: { i18nKey: "procurement.po.workflow.reopen", label: "Return to draft" },
  sent: { i18nKey: "procurement.po.workflow.send", label: "Send to supplier" },
  received: { i18nKey: "procurement.po.workflow.receive", label: "Mark received" },
  cancelled: { i18nKey: "procurement.po.workflow.cancel", label: "Cancel order" },
};

/** qty * unit_price for one line, tolerating nulls. */
export const lineTotal = (
  qty: number | null | undefined,
  unitPrice: number | null | undefined
) => Number(qty ?? 0) * Number(unitPrice ?? 0);
