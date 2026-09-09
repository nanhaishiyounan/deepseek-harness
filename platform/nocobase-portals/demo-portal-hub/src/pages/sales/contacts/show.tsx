import { useList, useShow, useTranslate } from "@refinedev/core";
import { Building2, Pencil } from "lucide-react";
import { useMemo } from "react";
import { Link, useOutlet, useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { EditButton } from "@/components/resources/buttons/edit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import {
  DEAL_STAGES,
  INDUSTRIES,
  OPEN_DEAL_STAGES,
  daysSince,
  formatCurrency,
  formatDate,
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
  CopyLinkButton,
  DetailItems,
  DrawerSection,
  EmptyRow,
  EnumBadge,
  MiniStat,
  SimpleTable,
  useLocale,
} from "../shared";
import type { ActivityRecord, ContactRecord, DealRecord } from "../types";

export function ContactShow({ idParam = "id" }: { idParam?: string } = {}) {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const closeTo = useContextualCloseTo();
  const params = useParams<Record<string, string>>();
  const id = params[idParam];
  const nestedDrawer = useOutlet();
  const nav = useRecordNav({
    listId: idParam === "id" ? "contacts" : "",
    currentId: id,
    pathFor: (recordId) => `/contacts/show/${recordId}`,
  });
  useDrawerShortcuts({
    onPrev: nav.goPrev,
    onNext: nav.goNext,
    onEdit: () => openChild("edit"),
  });
  const { result: record, query } = useShow<ContactRecord>({
    resource: "hub_sales_contacts",
    id,
    meta: { appends: ["account"] },
  });

  const { result: deals } = useList<DealRecord>({
    resource: "hub_sales_deals",
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    filters: record?.account_id
      ? [
          {
            field: "account_id",
            operator: "eq",
            value: record.account_id,
          },
        ]
      : [],
    errorNotification: false,
    queryOptions: { retry: false, enabled: Boolean(record?.account_id) },
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
    errorNotification: false,
    queryOptions: { retry: false, enabled: dealIds.length > 0 },
  });

  const openPipeline = useMemo(
    () =>
      deals.data.reduce(
        (total, deal) =>
          OPEN_DEAL_STAGES.includes(deal.stage ?? "")
            ? total + Number(deal.amount ?? 0)
            : total,
        0
      ),
    [deals.data]
  );
  const lastTouchDays = daysSince(activities.data[0]?.date);

  const displayName =
    record?.name ||
    translate("sales.contacts.detail.unnamed", { ns: "starter" }, "Unnamed contact");

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
        "sales.contacts.drawer.show.description",
        { ns: "starter" },
        "Contact details and the account they belong to."
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
              resource="hub_sales_contacts"
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
                "sales.contacts.detail.loadError.title",
                { ns: "starter" },
                "Unable to load contact"
              )}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "sales.contacts.detail.loadError.description",
                { ns: "starter" },
                "The contact may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniStat
                label={translate(
                  "sales.accounts.stat.openPipeline",
                  { ns: "starter" },
                  "Open pipeline"
                )}
                value={formatCurrency(openPipeline, locale)}
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
                  lastTouchDays === null
                    ? "—"
                    : translate(
                        "sales.deals.columns.daysAgo",
                        { ns: "starter" },
                        "{{days}}d ago"
                      ).replace("{{days}}", String(lastTouchDays))
                }
                tone={
                  lastTouchDays !== null && lastTouchDays > 30
                    ? "warning"
                    : "default"
                }
              />
              <MiniStat
                label={translate(
                  "sales.contacts.detail.contactSince",
                  { ns: "starter" },
                  "Contact since"
                )}
                value={formatDate(record?.createdAt, locale)}
              />
            </div>

            <DetailItems
              title={translate(
                "sales.contacts.detail.profile",
                { ns: "starter" },
                "Contact info"
              )}
              items={[
                [
                  translate(
                    "sales.contacts.fields.jobTitle",
                    { ns: "starter" },
                    "Job title"
                  ),
                  record?.title || "—",
                ],
                [
                  translate(
                    "sales.contacts.fields.email",
                    { ns: "starter" },
                    "Email"
                  ),
                  record?.email ? (
                    <a
                      key="email"
                      href={`mailto:${record.email}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {record.email}
                    </a>
                  ) : (
                    "—"
                  ),
                ],
                [
                  translate(
                    "sales.contacts.fields.phone",
                    { ns: "starter" },
                    "Phone"
                  ),
                  record?.phone || "—",
                ],
              ]}
            />
            <section className="space-y-3">
              <h3 className="text-sm font-medium">
                {translate(
                  "sales.contacts.detail.account",
                  { ns: "starter" },
                  "Account"
                )}
              </h3>
              {record?.account?.name ? (
                <Button
                  render={
                    <Link
                      to={`/accounts/show/${encodeURIComponent(
                        String(record.account.id)
                      )}`}
                    />
                  }
                  variant="outline"
                  className="h-auto justify-start gap-2 py-2"
                >
                  <Building2 className="size-4 text-muted-foreground" />
                  <span className="flex flex-col items-start">
                    <span className="text-sm font-medium">
                      {record.account.name}
                    </span>
                    {record.account.industry ? (
                      <span className="text-xs text-muted-foreground">
                        {labelFor(
                          INDUSTRIES,
                          record.account.industry,
                          translate
                        )}
                      </span>
                    ) : null}
                  </span>
                </Button>
              ) : (
                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  {translate(
                    "sales.contacts.detail.noAccount",
                    { ns: "starter" },
                    "This contact is not linked to an account."
                  )}
                </p>
              )}
            </section>

            {record?.account_id ? (
              <DrawerSection
                title={translate(
                  "sales.contacts.detail.dealsAtAccount",
                  { ns: "starter" },
                  "Deals at this account"
                )}
              >
                <SimpleTable
                  headers={[
                    translate(
                      "sales.deals.fields.title",
                      { ns: "starter" },
                      "Deal"
                    ),
                    translate(
                      "sales.deals.fields.stage",
                      { ns: "starter" },
                      "Stage"
                    ),
                    translate(
                      "sales.deals.fields.amount",
                      { ns: "starter" },
                      "Amount"
                    ),
                    translate(
                      "sales.deals.fields.expectedClose",
                      { ns: "starter" },
                      "Expected close"
                    ),
                  ]}
                >
                  {deals.data.length === 0 ? (
                    <EmptyRow
                      colSpan={4}
                      text={translate(
                        "sales.deals.empty",
                        { ns: "starter" },
                        "No deals for this account yet."
                      )}
                    />
                  ) : (
                    deals.data.map((deal) => (
                      <tr key={String(deal.id)}>
                        <td className="px-3 py-2 font-medium">
                          <Link
                            to={`/deals/show/${encodeURIComponent(
                              String(deal.id)
                            )}`}
                            className="text-primary underline-offset-2 hover:underline"
                          >
                            {deal.title || "—"}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          <EnumBadge
                            value={deal.stage ?? "inquiry"}
                            label={labelFor(
                              DEAL_STAGES,
                              deal.stage ?? "inquiry",
                              translate
                            )}
                          />
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatCurrency(deal.amount, locale)}
                        </td>
                        <td className="px-3 py-2">
                          {formatDate(deal.expected_close_date, locale)}
                        </td>
                      </tr>
                    ))
                  )}
                </SimpleTable>
              </DrawerSection>
            ) : null}
          </div>
        )}
      </div>
    </RouteDrawer>
  );
}
