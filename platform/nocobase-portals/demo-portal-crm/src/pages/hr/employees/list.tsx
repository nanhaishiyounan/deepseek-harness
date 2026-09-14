import {
  useGetLocale,
  useList,
  useTranslate,
  useUpdate,
  type CrudFilters,
} from "@refinedev/core";
import { useTable } from "@refinedev/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import {
  CalendarOff,
  Eye,
  Network,
  Pencil,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { CanAccess } from "@/components/access-control/can-access";
import { AccessDenied } from "@/components/access-control/access-denied";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableFilterDropdownText } from "@/components/data-table/data-table-filter";
import { DataTableSorter } from "@/components/data-table/data-table-sorter";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { ShowButton } from "@/components/resources/buttons/show";
import { ListView } from "@/components/resources/views/list-view";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EMPLOYEE_STATUSES, formatDate, labelFor } from "../constants";
import { useDepartmentOptions } from "../pickers";
import { EnumBadge } from "../shared";
import { HrCharts } from "../stats";
import {
  BulkBar,
  ColumnsMenu,
  DeleteBulkButton,
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
import type { EmployeeRecord } from "../types";

const STORAGE_KEY = "hub.hr.employees";

const URL_DEFAULTS: Record<"q" | "status" | "dept" | "hired", string> = {
  q: "",
  status: "",
  dept: "",
  hired: "",
};

/** Windows used by the "recent hires" shortcuts — real hire_date filters. */
const HIRED_WINDOWS: Record<string, number> = { "90d": 90, "1y": 365 };

const daysAgoIso = (days: number) =>
  new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

const tenureYears = (hireDate: string | null | undefined) => {
  if (!hireDate) return null;
  const hired = new Date(hireDate).getTime();
  if (Number.isNaN(hired)) return null;
  return (Date.now() - hired) / (365.25 * 86400000);
};

export function EmployeesLayout() {
  return (
    <CanAccess
      resource="hub_hr_employees"
      action="list"
      fallback={<AccessDenied />}
    >
      <EmployeeList />
    </CanAccess>
  );
}

function EmployeeList() {
  const translate = useTranslate();
  const getLocale = useGetLocale();
  const locale = getLocale();
  const navigate = useNavigate();
  const { mutate: updateEmployee } = useUpdate<EmployeeRecord>();
  const { options: departmentOptions } = useDepartmentOptions();

  const { state, setState, query: urlQuery, applyQuery, reset } =
    useUrlState(URL_DEFAULTS);
  const { views, save: saveView, remove: removeView } =
    useSavedViews(STORAGE_KEY);
  const [activeView, setActiveView] = useState<string | null>(null);
  const prefs = useTablePrefs(STORAGE_KEY, ["email"]);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  const filters = useMemo<CrudFilters>(() => {
    const out: CrudFilters = [];
    if (state.q.trim()) {
      out.push({ field: "name", operator: "contains", value: state.q.trim() });
    }
    if (state.status) {
      out.push({ field: "status", operator: "eq", value: state.status });
    }
    if (state.dept) {
      out.push({ field: "department_id", operator: "eq", value: state.dept });
    }
    const window = HIRED_WINDOWS[state.hired];
    if (window) {
      out.push({
        field: "hire_date",
        operator: "gte",
        value: daysAgoIso(window),
      });
    }
    return out;
  }, [state]);

  /* ---- headline numbers (unfiltered, so the tiles stay a stable frame) --- */
  const { result: allResult, query: allQuery } = useList<EmployeeRecord>({
    resource: "hub_hr_employees",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    meta: { appends: ["department"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const summary = useMemo(() => {
    const rows = allResult.data;
    const departments = new Set(
      rows
        .filter((row) => row.status !== "terminated" && row.department_id != null)
        .map((row) => String(row.department_id))
    );
    return {
      total: rows.length,
      active: rows.filter((row) => row.status === "active").length,
      onLeave: rows.filter((row) => row.status === "onleave").length,
      terminated: rows.filter((row) => row.status === "terminated").length,
      departments: departments.size,
    };
  }, [allResult.data]);

  /* ------------------------------- columns ------------------------------- */
  const columnLabels = useMemo(
    () => ({
      name: translate("hr.employees.fields.name", { ns: "starter" }, "Name"),
      job_title: translate("hr.employees.fields.title", { ns: "starter" }, "Title"),
      email: translate("hr.employees.fields.email", { ns: "starter" }, "Email"),
      department: translate(
        "hr.employees.fields.department",
        { ns: "starter" },
        "Department"
      ),
      manager: translate("hr.employees.fields.manager", { ns: "starter" }, "Manager"),
      status: translate("hr.employees.fields.status", { ns: "starter" }, "Status"),
      hire_date: translate(
        "hr.employees.fields.hireDate",
        { ns: "starter" },
        "Hire date"
      ),
      tenure: translate("hr.employees.fields.tenure", { ns: "starter" }, "Tenure"),
    }),
    [translate]
  );

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<EmployeeRecord>();
    return [
      columnHelper.display({
        id: "select",
        size: 40,
        enableSorting: false,
        header: ({ table }) => <SelectAllCheckbox i18nPrefix="hr.toolkit" table={table} />,
        cell: ({ row }) => (
          <RowCheckbox i18nPrefix="hr.toolkit"
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
        cell: ({ getValue, row }) => (
          <button
            type="button"
            className="font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => navigate(`/employees/show/${row.original.id}`)}
          >
            {getValue() || "—"}
          </button>
        ),
      }),
      columnHelper.accessor("job_title", {
        id: "job_title",
        header: columnLabels.job_title,
        enableSorting: false,
        cell: ({ getValue }) => getValue() || "—",
      }),
      columnHelper.accessor("email", {
        id: "email",
        header: columnLabels.email,
        enableSorting: false,
        cell: ({ getValue }) => {
          const value = getValue();
          return value ? (
            <a
              href={`mailto:${value}`}
              className="text-primary underline-offset-2 hover:underline"
            >
              {value}
            </a>
          ) : (
            "—"
          );
        },
      }),
      columnHelper.accessor((record) => record.department?.name, {
        id: "department",
        header: columnLabels.department,
        enableSorting: false,
        cell: ({ getValue }) => getValue() || "—",
      }),
      columnHelper.accessor((record) => record.manager?.name, {
        id: "manager",
        header: columnLabels.manager,
        enableSorting: false,
        cell: ({ getValue }) => getValue() || "—",
      }),
      columnHelper.accessor("status", {
        id: "status",
        header: columnLabels.status,
        enableSorting: false,
        cell: ({ getValue }) => {
          const value = getValue() ?? "active";
          return (
            <EnumBadge
              value={value}
              label={labelFor(EMPLOYEE_STATUSES, value, translate)}
            />
          );
        },
      }),
      columnHelper.accessor("hire_date", {
        id: "hire_date",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>{columnLabels.hire_date}</span>
            <DataTableSorter column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => formatDate(getValue(), locale),
      }),
      columnHelper.display({
        id: "tenure",
        header: columnLabels.tenure,
        enableSorting: false,
        size: 96,
        cell: ({ row }) => {
          const years = tenureYears(row.original.hire_date);
          if (years === null) return "—";
          return (
            <span className="tabular-nums">
              {translate(
                "hr.employees.tenureYears",
                { ns: "starter", years: years.toFixed(1) },
                `${years.toFixed(1)} yrs`
              )}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: translate("hr.common.actions", { ns: "starter" }, "Actions"),
        enableSorting: false,
        size: 144,
        cell: ({ row }) => (
          <div className="flex items-center gap-1 opacity-60 transition-opacity group-hover/row:opacity-100">
            <ShowButton
              resource="hub_hr_employees"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
            >
              <Eye />
            </ShowButton>
            <EditButton
              resource="hub_hr_employees"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
            >
              <Pencil />
            </EditButton>
            <DeleteButton
              resource="hub_hr_employees"
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
  }, [columnLabels, locale, navigate, translate]);

  const table = useTable<EmployeeRecord>({
    columns,
    enableRowSelection: true,
    getRowId: (row) => String(row.id),
    state: { rowSelection, columnVisibility: prefs.columnVisibility },
    onRowSelectionChange: setRowSelection,
    refineCoreProps: {
      resource: "hub_hr_employees",
      syncWithLocation: false,
      meta: { appends: ["department", "manager"] },
      filters: { permanent: filters },
      sorters: { initial: [{ field: "name", order: "asc" }] },
      errorNotification: false,
    },
  });

  const tableQuery = table.refineCore.tableQuery;
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  /* -------------------------------- export ------------------------------- */
  const exportList = useList<EmployeeRecord>({
    resource: "hub_hr_employees",
    pagination: { mode: "server", currentPage: 1, pageSize: 1000 },
    filters,
    meta: { appends: ["department", "manager"] },
    errorNotification: false,
    queryOptions: { enabled: false, retry: false },
  });

  const handleExport = useCallback(async () => {
    const response = await exportList.query.refetch();
    const rows = response.data?.data ?? [];
    downloadCsv(
      `employees-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        columnLabels.name,
        columnLabels.job_title,
        columnLabels.email,
        columnLabels.department,
        columnLabels.manager,
        columnLabels.status,
        columnLabels.hire_date,
      ],
      rows.map((row) => [
        row.name,
        row.job_title,
        row.email,
        row.department?.name,
        row.manager?.name,
        labelFor(EMPLOYEE_STATUSES, row.status ?? "active", translate),
        row.hire_date ? String(row.hire_date).slice(0, 10) : "",
      ])
    );
  }, [columnLabels, exportList.query, translate]);

  /* ------------------------------ bulk actions --------------------------- */
  const bulkStatus = (status: string) => {
    selectedIds.forEach((id) =>
      updateEmployee({
        resource: "hub_hr_employees",
        id,
        values: { status },
        successNotification: false,
        invalidates: ["list"],
      })
    );
    setRowSelection({});
  };

  /* ------------------------------ saved views ---------------------------- */
  const presets = useMemo(
    () => [
      {
        key: "all",
        label: translate("hr.employees.views.all", { ns: "starter" }, "Everyone"),
        query: "",
      },
      {
        key: "active",
        label: translate("hr.employees.views.active", { ns: "starter" }, "Active"),
        query: "status=active",
      },
      {
        key: "onleave",
        label: translate(
          "hr.employees.views.onLeave",
          { ns: "starter" },
          "On leave"
        ),
        query: "status=onleave",
      },
      {
        key: "newHires",
        label: translate(
          "hr.employees.views.newHires",
          { ns: "starter" },
          "Hired in 90 days"
        ),
        query: "hired=90d",
      },
      {
        key: "leavers",
        label: translate("hr.employees.views.leavers", { ns: "starter" }, "Leavers"),
        query: "status=terminated",
      },
    ],
    [translate]
  );

  const applyView = (query: string, key: string) => {
    applyQuery(query);
    setActiveView(key);
    setRowSelection({});
  };

  const kpiItems = [
    {
      key: "total",
      label: translate("hr.stats.headcount.label", { ns: "starter" }, "Headcount"),
      value: String(summary.total),
      hint: translate("hr.stats.headcount.hint", { ns: "starter" }, "Total on file"),
      icon: <Users className="size-4" />,
      tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
      active: !state.status,
      onClick: () => {
        setState({ status: "" });
        setActiveView("all");
      },
    },
    {
      key: "active",
      label: translate("hr.stats.active.label", { ns: "starter" }, "Active"),
      value: String(summary.active),
      hint: translate("hr.stats.active.hint", { ns: "starter" }, "Currently working"),
      icon: <UserCheck className="size-4" />,
      tone: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-400",
      active: state.status === "active",
      onClick: () => {
        setState({ status: "active" });
        setActiveView("active");
      },
    },
    {
      key: "onleave",
      label: translate("hr.stats.onLeave.label", { ns: "starter" }, "On leave"),
      value: String(summary.onLeave),
      hint: translate("hr.stats.onLeave.hint", { ns: "starter" }, "Away right now"),
      icon: <CalendarOff className="size-4" />,
      tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
      active: state.status === "onleave",
      onClick: () => {
        setState({ status: "onleave" });
        setActiveView("onleave");
      },
    },
    {
      key: "terminated",
      label: translate(
        "hr.enums.employeeStatus.terminated",
        { ns: "starter" },
        "Terminated"
      ),
      value: String(summary.terminated),
      hint: translate(
        "hr.stats.turnover.hint",
        { ns: "starter", rate: summary.total
          ? ((summary.terminated / summary.total) * 100).toFixed(1)
          : "0.0" },
        `${
          summary.total
            ? ((summary.terminated / summary.total) * 100).toFixed(1)
            : "0.0"
        }% turnover`
      ),
      icon: <UserMinus className="size-4" />,
      tone: "text-red-600 bg-red-500/12 dark:text-red-400",
      active: state.status === "terminated",
      onClick: () => {
        setState({ status: "terminated" });
        setActiveView("leavers");
      },
    },
    {
      key: "departments",
      label: translate(
        "hr.stats.departments.label",
        { ns: "starter" },
        "Departments"
      ),
      value: String(summary.departments),
      hint: translate("hr.stats.departments.hint", { ns: "starter" }, "With staff"),
      icon: <Network className="size-4" />,
      tone: "text-teal-600 bg-teal-500/12 dark:text-teal-400",
    },
  ];

  return (
    <ListView resource="hub_hr_employees">
      <KpiBar items={kpiItems} className="xl:grid-cols-5" />

      <Toolbar>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <ToolbarSearch i18nPrefix="hr.toolkit"
            value={state.q}
            onChange={(value) => {
              setState({ q: value });
              setActiveView(null);
            }}
            placeholder={translate(
              "hr.employees.searchPlaceholder",
              { ns: "starter" },
              "Search people..."
            )}
          />
          <select
            value={state.dept}
            onChange={(event) => {
              setState({ dept: event.currentTarget.value });
              setActiveView(null);
            }}
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
          {filters.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                reset();
                setActiveView("all");
              }}
            >
              {translate("hr.toolkit.resetFilters", { ns: "starter" }, "Reset")}
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ColumnsMenu i18nPrefix="hr.toolkit"
            table={table.reactTable}
            labels={columnLabels}
            onChange={prefs.setHidden}
          />
          <DensityMenu i18nPrefix="hr.toolkit" value={prefs.density} onChange={prefs.setDensity} />
          <ExportCsvButton i18nPrefix="hr.toolkit" onExport={handleExport} />
        </div>
      </Toolbar>

      <SavedViewBar i18nPrefix="hr.toolkit"
        presets={presets}
        views={views}
        activeKey={activeView}
        onApply={applyView}
        onSave={(name) => {
          const view = saveView(name, urlQuery);
          setActiveView(view.id);
        }}
        onDelete={removeView}
      />

      {tableQuery.isError ? (
        <ErrorState i18nPrefix="hr.toolkit" onRetry={() => tableQuery.refetch()} />
      ) : (
        <div className={cn("[&_tbody_tr]:group/row", densityClass(prefs.density))}>
          <DataTable table={table} />
        </div>
      )}

      <BulkBar i18nPrefix="hr.toolkit" count={selectedIds.length} onClear={() => setRowSelection({})}>
        {EMPLOYEE_STATUSES.map((status) => (
          <Button
            key={status.value}
            variant="outline"
            size="sm"
            onClick={() => bulkStatus(status.value)}
          >
            {translate(
              "hr.employees.bulk.setStatus",
              {
                ns: "starter",
                status: labelFor(EMPLOYEE_STATUSES, status.value, translate),
              },
              `Mark ${labelFor(EMPLOYEE_STATUSES, status.value, translate)}`
            )}
          </Button>
        ))}
        <DeleteBulkButton i18nPrefix="hr.toolkit"
          onConfirm={() => {
            selectedIds.forEach((id) =>
              updateEmployee({
                resource: "hub_hr_employees",
                id,
                values: { status: "terminated" },
                successNotification: false,
                invalidates: ["list"],
              })
            );
            setRowSelection({});
          }}
          label={translate(
            "hr.employees.bulk.offboard",
            { ns: "starter" },
            "Offboard"
          )}
        />
      </BulkBar>

      <HrCharts employees={allResult.data} isLoading={allQuery.isLoading} />
    </ListView>
  );
}
