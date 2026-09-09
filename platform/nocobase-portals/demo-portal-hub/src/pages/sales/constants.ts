import type { useTranslate } from "@refinedev/core";
export {
  formatCurrency,
  formatDate,
  formatDateTime,
  toDateInputValue,
} from "@/lib/table-kit";

export const CURRENCY = "USD";

// Pipeline stages, in board order.
export const DEAL_STAGES = [
  { value: "inquiry", label: "Inquiry", i18nKey: "sales.enums.dealStage.inquiry" },
  { value: "quote", label: "Quote", i18nKey: "sales.enums.dealStage.quote" },
  {
    value: "negotiation",
    label: "Negotiation",
    i18nKey: "sales.enums.dealStage.negotiation",
  },
  { value: "won", label: "Won", i18nKey: "sales.enums.dealStage.won" },
  { value: "lost", label: "Lost", i18nKey: "sales.enums.dealStage.lost" },
] as const;

// Open stages contribute to "pipeline value".
export const OPEN_DEAL_STAGES = ["inquiry", "quote", "negotiation"];

/** Full status set for display, filtering, scoring and exports. */
export const LEAD_STATUSES = [
  { value: "new", label: "New", i18nKey: "sales.enums.leadStatus.new" },
  {
    value: "qualified",
    label: "Qualified",
    i18nKey: "sales.enums.leadStatus.qualified",
  },
  {
    value: "converted",
    label: "Converted",
    i18nKey: "sales.enums.leadStatus.converted",
  },
  {
    value: "unqualified",
    label: "Unqualified",
    i18nKey: "sales.enums.leadStatus.unqualified",
  },
] as const;

/**
 * Statuses a user may assign directly. `converted` is intentionally excluded:
 * only the conversion workflow may set it together with its related records.
 */
export const MANUAL_LEAD_STATUSES = LEAD_STATUSES.filter(
  (status) => status.value !== "converted"
);

export const LEAD_SOURCES = [
  { value: "website", label: "Website", i18nKey: "sales.enums.leadSource.website" },
  {
    value: "referral",
    label: "Referral",
    i18nKey: "sales.enums.leadSource.referral",
  },
  { value: "event", label: "Event", i18nKey: "sales.enums.leadSource.event" },
  {
    value: "cold_call",
    label: "Cold Call",
    i18nKey: "sales.enums.leadSource.cold_call",
  },
  {
    value: "partner",
    label: "Partner",
    i18nKey: "sales.enums.leadSource.partner",
  },
] as const;

export const INDUSTRIES = [
  {
    value: "technology",
    label: "Technology",
    i18nKey: "sales.enums.industry.technology",
  },
  {
    value: "manufacturing",
    label: "Manufacturing",
    i18nKey: "sales.enums.industry.manufacturing",
  },
  { value: "retail", label: "Retail", i18nKey: "sales.enums.industry.retail" },
  { value: "finance", label: "Finance", i18nKey: "sales.enums.industry.finance" },
  {
    value: "healthcare",
    label: "Healthcare",
    i18nKey: "sales.enums.industry.healthcare",
  },
  {
    value: "education",
    label: "Education",
    i18nKey: "sales.enums.industry.education",
  },
  { value: "other", label: "Other", i18nKey: "sales.enums.industry.other" },
] as const;

export const ACTIVITY_TYPES = [
  { value: "call", label: "Call", i18nKey: "sales.enums.activityType.call" },
  { value: "email", label: "Email", i18nKey: "sales.enums.activityType.email" },
  {
    value: "meeting",
    label: "Meeting",
    i18nKey: "sales.enums.activityType.meeting",
  },
] as const;

// Tailwind token classes for status pills — theme-aware, with a fallback for
// unknown enum values (per the design contract).
const BADGE_CLASSES: Record<string, string> = {
  // deal stages
  inquiry: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  quote: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  negotiation: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  won: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  lost: "bg-red-500/15 text-red-700 dark:text-red-300",
  // lead statuses
  new: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  qualified: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  converted: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  unqualified: "bg-muted text-muted-foreground",
  // lead sources
  website: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  referral: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  event: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  cold_call: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  partner: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  // activity types
  call: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  email: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  meeting: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  // industries
  technology: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  manufacturing: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  retail: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  finance: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  healthcare: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  education: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  other: "bg-muted text-muted-foreground",
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

// Compact currency for board totals, e.g. $156K.
export const formatCurrencyCompact = (
  value: number | null | undefined,
  locale: string
) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: CURRENCY,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value ?? 0));

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** Local-date key (YYYY-MM-DD). Not toISOString() — that shifts by timezone. */
export const todayIso = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

