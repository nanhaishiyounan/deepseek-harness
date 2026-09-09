import { useGetLocale, useList, useTranslate } from "@refinedev/core";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Breadcrumb } from "@/components/app-shell/breadcrumb";
import { LoadingState } from "@/components/app-shell/loading-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LEAVE_STATUSES, LEAVE_TYPES, labelFor } from "./constants";
import { badgeClassFor } from "./constants";
import { useDepartmentOptions } from "./pickers";
import { ErrorState } from "@/lib/table-kit";
import type { LeaveRequestRecord } from "./types";

const CELLS_PER_WEEK = 7;
const WEEKS_IN_GRID = 6;
const MAX_CHIPS_PER_DAY = 3;
/** A day with this many people away is flagged as a coverage risk. */
const COVERAGE_RISK_THRESHOLD = 3;

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function addDays(date: Date, delta: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + delta);
  return next;
}

export function LeaveCalendarPage() {
  const translate = useTranslate();
  const getLocale = useGetLocale();
  const locale = getLocale();
  const navigate = useNavigate();
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const { options: departmentOptions } = useDepartmentOptions();

  const { result, query } = useList<LeaveRequestRecord>({
    resource: "hub_hr_leave_requests",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    sorters: [{ field: "start_date", order: "asc" }],
    meta: { appends: ["employee"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  // Department / type / status narrowing happens client-side: the month view
  // already holds the full request set, and this keeps the filters instant.
  const visibleLeaves = useMemo(
    () =>
      result.data.filter((leave) => {
        if (
          departmentFilter &&
          String(leave.employee?.department_id ?? "") !== departmentFilter
        ) {
          return false;
        }
        if (typeFilter && (leave.type ?? "annual") !== typeFilter) return false;
        if (statusFilter && (leave.status ?? "pending") !== statusFilter) {
          return false;
        }
        return true;
      }),
    [departmentFilter, result.data, statusFilter, typeFilter]
  );

  // Expand each leave request's [start_date, end_date] span into a per-day
  // lookup so a calendar cell can just look up its own date key.
  const byDay = useMemo(() => {
    const map = new Map<string, LeaveRequestRecord[]>();
    for (const leave of visibleLeaves) {
      const startRaw = leave.start_date;
      const endRaw = leave.end_date || leave.start_date;
      if (!startRaw) continue;
      const start = new Date(String(startRaw).slice(0, 10));
      const end = new Date(String(endRaw).slice(0, 10));
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      let cursor = start;
      let guard = 0;
      while (cursor.getTime() <= end.getTime() && guard < 120) {
        const key = ymd(cursor);
        const bucket = map.get(key) ?? [];
        bucket.push(leave);
        map.set(key, bucket);
        cursor = addDays(cursor, 1);
        guard += 1;
      }
    }
    return map;
  }, [visibleLeaves]);

  const cells = useMemo(() => {
    const first = startOfMonth(month);
    const gridStart = addDays(first, -first.getDay());
    return Array.from({ length: CELLS_PER_WEEK * WEEKS_IN_GRID }, (_, i) => {
      const date = addDays(gridStart, i);
      return {
        date,
        inMonth: date.getMonth() === month.getMonth(),
        isToday: ymd(date) === ymd(new Date()),
        leaves: byDay.get(ymd(date)) ?? [],
      };
    });
  }, [month, byDay]);

  // Coverage risk: the busiest in-month day, surfaced above the grid.
  const busiest = useMemo(() => {
    let top: { key: string; count: number } | null = null;
    for (const cell of cells) {
      if (!cell.inMonth) continue;
      if (!top || cell.leaves.length > top.count) {
        top = { key: ymd(cell.date), count: cell.leaves.length };
      }
    }
    return top;
  }, [cells]);

  const weekdayLabels = useMemo(() => {
    const base = addDays(startOfMonth(new Date()), -startOfMonth(new Date()).getDay());
    return Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(locale, { weekday: "short" }).format(addDays(base, i))
    );
  }, [locale]);

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(month);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center text-muted-foreground">
          <Breadcrumb />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.035em]">
              {translate("hr.leaveCalendar.title", { ns: "starter" }, "Leave calendar")}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {translate(
                "hr.leaveCalendar.subtitle",
                { ns: "starter" },
                "Who's off this month. Click a name to open the request."
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMonth(startOfMonth(new Date()))}
            >
              {translate("hr.leaveCalendar.today", { ns: "starter" }, "Today")}
            </Button>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={translate(
                  "hr.leaveCalendar.prevMonth",
                  { ns: "starter" },
                  "Previous month"
                )}
                onClick={() => setMonth((m) => addMonths(m, -1))}
              >
                <ChevronLeft />
              </Button>
              <span className="min-w-36 text-center text-sm font-medium tabular-nums">
                {monthLabel}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={translate(
                  "hr.leaveCalendar.nextMonth",
                  { ns: "starter" },
                  "Next month"
                )}
                onClick={() => setMonth((m) => addMonths(m, 1))}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.currentTarget.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs"
          >
            <option value="">
              {translate(
                "hr.employees.allDepartments",
                { ns: "starter" },
                "All departments"
              )}
            </option>
            {departmentOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.currentTarget.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs"
          >
            <option value="">
              {translate("hr.leave.allTypes", { ns: "starter" }, "All types")}
            </option>
            {LEAVE_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {labelFor(LEAVE_TYPES, type.value, translate)}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.currentTarget.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs"
          >
            <option value="">
              {translate("hr.leave.allStatuses", { ns: "starter" }, "All statuses")}
            </option>
            {LEAVE_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {labelFor(LEAVE_STATUSES, status.value, translate)}
              </option>
            ))}
          </select>
        </div>
        {busiest && busiest.count >= COVERAGE_RISK_THRESHOLD ? (
          <p className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-3.5" />
            {translate(
              "hr.leaveCalendar.coverageRisk",
              { ns: "starter", count: busiest.count, date: busiest.key },
              `Peak of ${busiest.count} people away on ${busiest.key}`
            )}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="size-3.5" />
          {translate("hr.leaveCalendar.legend", { ns: "starter" }, "Status:")}
        </span>
        {LEAVE_STATUSES.map((status) => (
          <span key={status.value} className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-2.5 rounded-full",
                badgeClassFor(status.value).split(" ")[0]
              )}
            />
            {labelFor(LEAVE_STATUSES, status.value, translate)}
          </span>
        ))}
      </div>

      <Card>
        <CardContent className="p-2 sm:p-3">
          {query.isError ? (
            <ErrorState i18nPrefix="hr.toolkit" onRetry={() => query.refetch()} />
          ) : query.isLoading ? (
            <LoadingState className="min-h-96" />
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-7 gap-px overflow-hidden rounded-t-lg border border-b-0 bg-border">
                  {weekdayLabels.map((label) => (
                    <div
                      key={label}
                      className="bg-muted/50 px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
                    >
                      {label}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-px overflow-hidden rounded-b-lg border bg-border">
                  {cells.map((cell) => {
                    const overflow = cell.leaves.length - MAX_CHIPS_PER_DAY;
                    return (
                      <div
                        key={ymd(cell.date)}
                        className={cn(
                          "flex min-h-28 flex-col gap-1 bg-card p-1.5",
                          !cell.inMonth && "bg-muted/20 text-muted-foreground/50",
                          cell.inMonth &&
                            cell.leaves.length >= COVERAGE_RISK_THRESHOLD &&
                            "bg-amber-500/5 ring-1 ring-inset ring-amber-500/30"
                        )}
                      >
                        <span className="flex items-center justify-between gap-1">
                          <span
                            className={cn(
                              "flex size-5 items-center justify-center rounded-full text-xs tabular-nums",
                              cell.isToday &&
                                "bg-primary font-semibold text-primary-foreground"
                            )}
                          >
                            {cell.date.getDate()}
                          </span>
                          {cell.inMonth && cell.leaves.length > 0 ? (
                            <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                              {cell.leaves.length}
                            </span>
                          ) : null}
                        </span>
                        <div className="flex flex-1 flex-col gap-1">
                          {cell.leaves.slice(0, MAX_CHIPS_PER_DAY).map((leave) => (
                            <button
                              key={String(leave.id)}
                              type="button"
                              title={`${leave.employee?.name || "—"} · ${labelFor(
                                LEAVE_TYPES,
                                leave.type ?? "annual",
                                translate
                              )}`}
                              onClick={() => navigate(`/leave/show/${leave.id}`)}
                              className={cn(
                                "truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium hover:opacity-80",
                                badgeClassFor(leave.status ?? "pending")
                              )}
                            >
                              {leave.employee?.name || "—"}
                            </button>
                          ))}
                          {overflow > 0 ? (
                            <span className="px-1.5 text-[11px] text-muted-foreground">
                              {translate(
                                "hr.leaveCalendar.more",
                                { ns: "starter", count: overflow },
                                `+${overflow} more`
                              )}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
