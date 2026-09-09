import { useList, useTranslate } from "@refinedev/core";
import { Building2, Eye, Handshake, Pencil, Trash2, Wallet } from "lucide-react";
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
  INDUSTRIES,
  OPEN_DEAL_STAGES,
  formatCurrency,
  formatCurrencyCompact,
  formatDate,
  labelFor,
} from "../constants";
import { useOpenContextualChild } from "../route-surfaces";
import {
  EnumBadge,
  useCurrentUserId,
  useLocale,
  useOwnerOptions,
  userLabel,
} from "../shared";
import type { AccountRecord, ContactRecord, DealRecord } from "../types";

const APPENDS = ["owner"];

type Rollup = { open: number; won: number; deals: number; contacts: number };

/**
 * Per-account deal/contact rollups. Both collections are small enough to pull
 * once and aggregate client-side, which is what gives the list its "open
 * pipeline" and "contacts" columns without an N+1 per row.
 */
function useAccountRollups() {
  const { result: deals } = useList<DealRecord>({
    resource: "hub_sales_deals",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const { result: contacts } = useList<ContactRecord>({
    resource: "hub_sales_contacts",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  return useMemo(() => {
    const map = new Map<string, Rollup>();
    const bucket = (key: string) => {
      const existing = map.get(key);
      if (existing) return existing;
      const created: Rollup = { open: 0, won: 0, deals: 0, contacts: 0 };
      map.set(key, created);
      return created;
    };
    for (const deal of deals.data) {
      if (!deal.account_id) continue;
      const entry = bucket(String(deal.account_id));
      entry.deals += 1;
      const amount = Number(deal.amount ?? 0);
      if (OPEN_DEAL_STAGES.includes(deal.stage ?? "")) entry.open += amount;
      if (deal.stage === "won") entry.won += amount;
    }
    for (const contact of contacts.data) {
      if (!contact.account_id) continue;
      bucket(String(contact.account_id)).contacts += 1;
    }
    return map;
  }, [deals.data, contacts.data]);
}

export function AccountsLayout() {
  return (
    <CanAccess
      resource="hub_sales_accounts"
      action="list"
      fallback={<AccessDenied />}
    >
      <AccountList />
    </CanAccess>
  );
}

function AccountList() {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const currentUserId = useCurrentUserId();
  const ownerOptions = useOwnerOptions();
  const rollups = useAccountRollups();

  const views = useMemo<BuiltInView[]>(
    () => [
      {
        id: "all",
        label: translate("sales.accounts.views.all", { ns: "starter" }, "All accounts"),
        sort: { field: "name", order: "asc" },
      },
      {
        id: "mine",
        label: translate("sales.accounts.views.mine", { ns: "starter" }, "My accounts"),
        filters: currentUserId
          ? [{ field: "owner_id", operator: "eq", value: currentUserId }]
          : [],
        sort: { field: "name", order: "asc" },
      },
      {
        id: "recent",
        label: translate(
          "sales.accounts.views.recent",
          { ns: "starter" },
          "Recently added"
        ),
        sort: { field: "createdAt", order: "desc" },
      },
    ],
    [currentUserId, translate]
  );

  const state = useSalesList<AccountRecord>({
    listId: "accounts",
    resource: "hub_sales_accounts",
    searchField: "name",
    defaultSort: { field: "name", order: "asc" },
    views,
    appends: APPENDS,
    initiallyHidden: ["won", "website", "createdAt"],
  });

  const columns = useMemo<Array<GridColumn<AccountRecord>>>(
    () => [
      {
        id: "name",
        header: translate("sales.accounts.columns.account", { ns: "starter" }, "Account"),
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
        id: "industry",
        header: translate("sales.accounts.columns.industry", { ns: "starter" }, "Industry"),
        width: "10rem",
        cell: (record) =>
          record.industry ? (
            <EnumBadge
              value={record.industry}
              label={labelFor(INDUSTRIES, record.industry, translate)}
            />
          ) : (
            "—"
          ),
        csv: (record) => labelFor(INDUSTRIES, record.industry, translate),
      },
      {
        id: "owner",
        header: translate("sales.accounts.columns.owner", { ns: "starter" }, "Owner"),
        width: "10rem",
        cell: (record) => userLabel(record.owner),
        csv: (record) => userLabel(record.owner),
      },
      {
        id: "pipeline",
        header: translate(
          "sales.accounts.columns.openPipeline",
          { ns: "starter" },
          "Open pipeline"
        ),
        align: "right",
        width: "9rem",
        cell: (record) =>
          formatCurrency(rollups.get(String(record.id))?.open ?? 0, locale),
        csv: (record) => String(rollups.get(String(record.id))?.open ?? 0),
      },
      {
        id: "won",
        header: translate("sales.accounts.columns.won", { ns: "starter" }, "Won"),
        align: "right",
        width: "8rem",
        cell: (record) =>
          formatCurrency(rollups.get(String(record.id))?.won ?? 0, locale),
        csv: (record) => String(rollups.get(String(record.id))?.won ?? 0),
      },
      {
        id: "deals",
        header: translate("sales.accounts.columns.deals", { ns: "starter" }, "Deals"),
        align: "right",
        width: "6rem",
        cell: (record) => rollups.get(String(record.id))?.deals ?? 0,
        csv: (record) => String(rollups.get(String(record.id))?.deals ?? 0),
      },
      {
        id: "contacts",
        header: translate("sales.accounts.columns.contacts", { ns: "starter" }, "Contacts"),
        align: "right",
        width: "7rem",
        cell: (record) => rollups.get(String(record.id))?.contacts ?? 0,
        csv: (record) => String(rollups.get(String(record.id))?.contacts ?? 0),
      },
      {
        id: "website",
        header: translate("sales.accounts.columns.website", { ns: "starter" }, "Website"),
        cell: (record) =>
          record.website ? (
            <a
              href={record.website}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              {record.website.replace(/^https?:\/\//, "")}
            </a>
          ) : (
            "—"
          ),
        csv: (record) => record.website ?? "",
      },
      {
        id: "createdAt",
        header: translate(
          "sales.accounts.fields.accountSince",
          { ns: "starter" },
          "Account since"
        ),
        sortField: "createdAt",
        width: "9rem",
        cell: (record) => formatDate(record.createdAt, locale),
        csv: (record) => record.createdAt?.slice(0, 10) ?? "",
      },
    ],
    [locale, openChild, rollups, translate]
  );

  const { exportCsv, exporting } = useCsvExport<AccountRecord>({
    resource: "hub_sales_accounts",
    filters: state.filters,
    sorters: state.sorters,
    appends: APPENDS,
    columns,
    filename: "accounts.csv",
  });

  const totals = useMemo(() => {
    let open = 0;
    let won = 0;
    for (const entry of rollups.values()) {
      open += entry.open;
      won += entry.won;
    }
    return { open, won };
  }, [rollups]);

  return (
    <ListView resource="hub_sales_accounts">
      <KpiBar
        loading={state.query.isLoading}
        tiles={[
          {
            id: "count",
            label: translate("sales.accounts.kpi.count", { ns: "starter" }, "Accounts"),
            value: String(state.total),
            icon: Building2,
          },
          {
            id: "pipeline",
            label: translate(
              "sales.accounts.kpi.pipeline",
              { ns: "starter" },
              "Open pipeline"
            ),
            value: formatCurrencyCompact(totals.open, locale),
            hint: translate(
              "sales.accounts.kpi.pipeline.hint",
              { ns: "starter" },
              "Across every account"
            ),
            icon: Wallet,
          },
          {
            id: "won",
            label: translate("sales.accounts.kpi.won", { ns: "starter" }, "Closed won"),
            value: formatCurrencyCompact(totals.won, locale),
            tone: "positive",
            icon: Handshake,
          },
          {
            id: "mine",
            label: translate("sales.accounts.kpi.mine", { ns: "starter" }, "My accounts"),
            value:
              state.viewId === "mine"
                ? String(state.total)
                : translate("sales.accounts.kpi.mine.view", { ns: "starter" }, "View"),
            hint: translate(
              "sales.accounts.kpi.mine.hint",
              { ns: "starter" },
              "Owned by you"
            ),
            active: state.viewId === "mine",
            onClick: () => state.applyView("mine"),
          },
        ]}
      />

      <ListToolbar
        state={{ ...state, columns }}
        facets={[
          {
            field: "industry",
            label: translate("sales.accounts.fields.industry", { ns: "starter" }, "Industry"),
            options: INDUSTRIES.map((industry) => ({
              value: industry.value,
              label: labelFor(INDUSTRIES, industry.value, translate),
            })),
          },
          {
            field: "owner_id",
            label: translate("sales.accounts.fields.owner", { ns: "starter" }, "Owner"),
            options: ownerOptions,
          },
        ]}
        searchPlaceholder={translate(
          "sales.accounts.searchPlaceholder",
          { ns: "starter" },
          "Search accounts…"
        )}
        onExport={exportCsv}
        exporting={exporting}
      />

      <DataGrid
        state={state}
        columns={columns}
        onRowOpen={(record) => openChild(`show/${record.id}`)}
        emptyTitle={translate(
          "sales.accounts.empty.title",
          { ns: "starter" },
          "No accounts yet"
        )}
        emptyDescription={translate(
          "sales.accounts.empty.description",
          { ns: "starter" },
          "Create an account, or convert a qualified lead into one."
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
              resource="hub_sales_accounts"
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
        resource="hub_sales_accounts"
        selected={state.selected}
        onClear={() => state.setSelected([])}
        onDone={() => {
          state.setSelected([]);
          void state.query.refetch();
        }}
        fieldActions={[
          {
            field: "industry",
            label: translate("sales.accounts.fields.industry", { ns: "starter" }, "Industry"),
            options: INDUSTRIES.map((industry) => ({
              value: industry.value,
              label: labelFor(INDUSTRIES, industry.value, translate),
            })),
          },
        ]}
      />
    </ListView>
  );
}
