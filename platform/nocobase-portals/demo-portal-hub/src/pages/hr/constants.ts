import type { useTranslate } from "@refinedev/core";
export { formatDate, toDateInputValue } from "@/lib/table-kit";

export const EMPLOYEE_STATUSES = [
  { value: "active", label: "Active", i18nKey: "hr.enums.employeeStatus.active" },
  { value: "onleave", label: "On leave", i18nKey: "hr.enums.employeeStatus.onleave" },
  { value: "terminated", label: "Terminated", i18nKey: "hr.enums.employeeStatus.terminated" },
] as const;

export const LEAVE_TYPES = [
  { value: "annual", label: "Annual", i18nKey: "hr.enums.leaveType.annual" },
  { value: "sick", label: "Sick", i18nKey: "hr.enums.leaveType.sick" },
  { value: "unpaid", label: "Unpaid", i18nKey: "hr.enums.leaveType.unpaid" },
] as const;

export const LEAVE_STATUSES = [
  { value: "pending", label: "Pending", i18nKey: "hr.enums.leaveStatus.pending" },
  { value: "approved", label: "Approved", i18nKey: "hr.enums.leaveStatus.approved" },
  { value: "rejected", label: "Rejected", i18nKey: "hr.enums.leaveStatus.rejected" },
] as const;

const BADGE_CLASSES: Record<string, string> = {
  // employee status
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  onleave: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  terminated: "bg-red-500/15 text-red-700 dark:text-red-300",
  // leave type
  annual: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  sick: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  unpaid: "bg-muted text-muted-foreground",
  // leave status
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-300",
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
