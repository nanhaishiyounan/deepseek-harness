import { useTranslate } from "@refinedev/core";
import { CalendarCheck, CircleCheck, DollarSign } from "lucide-react";
import { Link } from "react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { todayIso, useWeekAhead } from "./data";

type WeekItem = {
  key: string;
  day: string;
  title: string;
  to: string;
  icon: typeof CalendarCheck;
  tone: string;
};

const localDateKey = (value: Date) => {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
};

const activityDayKey = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : localDateKey(date);
};

const dateFromKey = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export function WeekStrip() {
  const translate = useTranslate();
  const locale =
    typeof navigator !== "undefined" ? navigator.language : "en-US";
  const week = useWeekAhead();
  const today = todayIso();

  const items: WeekItem[] = [
    ...week.activities
      .filter((activity) => activity.date)
      .map((activity) => ({
        key: `activity-${activity.id}`,
        day: activityDayKey(activity.date as string),
        title: activity.subject || "—",
        to: `/activities/show/${activity.id}`,
        icon: CalendarCheck,
        tone: "bg-blue-500/12 text-blue-700 dark:text-blue-400",
      })),
    ...week.tasks
      .filter((task) => task.due_date)
      .map((task) => ({
        key: `task-${task.id}`,
        day: task.due_date?.slice(0, 10) ?? "",
        title: task.title || "—",
        to: "/tasks",
        icon: CircleCheck,
        tone: "bg-amber-500/12 text-amber-700 dark:text-amber-400",
      })),
    ...week.deals
      .filter((deal) => deal.expected_close_date)
      .map((deal) => ({
        key: `deal-${deal.id}`,
        day: deal.expected_close_date?.slice(0, 10) ?? "",
        title: deal.title || "—",
        to: `/deals/show/${deal.id}`,
        icon: DollarSign,
        tone: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
      })),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{translate("home.week.title", "My week")}</CardTitle>
        <CardDescription>
          {translate(
            "home.week.subtitle",
            "Meetings, deadlines and expected closes for the next seven days."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
          <span>
            {translate("home.week.totals.activities", "{{count}} meetings").replace(
              "{{count}}",
              String(week.activities.length)
            )}
          </span>
          <span>
            {translate("home.week.totals.tasks", "{{count}} tasks due").replace(
              "{{count}}",
              String(week.tasks.length)
            )}
          </span>
          <span>
            {translate("home.week.totals.deals", "{{count}} deals closing").replace(
              "{{count}}",
              String(week.deals.length)
            )}
          </span>
        </div>

        {week.isLoading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-32 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            {translate("home.week.empty", "Nothing scheduled this week.")}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
            {week.days.map((dayKey) => {
              const date = dateFromKey(dayKey);
              const dayItems = items.filter((item) => item.day === dayKey);
              return (
                <div
                  key={dayKey}
                  className={cn(
                    "min-h-32 rounded-lg border p-2",
                    dayKey === today &&
                      "bg-primary/5 ring-1 ring-inset ring-primary/40"
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {new Intl.DateTimeFormat(locale, {
                        weekday: "short",
                      }).format(date)}
                    </span>
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                        dayKey === today
                          ? "bg-primary font-semibold text-primary-foreground"
                          : "text-foreground"
                      )}
                    >
                      {date.getDate()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {dayItems.slice(0, 3).map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.key}
                          to={item.to}
                          title={item.title}
                          className={cn(
                            "flex w-full items-center gap-1 truncate rounded-md px-1.5 py-1 text-[11px] font-medium hover:opacity-80",
                            item.tone
                          )}
                        >
                          <Icon className="size-3 shrink-0" />
                          <span className="truncate">{item.title}</span>
                        </Link>
                      );
                    })}
                    {dayItems.length > 3 ? (
                      <span className="block px-1.5 text-[11px] text-muted-foreground">
                        {translate("home.week.more", "+{{count}} more").replace(
                          "{{count}}",
                          String(dayItems.length - 3)
                        )}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
