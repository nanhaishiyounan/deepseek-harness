import type { useTranslate } from "@refinedev/core";
export { formatDateTime } from "@/lib/table-kit";

// ---------------------------------------------------------------------------
// Enum option sets — labels live here, DB columns store the plain value.
// Each carries an i18nKey so labelFor() can resolve a translated label.
// ---------------------------------------------------------------------------

export const TICKET_STATUSES = [
  { value: "open", label: "Open", i18nKey: "helpdesk.enums.status.open" },
  { value: "pending", label: "Pending", i18nKey: "helpdesk.enums.status.pending" },
  { value: "resolved", label: "Resolved", i18nKey: "helpdesk.enums.status.resolved" },
  { value: "closed", label: "Closed", i18nKey: "helpdesk.enums.status.closed" },
] as const;

export const TICKET_PRIORITIES = [
  { value: "low", label: "Low", i18nKey: "helpdesk.enums.priority.low" },
  { value: "med", label: "Medium", i18nKey: "helpdesk.enums.priority.med" },
  { value: "high", label: "High", i18nKey: "helpdesk.enums.priority.high" },
  { value: "urgent", label: "Urgent", i18nKey: "helpdesk.enums.priority.urgent" },
] as const;

export const TICKET_CATEGORIES = [
  { value: "billing", label: "Billing", i18nKey: "helpdesk.enums.category.billing" },
  { value: "technical", label: "Technical", i18nKey: "helpdesk.enums.category.technical" },
  { value: "account", label: "Account", i18nKey: "helpdesk.enums.category.account" },
  { value: "other", label: "Other", i18nKey: "helpdesk.enums.category.other" },
] as const;

/** Statuses rendered as board columns, in order. */
export const BOARD_COLUMNS = TICKET_STATUSES;

// ---------------------------------------------------------------------------
// Badge / pill color tokens — always token-based so light + dark both read.
// ---------------------------------------------------------------------------

const STATUS_CLASSES: Record<string, string> = {
  open: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  resolved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  closed: "bg-muted text-muted-foreground",
};

const PRIORITY_CLASSES: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  med: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  high: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  urgent: "bg-red-500/15 text-red-700 dark:text-red-300",
};

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-slate-400 dark:bg-slate-500",
  med: "bg-sky-500",
  high: "bg-amber-500",
  urgent: "bg-red-500",
};

const CATEGORY_CLASSES: Record<string, string> = {
  billing: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  technical: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  account: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  other: "bg-muted text-muted-foreground",
};

const FALLBACK = "bg-muted text-muted-foreground";

export const statusClassFor = (value: string | null | undefined) =>
  STATUS_CLASSES[value ?? ""] ?? FALLBACK;

export const priorityClassFor = (value: string | null | undefined) =>
  PRIORITY_CLASSES[value ?? ""] ?? FALLBACK;

export const priorityDotFor = (value: string | null | undefined) =>
  PRIORITY_DOT[value ?? ""] ?? "bg-muted-foreground";

export const categoryClassFor = (value: string | null | undefined) =>
  CATEGORY_CLASSES[value ?? ""] ?? FALLBACK;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const labelFor = (
  options: ReadonlyArray<{ value: string; label: string; i18nKey?: string }>,
  value: string | null | undefined,
  translate?: ReturnType<typeof useTranslate>
) => {
  const option = options.find((item) => item.value === value);
  if (!option) {
    if (!value) return "—";
    return String(value)
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }
  return option.i18nKey && translate
    ? translate(option.i18nKey, { ns: "starter" }, option.label)
    : option.label;
};

export const relativeTime = (
  value: string | null | undefined,
  translate?: ReturnType<typeof useTranslate>
) => {
  if (!value) return "—";
  const tr = (key: string, fallback: string, options?: Record<string, unknown>) =>
    translate ? translate(key, { ns: "starter", ...options }, fallback) : fallback;
  const then = new Date(value).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return tr("helpdesk.time.justNow", "just now");
  if (mins < 60) return tr("helpdesk.time.minutes", `${mins}m ago`, { count: mins });
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return tr("helpdesk.time.hours", `${hrs}h ago`, { count: hrs });
  const days = Math.round(hrs / 24);
  if (days < 30) return tr("helpdesk.time.days", `${days}d ago`, { count: days });
  const months = Math.round(days / 30);
  return tr("helpdesk.time.months", `${months}mo ago`, { count: months });
};

export const initialsFor = (name: string | null | undefined) => {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
};
