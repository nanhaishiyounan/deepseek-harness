import {
  useList,
  useNotification,
  useTranslate,
  useUpdate,
  type CrudFilter,
} from "@refinedev/core";
import { useTable } from "@refinedev/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import ReactECharts from "echarts-for-react";
import {
  CheckCircle2,
  Eye,
  Inbox,
  KanbanSquare,
  MessageSquare,
  Pencil,
  Plus,
  ShieldAlert,
  Table2,
  Trash2,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router";
import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { Breadcrumb } from "@/components/app-shell/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable } from "@/components/data-table/data-table";
import {
  DataTableFilterCombobox,
  DataTableFilterDropdownDateRangePicker,
  DataTableFilterDropdownText,
} from "@/components/data-table/data-table-filter";
import { DataTableSorter } from "@/components/data-table/data-table-sorter";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { ShowButton } from "@/components/resources/buttons/show";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useChartTheme } from "@/pages/home/theme";
import {
  BOARD_COLUMNS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  labelFor,
  relativeTime,
  statusClassFor,
} from "../constants";
import {
  BulkActionBar,
  ListToolbar,
  densityClass,
  exportCsv,
  storedColumnVisibility,
  useColumnVisibilityPersistence,
  usePersistentState,
  useSavedViews,
  type Density,
} from "@/lib/table-kit";
import { useUserOptions } from "../pickers";
import { getTicketShowPath, helpdeskRoutes } from "../routes";
import {
  AGE_BUCKETS,
  ageBucketFor,
  slaLabel,
  slaStateFor,
  slaTone,
  ticketAgeHours,
  useSlaByPriority,
} from "../sla";
import {
  CategoryBadge,
  PriorityPill,
  StatusPill,
  UserChip,
} from "../shared";
import type { TicketRecord } from "../types";

const RESOURCE = "hub_hd_tickets";
const OPEN_STATUSES = new Set(["open", "pending"]);
const STORAGE_KEY = "helpdesk.tickets";

// Agent queues. Everything expressible as a server filter rides on the table's
// permanent filter; SLA breach is derived per row and shown in the SLA column.
type Queue = "all" | "open" | "unassigned" | "escalated" | "solved";

const QUEUES: Array<{ value: Queue; label: string; i18nKey: string }> = [
  { value: "all", label: "All", i18nKey: "helpdesk.queues.all" },
  { value: "open", label: "Open", i18nKey: "helpdesk.queues.open" },
  { value: "unassigned", label: "Unassigned", i18nKey: "helpdesk.queues.unassigned" },
  { value: "escalated", label: "High & urgent", i18nKey: "helpdesk.queues.escalated" },
  { value: "solved", label: "Solved", i18nKey: "helpdesk.queues.solved" },
];

function queueFilters(queue: Queue): CrudFilter[] {
  switch (queue) {
    case "open":
      return [{ field: "status", operator: "in", value: ["open", "pending"] }];
    case "unassigned":
      return [
        { field: "status", operator: "in", value: ["open", "pending"] },
        // `$null` fails the bigint cast on this column; equality against null
        // is what the backend accepts.
        { field: "assigneeId", operator: "eq", value: null },
      ];
    case "escalated":
      return [
        { field: "status", operator: "in", value: ["open", "pending"] },
        { field: "priority", operator: "in", value: ["high", "urgent"] },
      ];
    case "solved":
      return [{ field: "status", operator: "in", value: ["resolved", "closed"] }];
    default:
      return [];
  }
}

export function TicketsLayout() {
  return (
    <>
      <CanAccess resource={RESOURCE} action="list" fallback={<AccessDenied />}>
        <TicketBoard />
      </CanAccess>
    </>
  );
}

