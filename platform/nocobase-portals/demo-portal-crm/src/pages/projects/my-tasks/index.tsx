import {
  useGetIdentity,
  useList,
  useTranslate,
  useUpdate,
} from "@refinedev/core";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Circle,
  ListChecks,
  User,
} from "lucide-react";
import { useCallback, useMemo } from "react";
import { Breadcrumb } from "@/components/app-shell/breadcrumb";
import { LoadingState } from "@/components/app-shell/loading-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  formatDate,
  labelFor,
  todayIso,
} from "../constants";
import { useOpenAbsolute } from "../route-surfaces";
import { PriorityPill, useLocale } from "../shared";
import {
  EmptyState,
  ErrorState,
  ExportCsvButton,
  KpiBar,
  Toolbar,
  ToolbarSearch,
  downloadCsv,
  useUrlState,
} from "@/lib/table-kit";
import type { ProjectRecord, TaskRecord } from "../types";
import { taskTransitionValues } from "../transitions";

const COLUMN_ACCENT: Record<string, string> = {
  todo: "bg-slate-400",
  in_progress: "bg-blue-500",
  review: "bg-violet-500",
  done: "bg-emerald-500",
};

const NEXT_STATUS: Record<string, string> = {
  todo: "in_progress",
  in_progress: "review",
  review: "done",
  done: "todo",
};

const URL_DEFAULTS: Record<"q" | "project" | "priority" | "due", string> = {
  q: "",
  project: "",
  priority: "",
  due: "",
};

const inDaysIso = (today: string, days: number) =>
  new Date(Date.parse(today) + days * 86400000).toISOString().slice(0, 10);

