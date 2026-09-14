import {
  useGetLocale,
  useGetIdentity,
  useList,
  useTranslate,
  useUpdate,
  type CrudFilters,
} from "@refinedev/core";
import { useTable } from "@refinedev/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import {
  CalendarClock,
  Check,
  Clock,
  Eye,
  Pencil,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { CanAccess } from "@/components/access-control/can-access";
import { AccessDenied } from "@/components/access-control/access-denied";
import { DataTable } from "@/components/data-table/data-table";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { ShowButton } from "@/components/resources/buttons/show";
import { ListView } from "@/components/resources/views/list-view";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LEAVE_STATUSES,
  LEAVE_TYPES,
  formatDate,
  labelFor,
} from "../constants";
import { EnumBadge } from "../shared";
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
import type { LeaveRequestRecord } from "../types";
import {
  leaveTransitionValues,
  type LeaveDecisionStatus,
} from "./transitions";

const STORAGE_KEY = "hub.hr.leave";

const URL_DEFAULTS: Record<"q" | "status" | "type" | "window", string> = {
  q: "",
  status: "",
  type: "",
  window: "",
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const inDaysIso = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

export function LeaveLayout() {
  return (
    <CanAccess
      resource="hub_hr_leave_requests"
      action="list"
      fallback={<AccessDenied />}
    >
      <LeaveList />
    </CanAccess>
  );
}

function LeaveList() {
  const translate = useTranslate();
  const getLocale = useGetLocale();
  const locale = getLocale();
  const navigate = useNavigate();
  const { mutate: updateLeave } = useUpdate<LeaveRequestRecord>();
  const { data: identity } = useGetIdentity<{ id?: string | number }>();

  const { state, setState, query: urlQuery, applyQuery, reset } =
    useUrlState(URL_DEFAULTS);
  const { views, save: saveView, remove: removeView } =
    useSavedViews(STORAGE_KEY);
  const [activeView, setActiveView] = useState<string | null>("pending");
  const prefs = useTablePrefs(STORAGE_KEY, ["reason"]);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  const decisionValues = useCallback(
    (status: LeaveDecisionStatus) => {
      if (status === "pending") {
        return window.confirm(
          translate(
            "hr.leave.actions.reopenConfirm",
            { ns: "starter" },
            "Reopen this request and clear its previous decision?"
          )
        )
          ? leaveTransitionValues(status)
          : null;
      }
      if (identity?.id == null) {
        window.alert(
          translate(
            "hr.leave.actions.identityRequired",
            { ns: "starter" },
            "Your user identity could not be resolved. The decision was not saved."
          )
        );
        return null;
      }
      const comment = window.prompt(
        translate(
          "hr.leave.actions.commentPrompt",
          { ns: "starter" },
          "Enter a decision comment (required)"
        )
      );
      if (comment === null) return null;
      if (!comment.trim()) {
        window.alert(
          translate(
            "hr.leave.actions.commentRequired",
            { ns: "starter" },
            "A decision comment is required."
          )
        );
        return null;
      }
      return leaveTransitionValues(status, identity.id, comment);
    },
    [identity?.id, translate]
  );

  const setStatus = useCallback(
    (id: string | number, status: LeaveDecisionStatus) => {
      const values = decisionValues(status);
      if (!values) return;
      updateLeave({
        resource: "hub_hr_leave_requests",
        id,
        values,
        successNotification: {
          type: "success",
          message: translate(
            `hr.leave.notification.${status}`,
            { ns: "starter" },
            `Request ${status}`
          ),
        },
      });
    },
    [decisionValues, translate, updateLeave]
  );

  const filters = useMemo<CrudFilters>(() => {
    const out: CrudFilters = [];
    if (state.status) {
      out.push({ field: "status", operator: "eq", value: state.status });
    }
    if (state.type) {
      out.push({ field: "type", operator: "eq", value: state.type });
    }
    if (state.window === "upcoming") {
      out.push({ field: "start_date", operator: "gte", value: todayIso() });
    }
    if (state.window === "week") {
      out.push({ field: "start_date", operator: "lte", value: inDaysIso(7) });
      out.push({ field: "end_date", operator: "gte", value: todayIso() });
    }
    if (state.window === "past") {
      out.push({ field: "end_date", operator: "lt", value: todayIso() });
    }
    return out;
  }, [state]);

  /* Client-side name search: the request row carries the employee relation, so
     filtering on the loaded page keeps the API contract simple. */
  const searchTerm = state.q.trim().toLowerCase();

  /* --------------------------- summary numbers --------------------------- */
  const { result: allResult } = useList<LeaveRequestRecord>({
    resource: "hub_hr_leave_requests",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    meta: { appends: ["employee"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const summary = useMemo(() => {
    const rows = allResult.data;
    const today = todayIso();
    const weekAhead = inDaysIso(7);
    return {
      pending: rows.filter((row) => (row.status ?? "pending") === "pending")
        .length,
      approved: rows.filter((row) => row.status === "approved").length,
      rejected: rows.filter((row) => row.status === "rejected").length,
      upcoming: rows.filter(
        (row) =>
          row.status === "approved" &&
          (row.start_date ?? "") >= today &&
          (row.start_date ?? "") <= weekAhead
      ).length,
      daysPending: rows
        .filter((row) => (row.status ?? "pending") === "pending")
        .reduce((total, row) => total + Number(row.days ?? 0), 0),
    };
  }, [allResult.data]);

  /* ------------------------------- columns ------------------------------- */
  const columnLabels = useMemo(
    () => ({
      employee: translate("hr.leave.fields.employee", { ns: "starter" }, "Employee"),
      type: translate("hr.leave.fields.type", { ns: "starter" }, "Type"),
      dates: translate("hr.leave.fields.dates", { ns: "starter" }, "Dates"),
      days: translate("hr.leave.fields.days", { ns: "starter" }, "Days"),
      status: translate("hr.leave.fields.status", { ns: "starter" }, "Status"),
      reason: translate("hr.leave.fields.reason", { ns: "starter" }, "Reason"),
      submitted: translate(
        "hr.leave.fields.submitted",
        { ns: "starter" },
        "Submitted"
      ),
    }),
    [translate]
  );

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<LeaveRequestRecord>();
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
      columnHelper.accessor((record) => record.employee?.name, {
        id: "employee",
        header: columnLabels.employee,
        enableSorting: false,
        cell: ({ row, getValue }) => (
          <button
            type="button"
            className="flex flex-col text-left"
            onClick={() => navigate(`/leave/show/${row.original.id}`)}
          >
            <span className="font-medium text-primary underline-offset-2 hover:underline">
              {getValue() || "—"}
            </span>
            <span className="text-xs text-muted-foreground">
              {row.original.employee?.job_title || ""}
            </span>
          </button>
        ),
      }),
      columnHelper.accessor("type", {
        id: "type",
        header: columnLabels.type,
        enableSorting: false,
        cell: ({ getValue }) => {
          const value = getValue() ?? "annual";
          return (
            <EnumBadge value={value} label={labelFor(LEAVE_TYPES, value, translate)} />
          );
        },
      }),
      columnHelper.display({
        id: "dates",
        header: columnLabels.dates,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {formatDate(row.original.start_date, locale)} –{" "}
            {formatDate(row.original.end_date, locale)}
          </span>
        ),
      }),
      columnHelper.accessor("days", {
        id: "days",
        header: columnLabels.days,
        enableSorting: false,
        size: 80,
        cell: ({ getValue }) => (
          <span className="tabular-nums">{getValue() ?? "—"}</span>
        ),
      }),
      columnHelper.accessor("reason", {
        id: "reason",
        header: columnLabels.reason,
        enableSorting: false,
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue() || "—"}</span>
        ),
      }),
      columnHelper.accessor("createdAt", {
        id: "submitted",
        header: columnLabels.submitted,
        enableSorting: false,
        cell: ({ getValue }) => formatDate(getValue(), locale),
      }),
      columnHelper.accessor("status", {
        id: "status",
        header: columnLabels.status,
        enableSorting: false,
        cell: ({ getValue }) => {
          const value = getValue() ?? "pending";
          return (
            <EnumBadge value={value} label={labelFor(LEAVE_STATUSES, value, translate)} />
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: translate("hr.common.actions", { ns: "starter" }, "Actions"),
        enableSorting: false,
        size: 236,
        cell: ({ row }) => {
          const isPending = (row.original.status ?? "pending") === "pending";
          return (
            <div className="flex items-center gap-1">
              {isPending ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400"
                    onClick={() => setStatus(row.original.id, "approved")}
                  >
                    <Check className="size-4" />
                    {translate("hr.leave.actions.approve", { ns: "starter" }, "Approve")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-red-500/40 text-red-700 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
                    onClick={() => setStatus(row.original.id, "rejected")}
                  >
                    <X className="size-4" />
                    {translate("hr.leave.actions.reject", { ns: "starter" }, "Reject")}
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-muted-foreground"
                  onClick={() => setStatus(row.original.id, "pending")}
                >
                  {translate("hr.leave.actions.reopen", { ns: "starter" }, "Reopen")}
                </Button>
              )}
              <ShowButton
                resource="hub_hr_leave_requests"
                recordItemId={row.original.id}
                variant="ghost"
                size="icon"
              >
                <Eye />
              </ShowButton>
              <EditButton
                resource="hub_hr_leave_requests"
                recordItemId={row.original.id}
                variant="ghost"
                size="icon"
              >
                <Pencil />
              </EditButton>
              <DeleteButton
                resource="hub_hr_leave_requests"
                recordItemId={row.original.id}
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 />
              </DeleteButton>
            </div>
          );
        },
      }),
    ];
  }, [columnLabels, locale, navigate, setStatus, translate]);

  const table = useTable<LeaveRequestRecord>({
    columns,
    enableRowSelection: true,
    getRowId: (row) => String(row.id),
    state: { rowSelection, columnVisibility: prefs.columnVisibility },
    onRowSelectionChange: setRowSelection,
    refineCoreProps: {
      resource: "hub_hr_leave_requests",
      syncWithLocation: false,
      meta: { appends: ["employee"] },
      filters: { permanent: filters },
      sorters: { initial: [{ field: "start_date", order: "desc" }] },
      errorNotification: false,
    },
  });

  const tableQuery = table.refineCore.tableQuery;
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  // The employee search runs over the rendered page so the table stays in
  // sync with the server-side filters above.
  const visibleRows = table.reactTable.getRowModel().rows;
  const hiddenBySearch = searchTerm
    ? visibleRows.filter(
        (row) =>
          !(row.original.employee?.name ?? "").toLowerCase().includes(searchTerm)
      ).length
    : 0;

  const exportList = useList<LeaveRequestRecord>({
    resource: "hub_hr_leave_requests",
    pagination: { mode: "server", currentPage: 1, pageSize: 1000 },
    filters,
    meta: { appends: ["employee"] },
    errorNotification: false,
    queryOptions: { enabled: false, retry: false },
  });

  const handleExport = useCallback(async () => {
    const response = await exportList.query.refetch();
    const rows = response.data?.data ?? [];
    downloadCsv(
      `leave-requests-${todayIso()}.csv`,
      [
        columnLabels.employee,
        columnLabels.type,
        translate("hr.leave.fields.start", { ns: "starter" }, "Start"),
        translate("hr.leave.fields.end", { ns: "starter" }, "End"),
        columnLabels.days,
        columnLabels.status,
        columnLabels.reason,
      ],
      rows.map((row) => [
        row.employee?.name,
        labelFor(LEAVE_TYPES, row.type ?? "annual", translate),
        row.start_date ? String(row.start_date).slice(0, 10) : "",
        row.end_date ? String(row.end_date).slice(0, 10) : "",
        row.days,
        labelFor(LEAVE_STATUSES, row.status ?? "pending", translate),
        row.reason,
      ])
    );
  }, [columnLabels, exportList.query, translate]);

  const bulkDecide = (status: LeaveDecisionStatus) => {
    const values = decisionValues(status);
    if (!values) return;
    selectedIds.forEach((id) =>
      updateLeave({
        resource: "hub_hr_leave_requests",
        id,
        values,
        successNotification: false,
        invalidates: ["list"],
      })
    );
    setRowSelection({});
  };

  const presets = useMemo(
    () => [
      {
        key: "pending",
        label: translate(
          "hr.leave.views.pending",
          { ns: "starter" },
          "Waiting on me"
        ),
        query: "status=pending",
      },
      {
        key: "week",
        label: translate("hr.leave.views.week", { ns: "starter" }, "Off this week"),
        query: "window=week",
      },
      {
        key: "upcoming",
        label: translate("hr.leave.views.upcoming", { ns: "starter" }, "Upcoming"),
        query: "window=upcoming",
      },
      {
        key: "approved",
        label: translate("hr.leave.views.approved", { ns: "starter" }, "Approved"),
        query: "status=approved",
      },
      {
        key: "all",
        label: translate("hr.leave.views.all", { ns: "starter" }, "All requests"),
        query: "",
      },
    ],
    [translate]
  );

  const kpiItems = [
    {
      key: "pending",
      label: translate("hr.leave.kpi.pending", { ns: "starter" }, "Awaiting decision"),
      value: String(summary.pending),
      hint: translate(
        "hr.leave.kpi.pendingHint",
        { ns: "starter", days: summary.daysPending },
        `${summary.daysPending} days requested`
      ),
      icon: <Clock className="size-4" />,
      tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
      active: state.status === "pending",
      onClick: () => {
        applyQuery("status=pending");
        setActiveView("pending");
      },
    },
    {
      key: "upcoming",
      label: translate("hr.leave.kpi.upcoming", { ns: "starter" }, "Starting in 7 days"),
      value: String(summary.upcoming),
      hint: translate(
        "hr.leave.kpi.upcomingHint",
        { ns: "starter" },
        "Approved and imminent"
      ),
      icon: <CalendarClock className="size-4" />,
      tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
      active: state.window === "upcoming",
      onClick: () => {
        applyQuery("window=upcoming");
        setActiveView("upcoming");
      },
    },
    {
      key: "approved",
      label: translate("hr.enums.leaveStatus.approved", { ns: "starter" }, "Approved"),
      value: String(summary.approved),
      hint: translate("hr.leave.kpi.approvedHint", { ns: "starter" }, "All time"),
      icon: <ThumbsUp className="size-4" />,
      tone: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-400",
      active: state.status === "approved",
      onClick: () => {
        applyQuery("status=approved");
        setActiveView("approved");
      },
    },
    {
      key: "rejected",
      label: translate("hr.enums.leaveStatus.rejected", { ns: "starter" }, "Rejected"),
      value: String(summary.rejected),
      hint: translate(
        "hr.leave.kpi.rejectedHint",
        {
          ns: "starter",
          rate:
            summary.approved + summary.rejected > 0
              ? (
                  (summary.rejected / (summary.approved + summary.rejected)) *
                  100
                ).toFixed(0)
              : "0",
        },
        "Rejection rate"
      ),
      icon: <X className="size-4" />,
      tone: "text-red-600 bg-red-500/12 dark:text-red-400",
      active: state.status === "rejected",
      onClick: () => {
        applyQuery("status=rejected");
        setActiveView("rejected");
      },
    },
  ];

  return (
    <ListView resource="hub_hr_leave_requests">
      <KpiBar items={kpiItems} />

      <Toolbar>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <ToolbarSearch i18nPrefix="hr.toolkit"
            value={state.q}
            onChange={(value) => setState({ q: value })}
            placeholder={translate(
              "hr.leave.searchPlaceholder",
              { ns: "starter" },
              "Filter by employee..."
            )}
          />
          <select
            value={state.type}
            onChange={(event) => {
              setState({ type: event.currentTarget.value });
              setActiveView(null);
            }}
            className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs"
          >
            <option value="">
              {translate("hr.leave.allTypes", { ns: "starter" }, "All types")}
            </option>
            {LEAVE_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {labelFor(LEAVE_TYPES, type.value, translate)}
              </option>
            ))}
          </select>
          {filters.length > 0 || state.q ? (
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
        <ErrorState i18nPrefix="hr.toolkit" onRetry={() => tableQuery.refetch()} />
      ) : (
        <>
          {hiddenBySearch > 0 ? (
            <p className="text-xs text-muted-foreground">
              {translate(
                "hr.leave.searchHint",
                { ns: "starter", count: hiddenBySearch },
                `${hiddenBySearch} rows on this page don't match "${state.q}".`
              )}
            </p>
          ) : null}
          <div className={cn(densityClass(prefs.density))}>
            <DataTable table={table} />
          </div>
        </>
      )}

      <BulkBar i18nPrefix="hr.toolkit" count={selectedIds.length} onClear={() => setRowSelection({})}>
        <Button
          variant="outline"
          size="sm"
          className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
          onClick={() => bulkDecide("approved")}
        >
          <Check className="size-4" />
          {translate("hr.leave.actions.approve", { ns: "starter" }, "Approve")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-red-500/40 text-red-700 dark:text-red-400"
          onClick={() => bulkDecide("rejected")}
        >
          <X className="size-4" />
          {translate("hr.leave.actions.reject", { ns: "starter" }, "Reject")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => bulkDecide("pending")}>
          {translate("hr.leave.actions.reopen", { ns: "starter" }, "Reopen")}
        </Button>
      </BulkBar>
    </ListView>
  );
}
