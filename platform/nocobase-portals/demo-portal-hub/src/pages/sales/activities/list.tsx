import { useList, useTranslate } from "@refinedev/core";
import {
  Activity as ActivityIcon,
  CalendarDays,
  Eye,
  Pencil,
  Trash2,
} from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { ListView } from "@/components/resources/views/list-view";
import { Button } from "@/components/ui/button";
import { ListToolbar } from "@/lib/table-kit";
import {
  BulkBar,
  DataGrid,
  KpiBar,
  useCsvExport,
  useSalesList,
  type BuiltInView,
  type GridColumn,
} from "../grid";
import {
  ACTIVITY_TYPES,
  addDaysIso,
  formatDateTime,
  labelFor,
} from "../constants";
import { salesRoutes } from "../module";
import { useOpenContextualChild } from "../route-surfaces";
import { activityIcon, EnumBadge, useLocale } from "../shared";
import type { ActivityRecord, DealRecord } from "../types";

const APPENDS = ["deal"];

export function ActivitiesLayout() {
  return (
    <CanAccess
      resource="hub_sales_activities"
      action="list"
      fallback={<AccessDenied />}
    >
      <ActivityList />
    </CanAccess>
  );
}

function ActivityList() {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const navigate = useNavigate();

  const { result: deals } = useList<DealRecord>({
    resource: "hub_sales_deals",
    pagination: { mode: "server", currentPage: 1, pageSize: 300 },
    sorters: [{ field: "title", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const dealOptions = useMemo(
    () =>
      deals.data
        .filter((deal) => deal.title)
        .map((deal) => ({ value: String(deal.id), label: deal.title as string })),
    [deals.data]
  );

  const views = useMemo<BuiltInView[]>(
    () => [
      {
        id: "all",
        label: translate("sales.activities.views.all", { ns: "starter" }, "All activity"),
        sort: { field: "date", order: "desc" },
      },
      {
        id: "week",
        label: translate(
          "sales.activities.views.week",
          { ns: "starter" },
          "Last 7 days"
        ),
        filters: [{ field: "date", operator: "gte", value: addDaysIso(-7) }],
        sort: { field: "date", order: "desc" },
      },
      {
        id: "month",
        label: translate(
          "sales.activities.views.month",
          { ns: "starter" },
          "Last 30 days"
        ),
        filters: [{ field: "date", operator: "gte", value: addDaysIso(-30) }],
        sort: { field: "date", order: "desc" },
      },
      {
        id: "meetings",
        label: translate(
          "sales.activities.views.meetings",
          { ns: "starter" },
          "Meetings"
        ),
        filters: [{ field: "type", operator: "eq", value: "meeting" }],
        sort: { field: "date", order: "desc" },
      },
    ],
    [translate]
  );

  const state = useSalesList<ActivityRecord>({
    listId: "activities",
    resource: "hub_sales_activities",
    searchField: "subject",
    defaultSort: { field: "date", order: "desc" },
    views,
    appends: APPENDS,
    initiallyHidden: ["notes"],
  });

  const columns = useMemo<Array<GridColumn<ActivityRecord>>>(
    () => [
      {
        id: "date",
        header: translate("sales.activities.fields.date", { ns: "starter" }, "Date"),
        sortField: "date",
        width: "12rem",
        cell: (record) => (
          <span className="whitespace-nowrap">
            {formatDateTime(record.date, locale)}
          </span>
        ),
        csv: (record) => record.date ?? "",
      },
      {
        id: "type",
        header: translate("sales.activities.fields.type", { ns: "starter" }, "Type"),
        width: "8rem",
        cell: (record) => {
          const type = record.type ?? "call";
          const Icon = activityIcon(type);
          return (
            <span className="flex items-center gap-1.5">
              <Icon className="size-3.5 text-muted-foreground" />
              <EnumBadge
                value={type}
                label={labelFor(ACTIVITY_TYPES, type, translate)}
              />
            </span>
          );
        },
        csv: (record) =>
          labelFor(ACTIVITY_TYPES, record.type ?? "call", translate),
      },
      {
        id: "subject",
        header: translate("sales.activities.fields.subject", { ns: "starter" }, "Subject"),
        cell: (record) => (
          <button
            type="button"
            className="text-left font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => openChild(`show/${record.id}`)}
          >
            {record.subject || "—"}
          </button>
        ),
        csv: (record) => record.subject ?? "",
      },
      {
        id: "deal",
        header: translate("sales.activities.fields.deal", { ns: "starter" }, "Deal"),
        cell: (record) =>
          record.deal?.title ? (
            <Link
              to={`${salesRoutes.pipeline}/show/${record.deal.id}`}
              className="text-primary underline-offset-2 hover:underline"
            >
              {record.deal.title}
            </Link>
          ) : (
            "—"
          ),
        csv: (record) => record.deal?.title ?? "",
      },
      {
        id: "notes",
        header: translate("sales.activities.fields.notes", { ns: "starter" }, "Notes"),
        cell: (record) => (
          <span className="line-clamp-1 text-muted-foreground">
            {record.notes || "—"}
          </span>
        ),
        csv: (record) => record.notes ?? "",
      },
    ],
    [locale, openChild, translate]
  );

  const { exportCsv, exporting } = useCsvExport<ActivityRecord>({
    resource: "hub_sales_activities",
    filters: state.filters,
    sorters: state.sorters,
    appends: APPENDS,
    columns,
    filename: "activities.csv",
  });

  const mix = useMemo(() => {
    const counts = { call: 0, email: 0, meeting: 0 } as Record<string, number>;
    for (const record of state.rows) {
      const type = record.type ?? "call";
      counts[type] = (counts[type] ?? 0) + 1;
    }
    return counts;
  }, [state.rows]);

  return (
    <ListView resource="hub_sales_activities">
      <KpiBar
        loading={state.query.isLoading}
        tiles={[
          {
            id: "count",
            label: translate(
              "sales.activities.kpi.count",
              { ns: "starter" },
              "Activities in view"
            ),
            value: String(state.total),
            icon: ActivityIcon,
          },
          {
            id: "calls",
            label: translate("sales.enums.activityType.call", { ns: "starter" }, "Call"),
            value: String(mix.call ?? 0),
            hint: translate(
              "sales.activities.kpi.pageHint",
              { ns: "starter" },
              "On this page"
            ),
          },
          {
            id: "meetings",
            label: translate(
              "sales.enums.activityType.meeting",
              { ns: "starter" },
              "Meeting"
            ),
            value: String(mix.meeting ?? 0),
            hint: translate(
              "sales.activities.kpi.pageHint",
              { ns: "starter" },
              "On this page"
            ),
            tone: "positive",
          },
          {
            id: "calendar",
            label: translate(
              "sales.activities.kpi.calendar",
              { ns: "starter" },
              "Calendar view"
            ),
            value: translate("sales.activities.kpi.open", { ns: "starter" }, "Open"),
            hint: translate(
              "sales.activities.kpi.calendar.hint",
              { ns: "starter" },
              "See the month at a glance"
            ),
            icon: CalendarDays,
            onClick: () => navigate(salesRoutes.salesCalendar),
          },
        ]}
      />

      <ListToolbar
        state={{ ...state, columns }}
        facets={[
          {
            field: "type",
            label: translate("sales.activities.fields.type", { ns: "starter" }, "Type"),
            options: ACTIVITY_TYPES.map((type) => ({
              value: type.value,
              label: labelFor(ACTIVITY_TYPES, type.value, translate),
            })),
          },
          {
            field: "deal_id",
            label: translate("sales.activities.fields.deal", { ns: "starter" }, "Deal"),
            options: dealOptions,
          },
        ]}
        searchPlaceholder={translate(
          "sales.activities.searchPlaceholder",
          { ns: "starter" },
          "Search subjects…"
        )}
        onExport={exportCsv}
        exporting={exporting}
      />

      <DataGrid
        state={state}
        columns={columns}
        onRowOpen={(record) => openChild(`show/${record.id}`)}
        emptyTitle={translate(
          "sales.activities.empty.title",
          { ns: "starter" },
          "Nothing logged in this window"
        )}
        emptyDescription={translate(
          "sales.activities.empty.description",
          { ns: "starter" },
          "Calls, emails and meetings logged against deals appear here."
        )}
        rowActions={(record) => (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => openChild(`show/${record.id}`)}
            >
              <Eye />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => openChild(`edit/${record.id}`)}
            >
              <Pencil />
            </Button>
            <DeleteButton
              resource="hub_sales_activities"
              recordItemId={record.id}
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 />
            </DeleteButton>
          </>
        )}
      />

      <BulkBar
        resource="hub_sales_activities"
        selected={state.selected}
        onClear={() => state.setSelected([])}
        onDone={() => {
          state.setSelected([]);
          void state.query.refetch();
        }}
        fieldActions={[
          {
            field: "type",
            label: translate("sales.activities.fields.type", { ns: "starter" }, "Type"),
            options: ACTIVITY_TYPES.map((type) => ({
              value: type.value,
              label: labelFor(ACTIVITY_TYPES, type.value, translate),
            })),
          },
        ]}
      />
    </ListView>
  );
}
