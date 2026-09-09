import { format } from "date-fns";
import type { useTranslate } from "@refinedev/core";

export const CURRENCY = "USD";

export const DEAL_STAGES = [
  { value: "inquiry", label: "Inquiry", i18nKey: "crm.enums.dealStage.inquiry" },
  { value: "quote", label: "Quote", i18nKey: "crm.enums.dealStage.quote" },
  { value: "negotiation", label: "Negotiation", i18nKey: "crm.enums.dealStage.negotiation" },
  { value: "won", label: "Won", i18nKey: "crm.enums.dealStage.won" },
  { value: "lost", label: "Lost", i18nKey: "crm.enums.dealStage.lost" },
] as const;

export const OPEN_DEAL_STAGES = ["inquiry", "quote", "negotiation"];

export const DEAL_STAGE_PROBABILITY: Record<string, number> = {
  inquiry: 0.15,
  quote: 0.45,
  negotiation: 0.75,
  won: 1,
  lost: 0,
};

export const LEAD_STATUSES = [
  { value: "new", label: "New", i18nKey: "crm.enums.leadStatus.new" },
  { value: "working", label: "Working", i18nKey: "crm.enums.leadStatus.working" },
  { value: "qualified", label: "Qualified", i18nKey: "crm.enums.leadStatus.qualified" },
  { value: "unqualified", label: "Unqualified", i18nKey: "crm.enums.leadStatus.unqualified" },
  { value: "converted", label: "Converted", i18nKey: "crm.enums.leadStatus.converted" },
] as const;

/**
 * Statuses a user may assign directly. `converted` is intentionally excluded:
 * only the conversion workflow may set it together with its related records.
 */
export const MANUAL_LEAD_STATUSES = LEAD_STATUSES.filter(
  (status) => status.value !== "converted"
);

export const LEAD_SOURCES = [
  { value: "website", label: "Website", i18nKey: "crm.enums.leadSource.website" },
  { value: "referral", label: "Referral", i18nKey: "crm.enums.leadSource.referral" },
  { value: "event", label: "Event", i18nKey: "crm.enums.leadSource.event" },
  { value: "outbound", label: "Outbound", i18nKey: "crm.enums.leadSource.outbound" },
  { value: "partner", label: "Partner", i18nKey: "crm.enums.leadSource.partner" },
] as const;

export const QUOTE_STATUSES = [
  { value: "draft", label: "Draft", i18nKey: "crm.enums.quoteStatus.draft" },
  { value: "sent", label: "Sent", i18nKey: "crm.enums.quoteStatus.sent" },
  { value: "accepted", label: "Accepted", i18nKey: "crm.enums.quoteStatus.accepted" },
  { value: "rejected", label: "Rejected", i18nKey: "crm.enums.quoteStatus.rejected" },
  { value: "superseded", label: "Superseded", i18nKey: "crm.enums.quoteStatus.superseded" },
] as const;

export const PRODUCT_CATEGORIES = [
  { value: "seating", label: "Seating", i18nKey: "crm.enums.productCategory.seating" },
  { value: "tables", label: "Tables", i18nKey: "crm.enums.productCategory.tables" },
  { value: "storage", label: "Storage", i18nKey: "crm.enums.productCategory.storage" },
  { value: "accessories", label: "Accessories", i18nKey: "crm.enums.productCategory.accessories" },
  { value: "services", label: "Services", i18nKey: "crm.enums.productCategory.services" },
] as const;

export const ACTIVITY_TYPES = [
  { value: "call", label: "Call", i18nKey: "crm.enums.activityType.call" },
  { value: "meeting", label: "Meeting", i18nKey: "crm.enums.activityType.meeting" },
  { value: "email", label: "Email", i18nKey: "crm.enums.activityType.email" },
] as const;

// The seeded data stores `overdue` as a status of its own, alongside the derived
// "past its due date and not done" highlight. Both have to render, or those rows
// show an empty badge and vanish from every status filter.
export const FOLLOW_UP_STATUSES = [
  { value: "pending", label: "Pending", i18nKey: "crm.enums.followUpStatus.pending" },
  { value: "overdue", label: "Overdue", i18nKey: "crm.enums.followUpStatus.overdue" },
  { value: "done", label: "Done", i18nKey: "crm.enums.followUpStatus.done" },
] as const;

export const CUSTOMER_STATUSES = [
  { value: "active", label: "Active", i18nKey: "crm.enums.customerStatus.active" },
  { value: "inactive", label: "Inactive", i18nKey: "crm.enums.customerStatus.inactive" },
] as const;

export const INDUSTRIES = [
  { value: "design", label: "Design Studio", i18nKey: "crm.enums.industry.design" },
  { value: "architecture", label: "Architecture", i18nKey: "crm.enums.industry.architecture" },
  { value: "corporate", label: "Corporate", i18nKey: "crm.enums.industry.corporate" },
  { value: "education", label: "Education", i18nKey: "crm.enums.industry.education" },
  { value: "hospitality", label: "Hospitality", i18nKey: "crm.enums.industry.hospitality" },
  { value: "other", label: "Other", i18nKey: "crm.enums.industry.other" },
] as const;

const BADGE_CLASSES: Record<string, string> = {
  inquiry: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  quote: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  negotiation: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  won: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  lost: "bg-red-500/15 text-red-700 dark:text-red-300",
  call: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  meeting: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  email: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  overdue: "bg-red-500/15 text-red-700 dark:text-red-300",
  done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  inactive: "bg-muted text-muted-foreground",
  new: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  working: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  qualified: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  unqualified: "bg-red-500/15 text-red-700 dark:text-red-300",
  converted: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  accepted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-300",
  superseded: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
};

export const CRM_CHART_COLORS = [
  "#2563eb",
  "#0ea5e9",
  "#14b8a6",
  "#60a5fa",
  "#8b5cf6",
  "#f59e0b",
];

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

export const formatCurrency = (value: number | null | undefined, locale: string) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: CURRENCY,
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));

export const formatDate = (value: string | null | undefined, locale: string) =>
  value
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
        new Date(value)
      )
    : "—";

export const formatDateTime = (
  value: string | null | undefined,
  locale: string
) =>
  value
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";

export const toDateInputValue = (value: string | null | undefined) =>
  value ? String(value).slice(0, 10) : "";

export const toDateTimeInputValue = (value: string | null | undefined) => {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : format(parsed, "yyyy-MM-dd'T'HH:mm");
};
