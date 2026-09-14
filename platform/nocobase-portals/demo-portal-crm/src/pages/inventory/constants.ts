import { format } from "date-fns";
import type { useTranslate } from "@refinedev/core";
export {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
} from "@/lib/table-kit";

export const CURRENCY = "USD";

export const CATEGORIES = [
  { value: "electronics", label: "Electronics", i18nKey: "inventory.enums.category.electronics" },
  { value: "office", label: "Office", i18nKey: "inventory.enums.category.office" },
  { value: "parts", label: "Parts", i18nKey: "inventory.enums.category.parts" },
  { value: "other", label: "Other", i18nKey: "inventory.enums.category.other" },
] as const;

export const PRODUCT_STATUSES = [
  { value: "active", label: "Active", i18nKey: "inventory.enums.productStatus.active" },
  { value: "discontinued", label: "Discontinued", i18nKey: "inventory.enums.productStatus.discontinued" },
] as const;

export const MOVE_TYPES = [
  { value: "in", label: "In", i18nKey: "inventory.enums.moveType.in" },
  { value: "out", label: "Out", i18nKey: "inventory.enums.moveType.out" },
  { value: "adjust", label: "Adjust", i18nKey: "inventory.enums.moveType.adjust" },
] as const;

const BADGE_CLASSES: Record<string, string> = {
  // categories
  electronics: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  office: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  parts: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  other: "bg-muted text-muted-foreground",
  // product status
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  discontinued: "bg-muted text-muted-foreground",
  // move types
  in: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  out: "bg-red-500/15 text-red-700 dark:text-red-300",
  adjust: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
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

export const toDateTimeInputValue = (value: string | null | undefined) => {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : format(parsed, "yyyy-MM-dd'T'HH:mm");
};

/** Signed contribution of a stock move to on-hand quantity. */
export const signedQty = (
  type: string | null | undefined,
  qty: number | null | undefined
) => {
  const value = Number(qty ?? 0);
  return type === "out" ? -value : value;
};
