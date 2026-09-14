import { useList, useTranslate } from "@refinedev/core";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import {
  AlertTriangle,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flag,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Breadcrumb } from "@/components/app-shell/breadcrumb";
import { LoadingState } from "@/components/app-shell/loading-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  labelFor,
  TASK_PRIORITIES,
  TASK_STATUSES,
  todayIso,
  userLabel,
} from "../constants";
import { useOpenAbsolute } from "../route-surfaces";
import { useLocale } from "../shared";
import { EmptyState, ErrorState, KpiBar, useUrlState } from "@/lib/table-kit";
import type { MilestoneRecord, ProjectRecord, TaskRecord } from "../types";

const DAY_LOAD_THRESHOLD = 4;
const URL_DEFAULTS: Record<
  "project" | "assignee" | "priority" | "tasks" | "milestones",
  string
> = {
  project: "",
  assignee: "",
  priority: "",
  tasks: "1",
  milestones: "1",
};

const TASK_DOT: Record<string, string> = {
  todo: "bg-slate-400",
  in_progress: "bg-blue-500",
  review: "bg-violet-500",
  done: "bg-emerald-500",
};

type CalendarTaskEvent = {
  kind: "task";
  id: string | number;
  date: string;
  title: string;
  status: string;
};

type CalendarMilestoneEvent = {
  kind: "milestone";
  id: string | number;
  date: string;
  title: string;
  done: boolean;
};

type CalendarEvent = CalendarTaskEvent | CalendarMilestoneEvent;

const isCompleted = (event: CalendarEvent) =>
  event.kind === "task" ? event.status === "done" : event.done;

const isOverdue = (event: CalendarEvent, today: string) =>
  event.date < today && !isCompleted(event);

const taskProjectId = (task: TaskRecord) =>
  String(
    (task as TaskRecord & { hub_pj_task_project_id?: string | number })
      .hub_pj_task_project_id ?? task.project?.id ?? ""
  );

const milestoneProjectId = (milestone: MilestoneRecord) =>
  String(
    (
      milestone as MilestoneRecord & {
        hub_pj_ms_project_id?: string | number;
      }
    ).hub_pj_ms_project_id ?? milestone.project?.id ?? ""
  );

