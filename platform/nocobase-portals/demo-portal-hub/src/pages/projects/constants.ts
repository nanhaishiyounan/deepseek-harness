// Enum options, badge styling and formatters for the Projects module.
// The React UI owns these enums; the backend stores plain strings.

import type { useTranslate } from "@refinedev/core";
export { formatDate, toDateInputValue } from "@/lib/table-kit";

export const PROJECT_STATUSES = [
  { value: "planning", label: "Planning", i18nKey: "projects.enums.projectStatus.planning" },
  { value: "active", label: "Active", i18nKey: "projects.enums.projectStatus.active" },
  { value: "on_hold", label: "On hold", i18nKey: "projects.enums.projectStatus.on_hold" },
  { value: "done", label: "Done", i18nKey: "projects.enums.projectStatus.done" },
] as const;

export const TASK_STATUSES = [
  { value: "todo", label: "To do", i18nKey: "projects.enums.taskStatus.todo" },
  { value: "in_progress", label: "In progress", i18nKey: "projects.enums.taskStatus.in_progress" },
  { value: "review", label: "Review", i18nKey: "projects.enums.taskStatus.review" },
  { value: "done", label: "Done", i18nKey: "projects.enums.taskStatus.done" },
] as const;

export const TASK_PRIORITIES = [
  { value: "low", label: "Low", i18nKey: "projects.enums.taskPriority.low" },
  { value: "med", label: "Medium", i18nKey: "projects.enums.taskPriority.med" },
  { value: "high", label: "High", i18nKey: "projects.enums.taskPriority.high" },
] as const;

const BADGE_CLASSES: Record<string, string> = {
  // project + task status
  planning: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  active: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  on_hold: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  todo: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  in_progress: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  review: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  // priority
  low: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  med: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  high: "bg-red-500/15 text-red-700 dark:text-red-300",
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

export const todayIso = () => new Date().toISOString().slice(0, 10);

export const userLabel = (
  user: { nickname?: string | null; username?: string | null } | null | undefined
) => user?.nickname || user?.username || "—";
