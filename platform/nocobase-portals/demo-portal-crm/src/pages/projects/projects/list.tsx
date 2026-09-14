import {
  useGetIdentity,
  useList,
  useTranslate,
  useUpdate,
  type CrudFilters,
} from "@refinedev/core";
import { useTable } from "@refinedev/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FolderKanban,
  Pencil,
  PlayCircle,
  Trash2,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableFilterDropdownText } from "@/components/data-table/data-table-filter";
import { DataTableSorter } from "@/components/data-table/data-table-sorter";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { ShowButton } from "@/components/resources/buttons/show";
import { ListView } from "@/components/resources/views/list-view";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PROJECT_STATUSES,
  formatDate,
  labelFor,
  todayIso,
  userLabel,
} from "../constants";
import { useOpenContextualChild } from "../route-surfaces";
import { EnumBadge, useLocale } from "../shared";
import {
  BulkBar,
  ColumnsMenu,
  DensityMenu,
  ErrorState,
  ExportCsvButton,
  KpiBar,
  RowCheckbox,
  SavedViewBar,
  SelectAllCheckbox,
  Toolbar,
  ToolbarSearch,
  densityClass,
  downloadCsv,
  useSavedViews,
  useTablePrefs,
  useUrlState,
} from "@/lib/table-kit";
import type { MilestoneRecord, ProjectRecord, TaskRecord } from "../types";
import { ProjectStats } from "./stats";
import { ProjectTimeline } from "./timeline";
import { projectTransitionValues } from "../transitions";

const STORAGE_KEY = "hub.pj.projects";

const URL_DEFAULTS: Record<"q" | "status" | "owner" | "health", string> = {
  q: "",
  status: "",
  owner: "",
  health: "",
};

export type ProjectHealth = "on_track" | "at_risk" | "off_track" | "done";

export type ProjectRollup = {
  tasks: number;
  doneTasks: number;
  overdueTasks: number;
  milestones: number;
  doneMilestones: number;
  progress: number;
  elapsed: number;
  health: ProjectHealth;
};

const EMPTY_ROLLUP: ProjectRollup = {
  tasks: 0,
  doneTasks: 0,
  overdueTasks: 0,
  milestones: 0,
  doneMilestones: 0,
  progress: 0,
  elapsed: 0,
  health: "on_track",
};

const HEALTH_CLASS: Record<ProjectHealth, string> = {
  on_track: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  at_risk: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  off_track: "bg-red-500/15 text-red-700 dark:text-red-300",
  done: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
};

/**
 * Rolls tasks and milestones up per project and derives a schedule-vs-delivery
 * health signal: how much of the calendar has burned versus how much of the
 * work is finished, plus any overdue tasks.
 */
