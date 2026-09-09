import { useList, useOne, useTranslate } from "@refinedev/core";
import {
  AtSign,
  Building2,
  Eye,
  Mail,
  Pencil,
  Phone,
  Trash2,
  Users,
} from "lucide-react";
import { useMemo } from "react";
import { useParams } from "react-router";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { ListView } from "@/components/resources/views/list-view";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import { cn } from "@/lib/utils";
import { AuditTrail, CopyLinkButton } from "../audit-trail";
import {
  ACTIVITY_TYPES,
  DEAL_STAGES,
  formatCurrency,
  formatDate,
  formatDateTime,
  labelFor,
} from "../constants";
import { csvTimestamp, downloadCsv, type CsvColumn } from "../csv";
import { useCrmIdentity } from "../identity";
import {
  BulkActionBar,
  ColumnSettingsMenu,
  ExportCsvButton,
  KpiStrip,
  ListEmptyState,
  ListErrorState,
  SavedViewsMenu,
  SelectCell,
  SortableHeader,
  TableSkeleton,
  densityClass,
  useActiveViewName,
  useBulkMutation,
  useColumnPreferences,
  useListSorters,
  useRowSelection,
  useSavedViews,
  type BulkAction,
  type ListSorter,
  type ViewPreset,
} from "../list-toolkit";
import {
  ListFilterSelect,
  ListPagination,
  ListSearchInput,
  ListToolbar,
  ListToolbarContent,
  searchFilter,
  useDebouncedValue,
  useListPagination,
  useResetPageOnFilterChange,
} from "../list-controls";
import { useCustomerOptions } from "../pickers";
import { RecordLink, useOpenRecord } from "../record-links";
import { useRecordCursorSource } from "../record-cursor";
import { RecordPager } from "../record-pager";
import { useTrackRecentRecord } from "../recent-records";
import { useContextualCloseTo, useOpenContextualChild } from "../route-surfaces";
import { DRAWER_WIDE, DetailItems, DrawerSection, EnumBadge, useLocale } from "../shared";
import { useUrlState } from "../url-state";
import type { ActivityRecord, ContactRecord, DealRecord } from "../types";

const CONTACT_FILTER_DEFAULTS = {
  q: "",
  customer: "all",
  reachable: "all",
  sort: "",
};

type ContactFilterState = typeof CONTACT_FILTER_DEFAULTS;
const CONTACT_DEFAULT_SORTERS: ListSorter[] = [{ field: "name", order: "asc" }];

/**
 * People, as their own object. Until now contacts only existed inside an
 * account drawer, which makes the most common sales question — "who do we know
 * at all, and how do I reach them?" — impossible to answer.
 */
