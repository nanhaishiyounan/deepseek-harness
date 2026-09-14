import {
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
  Circle,
  Eye,
  Flag,
  Pencil,
  Trash2,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableFilterDropdownText } from "@/components/data-table/data-table-filter";
import { DataTableSorter } from "@/components/data-table/data-table-sorter";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { ShowButton } from "@/components/resources/buttons/show";
import { ListView } from "@/components/resources/views/list-view";
import { cn } from "@/lib/utils";
import { formatDate, todayIso } from "../constants";
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
import type { MilestoneRecord, ProjectRecord } from "../types";
import { milestoneTransitionValues } from "../transitions";

const STORAGE_KEY = "hub.pj.milestones";

const URL_DEFAULTS: Record<"q" | "project" | "state", string> = {
  q: "",
  project: "",
  state: "",
};

const daysLate = (dueDate: string | null | undefined, today: string) => {
  if (!dueDate || dueDate >= today) return 0;
  return Math.floor((Date.parse(today) - Date.parse(dueDate)) / 86400000);
};

export function MilestonesLayout() {
  return (
    <CanAccess
      resource="hub_pj_milestones"
      action="list"
      fallback={<AccessDenied />}
    >
      <MilestoneList />
    </CanAccess>
  );
}

function MilestoneList() {
  const locale = useLocale();
  const translate = useTranslate();
  const openChild = useOpenContextualChild();
  const { mutate: updateMilestone } = useUpdate<MilestoneRecord>();
  const today = todayIso();

  const { state, setState, query: urlQuery, applyQuery, reset } =
    useUrlState(URL_DEFAULTS);
  const { views, save: saveView, remove: removeView } =
    useSavedViews(STORAGE_KEY);
  const [activeView, setActiveView] = useState<string | null>(null);
  const prefs = useTablePrefs(STORAGE_KEY, ["project"]);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  const filters = useMemo<CrudFilters>(() => {
    const out: CrudFilters = [];
    if (state.q.trim()) {
      out.push({ field: "name", operator: "contains", value: state.q.trim() });
    }
    if (state.project) {
      out.push({
        field: "hub_pj_ms_project_id",
        operator: "eq",
        value: state.project,
      });
    }
    if (state.state === "open") {
      out.push({ field: "done", operator: "eq", value: false });
    }
    if (state.state === "done") {
      out.push({ field: "done", operator: "eq", value: true });
    }
    if (state.state === "overdue") {
      out.push({ field: "done", operator: "eq", value: false });
      out.push({ field: "due_date", operator: "lt", value: today });
    }
    return out;
  }, [state, today]);

  const { result: allResult } = useList<MilestoneRecord>({
    resource: "hub_pj_milestones",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
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

  const summary = useMemo(() => {
    const rows = allResult.data;
    const reached = rows.filter((row) => row.done === true).length;
    const open = rows.filter((row) => row.done !== true).length;
    const overdue = rows.filter(
      (row) => row.done !== true && Boolean(row.due_date) && row.due_date! < today
    ).length;
    return { total: rows.length, reached, open, overdue };
  }, [allResult.data, today]);

  const columnLabels = useMemo(
    () => ({
      name: translate(
        "projects.milestones.columns.milestone",
        { ns: "starter" },
        "Milestone"
      ),
      project: translate(
        "projects.milestones.columns.project",
        { ns: "starter" },
        "Project"
      ),
      due_date: translate(
        "projects.milestones.columns.target",
        { ns: "starter" },
        "Target"
      ),
      done: translate(
        "projects.milestones.columns.status",
        { ns: "starter" },
        "Status"
      ),
      days_late: translate(
        "projects.milestones.columns.daysLate",
        { ns: "starter" },
        "Days late"
      ),
    }),
    [translate]
  );

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<MilestoneRecord>();
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
            className="flex items-center gap-2 text-left font-medium underline-offset-2 hover:underline"
          >
            <Flag
              className={
                "size-3.5 " +
                (row.original.done
                  ? "text-emerald-500"
                  : "text-muted-foreground/50")
              }
            />
            {row.original.name || "—"}
          </button>
        ),
      }),
      columnHelper.accessor("project", {
        id: "project",
        header: columnLabels.project,
        enableSorting: false,
        cell: ({ getValue }) => getValue()?.name || "—",
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
        cell: ({ row }) => {
          const isOverdue =
            !row.original.done && (row.original.due_date ?? "") < today;
          return (
            <span
              className={
                "whitespace-nowrap " +
                (isOverdue ? "text-red-600 dark:text-red-400" : "")
              }
            >
              {formatDate(row.original.due_date, locale)}
            </span>
          );
        },
      }),
      columnHelper.accessor("done", {
        id: "done",
        header: columnLabels.done,
        enableSorting: false,
        cell: ({ getValue }) =>
          getValue() ? (
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
          ),
      }),
      columnHelper.display({
        id: "days_late",
        header: columnLabels.days_late,
        enableSorting: false,
        size: 100,
        cell: ({ row }) => {
          const late =
            row.original.done !== true
              ? daysLate(row.original.due_date, today)
              : 0;
          return late > 0 ? (
            <span className="font-medium tabular-nums text-red-600 dark:text-red-400">
              {late}
            </span>
          ) : (
            "—"
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
            {row.original.done ? (
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
                    id: row.original.id,
                    values: milestoneTransitionValues(true, row.original),
                  })
                }
              >
                <CheckCircle2 />
              </Button>
            )}
            <ShowButton
              resource="hub_pj_milestones"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              onClick={() => openChild(`show/${row.original.id}`)}
            >
              <Eye />
            </ShowButton>
            <EditButton
              resource="hub_pj_milestones"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              onClick={() => openChild(`edit/${row.original.id}`)}
            >
              <Pencil />
            </EditButton>
            <DeleteButton
              resource="hub_pj_milestones"
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
  }, [columnLabels, locale, openChild, today, translate, updateMilestone]);

  const table = useTable<MilestoneRecord>({
    columns,
    enableRowSelection: true,
    getRowId: (row) => String(row.id),
    state: { rowSelection, columnVisibility: prefs.columnVisibility },
    onRowSelectionChange: setRowSelection,
    refineCoreProps: {
      resource: "hub_pj_milestones",
      syncWithLocation: false,
      meta: { appends: ["project"] },
      filters: { permanent: filters },
      sorters: { initial: [{ field: "due_date", order: "asc" }] },
      errorNotification: false,
    },
  });

  const tableQuery = table.refineCore.tableQuery;
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  const exportList = useList<MilestoneRecord>({
    resource: "hub_pj_milestones",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    filters,
    meta: { appends: ["project"] },
    errorNotification: false,
    queryOptions: { enabled: false, retry: false },
  });

  const handleExport = useCallback(async () => {
    const response = await exportList.query.refetch();
    const rows = response.data?.data ?? [];
    downloadCsv(
      `milestones-${today}.csv`,
      [
        columnLabels.name,
        columnLabels.project,
        columnLabels.due_date,
        columnLabels.done,
        columnLabels.days_late,
      ],
      rows.map((row) => {
        const late = row.done !== true ? daysLate(row.due_date, today) : 0;
        return [
          row.name ?? "",
          row.project?.name ?? "",
          row.due_date ?? "",
          row.done
            ? translate(
                "projects.milestones.status.completed",
                { ns: "starter" },
                "Completed"
              )
            : translate(
                "projects.milestones.status.pending",
                { ns: "starter" },
                "Pending"
              ),
          late > 0 ? late : "",
        ];
      })
    );
  }, [columnLabels, exportList.query, today, translate]);

  const bulkDone = (done: boolean) => {
    selectedIds.forEach((id) =>
      updateMilestone({
        resource: "hub_pj_milestones",
        id,
        values: milestoneTransitionValues(
          done,
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
        label: translate(
          "projects.milestones.views.all",
          { ns: "starter" },
          "All"
        ),
        query: "",
      },
      {
        key: "open",
        label: translate(
          "projects.milestones.views.open",
          { ns: "starter" },
          "Open"
        ),
        query: "state=open",
      },
      {
        key: "overdue",
        label: translate(
          "projects.milestones.views.overdue",
          { ns: "starter" },
          "Overdue"
        ),
        query: "state=overdue",
      },
      {
        key: "done",
        label: translate(
          "projects.milestones.views.reached",
          { ns: "starter" },
          "Reached"
        ),
        query: "state=done",
      },
    ],
    [translate]
  );

  const reachedPercent = summary.total
    ? Math.round((summary.reached / summary.total) * 100)
    : 0;
  const overduePercent = summary.open
    ? Math.round((summary.overdue / summary.open) * 100)
    : 0;
  const kpiItems = [
    {
      key: "total",
      label: translate(
        "projects.milestones.kpi.total",
        { ns: "starter" },
        "Total milestones"
      ),
      value: String(summary.total),
      hint: translate(
        "projects.milestones.kpi.totalHint",
        { ns: "starter", open: summary.open },
        `${summary.open} open`
      ),
      icon: <Flag className="size-4" />,
      tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
      active: !state.state,
      onClick: () => {
        setState({ state: "" });
        setActiveView("all");
      },
    },
    {
      key: "reached",
      label: translate(
        "projects.milestones.kpi.reached",
        { ns: "starter" },
        "Reached"
      ),
      value: String(summary.reached),
      hint: translate(
        "projects.milestones.kpi.reachedHint",
        { ns: "starter", percent: reachedPercent },
        `${reachedPercent}% of total`
      ),
      icon: <CheckCircle2 className="size-4" />,
      tone: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-400",
      active: state.state === "done",
      onClick: () => {
        setState({ state: "done" });
        setActiveView("done");
      },
    },
    {
      key: "open",
      label: translate(
        "projects.milestones.kpi.open",
        { ns: "starter" },
        "Open"
      ),
      value: String(summary.open),
      hint: translate(
        "projects.milestones.kpi.openHint",
        { ns: "starter", overdue: summary.overdue },
        `${summary.overdue} overdue`
      ),
      icon: <Circle className="size-4" />,
      tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
      active: state.state === "open",
      onClick: () => {
        setState({ state: "open" });
        setActiveView("open");
      },
    },
    {
      key: "overdue",
      label: translate(
        "projects.milestones.kpi.overdue",
        { ns: "starter" },
        "Overdue"
      ),
      value: String(summary.overdue),
      hint: translate(
        "projects.milestones.kpi.overdueHint",
        { ns: "starter", percent: overduePercent },
        `${overduePercent}% of open`
      ),
      icon: <AlertTriangle className="size-4" />,
      tone: "text-red-600 bg-red-500/12 dark:text-red-400",
      active: state.state === "overdue",
      onClick: () => {
        setState({ state: "overdue" });
        setActiveView("overdue");
      },
    },
  ];

  const hasFilters = Boolean(state.q || state.project || state.state);

  return (
    <ListView resource="hub_pj_milestones">
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
              "projects.milestones.searchPlaceholder",
              { ns: "starter" },
              "Search milestones..."
            )}
          />
          <select
            value={state.project}
            onChange={(event) => {
              setState({ project: event.currentTarget.value });
              setActiveView(null);
            }}
            className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs"
          >
            <option value="">
              {translate(
                "projects.milestones.allProjects",
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
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                reset();
                setActiveView("all");
              }}
            >
              {translate(
                "projects.toolkit.resetFilters",
                { ns: "starter" },
                "Reset"
              )}
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
        <Button variant="outline" size="sm" onClick={() => bulkDone(true)}>
          {translate(
            "projects.milestones.bulk.markReached",
            { ns: "starter" },
            "Mark reached"
          )}
        </Button>
        <Button variant="outline" size="sm" onClick={() => bulkDone(false)}>
          {translate(
            "projects.milestones.bulk.reopen",
            { ns: "starter" },
            "Reopen"
          )}
        </Button>
      </BulkBar>
    </ListView>
  );
}
