import { useList, useShow, useTranslate, useUpdate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Flag,
  Link2,
  Pencil,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useOutlet, useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import { cn } from "@/lib/utils";
import { useChartTheme } from "@/pages/home/theme";
import {
  PROJECT_STATUSES,
  TASK_STATUSES,
  formatDate,
  labelFor,
  todayIso,
  userLabel,
} from "../constants";
import {
  useContextualCloseTo,
  useOpenContextualChild,
} from "../route-surfaces";
import {
  DetailItems,
  DrawerSection,
  EmptyRow,
  EnumBadge,
  PriorityPill,
  SimpleTable,
  useLocale,
} from "../shared";
import { useProjectRollups } from "./list";
import type {
  MilestoneRecord,
  ProjectRecord,
  TaskRecord,
} from "../types";
import { milestoneTransitionValues } from "../transitions";

export function ProjectShow() {
  const locale = useLocale();
  const translate = useTranslate();
  const openChild = useOpenContextualChild();
  const closeTo = useContextualCloseTo();
  const { id } = useParams<{ id: string }>();
  const nested = useOutlet();
  const [copied, setCopied] = useState(false);
  const { result: record, query } = useShow<ProjectRecord>({
    resource: "hub_pj_projects",
    id,
    meta: { appends: ["owner"] },
  });

  const displayName =
    record?.name ||
    translate("projects.projects.show.title.untitled", { ns: "starter" }, "Untitled project");

  return (
    <RouteDrawer
      title={
        query.isLoading && !record ? (
          <Skeleton className="h-6 w-40" />
        ) : (
          displayName
        )
      }
      description={translate(
        "projects.projects.show.desc",
        { ns: "starter" },
        "Tasks and milestones for this project."
      )}
      closeLabel={translate("projects.common.close", { ns: "starter" }, "Close")}
      closeTo={closeTo}
      nested={nested}
      actions={
        record ? (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              title={translate("projects.common.copyLink", { ns: "starter" }, "Copy link")}
              onClick={() => {
                if (typeof window === "undefined") return;
                void navigator.clipboard?.writeText(window.location.href);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
            >
              <Link2 className={cn("size-4", copied && "text-emerald-600")} />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              title={translate("projects.common.print", { ns: "starter" }, "Print")}
              onClick={() => window.print()}
            >
              <Printer className="size-4" />
            </Button>
            <EditButton
              resource="hub_pj_projects"
              recordItemId={record.id}
              variant="outline"
              size="icon-sm"
              onClick={() => openChild("edit")}
            >
              <Pencil />
            </EditButton>
          </div>
        ) : null
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {query.isLoading ? (
          <LoadingState className="min-h-64" />
        ) : query.isError ? (
          <Alert variant="destructive">
            <AlertTitle>
              {translate(
                "projects.projects.show.error.title",
                { ns: "starter" },
                "Unable to load project"
              )}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "projects.projects.show.error.desc",
                { ns: "starter" },
                "The project may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <DetailItems
              title={translate("projects.projects.show.overview", { ns: "starter" }, "Overview")}
              items={[
                [
                  translate("projects.projects.show.fields.code", { ns: "starter" }, "Code"),
                  record?.code || "—",
                ],
                [
                  translate("projects.projects.show.fields.status", { ns: "starter" }, "Status"),
                  <EnumBadge
                    key="status"
                    value={record?.status ?? "planning"}
                    label={labelFor(PROJECT_STATUSES, record?.status ?? "planning", translate)}
                  />,
                ],
                [
                  translate("projects.projects.show.fields.owner", { ns: "starter" }, "Owner"),
                  userLabel(record?.owner),
                ],
                [
                  translate("projects.projects.show.fields.startDate", { ns: "starter" }, "Start date"),
                  formatDate(record?.start_date, locale),
                ],
                [
                  translate("projects.projects.show.fields.dueDate", { ns: "starter" }, "Due date"),
                  formatDate(record?.due_date, locale),
                ],
              ]}
            />
            {record ? (
              <>
                <Separator />
                <ProjectHealthPanel project={record} />
              </>
            ) : null}
            {id ? (
              <>
                <Separator />
                <ProjectProgress projectId={id} />
                <Separator />
                <ProjectRisks projectId={id} locale={locale} />
                <Separator />
                <TasksSection projectId={id} locale={locale} />
                <Separator />
                <MilestonesSection projectId={id} locale={locale} />
              </>
            ) : null}
          </div>
        )}
      </div>
    </RouteDrawer>
  );
}


/**
 * Schedule-versus-delivery read-out: the same health signal the portfolio list
 * shows, expanded so a reviewer can see why a project is flagged.
 */
function ProjectHealthPanel({ project }: { project: ProjectRecord }) {
  const translate = useTranslate();
  const { rollupFor } = useProjectRollups();
  const rollup = rollupFor(project);

  const labels: Record<string, string> = {
    on_track: translate("projects.health.on_track", { ns: "starter" }, "On track"),
    at_risk: translate("projects.health.at_risk", { ns: "starter" }, "At risk"),
    off_track: translate("projects.health.off_track", { ns: "starter" }, "Off track"),
    done: translate("projects.health.done", { ns: "starter" }, "Delivered"),
  };
  const tone: Record<string, string> = {
    on_track: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    at_risk: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    off_track: "bg-red-500/15 text-red-700 dark:text-red-300",
    done: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  };

  return (
    <DrawerSection
      title={translate("projects.projects.show.health", { ns: "starter" }, "Health")}
      action={
        <span
          className={cn(
            "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
            tone[rollup.health]
          )}
        >
          {labels[rollup.health]}
        </span>
      }
    >
      <div className="space-y-3">
        <Bar
          label={translate(
            "projects.projects.show.delivered",
            { ns: "starter" },
            "Work delivered"
          )}
          value={rollup.progress}
          className="bg-emerald-500"
        />
        <Bar
          label={translate(
            "projects.projects.show.scheduleUsed",
            { ns: "starter" },
            "Schedule used"
          )}
          value={rollup.elapsed}
          className="bg-blue-500"
        />
        <div className="grid grid-cols-3 gap-3 text-center">
          <Metric
            value={rollup.overdueTasks}
            label={translate(
              "projects.projects.show.overdueTasks",
              { ns: "starter" },
              "Overdue tasks"
            )}
            danger={rollup.overdueTasks > 0}
          />
          <Metric
            value={rollup.tasks - rollup.doneTasks}
            label={translate(
              "projects.projects.show.openTasks",
              { ns: "starter" },
              "Open tasks"
            )}
          />
          <Metric
            value={rollup.milestones - rollup.doneMilestones}
            label={translate(
              "projects.projects.show.openMilestones",
              { ns: "starter" },
              "Open milestones"
            )}
          />
        </div>
      </div>
    </DrawerSection>
  );
}

function Bar({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", className)}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

function Metric({
  value,
  label,
  danger,
}: {
  value: number;
  label: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border p-2.5">
      <p
        className={cn(
          "text-xl font-semibold tabular-nums",
          danger && "text-red-600 dark:text-red-400"
        )}
      >
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

/** The overdue tasks that drive the health flag, listed so they can be actioned. */
function ProjectRisks({
  projectId,
  locale,
}: {
  projectId: string;
  locale: string;
}) {
  const translate = useTranslate();
  const openChild = useOpenContextualChild();
  const today = todayIso();
  const { result } = useList<TaskRecord>({
    resource: "hub_pj_tasks",
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    sorters: [{ field: "due_date", order: "asc" }],
    filters: [
      { field: "hub_pj_task_project_id", operator: "eq", value: projectId },
      { field: "due_date", operator: "lt", value: today },
    ],
    meta: { appends: ["assignee"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const overdue = result.data.filter((task) => task.status !== "done");
  if (overdue.length === 0) return null;

  return (
    <DrawerSection
      title={translate("projects.projects.show.risks", { ns: "starter" }, "Risks")}
      action={
        <span className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
          <AlertTriangle className="size-3.5" />
          {translate(
            "projects.projects.show.riskCount",
            { ns: "starter", count: overdue.length },
            `${overdue.length} overdue`
          )}
        </span>
      }
    >
      <ul className="space-y-1">
        {overdue.slice(0, 6).map((task) => (
          <li key={String(task.id)}>
            <button
              type="button"
              onClick={() => openChild(`tasks/edit/${task.id}`)}
              className="flex w-full items-center justify-between gap-2 rounded-md border border-red-500/25 bg-red-500/5 px-3 py-2 text-left text-sm hover:border-red-500/50"
            >
              <span className="truncate">{task.title}</span>
              <span className="shrink-0 text-xs font-medium text-red-600 tabular-nums dark:text-red-400">
                {formatDate(task.due_date, locale)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </DrawerSection>
  );
}

function ProjectProgress({ projectId }: { projectId: string }) {
  const translate = useTranslate();
  const chart = useChartTheme();
  const { result: taskResult } = useList<TaskRecord>({
    resource: "hub_pj_tasks",
    pagination: { mode: "server", currentPage: 1, pageSize: 300 },
    filters: [
      { field: "hub_pj_task_project_id", operator: "eq", value: projectId },
    ],
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const { result: msResult } = useList<MilestoneRecord>({
    resource: "hub_pj_milestones",
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    sorters: [{ field: "due_date", order: "asc" }],
    filters: [
      { field: "hub_pj_ms_project_id", operator: "eq", value: projectId },
    ],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const tasks = taskResult.data;
  const milestones = msResult.data;
  const doneCount = tasks.filter((task) => task.status === "done").length;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  const today = todayIso();

  const donutOption = useMemo(
    () => ({
      color: chart.palette,
      tooltip: {
        trigger: "item",
        backgroundColor: chart.tooltipBg,
        borderColor: chart.tooltipBorder,
        textStyle: { color: chart.tooltipText, fontSize: 12 },
        borderWidth: 1,
      },
      series: [
        {
          type: "pie",
          radius: ["62%", "88%"],
          avoidLabelOverlap: false,
          padAngle: 2,
          itemStyle: { borderRadius: 4 },
          label: { show: false },
          labelLine: { show: false },
          data: TASK_STATUSES.map((status) => ({
            name: translate(status.i18nKey, { ns: "starter" }, status.label),
            value: tasks.filter((task) => (task.status ?? "todo") === status.value)
              .length,
          })).filter((entry) => entry.value > 0),
        },
      ],
    }),
    [tasks, chart, translate]
  );

  if (!tasks.length) return null;

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">
        {translate("projects.projects.show.progress", { ns: "starter" }, "Progress")}
      </h3>
      <div className="flex items-center gap-4">
        <div className="flex-1 space-y-1.5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {translate(
              "projects.projects.show.progress.hint",
              { ns: "starter", done: doneCount, total: tasks.length, pct },
              `${doneCount} of ${tasks.length} tasks done (${pct}%)`
            )}
          </p>
        </div>
        <ReactECharts
          key={`pj-progress-${chart.isDark}`}
          option={donutOption}
          style={{ width: 88, height: 88 }}
          opts={{ renderer: "svg" }}
        />
      </div>
      {milestones.length ? (
        <div className="flex items-center overflow-x-auto pt-1">
          {milestones.map((milestone, index) => {
            const overdue =
              !milestone.done && (milestone.due_date ?? "") < today;
            return (
              <div key={String(milestone.id)} className="flex shrink-0 items-center">
                {index > 0 ? <span className="h-px w-6 shrink-0 bg-border" /> : null}
                <div
                  className="flex flex-col items-center gap-1 px-1"
                  title={milestone.name ?? undefined}
                >
                  <span
                    className={cn(
                      "size-2.5 rounded-full",
                      milestone.done
                        ? "bg-emerald-500"
                        : overdue
                          ? "bg-red-500"
                          : "bg-slate-300 dark:bg-slate-600"
                    )}
                  />
                  <span className="max-w-16 truncate text-[10px] text-muted-foreground">
                    {milestone.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function AddLink({ to, label }: { to: string; label: string }) {
  const openChild = useOpenContextualChild();
  return (
    <Button variant="outline" size="sm" onClick={() => openChild(to)}>
      <Plus />
      {label}
    </Button>
  );
}

function RowEditLink({ to }: { to: string }) {
  const openChild = useOpenContextualChild();
  return (
    <Button variant="ghost" size="icon" onClick={() => openChild(to)}>
      <Pencil />
    </Button>
  );
}

function TasksSection({
  projectId,
  locale,
}: {
  projectId: string;
  locale: string;
}) {
  const translate = useTranslate();
  const { result } = useList<TaskRecord>({
    resource: "hub_pj_tasks",
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    sorters: [{ field: "due_date", order: "asc" }],
    filters: [
      { field: "hub_pj_task_project_id", operator: "eq", value: projectId },
    ],
    meta: { appends: ["assignee"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const today = todayIso();

  return (
    <DrawerSection
      title={translate("projects.projects.show.tasks", { ns: "starter" }, "Tasks")}
      action={
        <AddLink
          to="tasks/create"
          label={translate("projects.projects.show.addTask", { ns: "starter" }, "Add task")}
        />
      }
    >
      <SimpleTable
        headers={[
          translate("projects.tasks.columns.task", { ns: "starter" }, "Task"),
          translate("projects.tasks.columns.status", { ns: "starter" }, "Status"),
          translate("projects.tasks.columns.priority", { ns: "starter" }, "Priority"),
          translate("projects.tasks.columns.assignee", { ns: "starter" }, "Assignee"),
          translate("projects.tasks.columns.due", { ns: "starter" }, "Due"),
          translate("projects.common.actions", { ns: "starter" }, "Actions"),
        ]}
      >
        {result.data.length === 0 ? (
          <EmptyRow
            colSpan={6}
            text={translate(
              "projects.projects.show.tasks.empty",
              { ns: "starter" },
              "No tasks yet. Add the first one."
            )}
          />
        ) : (
          result.data.map((task) => {
            const isOverdue =
              task.status !== "done" &&
              Boolean(task.due_date) &&
              (task.due_date as string) < today;
            return (
              <tr key={String(task.id)}>
                <td className="px-3 py-2 font-medium">{task.title || "—"}</td>
                <td className="px-3 py-2">
                  <EnumBadge
                    value={task.status ?? "todo"}
                    label={labelFor(TASK_STATUSES, task.status ?? "todo", translate)}
                  />
                </td>
                <td className="px-3 py-2">
                  <PriorityPill value={task.priority} />
                </td>
                <td className="px-3 py-2">{userLabel(task.assignee)}</td>
                <td
                  className={
                    "px-3 py-2 whitespace-nowrap " +
                    (isOverdue ? "text-red-600 dark:text-red-400" : "")
                  }
                >
                  {formatDate(task.due_date, locale)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <RowEditLink
                      to={`tasks/edit/${encodeURIComponent(String(task.id))}`}
                    />
                    <DeleteButton
                      resource="hub_pj_tasks"
                      recordItemId={task.id}
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 />
                    </DeleteButton>
                  </div>
                </td>
              </tr>
            );
          })
        )}
      </SimpleTable>
    </DrawerSection>
  );
}

function MilestonesSection({
  projectId,
  locale,
}: {
  projectId: string;
  locale: string;
}) {
  const translate = useTranslate();
  const { mutate: updateMilestone } = useUpdate<MilestoneRecord>();
  const { result } = useList<MilestoneRecord>({
    resource: "hub_pj_milestones",
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    sorters: [{ field: "due_date", order: "asc" }],
    filters: [
      { field: "hub_pj_ms_project_id", operator: "eq", value: projectId },
    ],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const today = todayIso();

  return (
    <DrawerSection
      title={translate("projects.projects.show.milestones", { ns: "starter" }, "Milestones")}
      action={
        <AddLink
          to="milestones/create"
          label={translate(
            "projects.projects.show.addMilestone",
            { ns: "starter" },
            "Add milestone"
          )}
        />
      }
    >
      <SimpleTable
        headers={[
          translate("projects.milestones.columns.milestone", { ns: "starter" }, "Milestone"),
          translate("projects.milestones.columns.target", { ns: "starter" }, "Target"),
          translate("projects.milestones.columns.status", { ns: "starter" }, "Status"),
          translate("projects.common.actions", { ns: "starter" }, "Actions"),
        ]}
      >
        {result.data.length === 0 ? (
          <EmptyRow
            colSpan={4}
            text={translate(
              "projects.projects.show.milestones.empty",
              { ns: "starter" },
              "No milestones scheduled yet."
            )}
          />
        ) : (
          result.data.map((milestone) => {
            const isDone = Boolean(milestone.done);
            const isOverdue =
              !isDone && (milestone.due_date ?? "") < today;
            return (
              <tr key={String(milestone.id)}>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2 font-medium">
                    <Flag
                      className={
                        "size-3.5 " +
                        (isDone
                          ? "text-emerald-500"
                          : "text-muted-foreground/50")
                      }
                    />
                    {milestone.name || "—"}
                  </span>
                </td>
                <td
                  className={
                    "px-3 py-2 whitespace-nowrap " +
                    (isOverdue ? "text-red-600 dark:text-red-400" : "")
                  }
                >
                  {formatDate(milestone.due_date, locale)}
                </td>
                <td className="px-3 py-2">
                  {isDone ? (
                    <EnumBadge
                      value="done"
                      label={translate(
                        "projects.milestones.status.completed",
                        { ns: "starter" },
                        "Completed"
                      )}
                    />
                  ) : (
                    <EnumBadge
                      value="planning"
                      label={translate(
                        "projects.milestones.status.pending",
                        { ns: "starter" },
                        "Pending"
                      )}
                    />
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    {isDone ? (
                      <Circle className="size-4 text-muted-foreground/40" />
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        title={translate(
                          "projects.milestones.markCompleted",
                          { ns: "starter" },
                          "Mark completed"
                        )}
                        onClick={() =>
                          updateMilestone({
                            resource: "hub_pj_milestones",
                            id: milestone.id,
                            values: milestoneTransitionValues(true, milestone),
                          })
                        }
                      >
                        <CheckCircle2 />
                      </Button>
                    )}
                    <RowEditLink
                      to={`milestones/edit/${encodeURIComponent(
                        String(milestone.id)
                      )}`}
                    />
                    <DeleteButton
                      resource="hub_pj_milestones"
                      recordItemId={milestone.id}
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 />
                    </DeleteButton>
                  </div>
                </td>
              </tr>
            );
          })
        )}
      </SimpleTable>
    </DrawerSection>
  );
}
