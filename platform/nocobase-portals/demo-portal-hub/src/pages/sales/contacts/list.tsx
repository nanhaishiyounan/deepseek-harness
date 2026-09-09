import { useList, useTranslate } from "@refinedev/core";
import { AtSign, Building2, Contact, Eye, Pencil, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
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
import { formatDate } from "../constants";
import { useOpenContextualChild } from "../route-surfaces";
import { useLocale } from "../shared";
import type { AccountRecord, ContactRecord } from "../types";

const APPENDS = ["account"];

export function ContactsLayout() {
  return (
    <CanAccess
      resource="hub_sales_contacts"
      action="list"
      fallback={<AccessDenied />}
    >
      <ContactList />
    </CanAccess>
  );
}

function ContactList() {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();

  const { result: accounts } = useList<AccountRecord>({
    resource: "hub_sales_accounts",
    pagination: { mode: "server", currentPage: 1, pageSize: 300 },
    sorters: [{ field: "name", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const accountOptions = useMemo(
    () =>
      accounts.data
        .filter((account) => account.name)
        .map((account) => ({
          value: String(account.id),
          label: account.name as string,
        })),
    [accounts.data]
  );

  const views = useMemo<BuiltInView[]>(
    () => [
      {
        id: "all",
        label: translate("sales.contacts.views.all", { ns: "starter" }, "All contacts"),
        sort: { field: "name", order: "asc" },
      },
      {
        id: "recent",
        label: translate(
          "sales.contacts.views.recent",
          { ns: "starter" },
          "Recently added"
        ),
        sort: { field: "createdAt", order: "desc" },
      },
    ],
    [translate]
  );

  const state = useSalesList<ContactRecord>({
    listId: "contacts",
    resource: "hub_sales_contacts",
    searchField: "name",
    defaultSort: { field: "name", order: "asc" },
    views,
    appends: APPENDS,
    initiallyHidden: ["createdAt"],
  });

  const columns = useMemo<Array<GridColumn<ContactRecord>>>(
    () => [
      {
        id: "name",
        header: translate("sales.contacts.fields.name", { ns: "starter" }, "Name"),
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
        id: "title",
        header: translate("sales.contacts.fields.jobTitle", { ns: "starter" }, "Job title"),
        cell: (record) => record.title || "—",
        csv: (record) => record.title ?? "",
      },
      {
        id: "email",
        header: translate("sales.contacts.fields.email", { ns: "starter" }, "Email"),
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
        id: "phone",
        header: translate("sales.contacts.fields.phone", { ns: "starter" }, "Phone"),
        width: "10rem",
        cell: (record) =>
          record.phone ? (
            <a
              href={`tel:${record.phone}`}
              className="text-primary underline-offset-2 hover:underline"
            >
              {record.phone}
            </a>
          ) : (
            "—"
          ),
        csv: (record) => record.phone ?? "",
      },
      {
        id: "account",
        header: translate("sales.contacts.fields.account", { ns: "starter" }, "Account"),
        cell: (record) =>
          record.account?.name ? (
            <Link
              to={`/accounts/show/${record.account.id}`}
              className="text-primary underline-offset-2 hover:underline"
            >
              {record.account.name}
            </Link>
          ) : (
            "—"
          ),
        csv: (record) => record.account?.name ?? "",
      },
      {
        id: "createdAt",
        header: translate("sales.contacts.columns.added", { ns: "starter" }, "Added"),
        sortField: "createdAt",
        width: "9rem",
        cell: (record) => formatDate(record.createdAt, locale),
        csv: (record) => record.createdAt?.slice(0, 10) ?? "",
      },
    ],
    [locale, openChild, translate]
  );

  const { exportCsv, exporting } = useCsvExport<ContactRecord>({
    resource: "hub_sales_contacts",
    filters: state.filters,
    sorters: state.sorters,
    appends: APPENDS,
    columns,
    filename: "contacts.csv",
  });

  const reachable = state.rows.filter((record) => record.email).length;
  const linked = state.rows.filter((record) => record.account_id).length;

  return (
    <ListView resource="hub_sales_contacts">
      <KpiBar
        loading={state.query.isLoading}
        tiles={[
          {
            id: "count",
            label: translate("sales.contacts.kpi.count", { ns: "starter" }, "Contacts"),
            value: String(state.total),
            icon: Contact,
          },
          {
            id: "accounts",
            label: translate(
              "sales.contacts.kpi.accounts",
              { ns: "starter" },
              "Accounts covered"
            ),
            value: String(accountOptions.length),
            icon: Building2,
          },
          {
            id: "email",
            label: translate(
              "sales.contacts.kpi.reachable",
              { ns: "starter" },
              "With email (page)"
            ),
            value:
              state.rows.length === 0
                ? "—"
                : `${Math.round((reachable / state.rows.length) * 100)}%`,
            hint: translate(
              "sales.contacts.kpi.reachable.hint",
              { ns: "starter" },
              "Reachable by email"
            ),
            tone: "positive",
            icon: AtSign,
          },
          {
            id: "linked",
            label: translate(
              "sales.contacts.kpi.linked",
              { ns: "starter" },
              "Linked to an account (page)"
            ),
            value:
              state.rows.length === 0
                ? "—"
                : `${Math.round((linked / state.rows.length) * 100)}%`,
            tone: linked === state.rows.length ? "positive" : "warning",
          },
        ]}
      />

      <ListToolbar
        state={{ ...state, columns }}
        facets={[
          {
            field: "account_id",
            label: translate("sales.contacts.fields.account", { ns: "starter" }, "Account"),
            options: accountOptions,
          },
        ]}
        searchPlaceholder={translate(
          "sales.contacts.searchPlaceholder",
          { ns: "starter" },
          "Search contacts…"
        )}
        onExport={exportCsv}
        exporting={exporting}
      />

      <DataGrid
        state={state}
        columns={columns}
        onRowOpen={(record) => openChild(`show/${record.id}`)}
        emptyTitle={translate(
          "sales.contacts.empty.title",
          { ns: "starter" },
          "No contacts yet"
        )}
        emptyDescription={translate(
          "sales.contacts.empty.description",
          { ns: "starter" },
          "Add people to an account to keep the relationship map current."
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
              resource="hub_sales_contacts"
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
        resource="hub_sales_contacts"
        selected={state.selected}
        onClear={() => state.setSelected([])}
        onDone={() => {
          state.setSelected([]);
          void state.query.refetch();
        }}
      />
    </ListView>
  );
}
