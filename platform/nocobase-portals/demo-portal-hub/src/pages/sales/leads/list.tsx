import { useTranslate } from "@refinedev/core";
import {
  ArrowRightCircle,
  Eye,
  Flame,
  Pencil,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useMemo } from "react";
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
  LEAD_SOURCES,
  LEAD_STATUSES,
  MANUAL_LEAD_STATUSES,
  addDaysIso,
  formatDate,
  labelFor,
  scoreLead,
} from "../constants";
import { useOpenContextualChild } from "../route-surfaces";
import {
  EnumBadge,
  ScorePill,
  useCurrentUserId,
  useLocale,
  useOwnerOptions,
  userLabel,
} from "../shared";
import type { LeadRecord } from "../types";

const APPENDS = ["owner"];

export function LeadsLayout() {
  return (
    <CanAccess
      resource="hub_sales_leads"
      action="list"
      fallback={<AccessDenied />}
    >
      <LeadList />
    </CanAccess>
  );
}

function LeadList() {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const currentUserId = useCurrentUserId();
  const ownerOptions = useOwnerOptions();

  const views = useMemo<BuiltInView[]>(
    () => [
      {
        id: "all",
        label: translate("sales.leads.views.all", { ns: "starter" }, "All leads"),
        sort: { field: "createdAt", order: "desc" },
      },
      {
        id: "new",
        label: translate(
          "sales.leads.views.untouched",
          { ns: "starter" },
          "New & unworked"
        ),
        filters: [{ field: "status", operator: "eq", value: "new" }],
        sort: { field: "createdAt", order: "desc" },
      },
      {
        id: "qualified",
        label: translate(
          "sales.leads.views.qualified",
          { ns: "starter" },
          "Qualified"
        ),
        filters: [{ field: "status", operator: "eq", value: "qualified" }],
        sort: { field: "createdAt", order: "desc" },
      },
      {
        id: "converted",
        label: translate(
          "sales.leads.views.converted",
          { ns: "starter" },
          "Converted"
        ),
        filters: [{ field: "status", operator: "eq", value: "converted" }],
        sort: { field: "converted_at", order: "desc" },
      },
      {
        id: "mine",
        label: translate("sales.leads.views.mine", { ns: "starter" }, "My leads"),
        filters: currentUserId
          ? [{ field: "owner_id", operator: "eq", value: currentUserId }]
          : [],
        sort: { field: "createdAt", order: "desc" },
      },
      {
        id: "week",
        label: translate(
          "sales.leads.views.thisWeek",
          { ns: "starter" },
          "Captured this week"
        ),
        filters: [
          { field: "createdAt", operator: "gte", value: addDaysIso(-7) },
        ],
        sort: { field: "createdAt", order: "desc" },
      },
    ],
    [currentUserId, translate]
  );

  const state = useSalesList<LeadRecord>({
    listId: "leads",
    resource: "hub_sales_leads",
    searchField: "name",
    defaultSort: { field: "createdAt", order: "desc" },
    views,
    appends: APPENDS,
    initiallyHidden: ["email"],
  });

  const columns = useMemo<Array<GridColumn<LeadRecord>>>(
    () => [
      {
        id: "score",
        header: translate("sales.leads.columns.score", { ns: "starter" }, "Score"),
        width: "5.5rem",
        cell: (record) => <ScorePill score={scoreLead(record).score} />,
        csv: (record) => String(scoreLead(record).score),
      },
      {
        id: "name",
        header: translate("sales.leads.fields.name", { ns: "starter" }, "Name"),
        sortField: "name",
        cell: (record) => (
          <button
            type="button"
            className="text-left font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => openChild(`show/${record.id}`)}
          >
            {record.name || "—"}
          </button>
        ),
        csv: (record) => record.name ?? "",
      },
      {
        id: "company",
        header: translate("sales.leads.fields.company", { ns: "starter" }, "Company"),
        cell: (record) => record.company || "—",
        csv: (record) => record.company ?? "",
      },
      {
        id: "email",
        header: translate("sales.leads.fields.email", { ns: "starter" }, "Email"),
        cell: (record) =>
          record.email ? (
            <a
              href={`mailto:${record.email}`}
              className="text-primary underline-offset-2 hover:underline"
            >
              {record.email}
            </a>
          ) : (
            "—"
          ),
        csv: (record) => record.email ?? "",
      },
      {
        id: "source",
        header: translate("sales.leads.fields.source", { ns: "starter" }, "Source"),
        width: "9rem",
        cell: (record) =>
          record.source ? (
            <EnumBadge
              value={record.source}
              label={labelFor(LEAD_SOURCES, record.source, translate)}
            />
          ) : (
            "—"
          ),
        csv: (record) => labelFor(LEAD_SOURCES, record.source, translate),
      },
      {
        id: "status",
        header: translate("sales.leads.fields.status", { ns: "starter" }, "Status"),
        width: "8rem",
        cell: (record) => (
          <EnumBadge
            value={record.status ?? "new"}
            label={labelFor(LEAD_STATUSES, record.status ?? "new", translate)}
          />
        ),
        csv: (record) => labelFor(LEAD_STATUSES, record.status ?? "new", translate),
      },
      {
        id: "owner",
        header: translate("sales.leads.fields.owner", { ns: "starter" }, "Owner"),
        width: "10rem",
        cell: (record) => userLabel(record.owner),
        csv: (record) => userLabel(record.owner),
      },
      {
        id: "createdAt",
        header: translate("sales.leads.columns.captured", { ns: "starter" }, "Captured"),
        sortField: "createdAt",
        width: "9rem",
        cell: (record) => formatDate(record.createdAt, locale),
        csv: (record) => record.createdAt?.slice(0, 10) ?? "",
      },
    ],
    [locale, openChild, translate]
  );

  const { exportCsv, exporting } = useCsvExport<LeadRecord>({
    resource: "hub_sales_leads",
    filters: state.filters,
    sorters: state.sorters,
    appends: APPENDS,
    columns,
    filename: "leads.csv",
  });

  const hot = state.rows.filter(
    (record) => scoreLead(record).score >= 70
  ).length;

  return (
    <ListView resource="hub_sales_leads">
      <KpiBar
        loading={state.query.isLoading}
        tiles={[
          {
            id: "count",
            label: translate("sales.leads.kpi.count", { ns: "starter" }, "Leads in view"),
            value: String(state.total),
            icon: UserPlus,
          },
          {
            id: "new",
            label: translate("sales.leads.kpi.new", { ns: "starter" }, "New & unworked"),
            value:
              state.viewId === "new"
                ? String(state.total)
                : translate("sales.leads.kpi.view", { ns: "starter" }, "View"),
            hint: translate(
              "sales.leads.kpi.new.hint",
              { ns: "starter" },
              "Never contacted"
            ),
            tone: "warning",
            active: state.viewId === "new",
            onClick: () => state.applyView("new"),
          },
          {
            id: "qualified",
            label: translate("sales.leads.kpi.qualified", { ns: "starter" }, "Qualified"),
            value:
              state.viewId === "qualified"
                ? String(state.total)
                : translate("sales.leads.kpi.view", { ns: "starter" }, "View"),
            hint: translate(
              "sales.leads.kpi.qualified.hint",
              { ns: "starter" },
              "Ready to convert"
            ),
            tone: "positive",
            active: state.viewId === "qualified",
            onClick: () => state.applyView("qualified"),
          },
          {
            id: "converted",
            label: translate("sales.leads.kpi.converted", { ns: "starter" }, "Converted"),
            value:
              state.viewId === "converted"
                ? String(state.total)
                : translate("sales.leads.kpi.view", { ns: "starter" }, "View"),
            hint: translate(
              "sales.leads.kpi.converted.hint",
              { ns: "starter" },
              "Became an account"
            ),
            tone: "positive",
            active: state.viewId === "converted",
            onClick: () => state.applyView("converted"),
          },
          {
            id: "hot",
            label: translate("sales.leads.kpi.hot", { ns: "starter" }, "Hot on this page"),
            value: String(hot),
            hint: translate(
              "sales.leads.kpi.hot.hint",
              { ns: "starter" },
              "Fit score 70+"
            ),
            tone: "danger",
            icon: Flame,
          },
        ]}
      />

      <ListToolbar
        state={{ ...state, columns }}
        facets={[
          {
            field: "status",
            label: translate("sales.leads.fields.status", { ns: "starter" }, "Status"),
            options: LEAD_STATUSES.map((status) => ({
              value: status.value,
              label: labelFor(LEAD_STATUSES, status.value, translate),
            })),
          },
          {
            field: "source",
            label: translate("sales.leads.fields.source", { ns: "starter" }, "Source"),
            options: LEAD_SOURCES.map((source) => ({
              value: source.value,
              label: labelFor(LEAD_SOURCES, source.value, translate),
            })),
          },
          {
            field: "owner_id",
            label: translate("sales.leads.fields.owner", { ns: "starter" }, "Owner"),
            options: ownerOptions,
          },
        ]}
        searchPlaceholder={translate(
          "sales.leads.searchPlaceholder",
          { ns: "starter" },
          "Search leads…"
        )}
        onExport={exportCsv}
        exporting={exporting}
      />

      <DataGrid
        state={state}
        columns={columns}
        onRowOpen={(record) => openChild(`show/${record.id}`)}
        emptyTitle={translate(
          "sales.leads.empty.title",
          { ns: "starter" },
          "No leads in this view"
        )}
        emptyDescription={translate(
          "sales.leads.empty.description",
          { ns: "starter" },
          "Inbound and prospected leads land here for qualification."
        )}
        rowActions={(record) => (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={record.status === "converted"}
              onClick={() => openChild(`show/${record.id}/convert`)}
              aria-label={translate(
                "sales.leads.detail.convert",
                { ns: "starter" },
                "Convert"
              )}
            >
              <ArrowRightCircle />
            </Button>
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
              resource="hub_sales_leads"
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
        resource="hub_sales_leads"
        selected={state.selected}
        onClear={() => state.setSelected([])}
        onDone={() => {
          state.setSelected([]);
          void state.query.refetch();
        }}
        fieldActions={[
          {
            field: "status",
            label: translate("sales.leads.fields.status", { ns: "starter" }, "Status"),
            options: MANUAL_LEAD_STATUSES.map((status) => ({
              value: status.value,
              label: labelFor(MANUAL_LEAD_STATUSES, status.value, translate),
            })),
          },
          {
            field: "source",
            label: translate("sales.leads.fields.source", { ns: "starter" }, "Source"),
            options: LEAD_SOURCES.map((source) => ({
              value: source.value,
              label: labelFor(LEAD_SOURCES, source.value, translate),
            })),
          },
        ]}
      />
    </ListView>
  );
}
