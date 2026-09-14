// Enum options, labels and pill tones for the Finance module.
// Tones follow the suite convention used on the Overview page:
//   soft tinted background + saturated text, brighter text in dark mode.
import type { useTranslate } from "@refinedev/core";

export type Option = {
  value: string;
  label: string;
  /** i18n key resolved via useTranslate, with `label` as the fallback. */
  i18nKey: string;
  /** Tailwind classes for the status/category pill. */
  tone: string;
};

const AMBER = "bg-amber-500/12 text-amber-700 dark:text-amber-400";
const EMERALD = "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400";
const RED = "bg-red-500/12 text-red-700 dark:text-red-400";
const BLUE = "bg-blue-500/12 text-blue-700 dark:text-blue-400";
const SKY = "bg-sky-500/12 text-sky-700 dark:text-sky-400";
const TEAL = "bg-teal-500/12 text-teal-700 dark:text-teal-400";
const VIOLET = "bg-violet-500/12 text-violet-700 dark:text-violet-400";
const SLATE = "bg-slate-500/12 text-slate-600 dark:text-slate-300";

export const EXPENSE_CATEGORIES: Option[] = [
  { value: "travel", label: "Travel", i18nKey: "finance.enums.category.travel", tone: BLUE },
  { value: "meals", label: "Meals", i18nKey: "finance.enums.category.meals", tone: SKY },
  { value: "software", label: "Software", i18nKey: "finance.enums.category.software", tone: TEAL },
  { value: "equipment", label: "Equipment", i18nKey: "finance.enums.category.equipment", tone: VIOLET },
  { value: "other", label: "Other", i18nKey: "finance.enums.category.other", tone: SLATE },
];

export const EXPENSE_STATUSES: Option[] = [
  { value: "pending", label: "Pending", i18nKey: "finance.enums.expenseStatus.pending", tone: AMBER },
  { value: "approved", label: "Approved", i18nKey: "finance.enums.expenseStatus.approved", tone: EMERALD },
  { value: "rejected", label: "Rejected", i18nKey: "finance.enums.expenseStatus.rejected", tone: RED },
  { value: "reimbursed", label: "Reimbursed", i18nKey: "finance.enums.expenseStatus.reimbursed", tone: BLUE },
];

export const INVOICE_STATUSES: Option[] = [
  { value: "draft", label: "Draft", i18nKey: "finance.enums.invoiceStatus.draft", tone: SLATE },
  { value: "sent", label: "Sent", i18nKey: "finance.enums.invoiceStatus.sent", tone: BLUE },
  { value: "paid", label: "Paid", i18nKey: "finance.enums.invoiceStatus.paid", tone: EMERALD },
  { value: "overdue", label: "Overdue", i18nKey: "finance.enums.invoiceStatus.overdue", tone: RED },
];

/** Look up an option by value, with a graceful fallback for unknown enums. */
export function lookup(options: Option[], value: string | undefined | null): Option {
  const found = options.find((o) => o.value === value);
  if (found) return found;
  return {
    value: value ?? "unknown",
    label: value ? String(value) : "—",
    i18nKey: "",
    tone: SLATE,
  };
}

/** Translate an option's label, falling back to the raw value. */
export function optionLabel(
  option: Option,
  translate: ReturnType<typeof useTranslate>
): string {
  if (!option.i18nKey) return option.label;
  return translate(option.i18nKey, { ns: "starter" }, option.label);
}
