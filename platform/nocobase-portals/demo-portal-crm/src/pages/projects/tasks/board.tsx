import { useGetIdentity, useList, useTranslate, useUpdate } from "@refinedev/core";
import { CalendarClock, Plus, User } from "lucide-react";
import { useMemo, useState } from "react";
import { LoadingState } from "@/components/app-shell/loading-state";
import { Breadcrumb } from "@/components/app-shell/breadcrumb";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  formatDate,
  labelFor,
  todayIso,
  userLabel,
} from "../constants";
import { PriorityPill, useLocale } from "../shared";
import { useOpenContextualChild } from "../route-surfaces";
import {
  EmptyState,
  ErrorState,
  KpiBar,
  Toolbar,
  ToolbarSearch,
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

const URL_DEFAULTS: Record<
  "q" | "project" | "assignee" | "priority" | "group",
  string
> = {
  q: "",
  project: "",
  assignee: "",
  priority: "",
  group: "status",
};

type Grouping = "status" | "assignee" | "priority" | "project";

/** A single board column: a bucket key plus the tasks that landed in it. */
type Bucket = {
  key: string;
  label: string;
  accent: string;
  tasks: TaskRecord[];
  /** Only status columns accept drops — the other groupings are read-only. */
  droppable: boolean;
};

type Identity = { id?: string | number };

export function TaskBoardPage() {
  const locale = useLocale();
  const translate = useTranslate();
  const openChild = useOpenContextualChild();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const { mutate: updateTask } = useUpdate<TaskRecord>();
  const { data: identity } = useGetIdentity<Identity>();
  const { state, setState, reset } = useUrlState(URL_DEFAULTS);

  const { result, query } = useList<TaskRecord>({
    resource: "hub_pj_tasks",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    meta: { appends: ["project", "assignee"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const { result: projectResult } = useList<ProjectRecord>({
    resource: "hub_pj_projects",
    pagination: { mode: "server", currentPage: 1, pageSize: 300 },
    sorters: [{ field: "name", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const grouping = (state.group as Grouping) ?? "status";
  const term = state.q.trim().toLowerCase();
  const today = todayIso();

  const tasks = useMemo(
    () =>
      result.data.filter((task) => {
        if (term && !(task.title ?? "").toLowerCase().includes(term)) return false;
        if (
          state.project &&
          String(
            (task as TaskRecord & { hub_pj_task_project_id?: string | number })
              .hub_pj_task_project_id ?? task.project?.id ?? ""
          ) !== state.project
        ) {
          return false;
        }
        if (state.priority && (task.priority ?? "") !== state.priority) return false;
        if (state.assignee === "me") {
          const assigneeId = String(
            (task as TaskRecord & { hub_pj_task_assignee_id?: string | number })
              .hub_pj_task_assignee_id ?? task.assignee?.id ?? ""
          );
          if (assigneeId !== String(identity?.id ?? "")) return false;
        }
        if (state.assignee === "unassigned" && task.assignee) return false;
        return true;
      }),
    [identity?.id, result.data, state, term]
  );

  const summary = useMemo(() => {
    const open = tasks.filter((task) => task.status !== "done");
    return {
      total: tasks.length,
      open: open.length,
      overdue: open.filter((task) => (task.due_date ?? "") && task.due_date! < today)
        .length,
      unassigned: open.filter((task) => !task.assignee).length,
    };
  }, [tasks, today]);

  const unassignedLabel = translate(
    "projects.board.unassigned",
    { ns: "starter" },
    "Unassigned"
  );
  const noProjectLabel = translate(
    "projects.board.noProject",
    { ns: "starter" },
    "No project"
  );

  const buckets = useMemo<Bucket[]>(() => {
    const byDue = (a: TaskRecord, b: TaskRecord) =>
      (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");

    if (grouping === "status") {
      return TASK_STATUSES.map((status) => ({
        key: status.value,
        label: translate(status.i18nKey, { ns: "starter" }, status.label),
        accent: COLUMN_ACCENT[status.value],
        droppable: true,
        tasks: tasks
          .filter((task) => (task.status ?? "todo") === status.value)
          .sort(byDue),
      }));
    }

    if (grouping === "priority") {
      return [...TASK_PRIORITIES]
        .reverse()
        .map((priority) => ({
          key: priority.value,
          label: labelFor(TASK_PRIORITIES, priority.value, translate),
          accent:
            priority.value === "high"
              ? "bg-red-500"
              : priority.value === "med"
                ? "bg-sky-500"
                : "bg-slate-400",
          droppable: false,
          tasks: tasks
            .filter((task) => (task.priority ?? "low") === priority.value)
            .sort(byDue),
        }));
    }

    const groups = new Map<string, { label: string; tasks: TaskRecord[] }>();
    for (const task of tasks) {
      const key =
        grouping === "assignee"
          ? String(task.assignee?.id ?? "")
          : String(task.project?.id ?? "");
      const label =
        grouping === "assignee"
          ? task.assignee
            ? userLabel(task.assignee)
            : unassignedLabel
          : (task.project?.name ?? noProjectLabel);
      const entry = groups.get(key) ?? { label, tasks: [] };
      entry.tasks.push(task);
      groups.set(key, entry);
    }
    return [...groups.entries()]
      .map(([key, entry]) => ({
        key,
        label: entry.label,
        accent: "bg-primary/60",
        droppable: false,
        tasks: entry.tasks.sort(byDue),
      }))
      .sort((a, b) => b.tasks.length - a.tasks.length)
      .slice(0, 12);
  }, [grouping, noProjectLabel, tasks, translate, unassignedLabel]);

  const moveTask = (task: TaskRecord, status: string) => {
    if (task.status === status) return;
    updateTask({
      resource: "hub_pj_tasks",
      id: task.id,
      values: taskTransitionValues(status, task),
    });
  };

  const groupings: Array<{ value: Grouping; label: string }> = [
    {
      value: "status",
      label: translate("projects.board.group.status", { ns: "starter" }, "Status"),
    },
    {
      value: "assignee",
      label: translate("projects.board.group.assignee", { ns: "starter" }, "Assignee"),
    },
    {
      value: "priority",
      label: translate("projects.board.group.priority", { ns: "starter" }, "Priority"),
    },
    {
      value: "project",
      label: translate("projects.board.group.project", { ns: "starter" }, "Project"),
    },
  ];

  const kpiItems = [
    {
      key: "open",
      label: translate("projects.board.kpi.open", { ns: "starter" }, "Open tasks"),
      value: String(summary.open),
      hint: translate(
        "projects.board.kpi.openHint",
        { ns: "starter", total: summary.total },
        `${summary.total} in view`
      ),
      tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
    },
    {
      key: "overdue",
      label: translate("projects.board.kpi.overdue", { ns: "starter" }, "Overdue"),
      value: String(summary.overdue),
      hint: translate(
        "projects.board.kpi.overdueHint",
        { ns: "starter" },
        "Past their due date"
      ),
      tone: "text-red-600 bg-red-500/12 dark:text-red-400",
    },
    {
      key: "unassigned",
      label: unassignedLabel,
      value: String(summary.unassigned),
      hint: translate(
        "projects.board.kpi.unassignedHint",
        { ns: "starter" },
        "Nobody picked these up"
      ),
      tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
      active: state.assignee === "unassigned",
      onClick: () =>
        setState({
          assignee: state.assignee === "unassigned" ? "" : "unassigned",
        }),
    },
    {
      key: "mine",
      label: translate("projects.board.kpi.mine", { ns: "starter" }, "Assigned to me"),
      value: String(
        tasks.filter(
          (task) => String(task.assignee?.id ?? "") === String(identity?.id ?? "")
        ).length
      ),
      hint: translate("projects.board.kpi.mineHint", { ns: "starter" }, "In this view"),
      tone: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-400",
      active: state.assignee === "me",
      onClick: () =>
        setState({ assignee: state.assignee === "me" ? "" : "me" }),
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
            <h2 className="text-3xl font-semibold tracking-[-0.035em]">
              {translate("projects.board.title", { ns: "starter" }, "Task board")}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {translate(
                "projects.board.subtitle",
                { ns: "starter" },
                "Drag a card between status columns to move it through the workflow."
              )}
            </p>
          </div>
          <Button onClick={() => openChild("create")}>
            <Plus />
            {translate("projects.board.newTask", { ns: "starter" }, "New task")}
          </Button>
        </div>
      </div>

      <KpiBar items={kpiItems} />

      <Toolbar>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <ToolbarSearch i18nPrefix="projects.toolkit"
            value={state.q}
            onChange={(value) => setState({ q: value })}
            placeholder={translate(
              "projects.board.search",
              { ns: "starter" },
              "Search tasks..."
            )}
          />
          <select
            value={state.project}
            onChange={(event) => setState({ project: event.currentTarget.value })}
            className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs"
          >
            <option value="">
              {translate("projects.board.allProjects", { ns: "starter" }, "All projects")}
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
          {state.q || state.project || state.priority || state.assignee ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => reset()}
            >
              {translate("projects.toolkit.resetFilters", { ns: "starter" }, "Reset")}
            </Button>
          ) : null}
        </div>
        <Tabs
          value={grouping}
          onValueChange={(value) => setState({ group: value })}
        >
          <TabsList>
            {groupings.map((option) => (
              <TabsTrigger key={option.value} value={option.value}>
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </Toolbar>

      {query.isError ? (
        <ErrorState i18nPrefix="projects.toolkit" onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <LoadingState className="min-h-64" />
      ) : buckets.every((bucket) => bucket.tasks.length === 0) ? (
        <EmptyState
          title={translate(
            "projects.board.empty.title",
            { ns: "starter" },
            "No tasks match these filters"
          )}
          description={translate(
            "projects.board.empty.desc",
            { ns: "starter" },
            "Clear the filters or create a task to get started."
          )}
          action={
            <Button variant="outline" size="sm" onClick={() => reset()}>
              {translate("projects.toolkit.resetFilters", { ns: "starter" }, "Reset")}
            </Button>
          }
        />
      ) : (
        <div
          className={cn(
            "grid grid-cols-1 gap-4 md:grid-cols-2",
            buckets.length <= 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"
          )}
        >
          {buckets.map((bucket) => (
            <div
              key={bucket.key || "none"}
              className={cn(
                "flex min-h-72 flex-col rounded-xl border bg-muted/25 transition-colors",
                dragOver === bucket.key && "border-primary/60 bg-primary/5"
              )}
              onDragOver={(event) => {
                if (!bucket.droppable) return;
                event.preventDefault();
                setDragOver(bucket.key);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(event) => {
                if (!bucket.droppable) return;
                event.preventDefault();
                setDragOver(null);
                const id = event.dataTransfer.getData("text/plain");
                const task = result.data.find((item) => String(item.id) === id);
                if (task) moveTask(task, bucket.key);
              }}
            >
              <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={cn("size-2 shrink-0 rounded-full", bucket.accent)} />
                  <span className="truncate text-sm font-semibold">
                    {bucket.label}
                  </span>
                </div>
                <span className="shrink-0 rounded-md bg-background px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                  {bucket.tasks.length}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
                {bucket.tasks.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                    {bucket.droppable
                      ? translate(
                          "projects.board.dropHere",
                          { ns: "starter" },
                          "Drop a task here"
                        )
                      : translate("projects.board.none", { ns: "starter" }, "Nothing here")}
                  </p>
                ) : (
                  bucket.tasks.map((task) => (
                    <TaskCard
                      key={String(task.id)}
                      task={task}
                      locale={locale}
                      showStatus={grouping !== "status"}
                      draggable={bucket.droppable}
                      onOpen={() => openChild(`show/${task.id}`)}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  locale,
  showStatus,
  draggable,
  onOpen,
}: {
  task: TaskRecord;
  locale: string;
  showStatus: boolean;
  draggable: boolean;
  onOpen: () => void;
}) {
  const translate = useTranslate();
  const isOverdue =
    task.status !== "done" &&
    Boolean(task.due_date) &&
    (task.due_date as string) < todayIso();

  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(event) =>
        event.dataTransfer.setData("text/plain", String(task.id))
      }
      onClick={onOpen}
      className={cn(
        "group flex flex-col gap-2 rounded-lg border bg-card p-3 text-left shadow-xs transition-shadow hover:shadow-sm",
        draggable && "cursor-grab active:cursor-grabbing"
      )}
    >
      <span className="line-clamp-2 text-sm font-medium">{task.title || "—"}</span>
      {task.project?.name ? (
        <span className="truncate text-xs text-muted-foreground">
          {task.project.name}
        </span>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <PriorityPill value={task.priority} />
        {showStatus ? (
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {labelFor(TASK_STATUSES, task.status ?? "todo", translate)}
          </span>
        ) : null}
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
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <User className="size-3" />
        <span className="truncate">
          {task.assignee
            ? userLabel(task.assignee)
            : translate("projects.board.unassigned", { ns: "starter" }, "Unassigned")}
        </span>
      </span>
    </button>
  );
}
