import { useList, useShow, useTranslate, useUpdate } from "@refinedev/core";
import { CalendarClock, CheckCircle2, Circle, Eye, FileText, HandCoins, HeartPulse, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useOutlet, useParams, useResolvedPath } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import {
  CrmAIContext,
  CrmAIShortcut,
  useCustomerDetailTasks,
} from "../ai-assistant";
import { AuditTrail, CopyLinkButton, RelativeTime } from "../audit-trail";
import {
  ACTIVITY_TYPES,
  DEAL_STAGES,
  FOLLOW_UP_STATUSES,
  QUOTE_STATUSES,
  INDUSTRIES,
  CUSTOMER_STATUSES,
  formatCurrency,
  formatDate,
  formatDateTime,
  labelFor,
} from "../constants";
import { RecordLink, useOpenRecord } from "../record-links";
import { RecordPager } from "../record-pager";
import { useTrackRecentRecord } from "../recent-records";
import { crmRoutes } from "../routes";
import {
  useContextualCloseTo,
  useOpenContextualChild,
} from "../route-surfaces";
import { DRAWER_WIDE, DetailItems, DrawerSection, EnumBadge, useLocale } from "../shared";
import type {
  ActivityRecord,
  ContactRecord,
  CustomerRecord,
  DealRecord,
  FollowUpRecord,
  QuoteRecord,
} from "../types";