export const addDaysIso = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

/** Whole days from `value` until today; negative when `value` is in the future. */
export const daysSince = (value: string | null | undefined) => {
  if (!value) return null;
  const then = new Date(String(value).slice(0, 10));
  if (Number.isNaN(then.getTime())) return null;
  const today = new Date(todayIso());
  return Math.round((today.getTime() - then.getTime()) / 86_400_000);
};

/** Calendar quarter (0-based) of a YYYY-MM-DD string. */
export const quarterOf = (value: string) =>
  Math.floor((Number(value.slice(5, 7)) - 1) / 3);

// ---------------------------------------------------------------------------
// Deal stage machine
// ---------------------------------------------------------------------------

/**
 * Default win probability per stage. NocoBase has no probability column on
 * hub_sales_deals, so weighted pipeline is derived from the stage the same way
 * Salesforce seeds probability from its stage definition.
 */
export const STAGE_PROBABILITY: Record<string, number> = {
  inquiry: 0.1,
  quote: 0.3,
  negotiation: 0.6,
  won: 1,
  lost: 0,
};

export const weightedAmount = (
  amount: number | null | undefined,
  stage: string | null | undefined
) => Number(amount ?? 0) * (STAGE_PROBABILITY[stage ?? "inquiry"] ?? 0);

/**
 * Legal stage transitions. A deal advances one stage at a time, can be closed
 * won/lost from any open stage, and a closed deal can only be reopened back
 * into negotiation — arbitrary jumps are rejected by `canTransition`.
 */
export const STAGE_TRANSITIONS: Record<string, string[]> = {
  inquiry: ["quote", "won", "lost"],
  quote: ["negotiation", "won", "lost"],
  negotiation: ["won", "lost"],
  won: ["negotiation"],
  lost: ["negotiation"],
};

export const nextStages = (stage: string | null | undefined) =>
  STAGE_TRANSITIONS[stage ?? "inquiry"] ?? [];

export const canTransition = (from: string | null | undefined, to: string) =>
  nextStages(from).includes(to);

// ---------------------------------------------------------------------------
// Lead scoring
// ---------------------------------------------------------------------------

const SOURCE_POINTS: Record<string, number> = {
  referral: 35,
  partner: 30,
  event: 25,
  website: 18,
  cold_call: 10,
};

const STATUS_POINTS: Record<string, number> = {
  converted: 40,
  qualified: 35,
  new: 20,
  unqualified: 0,
};

export type LeadScoreFactor = { key: string; labelKey: string; points: number };

/**
 * Transparent 0–100 fit score. There is no score column on hub_sales_leads, so
 * it is derived from the fields that do exist — the UI shows the breakdown
 * rather than presenting it as a stored value.
 */
export const scoreLead = (lead: {
  source?: string | null;
  status?: string | null;
  email?: string | null;
  company?: string | null;
  createdAt?: string;
}): { score: number; factors: LeadScoreFactor[] } => {
  const factors: LeadScoreFactor[] = [
    {
      key: "source",
      labelKey: "sales.leads.score.source",
      points: SOURCE_POINTS[lead.source ?? ""] ?? 5,
    },
    {
      key: "status",
      labelKey: "sales.leads.score.status",
      points: STATUS_POINTS[lead.status ?? "new"] ?? 0,
    },
    {
      key: "contactable",
      labelKey: "sales.leads.score.contactable",
      points: lead.email ? 15 : 0,
    },
    {
      key: "company",
      labelKey: "sales.leads.score.company",
      points: lead.company ? 10 : 0,
    },
  ];
  const age = daysSince(lead.createdAt);
  factors.push({
    key: "freshness",
    labelKey: "sales.leads.score.freshness",
    points: age === null ? 0 : age <= 7 ? 5 : age <= 30 ? 2 : 0,
  });
  const score = Math.min(
    100,
    factors.reduce((total, factor) => total + factor.points, 0)
  );
  return { score, factors };
};

export const scoreBand = (score: number): "hot" | "warm" | "cold" =>
  score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