export function ProjectCalendarPage() {
  const locale = useLocale();
  const translate = useTranslate();
  const openAbsolute = useOpenAbsolute();
  const [cursor, setCursor] = useState(() => new Date());
  const { state, setState, reset } = useUrlState(URL_DEFAULTS);
  const dateFnsLocale = locale?.startsWith("zh") ? zhCN : enUS;

  const { result: taskResult, query: taskQuery } = useList<TaskRecord>({
    resource: "hub_pj_tasks",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    meta: { appends: ["project", "assignee"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const { result: msResult, query: msQuery } = useList<MilestoneRecord>({
    resource: "hub_pj_milestones",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    meta: { appends: ["project"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const { result: projectResult, query: projectQuery } = useList<ProjectRecord>({
    resource: "hub_pj_projects",
    pagination: { mode: "server", currentPage: 1, pageSize: 300 },
    sorters: [{ field: "name", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const isLoading =
    taskQuery.isLoading || msQuery.isLoading || projectQuery.isLoading;
  const isError = taskQuery.isError || msQuery.isError || projectQuery.isError;
  const today = todayIso();

  const assigneeOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const task of taskResult.data) {
      if (task.assignee?.id == null) continue;
      options.set(String(task.assignee.id), userLabel(task.assignee));
    }
    return [...options.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, locale));
  }, [locale, taskResult.data]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    const push = (key: string, event: CalendarEvent) => {
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    };

    if (state.tasks !== "0") {
      for (const task of taskResult.data) {
        if (!task.due_date) continue;
        if (state.project && taskProjectId(task) !== state.project) continue;
        if (
          state.assignee &&
          String(task.assignee?.id ?? "") !== state.assignee
        ) {
          continue;
        }
        if (state.priority && task.priority !== state.priority) continue;
        push(task.due_date, {
          kind: "task",
          id: task.id,
          date: task.due_date,
          title: task.title || "—",
          status: task.status || "todo",
        });
      }
    }

    if (state.milestones !== "0") {
      for (const milestone of msResult.data) {
        if (!milestone.due_date) continue;
        if (
          state.project &&
          milestoneProjectId(milestone) !== state.project
        ) {
          continue;
        }
        push(milestone.due_date, {
          kind: "milestone",
          id: milestone.id,
          date: milestone.due_date,
          title: milestone.name || "—",
          done: Boolean(milestone.done),
        });
      }
    }

    return map;
  }, [msResult.data, state, taskResult.data]);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const monthEvents = monthDays.flatMap(
    (day) => eventsByDay.get(format(day, "yyyy-MM-dd")) ?? []
  );
  const busiest = monthDays.reduce<{ date: Date; count: number } | null>(
    (top, day) => {
      const count = eventsByDay.get(format(day, "yyyy-MM-dd"))?.length ?? 0;
      return !top || count > top.count ? { date: day, count } : top;
    },
    null
  );
  const weekdayLabels = eachDayOfInterval({
    start: gridStart,
    end: endOfWeek(gridStart, { weekStartsOn: 1 }),
  });
  const completedCount = monthEvents.filter(isCompleted).length;
  const overdueCount = monthEvents.filter((event) => isOverdue(event, today)).length;
  const milestoneCount = monthEvents.filter(
    (event) => event.kind === "milestone"
  ).length;

  const openEvent = (event: CalendarEvent) => {
    openAbsolute(
      event.kind === "task"
        ? `/tasks/show/${event.id}`
        : `/milestones/show/${event.id}`
    );
  };

  const retry = () => {
    void taskQuery.refetch();
    void msQuery.refetch();
    void projectQuery.refetch();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center text-muted-foreground">
          <Breadcrumb />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-3xl font-semibold tracking-[-0.035em]">
              <CalendarDays className="size-7 text-muted-foreground" />
              {translate("projects.calendar.title", { ns: "starter" }, "Project calendar")}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {translate(
                "projects.calendar.subtitle",
                { ns: "starter" },
                "Task due dates and milestones across every project."
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCursor((d) => subMonths(d, 1))}>
              <ChevronLeft />
            </Button>
            <span className="min-w-32 text-center text-sm font-medium tabular-nums">
              {format(cursor, "MMMM yyyy", { locale: dateFnsLocale })}
            </span>
            <Button variant="outline" size="icon" onClick={() => setCursor((d) => addMonths(d, 1))}>
              <ChevronRight />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
              {translate("projects.calendar.today", { ns: "starter" }, "Today")}
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <LoadingState className="min-h-64" />
      ) : isError ? (
        <ErrorState i18nPrefix="projects.toolkit"
          onRetry={retry}
          title={translate(
            "projects.calendar.error.title",
            { ns: "starter" },
            "Unable to load the calendar"
          )}
          description={translate(
            "projects.calendar.error.desc",
            { ns: "starter" },
            "Check your connection and try again."
          )}
        />
      ) : (
        <>
          <KpiBar
            items={[
              {
                key: "items",
                label: translate(
                  "projects.calendar.kpi.items",
                  { ns: "starter" },
                  "Items this month"
                ),
                value: String(monthEvents.length),
                icon: <CalendarCheck className="size-4" />,
                tone: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
              },
              {
                key: "overdue",
                label: translate(
                  "projects.calendar.kpi.overdue",
                  { ns: "starter" },
                  "Overdue"
                ),
                value: String(overdueCount),
                icon: <AlertTriangle className="size-4" />,
                tone: "bg-red-500/15 text-red-700 dark:text-red-300",
              },
              {
                key: "milestones",
                label: translate(
                  "projects.calendar.kpi.milestones",
                  { ns: "starter" },
                  "Milestones due"
                ),
                value: String(milestoneCount),
                icon: <Flag className="size-4" />,
                tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
              },
              {
                key: "completed",
                label: translate(
                  "projects.calendar.kpi.completed",
                  { ns: "starter" },
                  "Completed"
                ),
                value: String(completedCount),
                icon: <CheckCircle2 className="size-4" />,
                tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
              },
            ]}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={state.project}
                onChange={(event) =>
                  setState({ project: event.currentTarget.value })
                }
                className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs"
              >
                <option value="">
                  {translate(
                    "projects.calendar.filters.allProjects",
                    { ns: "starter" },
                    "All projects"
                  )}
                </option>
                {projectResult.data
                  .filter((project) => project.name)
                  .map((project) => (
                    <option key={String(project.id)} value={String(project.id)}>
                      {project.name}
                    </option>
                  ))}
              </select>
              <select
                value={state.assignee}
                onChange={(event) =>
                  setState({ assignee: event.currentTarget.value })
                }
                className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs"
              >
                <option value="">
                  {translate(
                    "projects.calendar.filters.allAssignees",
                    { ns: "starter" },
                    "All assignees"
                  )}
                </option>
                {assigneeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={state.priority}
                onChange={(event) =>
                  setState({ priority: event.currentTarget.value })
                }
                className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs"
              >
                <option value="">
                  {translate(
                    "projects.calendar.filters.allPriorities",
                    { ns: "starter" },
                    "All priorities"
                  )}
                </option>
                {TASK_PRIORITIES.map((priority) => (
                  <option key={priority.value} value={priority.value}>
                    {labelFor(TASK_PRIORITIES, priority.value, translate)}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                variant={state.tasks !== "0" ? "secondary" : "outline"}
                className="rounded-full"
                aria-pressed={state.tasks !== "0"}
                onClick={() =>
                  setState({ tasks: state.tasks !== "0" ? "0" : "1" })
                }
              >
                {translate(
                  "projects.calendar.filters.tasks",
                  { ns: "starter" },
                  "Tasks"
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={state.milestones !== "0" ? "secondary" : "outline"}
                className="rounded-full"
                aria-pressed={state.milestones !== "0"}
                onClick={() =>
                  setState({
                    milestones: state.milestones !== "0" ? "0" : "1",
                  })
                }
              >
                {translate(
                  "projects.calendar.filters.milestones",
                  { ns: "starter" },
                  "Milestones"
                )}
              </Button>
            </div>
            {busiest && busiest.count > 0 ? (
              <p
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium",
                  busiest.count >= DAY_LOAD_THRESHOLD
                    ? "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400"
                    : "border-border text-muted-foreground"
                )}
              >
                <CalendarDays className="size-3.5" />
                {translate(
                  "projects.calendar.busiest",
                  {
                    ns: "starter",
                    count: busiest.count,
                    date: format(busiest.date, "PPP", {
                      locale: dateFnsLocale,
                    }),
                  },
                  `Busiest day: ${format(busiest.date, "PPP", {
                    locale: dateFnsLocale,
                  })} · ${busiest.count} items`
                )}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            {TASK_STATUSES.map((status) => (
              <span key={status.value} className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", TASK_DOT[status.value])} />
                {translate(status.i18nKey, { ns: "starter" }, status.label)}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <Flag className="size-3 text-amber-500" />
              {translate("projects.resources.milestone", { ns: "starter" }, "Milestone")}
            </span>
          </div>

          {monthEvents.length === 0 ? (
            <EmptyState
              title={translate(
                "projects.calendar.empty.title",
                { ns: "starter" },
                "No items this month"
              )}
              description={translate(
                "projects.calendar.empty.desc",
                { ns: "starter" },
                "No task due dates or milestones match the current filters."
              )}
              icon={<CalendarDays className="size-8" />}
              action={
                <Button variant="outline" size="sm" onClick={reset}>
                  {translate(
                    "projects.toolkit.resetFilters",
                    { ns: "starter" },
                    "Reset"
                  )}
                </Button>
              }
            />
          ) : (
            <Card>
              <CardContent className="p-2 sm:p-3">
                <div className="overflow-x-auto">
                  <div className="min-w-[640px]">
                    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-t-lg border border-b-0 bg-border">
                      {weekdayLabels.map((day) => (
                        <div
                          key={day.toISOString()}
                          className="bg-muted/50 px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
                        >
                          {format(day, "EEE", { locale: dateFnsLocale })}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-b-lg border bg-border">
                      {days.map((day) => {
                        const key = format(day, "yyyy-MM-dd");
                        const events = eventsByDay.get(key) ?? [];
                        const inMonth = isSameMonth(day, cursor);
                        const isToday = key === today;
                        return (
                          <div
                            key={key}
                            className={cn(
                              "flex min-h-28 flex-col gap-1 bg-card p-1.5",
                              !inMonth &&
                                "bg-muted/20 text-muted-foreground/50",
                              inMonth &&
                                events.length >= DAY_LOAD_THRESHOLD &&
                                "bg-amber-500/5 ring-1 ring-inset ring-amber-500/30"
                            )}
                          >
                            <span className="flex items-center justify-between gap-1">
                              <span
                                className={cn(
                                  "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                                  isToday
                                    ? "bg-primary font-semibold text-primary-foreground"
                                    : inMonth
                                      ? "text-foreground"
                                      : "text-muted-foreground/40"
                                )}
                              >
                                {format(day, "d")}
                              </span>
                              {inMonth && events.length > 0 ? (
                                <span
                                  className={cn(
                                    "min-w-5 rounded-full bg-muted px-1.5 py-0.5 text-center text-[10px] font-medium text-muted-foreground tabular-nums",
                                    events.length >= DAY_LOAD_THRESHOLD &&
                                      "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                  )}
                                >
                                  {events.length}
                                </span>
                              ) : null}
                            </span>
                            <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
                              {events.map((event) => {
                                const completed = isCompleted(event);
                                const overdue = isOverdue(event, today);
                                return (
                                  <button
                                    key={`${event.kind}-${String(event.id)}`}
                                    type="button"
                                    onClick={() => openEvent(event)}
                                    title={event.title}
                                    className={cn(
                                      "flex items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] font-medium hover:opacity-80",
                                      completed
                                        ? "bg-muted/60 text-muted-foreground line-through"
                                        : overdue
                                          ? "bg-red-500/15 text-red-700 dark:text-red-300"
                                          : event.kind === "task"
                                            ? "bg-muted"
                                            : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                    )}
                                  >
                                    {event.kind === "task" ? (
                                      <span
                                        className={cn(
                                          "size-1.5 shrink-0 rounded-full",
                                          TASK_DOT[event.status]
                                        )}
                                      />
                                    ) : (
                                      <Flag className="size-2.5 shrink-0" />
                                    )}
                                    <span className="truncate">{event.title}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