export function MyTasksPage() {
  const locale = useLocale();
  const translate = useTranslate();
  const openAbsolute = useOpenAbsolute();
  const { mutate: updateTask } = useUpdate<TaskRecord>();
  const { data: identity, isLoading: identityLoading } = useGetIdentity<{
    id?: string | number;
  }>();
  const currentUserId = identity?.id;
  const { state, setState, reset } = useUrlState(URL_DEFAULTS);
  const today = todayIso();
  const weekEnd = inDaysIso(today, 7);

  const { result, query } = useList<TaskRecord>({
    resource: "hub_pj_tasks",
    pagination: { mode: "server", currentPage: 1, pageSize: 300 },
    meta: { appends: ["project", "assignee"] },
    filters: [
      {
        field: "hub_pj_task_assignee_id",
        operator: "eq",
        value: currentUserId,
      },
    ],
    errorNotification: false,
    queryOptions: { enabled: Boolean(currentUserId), retry: false },
  });

  const { result: projectResult } = useList<ProjectRecord>({
    resource: "hub_pj_projects",
    pagination: { mode: "server", currentPage: 1, pageSize: 300 },
    sorters: [{ field: "name", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const term = state.q.trim().toLowerCase();
  const filteredTasks = useMemo(
    () =>
      result.data.filter((task) => {
        if (term && !(task.title ?? "").toLowerCase().includes(term)) {
          return false;
        }
        if (state.project) {
          const projectId = String(
            (task as TaskRecord & {
              hub_pj_task_project_id?: string | number;
            }).hub_pj_task_project_id ?? task.project?.id ?? ""
          );
          if (projectId !== state.project) return false;
        }
        if (state.priority && (task.priority ?? "") !== state.priority) {
          return false;
        }
        if (
          state.due === "overdue" &&
          !(
            task.status !== "done" &&
            Boolean(task.due_date) &&
            task.due_date! < today
          )
        ) {
          return false;
        }
        if (
          state.due === "week" &&
          !(
            task.status !== "done" &&
            Boolean(task.due_date) &&
            task.due_date! >= today &&
            task.due_date! <= weekEnd
          )
        ) {
          return false;
        }
        return true;
      }),
    [result.data, state, term, today, weekEnd]
  );

  const grouped = useMemo(() => {
    const buckets: Record<string, TaskRecord[]> = {
      todo: [],
      in_progress: [],
      review: [],
      done: [],
    };
    for (const task of filteredTasks) {
      const status =
        task.status && buckets[task.status] ? task.status : "todo";
      buckets[status].push(task);
    }
    const byDue = (a: TaskRecord, b: TaskRecord) =>
      (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
    Object.values(buckets).forEach((bucket) => bucket.sort(byDue));
    return buckets;
  }, [filteredTasks]);

  const summary = useMemo(() => {
    const open = result.data.filter((task) => task.status !== "done");
    return {
      open: open.length,
      overdue: open.filter(
        (task) => Boolean(task.due_date) && task.due_date! < today
      ).length,
      week: open.filter(
        (task) =>
          Boolean(task.due_date) &&
          task.due_date! >= today &&
          task.due_date! <= weekEnd
      ).length,
      done: result.data.filter((task) => task.status === "done").length,
    };
  }, [result.data, today, weekEnd]);

  const handleExport = useCallback(() => {
    downloadCsv(
      `my-tasks-${today}.csv`,
      [
        translate("projects.tasks.columns.task", { ns: "starter" }, "Task"),
        translate("projects.tasks.columns.project", { ns: "starter" }, "Project"),
        translate("projects.tasks.columns.priority", { ns: "starter" }, "Priority"),
        translate("projects.tasks.columns.status", { ns: "starter" }, "Status"),
        translate("projects.tasks.columns.due", { ns: "starter" }, "Due date"),
      ],
      filteredTasks.map((task) => [
        task.title ?? "",
        task.project?.name ?? "",
        labelFor(TASK_PRIORITIES, task.priority, translate),
        labelFor(TASK_STATUSES, task.status ?? "todo", translate),
        task.due_date ?? "",
      ])
    );
  }, [filteredTasks, today, translate]);

  const advanceTask = useCallback(
    (task: TaskRecord) => {
      const current = task.status ?? "todo";
      updateTask({
        resource: "hub_pj_tasks",
        id: task.id,
        values: taskTransitionValues(
          NEXT_STATUS[current] ?? "in_progress",
          task
        ),
        successNotification: false,
        invalidates: ["list"],
      });
    },
    [updateTask]
  );

  const totalCount = result.data.length;
  const isLoading = identityLoading || (Boolean(currentUserId) && query.isLoading);
  const hasFilters = Boolean(
    state.q || state.project || state.priority || state.due
  );

  const kpiItems = [
    {
      key: "open",
      label: translate(
        "projects.myTasks.kpi.open",
        { ns: "starter" },
        "Open"
      ),
      value: String(summary.open),
      hint: translate(
        "projects.myTasks.kpi.openHint",
        { ns: "starter", overdue: summary.overdue },
        `${summary.overdue} overdue`
      ),
      icon: <Circle className="size-4" />,
      tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
    },
    {
      key: "overdue",
      label: translate(
        "projects.myTasks.kpi.overdue",
        { ns: "starter" },
        "Overdue"
      ),
      value: String(summary.overdue),
      hint: translate(
        "projects.myTasks.kpi.overdueHint",
        { ns: "starter", open: summary.open },
        `${summary.open} open tasks`
      ),
      icon: <AlertTriangle className="size-4" />,
      tone: "text-red-600 bg-red-500/12 dark:text-red-400",
      active: state.due === "overdue",
      onClick: () => setState({ due: state.due === "overdue" ? "" : "overdue" }),
    },
    {
      key: "week",
      label: translate(
        "projects.myTasks.kpi.week",
        { ns: "starter" },
        "Due this week"
      ),
      value: String(summary.week),
      hint: translate(
        "projects.myTasks.kpi.weekHint",
        { ns: "starter", days: 7 },
        "Next 7 days"
      ),
      icon: <CalendarClock className="size-4" />,
      tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
      active: state.due === "week",
      onClick: () => setState({ due: state.due === "week" ? "" : "week" }),
    },
    {
      key: "done",
      label: translate(
        "projects.myTasks.kpi.done",
        { ns: "starter" },
        "Done"
      ),
      value: String(summary.done),
      hint: translate(
        "projects.myTasks.kpi.doneHint",
        { ns: "starter", total: totalCount },
        `${totalCount} assigned tasks`
      ),
      icon: <CheckCircle2 className="size-4" />,
      tone: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-400",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center text-muted-foreground">
          <Breadcrumb />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-3xl font-semibold tracking-[-0.035em]">
              <ListChecks className="size-7 text-muted-foreground" />
              {translate("projects.myTasks.title", { ns: "starter" }, "My tasks")}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {translate(
                "projects.myTasks.subtitle",
                { ns: "starter" },
                "Everything currently assigned to you, grouped by status."
              )}
            </p>
          </div>
          {totalCount > 0 ? (
            <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {translate(
                "projects.myTasks.totalCount",
                { ns: "starter", count: totalCount },
                `${totalCount} assigned`
              )}
            </span>
          ) : null}
        </div>
      </div>

      <KpiBar items={kpiItems} />

      <Toolbar>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <ToolbarSearch i18nPrefix="projects.toolkit"
            value={state.q}
            onChange={(value) => setState({ q: value })}
            placeholder={translate(
              "projects.myTasks.searchPlaceholder",
              { ns: "starter" },
              "Search my tasks..."
            )}
          />
          <select
            value={state.project}
            onChange={(event) => setState({ project: event.currentTarget.value })}
            className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs"
          >
            <option value="">
              {translate(
                "projects.board.allProjects",
                { ns: "starter" },
                "All projects"
              )}
            </option>
            {projectResult.data.map((project) => (
              <option key={String(project.id)} value={String(project.id)}>
                {project.name}
              </option>
            ))}
          </select>
          <select
            value={state.priority}
            onChange={(event) => setState({ priority: event.currentTarget.value })}
            className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs"
          >
            <option value="">
              {translate(
                "projects.board.allPriorities",
                { ns: "starter" },
                "Any priority"
              )}
            </option>
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority.value} value={priority.value}>
                {labelFor(TASK_PRIORITIES, priority.value, translate)}
              </option>
            ))}
          </select>
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => reset()}
            >
              {translate(
                "projects.toolkit.resetFilters",
                { ns: "starter" },
                "Reset"
              )}
            </Button>
          ) : null}
        </div>
        <ExportCsvButton i18nPrefix="projects.toolkit" onExport={handleExport} />
      </Toolbar>

      {isLoading ? (
        <LoadingState className="min-h-64" />
      ) : query.isError ? (
        <ErrorState i18nPrefix="projects.toolkit"
          title={translate(
            "projects.myTasks.error.title",
            { ns: "starter" },
            "Unable to load your tasks"
          )}
          description={translate(
            "projects.myTasks.error.desc",
            { ns: "starter" },
            "Check your connection and try again."
          )}
          onRetry={() => query.refetch()}
        />
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          title={translate(
            "projects.myTasks.empty.title",
            { ns: "starter" },
            "Nothing assigned to you"
          )}
          description={translate(
            hasFilters
              ? "projects.myTasks.empty.filteredDesc"
              : "projects.myTasks.empty.desc",
            { ns: "starter" },
            hasFilters
              ? "No assigned tasks match the current filters."
              : "Tasks assigned to you across every project will show up here."
          )}
          icon={<ListChecks className="size-8" />}
          action={
            <Button variant="outline" size="sm" onClick={() => reset()}>
              {translate(
                "projects.toolkit.resetFilters",
                { ns: "starter" },
                "Reset"
              )}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {TASK_STATUSES.map((status) => {
            const tasks = grouped[status.value] ?? [];
            return (
              <div
                key={status.value}
                className="flex min-h-72 flex-col rounded-xl border bg-muted/25"
              >
                <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        COLUMN_ACCENT[status.value]
                      )}
                    />
                    <span className="text-sm font-semibold">
                      {translate(status.i18nKey, { ns: "starter" }, status.label)}
                    </span>
                  </div>
                  <span className="rounded-md bg-background px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                    {tasks.length}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
                  {tasks.length === 0 ? (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                      {translate(
                        "projects.myTasks.columnEmpty",
                        { ns: "starter" },
                        "Nothing here"
                      )}
                    </p>
                  ) : (
                    tasks.map((task) => (
                      <MyTaskCard
                        key={String(task.id)}
                        task={task}
                        locale={locale}
                        onOpen={() => openAbsolute(`/tasks/show/${task.id}`)}
                        onAdvance={() => advanceTask(task)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MyTaskCard({
  task,
  locale,
  onOpen,
  onAdvance,
}: {
  task: TaskRecord;
  locale: string;
  onOpen: () => void;
  onAdvance: () => void;
}) {
  const translate = useTranslate();
  const isOverdue =
    task.status !== "done" &&
    Boolean(task.due_date) &&
    (task.due_date as string) < todayIso();
  const currentStatus = task.status ?? "todo";
  const nextStatus = NEXT_STATUS[currentStatus] ?? "in_progress";
  const nextLabel = labelFor(TASK_STATUSES, nextStatus, translate);
  const actionLabel =
    currentStatus === "done"
      ? translate(
          "projects.myTasks.reopen",
          { ns: "starter" },
          "Reopen"
        )
      : translate(
          "projects.myTasks.moveToStatus",
          { ns: "starter", status: nextLabel },
          `Move to ${nextLabel}`
        );

  return (
    <div className="group flex flex-col gap-2 rounded-lg border bg-card p-3 text-left shadow-xs transition-shadow hover:shadow-sm">
      <button type="button" onClick={onOpen} className="flex flex-col gap-2 text-left">
        <span className="line-clamp-2 text-sm font-medium underline-offset-2 group-hover:underline">
          {task.title || "—"}
        </span>
        {task.project?.name ? (
          <span className="truncate text-xs text-muted-foreground">
            {task.project.name}
          </span>
        ) : null}
      </button>
      <div className="flex items-center justify-between gap-2">
        <PriorityPill value={task.priority} />
        {task.due_date ? (
          <span
            className={cn(
              "flex items-center gap-1 text-xs tabular-nums",
              isOverdue
                ? "font-medium text-red-600 dark:text-red-400"
                : "text-muted-foreground"
            )}
          >
            <CalendarClock className="size-3" />
            {formatDate(task.due_date, locale)}
          </span>
        ) : null}
      </div>
      {!task.assignee ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
          <User className="size-3.5" />
          {translate("projects.board.unassigned", { ns: "starter" }, "Unassigned")}
        </div>
      ) : null}
      <Button
        variant="ghost"
        size="xs"
        className="self-start text-muted-foreground"
        onClick={onAdvance}
      >
        {actionLabel}
      </Button>
    </div>
  );
}