export function CustomerShow() {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const closeTo = useContextualCloseTo();
  const { id } = useParams<{ id: string }>();
  const nested = useOutlet();
  const parentRoute = useResolvedPath("..");
  const { result: record, query } = useShow<CustomerRecord>({
    resource: "crm_customers",
    id,
    meta: { appends: ["owner", "createdBy", "updatedBy"] },
  });
  useTrackRecentRecord("customer", record?.id, record?.company_name);
  const aiTasks = useCustomerDetailTasks(translate);
  const [tab, setTab] = useState("overview");

  const displayName =
    record?.company_name ||
    translate("crm.customers.detail.unnamed", { ns: "starter" }, "Unnamed customer");
  // Customer detail is also hosted by the dashboard, whose sibling path keeps
  // the extra "customers" segment when replacing the current drawer.
  const pagerPath = parentRoute.pathname.endsWith(crmRoutes.customers)
    ? "../show"
    : "../customers/show";

  return (
    <CrmAIContext
      id="crm-customer-detail"
      title={translate("crm.ai.context.customer", { ns: "starter" }, "Account detail")}
      getContext={() => ({
        resource: "crm_customers",
        record: record
          ? {
              id: record.id,
              company_name: record.company_name,
              industry: record.industry,
              status: record.status,
              website: record.website,
              phone: record.phone,
              owner: record.owner?.nickname ?? null,
              notes: record.notes,
            }
          : null,
      })}
    >
    <RouteDrawer
      className={DRAWER_WIDE}
      title={
        query.isLoading && !record ? (
          <Skeleton className="h-6 w-40" />
        ) : (
          displayName
        )
      }
      description={translate(
        "crm.customers.drawer.show.description",
        { ns: "starter" },
        "Contacts, deals, activity and follow-ups for this account."
      )}
      closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
      closeTo={closeTo}
      nested={nested}
      actions={
        <div className="flex items-center gap-2">
          <RecordPager
            kind="customer"
            id={id}
            buildPath={(next) => `${pagerPath}/${next}`}
          />
          <CrmAIShortcut tasks={aiTasks} />
          <CopyLinkButton />
          {record ? (
            <EditButton
              resource="crm_customers"
              recordItemId={record.id}
              variant="outline"
              size="icon-sm"
              onClick={() => openChild("edit")}
            >
              <Pencil />
            </EditButton>
          ) : null}
        </div>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {query.isLoading ? (
          <LoadingState className="min-h-64" />
        ) : query.isError ? (
          <Alert variant="destructive">
            <AlertTitle>
              {translate("crm.customers.detail.loadError.title", { ns: "starter" }, "Unable to load customer")}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "crm.customers.detail.loadError.description",
                { ns: "starter" },
                "The customer may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-end">
              <RelativeTime value={record?.updatedAt ?? record?.createdAt} />
            </div>
            <DetailItems
              title={translate("crm.customers.detail.profile", { ns: "starter" }, "Profile")}
              items={[
                [
                  translate("crm.customers.fields.industry", { ns: "starter" }, "Industry"),
                  record?.industry ? labelFor(INDUSTRIES, record.industry, translate) : "—",
                ],
                [
                  translate("crm.customers.fields.status", { ns: "starter" }, "Status"),
                  <EnumBadge
                    key="status"
                    value={record?.status ?? "active"}
                    label={labelFor(CUSTOMER_STATUSES, record?.status ?? "active", translate)}
                  />,
                ],
                [translate("crm.customers.fields.phone", { ns: "starter" }, "Phone"), record?.phone || "—"],
                [
                  translate("crm.customers.fields.website", { ns: "starter" }, "Website"),
                  record?.website ? (
                    <a
                      key="website"
                      href={record.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {record.website}
                    </a>
                  ) : (
                    "—"
                  ),
                ],
                [
                  translate("crm.customers.fields.createdAt", { ns: "starter" }, "Customer since"),
                  formatDate(record?.createdAt, locale),
                ],
                [translate("crm.customers.fields.notes", { ns: "starter" }, "Notes"), record?.notes || "—"],
              ]}
            />
            {id ? (
              <>
                <Separator />
                {/* Related records are split into tabs: the 360 view opens on a
                    summary instead of a single scroll of five tables. */}
                <Tabs value={tab} onValueChange={(next) => setTab(String(next))}>
                  <TabsList variant="line" className="w-full flex-wrap justify-start">
                    <TabsTrigger value="overview">
                      {translate("crm.customers.tabs.overview", { ns: "starter" }, "Overview")}
                    </TabsTrigger>
                    <TabsTrigger value="contacts">
                      {translate("crm.customers.detail.contacts", { ns: "starter" }, "Contacts")}
                    </TabsTrigger>
                    <TabsTrigger value="deals">
                      {translate("crm.customers.detail.deals", { ns: "starter" }, "Deals")}
                    </TabsTrigger>
                    <TabsTrigger value="quotes">
                      {translate("crm.customers.detail.quotes", { ns: "starter" }, "Quotes")}
                    </TabsTrigger>
                    <TabsTrigger value="activities">
                      {translate("crm.customers.detail.activities", { ns: "starter" }, "Activity log")}
                    </TabsTrigger>
                    <TabsTrigger value="followUps">
                      {translate("crm.customers.detail.followUps", { ns: "starter" }, "Follow-ups")}
                    </TabsTrigger>
                    <TabsTrigger value="history">
                      {translate("crm.customers.tabs.history", { ns: "starter" }, "History")}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="overview" className="pt-5">
                    <Customer360 customer={record} customerId={id} locale={locale} />
                  </TabsContent>
                  <TabsContent value="contacts" className="pt-5">
                    <ContactsSection customerId={id} />
                  </TabsContent>
                  <TabsContent value="deals" className="pt-5">
                    <DealsSection customerId={id} locale={locale} />
                  </TabsContent>
                  <TabsContent value="quotes" className="pt-5">
                    <CustomerQuotesSection customerId={id} locale={locale} />
                  </TabsContent>
                  <TabsContent value="activities" className="pt-5">
                    <ActivitiesSection customerId={id} locale={locale} />
                  </TabsContent>
                  <TabsContent value="followUps" className="pt-5">
                    <FollowUpsSection customerId={id} locale={locale} />
                  </TabsContent>
                  <TabsContent value="history" className="pt-5">
                    <AuditTrail record={record} locale={locale} />
                  </TabsContent>
                </Tabs>
              </>
            ) : null}
          </div>
        )}
      </div>
    </RouteDrawer>
    </CrmAIContext>
  );
}

function Customer360({
  customer,
  customerId,
  locale,
}: {
  customer?: CustomerRecord;
  customerId: string;
  locale: string;
}) {
  const translate = useTranslate();
  const openChild = useOpenContextualChild();
  const openRecord = useOpenRecord();
  const openTimelineItem = (kind: string, recordId: string | number) => {
    if (kind === "deal") {
      openChild(`deals/show/${encodeURIComponent(String(recordId))}`);
    } else if (kind === "activity") {
      openRecord.activity(recordId);
    } else if (kind === "quote") {
      openRecord.quote(recordId);
    } else if (kind === "followUp") {
      openRecord.followUp(recordId);
    }
  };
  const activities = useList<ActivityRecord>({
    resource: "crm_activities",
    filters: [{ field: "customer_id", operator: "eq", value: customerId }],
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const deals = useList<DealRecord>({
    resource: "crm_deals",
    filters: [{ field: "customer_id", operator: "eq", value: customerId }],
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const quotes = useList<QuoteRecord>({
    resource: "crm_quotes",
    filters: [{ field: "customer_id", operator: "eq", value: customerId }],
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const followUps = useList<FollowUpRecord>({
    resource: "crm_follow_ups",
    filters: [{ field: "customer_id", operator: "eq", value: customerId }],
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const today = new Date();
  const cutoff = new Date(today.getTime() - 30 * 86400000);
  const recentActivity = activities.result.data.some((activity) => activity.date && new Date(activity.date) >= cutoff);
  const openDeals = deals.result.data.filter((deal) => ["inquiry", "quote", "negotiation"].includes(deal.stage ?? ""));
  const acceptedQuotes = quotes.result.data.filter((quote) => quote.status === "accepted");
  const overdue = followUps.result.data.filter((followUp) => followUp.status !== "done" && (followUp.due_date ?? "") < today.toISOString().slice(0, 10));
  const health = Math.min(100,
    45 +
    (customer?.status === "active" ? 10 : 0) +
    (recentActivity ? 15 : 0) +
    (openDeals.length > 0 ? 12 : 0) +
    (acceptedQuotes.length > 0 ? 13 : 0) +
    (overdue.length === 0 ? 5 : -10)
  );
  const healthLabel = health >= 80
    ? translate("crm.customers.health.strong", { ns: "starter" }, "Strong")
    : health >= 60
      ? translate("crm.customers.health.watch", { ns: "starter" }, "Needs attention")
      : translate("crm.customers.health.risk", { ns: "starter" }, "At risk");
  const timeline = useMemo(() => [
    ...activities.result.data.map((record) => ({ id: `activity-${record.id}`, recordId: record.id, kind: "activity", date: record.date ?? record.createdAt, title: record.subject ?? "—", detail: labelFor(ACTIVITY_TYPES, record.type, translate), icon: <MessageSquare className="size-4" /> })),
    ...deals.result.data.map((record) => ({ id: `deal-${record.id}`, recordId: record.id, kind: "deal", date: record.closed_date ?? record.updatedAt ?? record.createdAt, title: record.title ?? "—", detail: `${labelFor(DEAL_STAGES, record.stage, translate)} · ${formatCurrency(record.amount, locale)}`, icon: <HandCoins className="size-4" /> })),
    ...quotes.result.data.map((record) => ({ id: `quote-${record.id}`, recordId: record.id, kind: "quote", date: record.issue_date ?? record.createdAt, title: record.quote_number ?? "—", detail: `${labelFor(QUOTE_STATUSES, record.status, translate)} · ${formatCurrency(record.total, locale)}`, icon: <FileText className="size-4" /> })),
    ...followUps.result.data.map((record) => ({ id: `follow-${record.id}`, recordId: record.id, kind: "followUp", date: record.due_date ?? record.createdAt, title: record.subject ?? "—", detail: labelFor(FOLLOW_UP_STATUSES, record.status, translate), icon: <CalendarClock className="size-4" /> })),
  ].filter((item) => item.date).sort((left, right) => String(right.date).localeCompare(String(left.date))).slice(0, 14), [activities.result.data, deals.result.data, followUps.result.data, locale, quotes.result.data, translate]);

  return (
    <section className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
        <div className="rounded-xl border bg-gradient-to-br from-blue-500/10 via-sky-500/5 to-transparent p-5">
          <div className="flex items-center justify-between"><HeartPulse className="size-5 text-blue-600" /><span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">{healthLabel}</span></div>
          <p className="mt-5 text-sm text-muted-foreground">{translate("crm.customers.health.title", { ns: "starter" }, "Account health")}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{health}<span className="text-base text-muted-foreground">/100</span></p>
          <Progress value={health} className="mt-4" />
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{translate("crm.customers.health.description", { ns: "starter" }, "Based on recency, open pipeline, accepted quotes and overdue follow-ups.")}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">{translate("crm.customers.health.recent", { ns: "starter" }, "Recent activity")}</p><p className="mt-2 text-xl font-semibold">{recentActivity ? translate("crm.common.yes", { ns: "starter" }, "Yes") : translate("crm.common.no", { ns: "starter" }, "No")}</p></div>
          <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">{translate("crm.customers.health.openDeals", { ns: "starter" }, "Open deals")}</p><p className="mt-2 text-xl font-semibold tabular-nums">{openDeals.length}</p></div>
          <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">{translate("crm.customers.health.acceptedQuotes", { ns: "starter" }, "Accepted quotes")}</p><p className="mt-2 text-xl font-semibold tabular-nums">{acceptedQuotes.length}</p></div>
          <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">{translate("crm.customers.health.overdue", { ns: "starter" }, "Overdue follow-ups")}</p><p className="mt-2 text-xl font-semibold tabular-nums">{overdue.length}</p></div>
        </div>
      </div>
      <DrawerSection title={translate("crm.customers.timeline.title", { ns: "starter" }, "Account timeline")}>
        <div className="relative space-y-1 before:absolute before:top-4 before:bottom-4 before:left-[1.15rem] before:w-px before:bg-border">
          {timeline.map((item) => (
            <div key={item.id} className="relative flex gap-3 rounded-lg px-1 py-2.5 hover:bg-accent/50">
              <div className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-card text-blue-600">{item.icon}</div>
              <div className="min-w-0 flex-1"><div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between"><RecordLink label={item.title} onClick={() => openTimelineItem(item.kind, item.recordId)} /><time className="shrink-0 text-xs text-muted-foreground">{formatDateTime(item.date, locale)}</time></div><p className="mt-0.5 text-xs text-muted-foreground">{translate(`crm.customers.timeline.${item.kind}`, { ns: "starter" }, item.kind)} · {item.detail}</p></div>
            </div>
          ))}
        </div>
      </DrawerSection>
    </section>
  );
}

function AddLink({ to, label }: { to: string; label: string }) {
  const openChild = useOpenContextualChild();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => openChild(to)}
    >
      <Plus />
      {label}
    </Button>
  );
}

function RowEditLink({ to }: { to: string }) {
  const openChild = useOpenContextualChild();

  return (
    <Button variant="ghost" size="icon" onClick={() => openChild(to)}>
      <Pencil />
    </Button>
  );
}

function RowViewLink({ to, label }: { to: string; label: string }) {
  const openChild = useOpenContextualChild();

  return (
    <Button variant="ghost" size="icon" onClick={() => openChild(to)}>
      <Eye />
      <span className="sr-only">{label}</span>
    </Button>
  );
}

function SimpleTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}

const EmptyRow = ({ colSpan, text }: { colSpan: number; text: string }) => (
  <tr>
    <td colSpan={colSpan} className="px-3 py-6 text-center text-muted-foreground">
      {text}
    </td>
  </tr>
);

function ContactsSection({ customerId }: { customerId: string }) {
  const translate = useTranslate();
  const { result } = useList<ContactRecord>({
    resource: "crm_contacts",
    pagination: { mode: "server", currentPage: 1, pageSize: 50 },
    sorters: [{ field: "name", order: "asc" }],
    filters: [{ field: "customer_id", operator: "eq", value: customerId }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  return (
    <DrawerSection
      title={translate("crm.customers.detail.contacts", { ns: "starter" }, "Contacts")}
      action={
        <AddLink
          to="contacts/create"
          label={translate("crm.contacts.actions.add", { ns: "starter" }, "Add contact")}
        />
      }
    >
      <SimpleTable
        headers={[
          translate("crm.contacts.fields.name", { ns: "starter" }, "Name"),
          translate("crm.contacts.fields.jobTitle", { ns: "starter" }, "Job title"),
          translate("crm.contacts.fields.email", { ns: "starter" }, "Email"),
          translate("crm.contacts.fields.phone", { ns: "starter" }, "Phone"),
          translate("crm.common.actions", { ns: "starter" }, "Actions"),
        ]}
      >
        {result.data.length === 0 ? (
          <EmptyRow
            colSpan={5}
            text={translate(
              "crm.contacts.empty",
              { ns: "starter" },
              "No contacts yet. Add the people you deal with here."
            )}
          />
        ) : (
          result.data.map((contact) => (
            <tr key={String(contact.id)}>
              <td className="px-3 py-2 font-medium">{contact.name || "—"}</td>
              <td className="px-3 py-2">{contact.job_title || "—"}</td>
              <td className="px-3 py-2">{contact.email || "—"}</td>
              <td className="px-3 py-2">{contact.phone || "—"}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  <RowEditLink
                    to={`contacts/edit/${encodeURIComponent(String(contact.id))}`}
                  />
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
              </td>
            </tr>
          ))
        )}
      </SimpleTable>
    </DrawerSection>
  );
}

function DealsSection({
  customerId,
  locale,
}: {
  customerId: string;
  locale: string;
}) {
  const translate = useTranslate();
  const openChild = useOpenContextualChild();
  const { result } = useList<DealRecord>({
    resource: "crm_deals",
    pagination: { mode: "server", currentPage: 1, pageSize: 50 },
    sorters: [{ field: "createdAt", order: "desc" }],
    filters: [{ field: "customer_id", operator: "eq", value: customerId }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  return (
    <DrawerSection
      title={translate("crm.customers.detail.deals", { ns: "starter" }, "Deals")}
      action={
        <AddLink
          to="deals/create"
          label={translate("crm.deals.actions.add", { ns: "starter" }, "Add deal")}
        />
      }
    >
      <SimpleTable
        headers={[
          translate("crm.deals.fields.title", { ns: "starter" }, "Deal"),
          translate("crm.deals.fields.stage", { ns: "starter" }, "Stage"),
          translate("crm.deals.fields.amount", { ns: "starter" }, "Amount"),
          translate("crm.deals.fields.expectedClose", { ns: "starter" }, "Expected close"),
          translate("crm.common.actions", { ns: "starter" }, "Actions"),
        ]}
      >
        {result.data.length === 0 ? (
          <EmptyRow
            colSpan={5}
            text={translate("crm.deals.empty", { ns: "starter" }, "No deals for this account yet.")}
          />
        ) : (
          result.data.map((deal) => (
            <tr key={String(deal.id)}>
              <td className="px-3 py-2 font-medium">
                <RecordLink
                  label={deal.title}
                  onClick={() =>
                    openChild(`deals/show/${encodeURIComponent(String(deal.id))}`)
                  }
                />
              </td>
              <td className="px-3 py-2">
                <EnumBadge
                  value={deal.stage ?? "inquiry"}
                  label={labelFor(DEAL_STAGES, deal.stage ?? "inquiry", translate)}
                />
              </td>
              <td className="px-3 py-2 tabular-nums">
                {formatCurrency(deal.amount, locale)}
              </td>
              <td className="px-3 py-2">
                {formatDate(deal.expected_close_date, locale)}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  <RowViewLink
                    to={`deals/show/${encodeURIComponent(String(deal.id))}`}
                    label={translate("crm.deals.actions.view", { ns: "starter" }, "View deal")}
                  />
                  <RowEditLink
                    to={`deals/edit/${encodeURIComponent(String(deal.id))}`}
                  />
                  <DeleteButton
                    resource="crm_deals"
                    recordItemId={deal.id}
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 />
                  </DeleteButton>
                </div>
              </td>
            </tr>
          ))
        )}
      </SimpleTable>
    </DrawerSection>
  );
}

/**
 * Every proposal sent to the account. Without it the 360 view stops at the
 * deal, and the commercial history — what was quoted, for how much, and whether
 * it is still valid — is invisible from the account.
 */
function CustomerQuotesSection({
  customerId,
  locale,
}: {
  customerId: string;
  locale: string;
}) {
  const translate = useTranslate();
  const openRecord = useOpenRecord();
  const { result } = useList<QuoteRecord>({
    resource: "crm_quotes",
    pagination: { mode: "server", currentPage: 1, pageSize: 50 },
    sorters: [{ field: "issue_date", order: "desc" }],
    filters: [{ field: "customer_id", operator: "eq", value: customerId }],
    meta: { appends: ["deal"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <DrawerSection
      title={translate("crm.customers.detail.quotes", { ns: "starter" }, "Quotes")}
    >
      <SimpleTable
        headers={[
          translate("crm.quotes.fields.number", { ns: "starter" }, "Quote"),
          translate("crm.quotes.fields.deal", { ns: "starter" }, "Deal"),
          translate("crm.quotes.fields.status", { ns: "starter" }, "Status"),
          translate("crm.quotes.fields.validUntil", { ns: "starter" }, "Valid until"),
          translate("crm.quotes.fields.total", { ns: "starter" }, "Total"),
        ]}
      >
        {result.data.length === 0 ? (
          <EmptyRow
            colSpan={5}
            text={translate(
              "crm.customers.quotes.empty",
              { ns: "starter" },
              "No proposals have been issued to this account yet."
            )}
          />
        ) : (
          result.data.map((quote) => {
            const expired =
              quote.status === "sent" && (quote.valid_until ?? "") < today;
            return (
              <tr key={String(quote.id)}>
                <td className="px-3 py-2 font-mono font-medium">
                  <RecordLink
                    label={quote.quote_number}
                    onClick={() => openRecord.quote(quote.id)}
                  />
                </td>
                <td className="px-3 py-2">{quote.deal?.title || "—"}</td>
                <td className="px-3 py-2">
                  <EnumBadge
                    value={quote.status ?? "draft"}
                    label={labelFor(QUOTE_STATUSES, quote.status ?? "draft", translate)}
                  />
                </td>
                <td
                  className={
                    "px-3 py-2 whitespace-nowrap " +
                    (expired ? "font-medium text-red-600 dark:text-red-400" : "")
                  }
                >
                  {formatDate(quote.valid_until, locale)}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {formatCurrency(quote.total, locale)}
                </td>
              </tr>
            );
          })
        )}
      </SimpleTable>
    </DrawerSection>
  );
}

function ActivitiesSection({
  customerId,
  locale,
}: {
  customerId: string;
  locale: string;
}) {
  const translate = useTranslate();
  const openRecord = useOpenRecord();
  const { result } = useList<ActivityRecord>({
    resource: "crm_activities",
    pagination: { mode: "server", currentPage: 1, pageSize: 50 },
    sorters: [{ field: "date", order: "desc" }],
    filters: [{ field: "customer_id", operator: "eq", value: customerId }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  return (
    <DrawerSection
      title={translate("crm.customers.detail.activities", { ns: "starter" }, "Activity log")}
      action={
        <AddLink
          to="activities/create"
          label={translate("crm.activities.actions.add", { ns: "starter" }, "Log activity")}
        />
      }
    >
      <SimpleTable
        headers={[
          translate("crm.activities.fields.date", { ns: "starter" }, "Date"),
          translate("crm.activities.fields.type", { ns: "starter" }, "Type"),
          translate("crm.activities.fields.subject", { ns: "starter" }, "Subject"),
          translate("crm.activities.fields.contact", { ns: "starter" }, "Contact"),
          translate("crm.common.actions", { ns: "starter" }, "Actions"),
        ]}
      >
        {result.data.length === 0 ? (
          <EmptyRow
            colSpan={5}
            text={translate(
              "crm.activities.empty",
              { ns: "starter" },
              "No calls, meetings or emails logged yet."
            )}
          />
        ) : (
          result.data.map((activity) => (
            <tr key={String(activity.id)}>
              <td className="px-3 py-2 whitespace-nowrap">
                {formatDateTime(activity.date, locale)}
              </td>
              <td className="px-3 py-2">
                <EnumBadge
                  value={activity.type ?? "call"}
                  label={labelFor(ACTIVITY_TYPES, activity.type ?? "call", translate)}
                />
              </td>
              <td className="px-3 py-2 font-medium">
                <RecordLink
                  label={activity.subject}
                  onClick={() => openRecord.activity(activity.id)}
                />
              </td>
              <td className="px-3 py-2">{activity.contact?.name || "—"}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  <RowEditLink
                    to={`activities/edit/${encodeURIComponent(String(activity.id))}`}
                  />
                  <DeleteButton
                    resource="crm_activities"
                    recordItemId={activity.id}
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 />
                  </DeleteButton>
                </div>
              </td>
            </tr>
          ))
        )}
      </SimpleTable>
    </DrawerSection>
  );
}

function FollowUpsSection({
  customerId,
  locale,
}: {
  customerId: string;
  locale: string;
}) {
  const translate = useTranslate();
  const openRecord = useOpenRecord();
  const { mutate: updateFollowUp } = useUpdate<FollowUpRecord>();
  const { result } = useList<FollowUpRecord>({
    resource: "crm_follow_ups",
    pagination: { mode: "server", currentPage: 1, pageSize: 50 },
    sorters: [{ field: "due_date", order: "asc" }],
    filters: [{ field: "customer_id", operator: "eq", value: customerId }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <DrawerSection
      title={translate("crm.customers.detail.followUps", { ns: "starter" }, "Follow-ups")}
      action={
        <AddLink
          to="follow-ups/create"
          label={translate("crm.followUps.actions.add", { ns: "starter" }, "Add follow-up")}
        />
      }
    >
      <SimpleTable
        headers={[
          translate("crm.followUps.fields.dueDate", { ns: "starter" }, "Due"),
          translate("crm.followUps.fields.subject", { ns: "starter" }, "Subject"),
          translate("crm.followUps.fields.status", { ns: "starter" }, "Status"),
          translate("crm.common.actions", { ns: "starter" }, "Actions"),
        ]}
      >
        {result.data.length === 0 ? (
          <EmptyRow
            colSpan={4}
            text={translate(
              "crm.followUps.empty",
              { ns: "starter" },
              "Nothing scheduled. Add a reminder so nothing slips."
            )}
          />
        ) : (
          result.data.map((followUp) => {
            const isDone = followUp.status === "done";
            const isOverdue =
              !isDone && (followUp.due_date ?? "") < today;
            return (
              <tr key={String(followUp.id)}>
                <td
                  className={
                    "px-3 py-2 whitespace-nowrap " +
                    (isOverdue ? "text-red-600 dark:text-red-400" : "")
                  }
                >
                  {formatDate(followUp.due_date, locale)}
                </td>
                <td className="px-3 py-2 font-medium">
                  <RecordLink
                    label={followUp.subject}
                    onClick={() => openRecord.followUp(followUp.id)}
                  />
                </td>
                <td className="px-3 py-2">
                  <EnumBadge
                    value={followUp.status ?? "pending"}
                    label={labelFor(FOLLOW_UP_STATUSES, followUp.status ?? "pending", translate)}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    {isDone ? (
                      <Circle className="size-4 text-muted-foreground/40" />
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        title={translate("crm.followUps.actions.markDone", { ns: "starter" }, "Mark done")}
                        onClick={() =>
                          updateFollowUp({
                            resource: "crm_follow_ups",
                            id: followUp.id,
                            values: { status: "done" },
                          })
                        }
                      >
                        <CheckCircle2 />
                      </Button>
                    )}
                    <RowEditLink
                      to={`follow-ups/edit/${encodeURIComponent(String(followUp.id))}`}
                    />
                    <DeleteButton
                      resource="crm_follow_ups"
                      recordItemId={followUp.id}
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 />
                    </DeleteButton>
                  </div>
                </td>
              </tr>
            );
          })
        )}
      </SimpleTable>
    </DrawerSection>
  );
}
