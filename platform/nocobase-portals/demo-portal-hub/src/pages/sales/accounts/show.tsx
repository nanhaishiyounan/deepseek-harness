import { useList, useShow, useTranslate } from "@refinedev/core";
import {
  Eye,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useOutlet, useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import { cn } from "@/lib/utils";
import {
  ACTIVITY_TYPES,
  DEAL_STAGES,
  INDUSTRIES,
  OPEN_DEAL_STAGES,
  daysSince,
  formatCurrency,
  formatDate,
  formatDateTime,
  labelFor,
} from "../constants";
import {
  RecordNav,
  useDrawerShortcuts,
  useRecordNav,
} from "../record-nav";
import {
  useContextualCloseTo,
  useOpenContextualChild,
} from "../route-surfaces";
import {
  activityIcon,
  CopyLinkButton,
  DetailItems,
  DrawerSection,
  EmptyRow,
  EnumBadge,
  MiniStat,
  SimpleTable,
  useLocale,
  userLabel,
} from "../shared";
import type {
  AccountRecord,
  ActivityRecord,
  ContactRecord,
  DealRecord,
} from "../types";

export function AccountShow() {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const closeTo = useContextualCloseTo();
  const { id } = useParams<{ id: string }>();
  const nestedDrawer = useOutlet();
  const [tab, setTab] = useState("overview");
  const nav = useRecordNav({
    listId: "accounts",
    currentId: id,
    pathFor: (recordId) => `/accounts/show/${recordId}`,
  });
  useDrawerShortcuts({
    onPrev: nav.goPrev,
    onNext: nav.goNext,
    onEdit: () => openChild("edit"),
  });

  const { result: record, query } = useShow<AccountRecord>({
    resource: "hub_sales_accounts",
    id,
    meta: { appends: ["owner"] },
  });

  const { result: deals } = useList<DealRecord>({
    resource: "hub_sales_deals",
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    sorters: [{ field: "expected_close_date", order: "asc" }],
    filters: id ? [{ field: "account_id", operator: "eq", value: id }] : [],
    errorNotification: false,
    queryOptions: { retry: false, enabled: Boolean(id) },
  });

  const { result: contacts } = useList<ContactRecord>({
    resource: "hub_sales_contacts",
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    sorters: [{ field: "name", order: "asc" }],
    filters: id ? [{ field: "account_id", operator: "eq", value: id }] : [],
    errorNotification: false,
    queryOptions: { retry: false, enabled: Boolean(id) },
  });

  const dealIds = useMemo(
    () => deals.data.map((deal) => deal.id),
    [deals.data]
  );

  const { result: activities } = useList<ActivityRecord>({
    resource: "hub_sales_activities",
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    sorters: [{ field: "date", order: "desc" }],
    filters:
      dealIds.length > 0
        ? [{ field: "deal_id", operator: "in", value: dealIds }]
        : [],
    meta: { appends: ["deal"] },
    errorNotification: false,
    queryOptions: { retry: false, enabled: dealIds.length > 0 },
  });

  const rollup = useMemo(() => {
    let open = 0;
    let won = 0;
    for (const deal of deals.data) {
      const amount = Number(deal.amount ?? 0);
      if (OPEN_DEAL_STAGES.includes(deal.stage ?? "")) open += amount;
      if (deal.stage === "won") won += amount;
    }
    const lastTouch = activities.data[0]?.date ?? null;
    return { open, won, lastTouch, lastTouchDays: daysSince(lastTouch) };
  }, [deals.data, activities.data]);

  const displayName =
    record?.name ||
    translate(
      "sales.accounts.detail.unnamed",
      { ns: "starter" },
      "Unnamed account"
    );

  return (
    <RouteDrawer
      title={
        query.isLoading && !record ? (
          <Skeleton className="h-6 w-40" />
        ) : (
          displayName
        )
      }
      description={translate(
        "sales.accounts.drawer.show.description",
        { ns: "starter" },
        "Profile, contacts and deals for this account."
      )}
      closeLabel={translate("sales.common.close", { ns: "starter" }, "Close")}
      closeTo={closeTo}
      nested={nestedDrawer}
      actions={
        record ? (
          <div className="flex items-center gap-1">
            <RecordNav state={nav} />
            <CopyLinkButton />
            <EditButton
              resource="hub_sales_accounts"
              recordItemId={record.id}
              variant="outline"
              size="icon-sm"
              onClick={() => openChild("edit")}
            >
              <Pencil />
            </EditButton>
          </div>
        ) : null
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {query.isLoading ? (
          <LoadingState className="min-h-64" />
        ) : query.isError ? (
          <Alert variant="destructive">
            <AlertTitle>
              {translate(
                "sales.accounts.detail.loadError.title",
                { ns: "starter" },
                "Unable to load account"
              )}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "sales.accounts.detail.loadError.description",
                { ns: "starter" },
                "The account may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-5">
            {/* Relationship header — the numbers a rep needs before a call. */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniStat
                label={translate(
                  "sales.accounts.stat.openPipeline",
                  { ns: "starter" },
                  "Open pipeline"
                )}
                value={formatCurrency(rollup.open, locale)}
              />
              <MiniStat
                label={translate(
                  "sales.accounts.stat.won",
                  { ns: "starter" },
                  "Closed won"
                )}
                value={formatCurrency(rollup.won, locale)}
                tone="positive"
              />
              <MiniStat
                label={translate(
                  "sales.accounts.stat.deals",
                  { ns: "starter" },
                  "Deals"
                )}
                value={String(deals.data.length)}
              />
              <MiniStat
                label={translate(
                  "sales.accounts.stat.lastTouch",
                  { ns: "starter" },
                  "Last touch"
                )}
                value={
                  rollup.lastTouchDays === null
                    ? "—"
                    : translate(
                        "sales.deals.columns.daysAgo",
                        { ns: "starter" },
                        "{{days}}d ago"
                      ).replace("{{days}}", String(rollup.lastTouchDays))
                }
                tone={
                  rollup.lastTouchDays !== null && rollup.lastTouchDays > 30
                    ? "warning"
                    : "default"
                }
              />
            </div>

            <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
              <TabsList variant="line">
                <TabsTrigger value="overview">
                  {translate(
                    "sales.accounts.tabs.overview",
                    { ns: "starter" },
                    "Overview"
                  )}
                </TabsTrigger>
                <TabsTrigger value="contacts">
                  {translate(
                    "sales.accounts.detail.contacts",
                    { ns: "starter" },
                    "Contacts"
                  )}
                  <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                    {contacts.data.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="deals">
                  {translate("sales.accounts.detail.deals", { ns: "starter" }, "Deals")}
                  <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                    {deals.data.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="timeline">
                  {translate(
                    "sales.accounts.detail.timeline",
                    { ns: "starter" },
                    "Timeline"
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="pt-4">
                <DetailItems
                  title={translate(
                    "sales.accounts.detail.profile",
                    { ns: "starter" },
                    "Profile"
                  )}
                  items={[
                    [
                      translate(
                        "sales.accounts.fields.industry",
                        { ns: "starter" },
                        "Industry"
                      ),
                      record?.industry
                        ? labelFor(INDUSTRIES, record.industry, translate)
                        : "—",
                    ],
                    [
                      translate(
                        "sales.accounts.fields.owner",
                        { ns: "starter" },
                        "Owner"
                      ),
                      userLabel(record?.owner),
                    ],
                    [
                      translate(
                        "sales.accounts.fields.website",
                        { ns: "starter" },
                        "Website"
                      ),
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
                      translate(
                        "sales.accounts.fields.accountSince",
                        { ns: "starter" },
                        "Account since"
                      ),
                      formatDate(record?.createdAt, locale),
                    ],
                  ]}
                />
              </TabsContent>

              <TabsContent value="contacts" className="pt-4">
                <ContactsSection
                  contacts={contacts.data}
                  openChild={openChild}
                />
              </TabsContent>

              <TabsContent value="deals" className="pt-4">
                <DealsSection
                  deals={deals.data}
                  locale={locale}
                  openChild={openChild}
                />
              </TabsContent>

              <TabsContent value="timeline" className="pt-4">
                <TimelineSection
                  activities={activities.data}
                  locale={locale}
                  hasDeals={dealIds.length > 0}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </RouteDrawer>
  );
}

type OpenChild = (to: string) => void;

function ContactsSection({
  contacts,
  openChild,
}: {
  contacts: ContactRecord[];
  openChild: OpenChild;
}) {
  const translate = useTranslate();

  return (
    <DrawerSection
      title={translate(
        "sales.accounts.detail.contacts",
        { ns: "starter" },
        "Contacts"
      )}
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={() => openChild("contacts/create")}
        >
          <Plus />
          {translate(
            "sales.contacts.actions.add",
            { ns: "starter" },
            "Add contact"
          )}
        </Button>
      }
    >
      <SimpleTable
        headers={[
          translate("sales.contacts.fields.name", { ns: "starter" }, "Name"),
          translate("sales.contacts.fields.jobTitle", { ns: "starter" }, "Job title"),
          translate("sales.contacts.fields.email", { ns: "starter" }, "Email"),
          translate("sales.contacts.fields.phone", { ns: "starter" }, "Phone"),
          translate("sales.common.actions", { ns: "starter" }, "Actions"),
        ]}
      >
        {contacts.length === 0 ? (
          <EmptyRow
            colSpan={5}
            text={translate(
              "sales.contacts.empty",
              { ns: "starter" },
              "No contacts yet."
            )}
          />
        ) : (
          contacts.map((contact) => (
            <tr key={String(contact.id)} className="group/row">
              <td className="px-3 py-2 font-medium">
                <button
                  type="button"
                  className="text-left text-primary underline-offset-2 hover:underline"
                  onClick={() =>
                    openChild(
                      `contacts/show/${encodeURIComponent(String(contact.id))}`
                    )
                  }
                >
                  {contact.name || "—"}
                </button>
              </td>
              <td className="px-3 py-2">{contact.title || "—"}</td>
              <td className="px-3 py-2">
                {contact.email ? (
                  <a
                    href={`mailto:${contact.email}`}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {contact.email}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2">{contact.phone || "—"}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1 md:opacity-0 md:group-hover/row:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      openChild(
                        `contacts/show/${encodeURIComponent(String(contact.id))}`
                      )
                    }
                  >
                    <Eye />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      openChild(
                        `contacts/edit/${encodeURIComponent(String(contact.id))}`
                      )
                    }
                  >
                    <Pencil />
                  </Button>
                  <DeleteButton
                    resource="hub_sales_contacts"
                    recordItemId={contact.id}
                    variant="ghost"
                    size="icon-sm"
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
  deals,
  locale,
  openChild,
}: {
  deals: DealRecord[];
  locale: string;
  openChild: OpenChild;
}) {
  const translate = useTranslate();

  return (
    <DrawerSection
      title={translate("sales.accounts.detail.deals", { ns: "starter" }, "Deals")}
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={() => openChild("deals/create")}
        >
          <Plus />
          {translate("sales.deals.actions.add", { ns: "starter" }, "Add deal")}
        </Button>
      }
    >
      <SimpleTable
        headers={[
          translate("sales.deals.fields.title", { ns: "starter" }, "Deal"),
          translate("sales.deals.fields.stage", { ns: "starter" }, "Stage"),
          translate("sales.deals.fields.amount", { ns: "starter" }, "Amount"),
          translate(
            "sales.deals.fields.expectedClose",
            { ns: "starter" },
            "Expected close"
          ),
          translate("sales.common.actions", { ns: "starter" }, "Actions"),
        ]}
      >
        {deals.length === 0 ? (
          <EmptyRow
            colSpan={5}
            text={translate(
              "sales.deals.empty",
              { ns: "starter" },
              "No deals for this account yet."
            )}
          />
        ) : (
          deals.map((deal) => (
            <tr key={String(deal.id)} className="group/row">
              <td className="px-3 py-2 font-medium">
                <button
                  type="button"
                  className="text-left text-primary underline-offset-2 hover:underline"
                  onClick={() =>
                    openChild(`deals/show/${encodeURIComponent(String(deal.id))}`)
                  }
                >
                  {deal.title || "—"}
                </button>
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
                <div className="flex items-center gap-1 md:opacity-0 md:group-hover/row:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      openChild(
                        `deals/show/${encodeURIComponent(String(deal.id))}`
                      )
                    }
                  >
                    <Eye />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      openChild(
                        `deals/edit/${encodeURIComponent(String(deal.id))}`
                      )
                    }
                  >
                    <Pencil />
                  </Button>
                  <DeleteButton
                    resource="hub_sales_deals"
                    recordItemId={deal.id}
                    variant="ghost"
                    size="icon-sm"
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
 * Cross-entity timeline: every activity logged against any of this account's
 * deals, merged into one chronological feed.
 */
function TimelineSection({
  activities,
  locale,
  hasDeals,
}: {
  activities: ActivityRecord[];
  locale: string;
  hasDeals: boolean;
}) {
  const translate = useTranslate();

  if (!hasDeals || activities.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        {translate(
          "sales.accounts.detail.timeline.empty",
          { ns: "starter" },
          "No activity logged for this account's deals yet."
        )}
      </p>
    );
  }

  return (
    <ol className="relative space-y-4 border-l pl-5">
      {activities.map((activity) => {
        const Icon = activityIcon(activity.type);
        const age = daysSince(activity.date);
        return (
          <li key={String(activity.id)} className="relative">
            <span
              className={cn(
                "absolute -left-[1.9rem] flex size-6 items-center justify-center rounded-full ring-4 ring-background",
                "bg-blue-500/12 text-blue-600 dark:text-blue-400"
              )}
            >
              <Icon className="size-3" />
            </span>
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="text-sm font-medium">
                  {activity.subject || "—"}
                </span>
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {formatDateTime(activity.date, locale)}
                  {age !== null
                    ? ` · ${translate(
                        "sales.deals.columns.daysAgo",
                        { ns: "starter" },
                        "{{days}}d ago"
                      ).replace("{{days}}", String(age))}`
                    : ""}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <EnumBadge
                  value={activity.type ?? "call"}
                  label={labelFor(
                    ACTIVITY_TYPES,
                    activity.type ?? "call",
                    translate
                  )}
                />
                {activity.deal?.title ? (
                  <span className="text-xs text-muted-foreground">
                    {activity.deal.title}
                  </span>
                ) : null}
              </div>
              {activity.notes ? (
                <p className="text-xs text-muted-foreground">{activity.notes}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