function TicketBoard() {
  const translate = useTranslate();
  const chart = useChartTheme();
  const [view, setView] = useState<"board" | "list">("board");
  const { byPriority: slaByPriority } = useSlaByPriority();

  const { result, query } = useList<TicketRecord>({
    resource: RESOURCE,
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    sorters: [{ field: "createdAt", order: "desc" }],
    meta: { appends: ["requester", "assignee", "replies"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const tickets = result.data ?? [];

  const stats = useMemo(() => {
    const open = tickets.filter((t) => OPEN_STATUSES.has(t.status ?? ""));
    const escalated = open.filter((t) =>
      ["high", "urgent"].includes(t.priority ?? "")
    );
    const closed = tickets.filter((t) =>
      ["resolved", "closed"].includes(t.status ?? "")
    );
    const replies = tickets.reduce(
      (sum, t) => sum + (t.replies?.length ?? 0),
      0
    );
    const resolutionRate = tickets.length
      ? Math.round((closed.length / tickets.length) * 100)
      : 0;
    const byPriority = TICKET_PRIORITIES.map(
      (p) => open.filter((t) => t.priority === p.value).length
    );

    // SLA breach + backlog ageing are derived here rather than filtered on the
    // server: both depend on the policy table and on "now".
    const breached = open.filter((ticket) => {
      const state = slaStateFor(ticket, slaByPriority);
      return state?.isBreached ?? false;
    });
    const ageCounts = new Map<string, number>();
    for (const ticket of open) {
      const bucket = ageBucketFor(ticketAgeHours(ticket));
      ageCounts.set(bucket, (ageCounts.get(bucket) ?? 0) + 1);
    }

    return {
      openCount: open.length,
      escalated: escalated.length,
      resolvedCount: closed.length,
      replies,
      resolutionRate,
      byPriority,
      breachedCount: breached.length,
      ageCounts,
    };
  }, [slaByPriority, tickets]);

  const agingOption = {
    color: [chart.palette[1] ?? chart.palette[0]],
    grid: { left: 0, right: 16, top: 6, bottom: 0, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: chart.tooltipBg,
      borderColor: chart.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: chart.tooltipText, fontSize: 12 },
      padding: [6, 10],
    },
    xAxis: {
      type: "category",
      data: AGE_BUCKETS.map((bucket) =>
        translate(bucket.i18nKey, { ns: "starter" }, bucket.label)
      ),
      axisLine: { lineStyle: { color: chart.grid } },
      axisTick: { show: false },
      axisLabel: { color: chart.axis, fontSize: 12 },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: chart.grid } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: chart.axis, fontSize: 11 },
      minInterval: 1,
    },
    series: [
      {
        type: "bar",
        barWidth: 26,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        data: AGE_BUCKETS.map((bucket) => stats.ageCounts.get(bucket.id) ?? 0),
      },
    ],
  };

  const grouped = useMemo(() => {
    const map = new Map<string, TicketRecord[]>();
    for (const column of BOARD_COLUMNS) map.set(column.value, []);
    for (const ticket of tickets) {
      const bucket = map.get(ticket.status ?? "");
      if (bucket) bucket.push(ticket);
      else map.set(ticket.status ?? "other", [ticket]);
    }
    return map;
  }, [tickets]);

  const priorityOption = {
    color: [chart.palette[0]],
    grid: { left: 0, right: 16, top: 6, bottom: 0, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: chart.tooltipBg,
      borderColor: chart.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: chart.tooltipText, fontSize: 12 },
      padding: [6, 10],
    },
    xAxis: {
      type: "value",
      splitLine: { lineStyle: { color: chart.grid } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: chart.axis, fontSize: 11 },
      minInterval: 1,
    },
    yAxis: {
      type: "category",
      data: TICKET_PRIORITIES.map((p) => labelFor(TICKET_PRIORITIES, p.value, translate)),
      axisLine: { lineStyle: { color: chart.grid } },
      axisTick: { show: false },
      axisLabel: { color: chart.axis, fontSize: 12 },
    },
    series: [
      {
        type: "bar",
        data: stats.byPriority,
        barWidth: 14,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
      },
    ],
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center text-muted-foreground">
          <Breadcrumb />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {translate("helpdesk.board.title", { ns: "starter" }, "Helpdesk")}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {translate(
                "helpdesk.board.subtitle",
                { ns: "starter" },
                "Every support request from open to closed, with priorities, owners and the full reply thread."
              )}
            </p>
          </div>
          <Button render={<Link to={helpdeskRoutes.ticketsCreate} />}>
            <Plus className="size-4" />
            {translate("helpdesk.board.newTicket", { ns: "starter" }, "New ticket")}
          </Button>
        </div>
      </div>

      {/* KPI + chart row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <StatTile
          icon={Inbox}
          tone="text-blue-600 bg-blue-500/12 dark:text-blue-400"
          label={translate("helpdesk.kpi.open.label", { ns: "starter" }, "Open tickets")}
          value={stats.openCount}
          hint={translate("helpdesk.kpi.open.hint", { ns: "starter" }, "Open + pending")}
        />
        <StatTile
          icon={TriangleAlert}
          tone="text-amber-600 bg-amber-500/12 dark:text-amber-400"
          label={translate("helpdesk.kpi.attention.label", { ns: "starter" }, "Needs attention")}
          value={stats.escalated}
          hint={translate(
            "helpdesk.kpi.attention.hint",
            { ns: "starter" },
            "High / urgent, still open"
          )}
        />
        <StatTile
          icon={CheckCircle2}
          tone="text-emerald-600 bg-emerald-500/12 dark:text-emerald-400"
          label={translate("helpdesk.kpi.resolution.label", { ns: "starter" }, "Resolution rate")}
          value={`${stats.resolutionRate}%`}
          hint={translate(
            "helpdesk.kpi.resolution.hint",
            { ns: "starter", count: stats.resolvedCount },
            `${stats.resolvedCount} resolved / closed`
          )}
        />
        <StatTile
          icon={ShieldAlert}
          tone="text-red-600 bg-red-500/12 dark:text-red-400"
          label={translate("helpdesk.kpi.breached.label", { ns: "starter" }, "SLA breached")}
          value={stats.breachedCount}
          hint={translate(
            "helpdesk.kpi.breached.hint",
            { ns: "starter" },
            "Open work past its resolve target"
          )}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>
            {translate("helpdesk.chart.priority.title", { ns: "starter" }, "Open tickets by priority")}
          </CardTitle>
          <CardDescription>
            {translate(
              "helpdesk.chart.priority.description",
              { ns: "starter" },
              "Where the pressure sits right now across open and pending work."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReactECharts
            key={`prio-${chart.isDark}`}
            option={priorityOption}
            style={{ height: 180 }}
            opts={{ renderer: "svg" }}
            showLoading={query.isLoading}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {translate("helpdesk.chart.aging.title", { ns: "starter" }, "Backlog ageing")}
          </CardTitle>
          <CardDescription>
            {translate(
              "helpdesk.chart.aging.description",
              { ns: "starter" },
              "How long the open queue has been waiting. A tail on the right means work is stalling."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReactECharts
            key={`aging-${chart.isDark}`}
            option={agingOption}
            style={{ height: 180 }}
            opts={{ renderer: "svg" }}
            showLoading={query.isLoading}
          />
        </CardContent>
      </Card>
      </div>

      {/* View toggle */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          {view === "board"
            ? translate("helpdesk.board.boardHeading", { ns: "starter" }, "Board")
            : translate("helpdesk.board.listHeading", { ns: "starter" }, "All tickets")}
        </h3>
        <Tabs value={view} onValueChange={(value) => setView(value as "board" | "list")}>
          <TabsList>
            <TabsTrigger value="board">
              <KanbanSquare className="size-3.5" />
              {translate("helpdesk.board.viewBoard", { ns: "starter" }, "Board")}
            </TabsTrigger>
            <TabsTrigger value="list">
              <Table2 className="size-3.5" />
              {translate("helpdesk.board.viewList", { ns: "starter" }, "List")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {view === "list" ? <TicketTable /> : null}

      {/* Board */}
      <div
        className={cn(
          "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4",
          view !== "board" && "hidden"
        )}
      >
        {BOARD_COLUMNS.map((column) => {
          const items = grouped.get(column.value) ?? [];
          return (
            <div
              key={column.value}
              className="flex min-h-40 flex-col gap-3 rounded-xl border border-border/70 bg-muted/30 p-3"
            >
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium",
                      statusClassFor(column.value)
                    )}
                  >
                    {labelFor(BOARD_COLUMNS, column.value, translate)}
                  </span>
                </div>
                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                  {items.length}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {query.isLoading ? (
                  <ColumnSkeleton />
                ) : items.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                    {translate("helpdesk.board.emptyColumn", { ns: "starter" }, "Nothing here")}
                  </p>
                ) : (
                  items.map((ticket) => (
                    <TicketCard key={ticket.id} ticket={ticket} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TicketCard({ ticket }: { ticket: TicketRecord }) {
  const translate = useTranslate();
  const replyCount = ticket.replies?.length ?? 0;
  return (
    <Link
      to={getTicketShowPath(ticket.id)}
      className="group flex flex-col gap-2 rounded-lg border border-border/70 bg-card p-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <p className="line-clamp-2 text-sm font-medium leading-5 text-foreground">
        {ticket.subject ||
          translate("helpdesk.board.untitled", { ns: "starter" }, "Untitled ticket")}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityPill
          value={ticket.priority}
          label={labelFor(TICKET_PRIORITIES, ticket.priority, translate)}
        />
        {ticket.category ? (
          <CategoryBadge
            value={ticket.category}
            label={labelFor(TICKET_CATEGORIES, ticket.category, translate)}
          />
        ) : null}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <UserChip user={ticket.assignee} />
        {replyCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <MessageSquare className="size-3.5" />
            {replyCount}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function StatTile({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: typeof Inbox;
  tone: string;
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
              {value}
            </p>
          </div>
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl",
              tone
            )}
          >
            <Icon className="size-5" />
          </span>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function ColumnSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-lg border border-border/70 bg-card"
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List view — a sortable, filterable table of every ticket. Clicking the
// subject (or the show icon) opens the same URL-addressable detail drawer
// as the board cards.
// ---------------------------------------------------------------------------

function TicketTable() {
  const translate = useTranslate();
  const notify = useNotification();
  const { mutateAsync: updateTicket } = useUpdate<TicketRecord>();
  const { byPriority } = useSlaByPriority();
  const { options: userOptions } = useUserOptions();
  const { result: categoryCatalog } = useList<TicketRecord>({
    resource: RESOURCE,
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const [density, setDensity] = usePersistentState<Density>(
    `${STORAGE_KEY}.density`,
    "comfortable"
  );
  const [queue, setQueue] = usePersistentState<Queue>(`${STORAGE_KEY}.queue`, "all");
  const [isBulkBusy, setIsBulkBusy] = useState(false);

  const permanentFilters = useMemo(() => queueFilters(queue), [queue]);

  const statusOptions = useMemo(
    () =>
      TICKET_STATUSES.map((s) => ({
        value: s.value,
        label: labelFor(TICKET_STATUSES, s.value, translate),
      })),
    [translate]
  );
  const priorityOptions = useMemo(
    () =>
      TICKET_PRIORITIES.map((p) => ({
        value: p.value,
        label: labelFor(TICKET_PRIORITIES, p.value, translate),
      })),
    [translate]
  );
  const categoryOptions = useMemo(
    () => {
      const known = TICKET_CATEGORIES.map((c) => ({
        value: c.value,
        label: labelFor(TICKET_CATEGORIES, c.value, translate),
      }));
      const knownValues = new Set<string>(known.map((option) => option.value));
      const discovered = Array.from(
        new Set(
          categoryCatalog.data
            .map((ticket) => ticket.category)
            .filter((value): value is string => Boolean(value))
        )
      )
        .filter((value) => !knownValues.has(value))
        .sort()
        .map((value) => ({
          value,
          label: labelFor(TICKET_CATEGORIES, value, translate),
        }));
      return [...known, ...discovered];
    },
    [categoryCatalog.data, translate]
  );

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<TicketRecord>();
    return [
      columnHelper.display({
        id: "select",
        size: 44,
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            aria-label={translate("helpdesk.ops.selectAll", { ns: "starter" }, "Select all")}
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onCheckedChange={(value) => table.toggleAllRowsSelected(Boolean(value))}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={translate("helpdesk.ops.selectRow", { ns: "starter" }, "Select row")}
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
      }),
      columnHelper.accessor("subject", {
        id: "subject",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>
              {translate("helpdesk.list.columns.subject", { ns: "starter" }, "Ticket")}
            </span>
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
        cell: ({ row, getValue }) => (
          <Link
            to={getTicketShowPath(row.original.id)}
            className="font-medium text-foreground hover:text-primary hover:underline"
          >
            {getValue() ||
              translate("helpdesk.board.untitled", { ns: "starter" }, "Untitled ticket")}
          </Link>
        ),
      }),
      columnHelper.display({
        id: "sla",
        header: translate("helpdesk.list.columns.sla", { ns: "starter" }, "SLA"),
        enableSorting: false,
        size: 132,
        cell: ({ row }) => {
          const state = slaStateFor(row.original, byPriority);
          if (!state) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          const tone = slaTone(state);
          return (
            <div className="flex flex-col gap-1">
              <span
                className={cn(
                  "text-xs font-medium tabular-nums",
                  tone === "breached" && "text-red-600 dark:text-red-400",
                  tone === "risk" && "text-amber-600 dark:text-amber-400",
                  tone === "ok" && "text-muted-foreground"
                )}
              >
                {slaLabel(state, translate)}
              </span>
              {state.isRunning && (
                <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      tone === "breached" && "bg-red-500",
                      tone === "risk" && "bg-amber-500",
                      tone === "ok" && "bg-emerald-500"
                    )}
                    style={{ width: `${state.percentElapsed}%` }}
                  />
                </span>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor("status", {
        id: "status",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>
              {translate("helpdesk.list.columns.status", { ns: "starter" }, "Status")}
            </span>
            <DataTableFilterCombobox
              column={column}
              table={table}
              options={statusOptions}
              multiple
              defaultOperator="in"
              operators={["in"]}
            />
          </div>
        ),
        enableSorting: false,
        cell: ({ getValue }) => (
          <StatusPill value={getValue()} label={labelFor(TICKET_STATUSES, getValue(), translate)} />
        ),
      }),
      columnHelper.accessor("priority", {
        id: "priority",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>
              {translate("helpdesk.list.columns.priority", { ns: "starter" }, "Priority")}
            </span>
            <DataTableFilterCombobox
              column={column}
              table={table}
              options={priorityOptions}
              multiple
              defaultOperator="in"
              operators={["in"]}
            />
          </div>
        ),
        enableSorting: false,
        cell: ({ getValue }) => (
          <PriorityPill value={getValue()} label={labelFor(TICKET_PRIORITIES, getValue(), translate)} />
        ),
      }),
      columnHelper.accessor("category", {
        id: "category",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>
              {translate("helpdesk.list.columns.category", { ns: "starter" }, "Category")}
            </span>
            <DataTableFilterCombobox
              column={column}
              table={table}
              options={categoryOptions}
              multiple
              defaultOperator="in"
              operators={["in"]}
            />
          </div>
        ),
        enableSorting: false,
        cell: ({ getValue }) => (
          <CategoryBadge
            value={getValue()}
            label={labelFor(TICKET_CATEGORIES, getValue(), translate)}
          />
        ),
      }),
      columnHelper.accessor((record) => record.requester, {
        id: "requester",
        header: translate("helpdesk.list.columns.requester", { ns: "starter" }, "Requester"),
        enableSorting: false,
        cell: ({ getValue }) => <UserChip user={getValue()} />,
      }),
      columnHelper.accessor((record) => record.assignee, {
        id: "assignee",
        header: translate("helpdesk.list.columns.assignee", { ns: "starter" }, "Assignee"),
        enableSorting: false,
        cell: ({ getValue }) => <UserChip user={getValue()} />,
      }),
      columnHelper.accessor("createdAt", {
        id: "createdAt",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>
              {translate("helpdesk.list.columns.age", { ns: "starter" }, "Age")}
            </span>
            <DataTableSorter column={column} />
            <DataTableFilterDropdownDateRangePicker column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground">
            {relativeTime(getValue(), translate)}
          </span>
        ),
      }),
      columnHelper.accessor("updatedAt", {
        id: "updatedAt",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>
              {translate("helpdesk.list.columns.updated", { ns: "starter" }, "Updated")}
            </span>
            <DataTableSorter column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground">
            {relativeTime(getValue(), translate)}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: translate("helpdesk.list.columns.actions", { ns: "starter" }, "Actions"),
        enableSorting: false,
        enableHiding: false,
        size: 120,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <ShowButton
              resource={RESOURCE}
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
            >
              <Eye />
            </ShowButton>
            <EditButton
              resource={RESOURCE}
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
            >
              <Pencil />
            </EditButton>
            <DeleteButton
              resource={RESOURCE}
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
  }, [byPriority, categoryOptions, priorityOptions, statusOptions, translate]);

  const table = useTable<TicketRecord>({
    columns,
    enableRowSelection: true,
    getRowId: (row) => String(row.id),
    initialState: { columnVisibility: storedColumnVisibility(STORAGE_KEY) },
    refineCoreProps: {
      resource: RESOURCE,
      syncWithLocation: true,
      meta: { appends: ["requester", "assignee"] },
      filters: { permanent: permanentFilters },
      sorters: { initial: [{ field: "createdAt", order: "desc" }] },
    },
  });

  useColumnVisibilityPersistence(STORAGE_KEY, table);
  const savedViews = useSavedViews(STORAGE_KEY, table, []);

  const exportQuery = useList<TicketRecord>({
    resource: RESOURCE,
    filters: table.refineCore.filters,
    sorters: table.refineCore.sorters,
    meta: { appends: ["requester", "assignee"] },
    pagination: { mode: "server", currentPage: 1, pageSize: 1000 },
    queryOptions: { enabled: false, retry: false },
    errorNotification: false,
  });

  const handleExport = useCallback(async () => {
    const { data } = await exportQuery.query.refetch();
    exportCsv<TicketRecord>(
      "tickets",
      [
        { header: "Subject", value: (row) => row.subject },
        { header: "Status", value: (row) => row.status },
        { header: "Priority", value: (row) => row.priority },
        { header: "Category", value: (row) => row.category },
        {
          header: "Requester",
          value: (row) => row.requester?.nickname ?? row.requester?.username,
        },
        {
          header: "Assignee",
          value: (row) => row.assignee?.nickname ?? row.assignee?.username,
        },
        { header: "Opened", value: (row) => row.createdAt },
        { header: "Updated", value: (row) => row.updatedAt },
        {
          header: "SLA",
          value: (row) => {
            const state = slaStateFor(row, byPriority);
            return state ? (state.isBreached ? "breached" : "within target") : "";
          },
        },
      ],
      data?.data ?? []
    );
  }, [byPriority, exportQuery.query]);

  const selectedRows = table.reactTable.getSelectedRowModel().rows;

  const applyBulk = useCallback(
    async (values: Record<string, unknown>, message: string) => {
      setIsBulkBusy(true);
      try {
        for (const row of selectedRows) {
          await updateTicket({
            resource: RESOURCE,
            id: row.original.id,
            values,
            successNotification: false,
          });
        }
        notify.open?.({
          type: "success",
          message: message.replace("{{count}}", String(selectedRows.length)),
        });
        table.reactTable.resetRowSelection();
      } finally {
        setIsBulkBusy(false);
      }
    },
    [notify, selectedRows, table, updateTicket]
  );

  const columnLabels = useMemo(
    () => ({
      subject: translate("helpdesk.list.columns.subject", { ns: "starter" }, "Ticket"),
      sla: translate("helpdesk.list.columns.sla", { ns: "starter" }, "SLA"),
      status: translate("helpdesk.list.columns.status", { ns: "starter" }, "Status"),
      priority: translate("helpdesk.list.columns.priority", { ns: "starter" }, "Priority"),
      category: translate("helpdesk.list.columns.category", { ns: "starter" }, "Category"),
      requester: translate("helpdesk.list.columns.requester", { ns: "starter" }, "Requester"),
      assignee: translate("helpdesk.list.columns.assignee", { ns: "starter" }, "Assignee"),
      createdAt: translate("helpdesk.list.columns.age", { ns: "starter" }, "Age"),
      updatedAt: translate("helpdesk.list.columns.updated", { ns: "starter" }, "Updated"),
    }),
    [translate]
  );

  return (
    <div className="flex flex-col gap-3">
      <ListToolbar i18nPrefix="helpdesk.ops"
        table={table}
        savedViews={savedViews}
        density={density}
        onDensityChange={setDensity}
        columnLabels={columnLabels}
        onExport={handleExport}
        isExporting={exportQuery.query.isFetching}
      >
        {QUEUES.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setQueue(option.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              queue === option.value
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/70 text-muted-foreground hover:bg-muted"
            )}
          >
            {translate(option.i18nKey, { ns: "starter" }, option.label)}
          </button>
        ))}
      </ListToolbar>

      <BulkActionBar i18nPrefix="helpdesk.ops"
        count={selectedRows.length}
        isBusy={isBulkBusy}
        onClear={() => table.reactTable.resetRowSelection()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" className="text-xs" disabled={isBulkBusy}>
                <UserPlus className="size-3.5" />
                {translate("helpdesk.bulk.assign", { ns: "starter" }, "Assign to")}
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel>
              {translate("helpdesk.list.columns.assignee", { ns: "starter" }, "Assignee")}
            </DropdownMenuLabel>
            {userOptions.slice(0, 30).map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() =>
                  void applyBulk(
                    { assigneeId: Number(option.value) },
                    translate(
                      "helpdesk.bulk.assignResult",
                      { ns: "starter" },
                      "{{count}} tickets reassigned"
                    )
                  )
                }
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" className="text-xs" disabled={isBulkBusy}>
                {translate("helpdesk.bulk.setStatus", { ns: "starter" }, "Set status")}
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            {TICKET_STATUSES.map((status) => (
              <DropdownMenuItem
                key={status.value}
                onClick={() =>
                  void applyBulk(
                    { status: status.value },
                    translate(
                      "helpdesk.bulk.statusResult",
                      { ns: "starter" },
                      "{{count}} tickets updated"
                    )
                  )
                }
              >
                {labelFor(TICKET_STATUSES, status.value, translate)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </BulkActionBar>

      <div className={densityClass(density)}>
        <DataTable table={table} />
      </div>
    </div>
  );
}
