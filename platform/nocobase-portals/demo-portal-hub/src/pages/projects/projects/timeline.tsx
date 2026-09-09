import { useList, useTranslate } from "@refinedev/core";
import { ChevronLeft, ChevronRight, Diamond } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PROJECT_STATUSES, formatDate, labelFor, todayIso } from "../constants";
import { useOpenContextualChild } from "../route-surfaces";
import { useLocale } from "../shared";
import { EmptyState } from "@/lib/table-kit";
import type { MilestoneRecord, ProjectRecord } from "../types";

const STATUS_BAR: Record<string, string> = {
  planning: "bg-slate-400",
  active: "bg-blue-500",
  on_hold: "bg-amber-500",
  done: "bg-emerald-500",
};

const startOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const addMonths = (date: Date, delta: number) =>
  new Date(date.getFullYear(), date.getMonth() + delta, 1);

/**
 * Gantt strip: a shared month axis, one bar per project with its delivered
 * share shaded in, milestone diamonds pinned to their due dates and a today
 * marker. The window pans month by month so long portfolios stay readable.
 */
export function ProjectTimeline() {
  const locale = useLocale();
  const translate = useTranslate();
  const openChild = useOpenContextualChild();
  const [monthsShown, setMonthsShown] = useState(9);
  const [offset, setOffset] = useState(0);

  const { result, query } = useList<ProjectRecord>({
    resource: "hub_pj_projects",
    pagination: { mode: "server", currentPage: 1, pageSize: 300 },
    sorters: [{ field: "start_date", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const { result: milestoneResult } = useList<MilestoneRecord>({
    resource: "hub_pj_milestones",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const projects = useMemo(
    () => result.data.filter((project) => project.start_date && project.due_date),
    [result.data]
  );

  const milestonesByProject = useMemo(() => {
    const map = new Map<string, MilestoneRecord[]>();
    for (const milestone of milestoneResult.data) {
      const key = String(
        (milestone as MilestoneRecord & { hub_pj_ms_project_id?: string | number })
          .hub_pj_ms_project_id ?? milestone.project?.id ?? ""
      );
      if (!key || !milestone.due_date) continue;
      const bucket = map.get(key) ?? [];
      bucket.push(milestone);
      map.set(key, bucket);
    }
    return map;
  }, [milestoneResult.data]);

  // The visible window starts N months before today and runs `monthsShown`
  // long, so "now" is always in frame unless the user pans away.
  const window = useMemo(() => {
    const first = addMonths(startOfMonth(new Date()), offset - 2);
    const last = addMonths(first, monthsShown);
    return { min: first.getTime(), max: last.getTime(), first, monthsShown };
  }, [monthsShown, offset]);

  const months = useMemo(
    () =>
      Array.from({ length: window.monthsShown }, (_, index) =>
        addMonths(window.first, index)
      ),
    [window]
  );

  const pct = (time: number) =>
    ((time - window.min) / (window.max - window.min)) * 100;

  const visible = useMemo(
    () =>
      projects.filter((project) => {
        const start = new Date(project.start_date as string).getTime();
        const end = new Date(project.due_date as string).getTime();
        return end >= window.min && start <= window.max;
      }),
    [projects, window]
  );

  const todayPct = pct(new Date(todayIso()).getTime());

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>
              {translate("projects.timeline.title", { ns: "starter" }, "Project timeline")}
            </CardTitle>
            <CardDescription>
              {translate(
                "projects.timeline.desc",
                { ns: "starter" },
                "Schedule, delivered share and milestones across the portfolio."
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={translate("projects.timeline.back", { ns: "starter" }, "Earlier")}
              onClick={() => setOffset((value) => value - 1)}
            >
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOffset(0)}>
              {translate("projects.timeline.today", { ns: "starter" }, "Today")}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={translate("projects.timeline.forward", { ns: "starter" }, "Later")}
              onClick={() => setOffset((value) => value + 1)}
            >
              <ChevronRight />
            </Button>
            <select
              value={monthsShown}
              onChange={(event) => setMonthsShown(Number(event.currentTarget.value))}
              className="ml-1 h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs"
            >
              {[6, 9, 12, 18].map((count) => (
                <option key={count} value={count}>
                  {translate(
                    "projects.timeline.months",
                    { ns: "starter", count },
                    `${count} months`
                  )}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-6 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            title={translate(
              "projects.timeline.empty",
              { ns: "starter" },
              "No scheduled projects in this window"
            )}
            description={translate(
              "projects.timeline.emptyDesc",
              { ns: "starter" },
              "Pan the timeline or widen the range to see more."
            )}
          />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              {/* month axis */}
              <div className="flex items-center gap-3 pb-1">
                <span className="w-40 shrink-0" />
                <div className="relative flex-1">
                  <div className="flex">
                    {months.map((month) => (
                      <div
                        key={month.toISOString()}
                        className="flex-1 border-l border-border/60 px-1 text-[11px] text-muted-foreground"
                      >
                        {new Intl.DateTimeFormat(locale, {
                          month: "short",
                          year:
                            month.getMonth() === 0 ? "2-digit" : undefined,
                        }).format(month)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="relative space-y-2.5">
                {todayPct >= 0 && todayPct <= 100 ? (
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-primary/50"
                    style={{ left: `calc(10rem + 0.75rem + ${todayPct}%)` }}
                  />
                ) : null}

                {visible.map((project) => {
                  const start = new Date(project.start_date as string).getTime();
                  const end = new Date(project.due_date as string).getTime();
                  const left = Math.max(0, pct(start));
                  const right = Math.min(100, pct(end));
                  const width = Math.max(right - left, 1);
                  const milestones = milestonesByProject.get(String(project.id)) ?? [];
                  const status = project.status ?? "planning";
                  const overdue = status !== "done" && end < Date.now();

                  return (
                    <button
                      key={String(project.id)}
                      type="button"
                      onClick={() => openChild(`show/${project.id}`)}
                      className="group flex w-full items-center gap-3 text-left"
                      title={`${project.name} · ${formatDate(
                        project.start_date,
                        locale
                      )} – ${formatDate(project.due_date, locale)} · ${labelFor(
                        PROJECT_STATUSES,
                        status,
                        translate
                      )}`}
                    >
                      <span className="w-40 shrink-0 truncate text-xs font-medium group-hover:underline">
                        {project.name || "—"}
                      </span>
                      <span className="relative h-4 flex-1 rounded-full bg-muted/50">
                        <span
                          className={cn(
                            "absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full",
                            STATUS_BAR[status] ?? "bg-slate-400",
                            overdue && "ring-1 ring-red-500/60"
                          )}
                          style={{ left: `${left}%`, width: `${width}%` }}
                        />
                        {milestones.map((milestone) => {
                          const at = pct(
                            new Date(milestone.due_date as string).getTime()
                          );
                          if (at < 0 || at > 100) return null;
                          return (
                            <Diamond
                              key={String(milestone.id)}
                              className={cn(
                                "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2",
                                milestone.done
                                  ? "fill-emerald-500 text-emerald-600"
                                  : "fill-background text-muted-foreground"
                              )}
                              style={{ left: `${at}%` }}
                            />
                          );
                        })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
          {PROJECT_STATUSES.map((status) => (
            <span key={status.value} className="flex items-center gap-1.5">
              <span
                className={cn("h-2 w-4 rounded-full", STATUS_BAR[status.value])}
              />
              {labelFor(PROJECT_STATUSES, status.value, translate)}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <Diamond className="size-3 fill-emerald-500 text-emerald-600" />
            {translate(
              "projects.timeline.milestoneDone",
              { ns: "starter" },
              "Milestone reached"
            )}
          </span>
          <span className="flex items-center gap-1.5">
            <Diamond className="size-3 fill-background text-muted-foreground" />
            {translate(
              "projects.timeline.milestoneOpen",
              { ns: "starter" },
              "Milestone open"
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
