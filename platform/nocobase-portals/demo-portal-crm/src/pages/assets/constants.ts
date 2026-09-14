// Enum vocab + formatting helpers for the Assets module.
// Pills/badges use the unified blue-forward tone set; every lookup has a
// fallback for unknown enum values (per the hub design contract).
import type { useTranslate } from "@refinedev/core";
export { formatCurrency, formatDate, toDateInputValue } from "@/lib/table-kit";

export const CURRENCY = "USD";

export const ASSET_CATEGORIES = [
  { value: "laptop", label: "Laptop", i18nKey: "assets.enums.category.laptop" },
  { value: "monitor", label: "Monitor", i18nKey: "assets.enums.category.monitor" },
  { value: "phone", label: "Phone", i18nKey: "assets.enums.category.phone" },
  { value: "peripheral", label: "Peripheral", i18nKey: "assets.enums.category.peripheral" },
  { value: "other", label: "Other", i18nKey: "assets.enums.category.other" },
] as const;

export const ASSET_STATUSES = [
  { value: "in_stock", label: "In stock", i18nKey: "assets.enums.status.in_stock" },
  { value: "assigned", label: "Assigned", i18nKey: "assets.enums.status.assigned" },
  { value: "repair", label: "Repair", i18nKey: "assets.enums.status.repair" },
  { value: "retired", label: "Retired", i18nKey: "assets.enums.status.retired" },
] as const;

// Maintenance vocab. Enum values are stored as their display strings in the
// backend (e.g. "Preventive", "In progress"), so the option value doubles as
// the stored value and i18n only swaps the visible label.
export const MAINTENANCE_TYPES = [
  { value: "Preventive", label: "Preventive", i18nKey: "assets.maintenance.enums.type.preventive" },
  { value: "Corrective", label: "Corrective", i18nKey: "assets.maintenance.enums.type.corrective" },
  { value: "Inspection", label: "Inspection", i18nKey: "assets.maintenance.enums.type.inspection" },
] as const;

export const MAINTENANCE_STATUSES = [
  { value: "Scheduled", label: "Scheduled", i18nKey: "assets.maintenance.enums.status.scheduled" },
  { value: "In progress", label: "In progress", i18nKey: "assets.maintenance.enums.status.in_progress" },
  { value: "Done", label: "Done", i18nKey: "assets.maintenance.enums.status.done" },
] as const;

// Tone per status — blue for the "assigned" active state, neutral/amber/red
// for the rest. Never black.
const STATUS_BADGE: Record<string, string> = {
  in_stock: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  assigned: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  repair: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  retired: "bg-muted text-muted-foreground",
};

const CATEGORY_BADGE: Record<string, string> = {
  laptop: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  monitor: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  phone: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  peripheral: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  other: "bg-muted text-muted-foreground",
};

const MAINTENANCE_STATUS_BADGE: Record<string, string> = {
  Scheduled: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  "In progress": "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  Done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

const MAINTENANCE_TYPE_BADGE: Record<string, string> = {
  Preventive: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  Corrective: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  Inspection: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
};

export const statusBadgeClass = (value: string | null | undefined) =>
  STATUS_BADGE[value ?? ""] ?? "bg-muted text-muted-foreground";

export const categoryBadgeClass = (value: string | null | undefined) =>
  CATEGORY_BADGE[value ?? ""] ?? "bg-muted text-muted-foreground";

export const maintenanceStatusBadgeClass = (value: string | null | undefined) =>
  MAINTENANCE_STATUS_BADGE[value ?? ""] ?? "bg-muted text-muted-foreground";

export const maintenanceTypeBadgeClass = (value: string | null | undefined) =>
  MAINTENANCE_TYPE_BADGE[value ?? ""] ?? "bg-muted text-muted-foreground";

export const labelFor = (
  options: ReadonlyArray<{ value: string; label: string; i18nKey?: string }>,
  value: string | null | undefined,
  translate?: ReturnType<typeof useTranslate>
) => {
  const option = options.find((item) => item.value === value);
  if (!option) return value || "—";
  return option.i18nKey && translate
    ? translate(option.i18nKey, { ns: "starter" }, option.label)
    : option.label;
};

export const todayIso = () => new Date().toISOString().slice(0, 10);

// --- lifecycle state machine -------------------------------------------------
// Legal moves only, the way an ITAM tool gates them. Assignment and return are
// driven by the assignment records themselves, so `assigned` is never picked by
// hand from a status dropdown.
export const ASSET_TRANSITIONS: Record<string, string[]> = {
  in_stock: ["repair", "retired"],
  assigned: ["repair", "retired"],
  repair: ["in_stock", "retired"],
  retired: ["in_stock"],
};

export const canTransition = (from: string | null | undefined, to: string) =>
  (ASSET_TRANSITIONS[from ?? "in_stock"] ?? []).includes(to);

// Legal work-order moves keep maintenance status changes explicit.
export const MAINTENANCE_TRANSITIONS: Record<string, string[]> = {
  Scheduled: ["In progress", "Done"],
  "In progress": ["Done"],
  Done: ["In progress"],
};

export const canTransitionMaintenance = (
  from: string | null | undefined,
  to: string
) => (MAINTENANCE_TRANSITIONS[from ?? "Scheduled"] ?? []).includes(to);

// --- depreciation ------------------------------------------------------------
// Straight-line over a category-specific useful life. There is no per-asset
// useful-life field in the backend, so the table below is the schedule.
export const USEFUL_LIFE_MONTHS: Record<string, number> = {
  laptop: 36,
  monitor: 60,
  phone: 24,
  peripheral: 36,
  other: 48,
};

export type Depreciation = {
  usefulLifeMonths: number;
  monthsInService: number;
  accumulated: number;
  netBookValue: number;
  percentDepreciated: number;
  isFullyDepreciated: boolean;
};

export const depreciationFor = (asset: {
  category?: string | null;
  value?: number | null;
  purchase_date?: string | null;
}): Depreciation | null => {
  const cost = Number(asset.value ?? 0);
  if (!asset.purchase_date || cost <= 0) return null;

  const usefulLifeMonths = USEFUL_LIFE_MONTHS[asset.category ?? "other"] ?? 48;
  const elapsed =
    (Date.now() - new Date(asset.purchase_date).getTime()) /
    (1000 * 60 * 60 * 24 * 30.44);
  const monthsInService = Math.max(0, Math.round(elapsed));
  const capped = Math.min(monthsInService, usefulLifeMonths);
  const accumulated = (cost / usefulLifeMonths) * capped;

  return {
    usefulLifeMonths,
    monthsInService,
    accumulated,
    netBookValue: cost - accumulated,
    percentDepreciated:
      usefulLifeMonths === 0 ? 0 : (capped / usefulLifeMonths) * 100,
    isFullyDepreciated: monthsInService >= usefulLifeMonths,
  };
};

/** Signed day delta to a date — negative means overdue. */
export const daysUntil = (value: string | null | undefined) => {
  if (!value) return null;
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / (1000 * 60 * 60 * 24));
};

export const assigneeName = (
  assignee:
    | { nickname?: string | null; username?: string | null; email?: string | null }
    | null
    | undefined
) => assignee?.nickname || assignee?.username || assignee?.email || "—";