export function useProjectRollups() {
  const { result: taskResult, query: taskQuery } = useList<TaskRecord>({
    resource: "hub_pj_tasks",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const { result: milestoneResult } = useList<MilestoneRecord>({
    resource: "hub_pj_milestones",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const byProject = useMemo(() => {
    const today = todayIso();
    const map = new Map<string, ProjectRollup>();
    const ensure = (key: string) => {
      const current = map.get(key) ?? { ...EMPTY_ROLLUP };
      map.set(key, current);
      return current;
    };

    for (const task of taskResult.data) {
      const key = String(
        (task as TaskRecord & { hub_pj_task_project_id?: string | number })
          .hub_pj_task_project_id ?? task.project?.id ?? ""
      );
      if (!key) continue;
      const entry = ensure(key);
      entry.tasks += 1;
      if (task.status === "done") entry.doneTasks += 1;
      else if (task.due_date && String(task.due_date) < today) {
        entry.overdueTasks += 1;
      }
    }

    for (const milestone of milestoneResult.data) {
      const key = String(
        (milestone as MilestoneRecord & { hub_pj_ms_project_id?: string | number })
          .hub_pj_ms_project_id ?? milestone.project?.id ?? ""
      );
      if (!key) continue;
      const entry = ensure(key);
      entry.milestones += 1;
      if (milestone.done) entry.doneMilestones += 1;
    }

    for (const entry of map.values()) {
      entry.progress = entry.tasks
        ? Math.round((entry.doneTasks / entry.tasks) * 100)
        : 0;
    }
    return map;
  }, [milestoneResult.data, taskResult.data]);

  const rollupFor = useCallback(
    (project: ProjectRecord): ProjectRollup => {
      const base = byProject.get(String(project.id)) ?? { ...EMPTY_ROLLUP };
      const start = project.start_date ? new Date(project.start_date).getTime() : null;
      const due = project.due_date ? new Date(project.due_date).getTime() : null;
      const now = Date.now();
      const elapsed =
        start && due && due > start
          ? Math.min(100, Math.max(0, Math.round(((now - start) / (due - start)) * 100)))
          : 0;

      let health: ProjectHealth = "on_track";
      if (project.status === "done") health = "done";
      else if (
        base.overdueTasks > 2 ||
        (due && due < now) ||
        elapsed - base.progress > 35
      ) {
        health = "off_track";
      } else if (base.overdueTasks > 0 || elapsed - base.progress > 15) {
        health = "at_risk";
      }

      return { ...base, elapsed, health };
    },
    [byProject]
  );

  return { rollupFor, isLoading: taskQuery.isLoading };
}

export function ProjectsLayout() {
  return (
    <CanAccess
      resource="hub_pj_projects"
      action="list"
      fallback={<AccessDenied />}
    >
      <ProjectList />
    </CanAccess>
  );
}

type Identity = { id?: string | number };

function ProjectList() {
  const locale = useLocale();
  const translate = useTranslate();
  const openChild = useOpenContextualChild();
  const { mutate: updateProject } = useUpdate<ProjectRecord>();
  const { data: identity } = useGetIdentity<Identity>();
  const { rollupFor } = useProjectRollups();

  const { state, setState, query: urlQuery, applyQuery, reset } =
    useUrlState(URL_DEFAULTS);
  const { views, save: saveView, remove: removeView } = useSavedViews(STORAGE_KEY);
  const [activeView, setActiveView] = useState<string | null>(null);
  const prefs = useTablePrefs(STORAGE_KEY, ["start_date"]);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  const { result: allResult } = useList<ProjectRecord>({
    resource: "hub_pj_projects",
    pagination: { mode: "server", currentPage: 1, pageSize: 300 },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const filters = useMemo<CrudFilters>(() => {
    const out: CrudFilters = [];
    if (state.q.trim()) {
      out.push({ field: "name", operator: "contains", value: state.q.trim() });
    }
    if (state.status) {
      out.push({ field: "status", operator: "eq", value: state.status });
    }
    if (state.owner === "me" && identity?.id != null) {
      out.push({
        field: "hub_pj_project_owner_id",
        operator: "eq",
        value: identity.id,
      });
    }
    // Health is derived, not stored: resolve it over the loaded portfolio and
    // narrow the query by the matching ids so paging stays server-side.
    if (state.health) {
      const ids = allResult.data
        .filter((project) => rollupFor(project).health === state.health)
        .map((project) => project.id);
      out.push({ field: "id", operator: "in", value: ids.length ? ids : [0] });
    }
    return out;
  }, [allResult.data, identity?.id, rollupFor, state]);

  const summary = useMemo(() => {
    const today = todayIso();
    const rows = allResult.data;
    let atRisk = 0;
    let offTrack = 0;
    for (const project of rows) {
      const health = rollupFor(project).health;
      if (health === "at_risk") atRisk += 1;
      if (health === "off_track") offTrack += 1;
    }
    return {
      total: rows.length,
      active: rows.filter((row) => row.status === "active").length,
      done: rows.filter((row) => row.status === "done").length,
      atRisk,
      offTrack,
      overdue: rows.filter(
        (row) => row.status !== "done" && (row.due_date ?? "") < today
      ).length,
    };
  }, [allResult.data, rollupFor]);

  const healthLabels: Record<ProjectHealth, string> = useMemo(
    () => ({
      on_track: translate("projects.health.on_track", { ns: "starter" }, "On track"),
      at_risk: translate("projects.health.at_risk", { ns: "starter" }, "At risk"),
      off_track: translate("projects.health.off_track", { ns: "starter" }, "Off track"),
      done: translate("projects.health.done", { ns: "starter" }, "Delivered"),
    }),
    [translate]
  );

  const columnLabels = useMemo(
    () => ({
      name: translate("projects.projects.columns.project", { ns: "starter" }, "Project"),
      status: translate("projects.projects.columns.status", { ns: "starter" }, "Status"),
      health: translate("projects.projects.columns.health", { ns: "starter" }, "Health"),
      progress: translate(
        "projects.projects.columns.progress",
        { ns: "starter" },
        "Progress"
      ),
      owner: translate("projects.projects.columns.owner", { ns: "starter" }, "Owner"),
      start_date: translate(
        "projects.projects.columns.start",
        { ns: "starter" },
        "Start"
      ),
      due_date: translate("projects.projects.columns.due", { ns: "starter" }, "Due"),
      milestones: translate(
        "projects.projects.columns.milestones",
        { ns: "starter" },
        "Milestones"
      ),
    }),
    [translate]
  );

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<ProjectRecord>();
    return [
      columnHelper.display({
        id: "select",
        size: 40,
        enableSorting: false,
        header: ({ table }) => <SelectAllCheckbox i18nPrefix="projects.toolkit" table={table} />,
        cell: ({ row }) => (
          <RowCheckbox i18nPrefix="projects.toolkit"
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(checked)}
          />
        ),
      }),
      columnHelper.accessor("name", {
        id: "name",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>{columnLabels.name}</span>
            <DataTableSorter column={column} />
            <DataTableFilterDropdownText
              column={column}
              table={table}
              defaultOperator="contains"
              operators={["contains", "eq", "startswith"]}
            />
          </div>
        ),
        enableSorting: true,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => openChild(`show/${row.original.id}`)}
            className="flex flex-col text-left"
          >
            <span className="font-medium underline-offset-2 hover:underline">
              {row.original.name || "—"}
            </span>
            {row.original.code ? (
              <span className="text-xs text-muted-foreground">
                {row.original.code}
              </span>
            ) : null}
          </button>
        ),
      }),
      columnHelper.accessor("status", {
        id: "status",
        header: columnLabels.status,
        enableSorting: false,
        cell: ({ getValue }) => {
          const value = getValue() ?? "planning";
          return (
            <EnumBadge
              value={value}
              label={labelFor(PROJECT_STATUSES, value, translate)}
            />
          );
        },
      }),
      columnHelper.display({
        id: "health",
        header: columnLabels.health,
        enableSorting: false,
        size: 120,
        cell: ({ row }) => {
          const rollup = rollupFor(row.original);
          return (
            <span
              className={cn(
                "inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
                HEALTH_CLASS[rollup.health]
              )}
              title={translate(
                "projects.health.tooltip",
                {
                  ns: "starter",
                  progress: rollup.progress,
                  elapsed: rollup.elapsed,
                  overdue: rollup.overdueTasks,
                },
                `${rollup.progress}% done, ${rollup.elapsed}% of schedule used`
              )}
            >
              {healthLabels[rollup.health]}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: "progress",
        header: columnLabels.progress,
        enableSorting: false,
        size: 160,
        cell: ({ row }) => {
          const rollup = rollupFor(row.original);
          return (
            <div className="flex items-center gap-2">
              <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    rollup.health === "off_track"
                      ? "bg-red-500"
                      : rollup.health === "at_risk"
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  )}
                  style={{ width: `${rollup.progress}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">
                {rollup.doneTasks}/{rollup.tasks}
              </span>
            </div>
          );
        },
      }),
      columnHelper.accessor("owner", {
        id: "owner",
        header: columnLabels.owner,
        enableSorting: false,
        cell: ({ getValue }) => userLabel(getValue()),
      }),
      columnHelper.accessor("start_date", {
        id: "start_date",
        header: columnLabels.start_date,
        enableSorting: false,
        cell: ({ getValue }) => formatDate(getValue(), locale),
      }),
      columnHelper.accessor("due_date", {
        id: "due_date",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>{columnLabels.due_date}</span>
            <DataTableSorter column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue, row }) => {
          const value = getValue();
          const overdue =
            row.original.status !== "done" && (value ?? "") < todayIso();
          return (
            <span
              className={cn(
                "whitespace-nowrap tabular-nums",
                overdue && "font-medium text-red-600 dark:text-red-400"
              )}
            >
              {formatDate(value, locale)}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: "milestones",
        header: columnLabels.milestones,
        enableSorting: false,
        size: 110,
        cell: ({ row }) => {
          const rollup = rollupFor(row.original);
          return (
            <span className="tabular-nums text-muted-foreground">
              {rollup.doneMilestones}/{rollup.milestones}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: translate("projects.common.actions", { ns: "starter" }, "Actions"),
        enableSorting: false,
        size: 144,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <ShowButton
              resource="hub_pj_projects"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              onClick={() => openChild(`show/${row.original.id}`)}
            >
              <Eye />
            </ShowButton>
            <EditButton
              resource="hub_pj_projects"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              onClick={() => openChild(`edit/${row.original.id}`)}
            >
              <Pencil />
            </EditButton>
            <DeleteButton
              resource="hub_pj_projects"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 />
            </DeleteButton>
          </div>
        ),
      }),
    ];
  }, [columnLabels, healthLabels, locale, openChild, rollupFor, translate]);

  const table = useTable<ProjectRecord>({
    columns,
    enableRowSelection: true,
    getRowId: (row) => String(row.id),
    state: { rowSelection, columnVisibility: prefs.columnVisibility },
    onRowSelectionChange: setRowSelection,
    refineCoreProps: {
      resource: "hub_pj_projects",
      syncWithLocation: false,
      meta: { appends: ["owner"] },
      filters: { permanent: filters },
      sorters: { initial: [{ field: "due_date", order: "asc" }] },
      errorNotification: false,
    },
  });

  const tableQuery = table.refineCore.tableQuery;
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  const exportList = useList<ProjectRecord>({
    resource: "hub_pj_projects",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    filters,
    meta: { appends: ["owner"] },
    errorNotification: false,
    queryOptions: { enabled: false, retry: false },
  });

  const handleExport = useCallback(async () => {
    const response = await exportList.query.refetch();
    const rows = response.data?.data ?? [];
    downloadCsv(
      `projects-${todayIso()}.csv`,
      [
        columnLabels.name,
        translate("projects.projects.columns.code", { ns: "starter" }, "Code"),
        columnLabels.status,
        columnLabels.health,
        columnLabels.progress,
        columnLabels.owner,
        columnLabels.start_date,
        columnLabels.due_date,
      ],
      rows.map((row) => {
        const rollup = rollupFor(row);
        return [
          row.name,
          row.code,
          labelFor(PROJECT_STATUSES, row.status ?? "planning", translate),
          healthLabels[rollup.health],
          `${rollup.progress}%`,
          userLabel(row.owner),
          row.start_date ?? "",
          row.due_date ?? "",
        ];
      })
    );
  }, [columnLabels, exportList.query, healthLabels, rollupFor, translate]);

  const bulkStatus = (status: string) => {
    if (status === "done") {
      const blocked = selectedIds
        .map((id) => allResult.data.find((row) => String(row.id) === String(id)))
        .filter((project): project is ProjectRecord => Boolean(project))
        .filter((project) => {
          const rollup = rollupFor(project);
          return (
            rollup.doneTasks !== rollup.tasks ||
            rollup.doneMilestones !== rollup.milestones
          );
        });
      if (blocked.length > 0) {
        window.alert(
          translate(
            "projects.projects.bulk.completeBlocked",
            { ns: "starter", count: blocked.length },
            "Complete every task and milestone before marking the selected projects done."
          )
        );
        return;
      }
    }
    selectedIds.forEach((id) =>
      updateProject({
        resource: "hub_pj_projects",
        id,
        values: projectTransitionValues(
          status,
          allResult.data.find((row) => String(row.id) === String(id))
        ),
        successNotification: false,
        invalidates: ["list"],
      })
    );
    setRowSelection({});
  };

  const presets = useMemo(
    () => [
      {
        key: "all",
        label: translate("projects.views.all", { ns: "starter" }, "All projects"),
        query: "",
      },
      {
        key: "active",
        label: translate("projects.views.active", { ns: "starter" }, "Active"),
        query: "status=active",
      },
      {
        key: "mine",
        label: translate("projects.views.mine", { ns: "starter" }, "Mine"),
        query: "owner=me",
      },
      {
        key: "risk",
        label: translate("projects.views.risk", { ns: "starter" }, "Needs attention"),
        query: "health=off_track",
      },
      {
        key: "planning",
        label: translate("projects.views.planning", { ns: "starter" }, "Planning"),
        query: "status=planning",
      },
    ],
    [translate]
  );

  const kpiItems = [
    {
      key: "total",
      label: translate("projects.kpi.total", { ns: "starter" }, "Projects"),
      value: String(summary.total),
      hint: translate("projects.kpi.totalHint", { ns: "starter" }, "In the portfolio"),
      icon: <FolderKanban className="size-4" />,
      tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
      active: !state.status && !state.health,
      onClick: () => {
        applyQuery("");
        setActiveView("all");
      },
    },
    {
      key: "active",
      label: translate("projects.enums.projectStatus.active", { ns: "starter" }, "Active"),
      value: String(summary.active),
      hint: translate("projects.kpi.activeHint", { ns: "starter" }, "Being delivered"),
      icon: <PlayCircle className="size-4" />,
      tone: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-400",
      active: state.status === "active",
      onClick: () => {
        applyQuery("status=active");
        setActiveView("active");
      },
    },
    {
      key: "risk",
      label: translate("projects.kpi.risk", { ns: "starter" }, "Needs attention"),
      value: String(summary.atRisk + summary.offTrack),
      hint: translate(
        "projects.kpi.riskHint",
        { ns: "starter", offTrack: summary.offTrack },
        `${summary.offTrack} off track`
      ),
      icon: <AlertTriangle className="size-4" />,
      tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
      active: state.health === "off_track",
      onClick: () => {
        applyQuery("health=off_track");
        setActiveView("risk");
      },
    },
    {
      key: "done",
      label: translate("projects.enums.projectStatus.done", { ns: "starter" }, "Done"),
      value: String(summary.done),
      hint: translate(
        "projects.kpi.doneHint",
        { ns: "starter", overdue: summary.overdue },
        `${summary.overdue} past due`
      ),
      icon: <CheckCircle2 className="size-4" />,
      tone: "text-slate-600 bg-slate-500/12 dark:text-slate-400",
      active: state.status === "done",
      onClick: () => {
        applyQuery("status=done");
        setActiveView(null);
      },
    },
  ];

  return (
    <ListView resource="hub_pj_projects">
      <KpiBar items={kpiItems} />

      <Toolbar>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <ToolbarSearch i18nPrefix="projects.toolkit"
            value={state.q}
            onChange={(value) => {
              setState({ q: value });
              setActiveView(null);
            }}
            placeholder={translate(
              "projects.projects.searchPlaceholder",
              { ns: "starter" },
              "Search projects..."
            )}
          />
          <select
            value={state.health}
            onChange={(event) => {
              setState({ health: event.currentTarget.value });
              setActiveView(null);
            }}
            className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs"
          >
            <option value="">
              {translate("projects.projects.allHealth", { ns: "starter" }, "Any health")}
            </option>
            {(Object.keys(healthLabels) as ProjectHealth[]).map((key) => (
              <option key={key} value={key}>
                {healthLabels[key]}
              </option>
            ))}
          </select>
          {filters.length > 0 || state.health ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                reset();
                setActiveView("all");
              }}
            >
              {translate("projects.toolkit.resetFilters", { ns: "starter" }, "Reset")}
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ColumnsMenu i18nPrefix="projects.toolkit"
            table={table.reactTable}
            labels={columnLabels}
            onChange={prefs.setHidden}
          />
          <DensityMenu i18nPrefix="projects.toolkit" value={prefs.density} onChange={prefs.setDensity} />
          <ExportCsvButton i18nPrefix="projects.toolkit" onExport={handleExport} />
        </div>
      </Toolbar>

      <SavedViewBar i18nPrefix="projects.toolkit"
        presets={presets}
        views={views}
        activeKey={activeView}
        onApply={(query, key) => {
          applyQuery(query);
          setActiveView(key);
          setRowSelection({});
        }}
        onSave={(name) => {
          const view = saveView(name, urlQuery);
          setActiveView(view.id);
        }}
        onDelete={removeView}
      />

      {tableQuery.isError ? (
        <ErrorState i18nPrefix="projects.toolkit" onRetry={() => tableQuery.refetch()} />
      ) : (
        <div className={cn(densityClass(prefs.density))}>
          <DataTable table={table} />
        </div>
      )}

      <BulkBar i18nPrefix="projects.toolkit" count={selectedIds.length} onClear={() => setRowSelection({})}>
        {PROJECT_STATUSES.map((status) => (
          <Button
            key={status.value}
            variant="outline"
            size="sm"
            onClick={() => bulkStatus(status.value)}
          >
            {labelFor(PROJECT_STATUSES, status.value, translate)}
          </Button>
        ))}
      </BulkBar>

      <ProjectStats />
      <ProjectTimeline />
    </ListView>
  );
}