export function ContactsPage() {
  const translate = useTranslate();
  const identity = useCrmIdentity();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const openRecord = useOpenRecord();
  const { state, setState, replaceState, reset, fingerprint, isDirty } =
    useUrlState<ContactFilterState>(CONTACT_FILTER_DEFAULTS);
  const debouncedSearch = useDebouncedValue(state.q);
  const listSorters = useListSorters(
    state.sort,
    (next) => setState({ sort: next }),
    CONTACT_DEFAULT_SORTERS
  );
  const { currentPage, pageSize, setCurrentPage, setPageSize } =
    useListPagination();
  const { options: customerOptions } = useCustomerOptions();
  const bulk = useBulkMutation("crm_contacts");

  const filters = useMemo(
    () => [
      ...searchFilter(["name", "email", "phone", "job_title"], debouncedSearch),
      ...(state.customer === "all"
        ? []
        : [{ field: "customer_id", operator: "eq" as const, value: state.customer }]),
      ...(state.reachable === "email"
        ? [{ field: "email", operator: "nnull" as const, value: true }]
        : []),
      ...(state.reachable === "phone"
        ? [{ field: "phone", operator: "nnull" as const, value: true }]
        : []),
    ],
    [debouncedSearch, state.customer, state.reachable]
  );
  useResetPageOnFilterChange(`${debouncedSearch}|${fingerprint}`, setCurrentPage);

  const { result, query } = useList<ContactRecord>({
    resource: "crm_contacts",
    filters,
    pagination: { mode: "server", currentPage, pageSize },
    sorters: listSorters.sorters,
    meta: { appends: ["customer"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const summary = useList<ContactRecord>({
    resource: "crm_contacts",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    meta: { fields: ["id", "email", "phone", "job_title"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const visible = result.data;
  useRecordCursorSource("contact", visible.map((row) => row.id));
  const all = summary.result.data;
  const withEmail = all.filter((contact) => Boolean(contact.email)).length;
  const withPhone = all.filter((contact) => Boolean(contact.phone)).length;
  const unreachable = all.filter(
    (contact) => !contact.email && !contact.phone
  ).length;

  const selection = useRowSelection(visible.map((contact) => contact.id));

  const reachableOptions = useMemo(
    () => [
      { value: "email", label: translate("crm.contacts.filters.email", { ns: "starter" }, "Has an email") },
      { value: "phone", label: translate("crm.contacts.filters.phone", { ns: "starter" }, "Has a phone number") },
    ],
    [translate]
  );

  const columnOptions = useMemo(
    () => [
      { id: "name", label: translate("crm.contacts.fields.name", { ns: "starter" }, "Name"), locked: true },
      { id: "job_title", label: translate("crm.contacts.fields.jobTitle", { ns: "starter" }, "Job title") },
      { id: "customer", label: translate("crm.contacts.fields.customer", { ns: "starter" }, "Customer") },
      { id: "email", label: translate("crm.contacts.fields.email", { ns: "starter" }, "Email") },
      { id: "phone", label: translate("crm.contacts.fields.phone", { ns: "starter" }, "Phone") },
      { id: "createdAt", label: translate("crm.contacts.fields.createdAt", { ns: "starter" }, "Created") },
    ],
    [translate]
  );
  const columnPrefs = useColumnPreferences("contacts", columnOptions);

  const presets = useMemo<ViewPreset<ContactFilterState>[]>(
    () => [
      {
        id: "emailable",
        name: translate("crm.contacts.views.emailable", { ns: "starter" }, "Contactable by email"),
        state: { reachable: "email" },
      },
      {
        id: "callable",
        name: translate("crm.contacts.views.callable", { ns: "starter" }, "Contactable by phone"),
        state: { reachable: "phone" },
      },
    ],
    [translate]
  );
  const savedViews = useSavedViews<ContactFilterState>("contacts");
  const activeView = useActiveViewName(
    state,
    CONTACT_FILTER_DEFAULTS,
    presets,
    savedViews.views
  );

  const csvColumns = useMemo<CsvColumn<ContactRecord>[]>(
    () => [
      { header: translate("crm.contacts.fields.name", { ns: "starter" }, "Name"), value: (contact) => contact.name },
      { header: translate("crm.contacts.fields.jobTitle", { ns: "starter" }, "Job title"), value: (contact) => contact.job_title },
      { header: translate("crm.contacts.fields.customer", { ns: "starter" }, "Customer"), value: (contact) => contact.customer?.company_name },
      { header: translate("crm.contacts.fields.email", { ns: "starter" }, "Email"), value: (contact) => contact.email },
      { header: translate("crm.contacts.fields.phone", { ns: "starter" }, "Phone"), value: (contact) => contact.phone },
    ],
    [translate]
  );

  const bulkActions = useMemo<BulkAction[]>(
    () => {
      const actions: BulkAction[] = [
        {
          id: "delete",
          label: translate("crm.bulk.delete", { ns: "starter" }, "Delete"),
          icon: <Trash2 className="size-4" />,
          destructive: true,
          confirm: translate(
            "crm.bulk.deleteConfirm",
            { ns: "starter" },
            "The selected records are removed permanently. This cannot be undone."
          ),
          onRun: async (ids) => {
            const done = await bulk.remove(
              ids,
              translate("crm.bulk.deleted", { ns: "starter" }, "Records deleted")
            );
            if (done) selection.clear();
          },
        },
      ];
      return actions.filter(
        (action) => identity.isAdmin || action.id !== "delete"
      );
    },
    [bulk, identity.isAdmin, selection, translate]
  );

  return (
    <ListView resource="crm_contacts">
      <div className="rounded-xl border bg-card shadow-sm">
        <KpiStrip
          loading={summary.query.isLoading}
          chips={[
            {
              id: "all",
              label: translate("crm.contacts.kpi.all", { ns: "starter" }, "Contacts"),
              value: summary.result.total ?? all.length,
              active: !isDirty,
              onClick: reset,
            },
            {
              id: "email",
              label: translate("crm.contacts.kpi.email", { ns: "starter" }, "With email"),
              value: withEmail,
              tone: "success",
              active: state.reachable === "email",
              onClick: () => replaceState({ reachable: "email" }),
            },
            {
              id: "phone",
              label: translate("crm.contacts.kpi.phone", { ns: "starter" }, "With phone"),
              value: withPhone,
              active: state.reachable === "phone",
              onClick: () => replaceState({ reachable: "phone" }),
            },
            {
              id: "unreachable",
              label: translate("crm.contacts.kpi.unreachable", { ns: "starter" }, "No way to reach"),
              value: unreachable,
              tone: unreachable > 0 ? "danger" : "default",
            },
          ]}
        />
        <ListToolbar>
          <ListToolbarContent
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <SavedViewsMenu
                  presets={presets}
                  views={savedViews.views}
                  activeName={activeView}
                  isDirty={isDirty}
                  onApply={(next) => replaceState(next)}
                  onSave={(name) => savedViews.save(name, state)}
                  onDelete={savedViews.remove}
                  onReset={reset}
                />
                <ColumnSettingsMenu
                  columns={columnOptions}
                  isVisible={columnPrefs.isVisible}
                  toggle={columnPrefs.toggle}
                  density={columnPrefs.density}
                  setDensity={columnPrefs.setDensity}
                  reset={columnPrefs.reset}
                />
                <ExportCsvButton
                  disabled={visible.length === 0}
                  onExport={() =>
                    downloadCsv(`crm-contacts-${csvTimestamp()}.csv`, csvColumns, visible)
                  }
                />
              </div>
            }
          >
            <ListSearchInput
              value={state.q}
              onChange={(value) => setState({ q: value })}
              placeholder={translate("crm.contacts.search", { ns: "starter" }, "Search name, email, phone or title")}
            />
            <ListFilterSelect
              value={state.customer}
              onChange={(value) => setState({ customer: value })}
              options={customerOptions}
              allLabel={translate("crm.common.allCustomers", { ns: "starter" }, "All customers")}
            />
            <ListFilterSelect
              value={state.reachable}
              onChange={(value) => setState({ reachable: value })}
              options={reachableOptions}
              allLabel={translate("crm.contacts.filters.any", { ns: "starter" }, "Any contact detail")}
            />
          </ListToolbarContent>
        </ListToolbar>

        <BulkActionBar
          count={selection.selected.length}
          ids={selection.selected}
          actions={bulkActions}
          busy={bulk.running}
          onClear={selection.clear}
        />

        {query.isLoading ? (
          <TableSkeleton columns={6} />
        ) : query.isError ? (
          <ListErrorState onRetry={() => void query.refetch()} />
        ) : (
          <>
            <div className={cn("overflow-x-auto", densityClass(columnPrefs.density))}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <SelectCell
                        checked={selection.allSelected}
                        onToggle={selection.toggleAll}
                        label={translate("crm.bulk.selectAll", { ns: "starter" }, "Select all rows")}
                      />
                    </TableHead>
                    <TableHead><SortableHeader field="name" label={translate("crm.contacts.fields.name", { ns: "starter" }, "Name")} sorters={listSorters} /></TableHead>
                    {columnPrefs.isVisible("job_title") ? (
                      <TableHead><SortableHeader field="job_title" label={translate("crm.contacts.fields.jobTitle", { ns: "starter" }, "Job title")} sorters={listSorters} /></TableHead>
                    ) : null}
                    {columnPrefs.isVisible("customer") ? (
                      <TableHead>{translate("crm.contacts.fields.customer", { ns: "starter" }, "Customer")}</TableHead>
                    ) : null}
                    {columnPrefs.isVisible("email") ? (
                      <TableHead><SortableHeader field="email" label={translate("crm.contacts.fields.email", { ns: "starter" }, "Email")} sorters={listSorters} /></TableHead>
                    ) : null}
                    {columnPrefs.isVisible("phone") ? (
                      <TableHead><SortableHeader field="phone" label={translate("crm.contacts.fields.phone", { ns: "starter" }, "Phone")} sorters={listSorters} /></TableHead>
                    ) : null}
                    {columnPrefs.isVisible("createdAt") ? (
                      <TableHead><SortableHeader field="createdAt" label={translate("crm.contacts.fields.createdAt", { ns: "starter" }, "Created")} sorters={listSorters} /></TableHead>
                    ) : null}
                    <TableHead className="w-28"><span className="sr-only">{translate("crm.common.actions", { ns: "starter" }, "Actions")}</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((contact) => (
                    <TableRow
                      key={String(contact.id)}
                      className="group cursor-pointer"
                      data-state={selection.isSelected(contact.id) ? "selected" : undefined}
                      onClick={() => openChild(`show/${contact.id}`)}
                    >
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <SelectCell
                          checked={selection.isSelected(contact.id)}
                          onToggle={() => selection.toggle(contact.id)}
                          label={translate("crm.bulk.selectRow", { ns: "starter" }, "Select row")}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{contact.name || "—"}</TableCell>
                      {columnPrefs.isVisible("job_title") ? (
                        <TableCell>{contact.job_title || "—"}</TableCell>
                      ) : null}
                      {columnPrefs.isVisible("customer") ? (
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <RecordLink
                            label={contact.customer?.company_name}
                            onClick={() =>
                              contact.customer_id &&
                              openRecord.customer(contact.customer_id)
                            }
                          />
                        </TableCell>
                      ) : null}
                      {columnPrefs.isVisible("email") ? (
                        <TableCell>
                          {contact.email ? (
                            <a
                              href={`mailto:${contact.email}`}
                              onClick={(event) => event.stopPropagation()}
                              className="inline-flex items-center gap-1.5 text-primary underline-offset-2 hover:underline"
                            >
                              <Mail className="size-3.5" />
                              {contact.email}
                            </a>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      ) : null}
                      {columnPrefs.isVisible("phone") ? (
                        <TableCell>{contact.phone || "—"}</TableCell>
                      ) : null}
                      {columnPrefs.isVisible("createdAt") ? (
                        <TableCell className="whitespace-nowrap">{formatDate(contact.createdAt, locale)}</TableCell>
                      ) : null}
                      <TableCell>
                        <div className="flex items-center gap-1 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                          <Button variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); openChild(`show/${contact.id}`); }}>
                            <Eye /><span className="sr-only">{translate("crm.contacts.actions.view", { ns: "starter" }, "View contact")}</span>
                          </Button>
                          <Button variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); openChild(`edit/${contact.id}`); }}>
                            <Pencil /><span className="sr-only">{translate("crm.contacts.actions.edit", { ns: "starter" }, "Edit contact")}</span>
                          </Button>
                          <DeleteButton
                            resource="crm_contacts"
                            recordItemId={contact.id}
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 />
                          </DeleteButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {visible.length === 0 ? (
                <ListEmptyState
                  title={translate("crm.contacts.listEmpty", { ns: "starter" }, "No contacts match the current filters.")}
                  description={translate(
                    "crm.contacts.listEmptyDescription",
                    { ns: "starter" },
                    "Contacts are added from an account, or created here and linked to one."
                  )}
                  filtered={isDirty}
                  onClearFilters={reset}
                />
              ) : null}
            </div>
            <ListPagination
              currentPage={currentPage}
              pageSize={pageSize}
              total={result.total ?? visible.length}
              setCurrentPage={setCurrentPage}
              setPageSize={setPageSize}
            />
          </>
        )}
      </div>
    </ListView>
  );
}

/** Person-level 360: their account, their deals and everything logged with them. */
export function ContactShow() {
  const { id } = useParams<{ id: string }>();
  const translate = useTranslate();
  const locale = useLocale();
  const closeTo = useContextualCloseTo();
  const openRecord = useOpenRecord();
  const { result: contact, query } = useOne<ContactRecord>({
    resource: "crm_contacts",
    id,
    meta: { appends: ["customer", "createdBy", "updatedBy"] },
    queryOptions: { enabled: Boolean(id), retry: false },
  });
  useTrackRecentRecord("contact", contact?.id, contact?.name);

  const deals = useList<DealRecord>({
    resource: "crm_deals",
    filters: id ? [{ field: "contact_id", operator: "eq", value: id }] : [],
    pagination: { mode: "server", currentPage: 1, pageSize: 25 },
    sorters: [{ field: "createdAt", order: "desc" }],
    errorNotification: false,
    queryOptions: { enabled: Boolean(id), retry: false },
  });
  const activities = useList<ActivityRecord>({
    resource: "crm_activities",
    filters: id ? [{ field: "contact_id", operator: "eq", value: id }] : [],
    pagination: { mode: "server", currentPage: 1, pageSize: 25 },
    sorters: [{ field: "date", order: "desc" }],
    errorNotification: false,
    queryOptions: { enabled: Boolean(id), retry: false },
  });

  return (
    <RouteDrawer
      className={DRAWER_WIDE}
      title={contact?.name ?? translate("crm.contacts.detail.title", { ns: "starter" }, "Contact")}
      description={translate(
        "crm.contacts.detail.description",
        { ns: "starter" },
        "How to reach them, and everything they are involved in."
      )}
      closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
      closeTo={closeTo}
      actions={
        <div className="flex items-center gap-2">
          <RecordPager
            kind="contact"
            id={id}
            buildPath={(next) => `../show/${next}`}
          />
          <CopyLinkButton />
        </div>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {query.isLoading ? (
          <TableSkeleton columns={2} rows={5} />
        ) : query.isError ? (
          <ListErrorState onRetry={() => void query.refetch()} />
        ) : contact ? (
          <div className="space-y-6">
            <DetailItems
              title={translate("crm.contacts.detail.profile", { ns: "starter" }, "Contact details")}
              items={[
                [
                  translate("crm.contacts.fields.customer", { ns: "starter" }, "Customer"),
                  <span key="customer" className="inline-flex items-center gap-2">
                    <Building2 className="size-4 text-muted-foreground" />
                    <RecordLink
                      label={contact.customer?.company_name}
                      onClick={() =>
                        contact.customer_id && openRecord.customer(contact.customer_id)
                      }
                    />
                  </span>,
                ],
                [
                  translate("crm.contacts.fields.jobTitle", { ns: "starter" }, "Job title"),
                  contact.job_title || "—",
                ],
                [
                  translate("crm.contacts.fields.email", { ns: "starter" }, "Email"),
                  contact.email ? (
                    <a
                      key="email"
                      href={`mailto:${contact.email}`}
                      className="inline-flex items-center gap-2 text-primary underline-offset-2 hover:underline"
                    >
                      <AtSign className="size-4" />
                      {contact.email}
                    </a>
                  ) : (
                    "—"
                  ),
                ],
                [
                  translate("crm.contacts.fields.phone", { ns: "starter" }, "Phone"),
                  contact.phone ? (
                    <span key="phone" className="inline-flex items-center gap-2">
                      <Phone className="size-4 text-muted-foreground" />
                      {contact.phone}
                    </span>
                  ) : (
                    "—"
                  ),
                ],
                [
                  translate("crm.contacts.fields.createdAt", { ns: "starter" }, "Added"),
                  formatDate(contact.createdAt, locale),
                ],
                [
                  translate("crm.contacts.fields.notes", { ns: "starter" }, "Notes"),
                  contact.notes || "—",
                ],
              ]}
            />

            <Separator />
            <DrawerSection
              title={translate("crm.contacts.detail.deals", { ns: "starter" }, "Deals involving this contact")}
              action={<Users className="size-4 text-muted-foreground" />}
            >
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <tbody className="divide-y">
                    {deals.result.data.length === 0 ? (
                      <tr>
                        <td className="px-3 py-6 text-center text-muted-foreground">
                          {translate("crm.contacts.deals.empty", { ns: "starter" }, "Not attached to a deal yet.")}
                        </td>
                      </tr>
                    ) : (
                      deals.result.data.map((deal) => (
                        <tr key={String(deal.id)}>
                          <td className="px-3 py-2 font-medium">
                            <RecordLink
                              label={deal.title}
                              onClick={() => openRecord.deal(deal.id)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <EnumBadge
                              value={deal.stage ?? "inquiry"}
                              label={labelFor(DEAL_STAGES, deal.stage ?? "inquiry", translate)}
                            />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatCurrency(deal.amount, locale)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </DrawerSection>

            <Separator />
            <DrawerSection
              title={translate("crm.contacts.detail.activities", { ns: "starter" }, "Recent interactions")}
            >
              <div className="space-y-1">
                {activities.result.data.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {translate("crm.contacts.activities.empty", { ns: "starter" }, "Nothing logged with this person yet.")}
                  </p>
                ) : (
                  activities.result.data.map((activity) => (
                    <div
                      key={String(activity.id)}
                      className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-accent/50"
                    >
                      <div className="min-w-0">
                        <RecordLink
                          label={activity.subject}
                          onClick={() => openRecord.activity(activity.id)}
                        />
                        <p className="text-xs text-muted-foreground">
                          {labelFor(ACTIVITY_TYPES, activity.type ?? "call", translate)}
                        </p>
                      </div>
                      <time className="shrink-0 text-xs text-muted-foreground">
                        {formatDateTime(activity.date, locale)}
                      </time>
                    </div>
                  ))
                )}
              </div>
            </DrawerSection>

            <Separator />
            <AuditTrail record={contact} locale={locale} />
          </div>
        ) : null}
      </div>
    </RouteDrawer>
  );
}
