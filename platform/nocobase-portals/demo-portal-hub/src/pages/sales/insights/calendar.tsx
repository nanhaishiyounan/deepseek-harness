import { useList, useTranslate } from "@refinedev/core";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCcw,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ListView } from "@/components/resources/views/list-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ACTIVITY_TYPES, formatDateTime, labelFor } from "../constants";
import { salesRoutes } from "../module";
import { activityIcon, EnumBadge, useLocale } from "../shared";
import type { ActivityRecord } from "../types";

const TYPE_CHIP: Record<string, string> = {
  email: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  meeting: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  call: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
};

// Local-date key (YYYY-MM-DD) — deliberately not toISOString(), which shifts
// across timezones and can bucket an activity onto the wrong day.
const dateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function SalesCalendarPage() {
  const translate = useTranslate();
  const locale = useLocale();
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [types, setTypes] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState<string>(() =>
    dateKey(new Date())
  );

  // The grid runs from the Sunday before the 1st to the Saturday after the
  // last day, so the leading/trailing cells show their activities too.
  const { gridStart, gridEnd } = useMemo(() => {
    const start = new Date(cursor);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    end.setDate(end.getDate() + (6 - end.getDay()));
    return { gridStart: start, gridEnd: end };
  }, [cursor]);

  const { result, query } = useList<ActivityRecord>({
    resource: "hub_sales_activities",
    pagination: { mode: "server", currentPage: 1, pageSize: 1000 },
    sorters: [{ field: "date", order: "asc" }],
    meta: { appends: ["deal"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const visible = useMemo(
    () =>
      types.length === 0
        ? result.data
        : result.data.filter((activity) =>
            types.includes(activity.type ?? "call")
          ),
    [result.data, types]
  );

  const byDay = useMemo(() => {
    const map = new Map<string, ActivityRecord[]>();
    for (const activity of visible) {
      if (!activity.date) continue;
      const key = dateKey(new Date(activity.date));
      const bucket = map.get(key) ?? [];
      bucket.push(activity);
      map.set(key, bucket);
    }
    return map;
  }, [visible]);

  const weeks = useMemo(() => {
    const days: Date[] = [];
    const cursorDay = new Date(gridStart);
    while (cursorDay <= gridEnd) {
      days.push(new Date(cursorDay));
      cursorDay.setDate(cursorDay.getDate() + 1);
    }
    const rows: Date[][] = [];
    for (let index = 0; index < days.length; index += 7) {
      rows.push(days.slice(index, index + 7));
    }
    return rows;
  }, [gridStart, gridEnd]);

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(cursor);

  const weekdayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
    const base = new Date(2024, 0, 7); // a Sunday
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(base);
      day.setDate(base.getDate() + index);
      return formatter.format(day);
    });
  }, [locale]);

  const today = dateKey(new Date());
  const monthPrefix = `${cursor.getFullYear()}-${String(
    cursor.getMonth() + 1
  ).padStart(2, "0")}`;

  const monthCounts = useMemo(() => {
    const counts: Record<string, number> = { call: 0, email: 0, meeting: 0 };
    for (const activity of result.data) {
      if (!activity.date || !activity.date.startsWith(monthPrefix)) continue;
      const type = activity.type ?? "call";
      counts[type] = (counts[type] ?? 0) + 1;
    }
    return counts;
  }, [result.data, monthPrefix]);

  const dayActivities = byDay.get(selectedDay) ?? [];

  return (
    <ListView resource="sales-calendar">
      {query.isError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-16 text-center">
          <p className="text-sm font-medium">
            {translate(
              "sales.calendar.loadError.title",
              { ns: "starter" },
              "Unable to load activities"
            )}
          </p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            <RefreshCcw />
            {translate("sales.grid.error.retry", { ns: "starter" }, "Retry")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{monthLabel}</h2>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() =>
                    setCursor(
                      (current) =>
                        new Date(current.getFullYear(), current.getMonth() - 1, 1)
                    )
                  }
                  aria-label={translate(
                    "sales.grid.prevPage",
                    { ns: "starter" },
                    "Previous page"
                  )}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const now = new Date();
                    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
                    setSelectedDay(dateKey(now));
                  }}
                >
                  {translate("sales.calendar.today", { ns: "starter" }, "Today")}
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() =>
                    setCursor(
                      (current) =>
                        new Date(current.getFullYear(), current.getMonth() + 1, 1)
                    )
                  }
                  aria-label={translate(
                    "sales.grid.nextPage",
                    { ns: "starter" },
                    "Next page"
                  )}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {ACTIVITY_TYPES.map((type) => {
                const active = types.includes(type.value);
                return (
                  <Button
                    key={type.value}
                    variant={active ? "secondary" : "outline"}
                    size="sm"
                    onClick={() =>
                      setTypes((current) =>
                        current.includes(type.value)
                          ? current.filter((value) => value !== type.value)
                          : [...current, type.value]
                      )
                    }
                  >
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        type.value === "email"
                          ? "bg-cyan-500"
                          : type.value === "meeting"
                            ? "bg-purple-500"
                            : "bg-blue-500"
                      )}
                    />
                    {labelFor(ACTIVITY_TYPES, type.value, translate)}
                    <span className="tabular-nums text-muted-foreground">
                      {monthCounts[type.value] ?? 0}
                    </span>
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(salesRoutes.activities)}
              >
                {translate(
                  "sales.calendar.openList",
                  { ns: "starter" },
                  "Open list"
                )}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
            <Card className="overflow-hidden py-0 xl:col-span-3">
              <CardContent className="p-0">
                {query.isLoading ? (
                  <Skeleton className="h-[32rem] w-full" />
                ) : (
                  <>
                    <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
                      {weekdayLabels.map((label) => (
                        <div key={label} className="px-2 py-2">
                          {label}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7">
                      {weeks.map((week) =>
                        week.map((day) => {
                          const key = dateKey(day);
                          const inMonth = day.getMonth() === cursor.getMonth();
                          const activities = byDay.get(key) ?? [];
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setSelectedDay(key)}
                              className={cn(
                                "min-h-28 border-r border-b p-1.5 text-left last:border-r-0 transition-colors hover:bg-accent/40",
                                !inMonth && "bg-muted/20",
                                selectedDay === key && "bg-primary/5 ring-1 ring-inset ring-primary/40"
                              )}
                            >
                              <div
                                className={cn(
                                  "mb-1 flex size-6 items-center justify-center rounded-full text-xs",
                                  key === today
                                    ? "bg-primary font-semibold text-primary-foreground"
                                    : inMonth
                                      ? "text-foreground"
                                      : "text-muted-foreground"
                                )}
                              >
                                {day.getDate()}
                              </div>
                              <div className="space-y-1">
                                {activities.slice(0, 3).map((activity) => {
                                  const Icon = activityIcon(activity.type);
                                  return (
                                    <span
                                      key={String(activity.id)}
                                      className={cn(
                                        "flex w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                                        TYPE_CHIP[activity.type ?? "call"]
                                      )}
                                      title={activity.subject ?? undefined}
                                    >
                                      <Icon className="size-3 shrink-0" />
                                      <span className="truncate">
                                        {activity.subject || "—"}
                                      </span>
                                    </span>
                                  );
                                })}
                                {activities.length > 3 ? (
                                  <span className="block px-1.5 text-[11px] text-muted-foreground">
                                    {`+${activities.length - 3} `}
                                    {translate(
                                      "sales.calendar.more",
                                      { ns: "starter" },
                                      "more"
                                    )}
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Day detail — the calendar and the list stay in step. */}
            <Card className="xl:col-span-1">
              <CardContent className="space-y-3 pt-6">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-medium">
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "full",
                    }).format(new Date(selectedDay))}
                  </h3>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {dayActivities.length}
                  </span>
                </div>

                {dayActivities.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                    {translate(
                      "sales.calendar.day.empty",
                      { ns: "starter" },
                      "Nothing scheduled for this day."
                    )}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {dayActivities.map((activity) => {
                      const Icon = activityIcon(activity.type);
                      return (
                        <li
                          key={String(activity.id)}
                          className="rounded-lg border p-2.5"
                        >
                          <Link
                            to={`${salesRoutes.activities}/show/${activity.id}`}
                            className="flex items-start gap-2"
                          >
                            <span
                              className={cn(
                                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
                                TYPE_CHIP[activity.type ?? "call"]
                              )}
                            >
                              <Icon className="size-3" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {activity.subject || "—"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(activity.date, locale)}
                              </p>
                            </div>
                          </Link>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <EnumBadge
                              value={activity.type ?? "call"}
                              label={labelFor(
                                ACTIVITY_TYPES,
                                activity.type ?? "call",
                                translate
                              )}
                            />
                            {activity.deal?.title ? (
                              <Link
                                to={`${salesRoutes.pipeline}/show/${activity.deal.id}`}
                                className="truncate text-xs text-primary underline-offset-2 hover:underline"
                              >
                                {activity.deal.title}
                              </Link>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => navigate(`${salesRoutes.activities}/create`)}
                >
                  <Plus />
                  {translate(
                    "sales.activities.actions.log",
                    { ns: "starter" },
                    "Log activity"
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </ListView>
  );
}
