import { useList, useShow, useTranslate } from "@refinedev/core";
import { Pencil } from "lucide-react";
import { Link, useOutlet, useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { EditButton } from "@/components/resources/buttons/edit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import {
  ACTIVITY_TYPES,
  DEAL_STAGES,
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
  CopyLinkButton,
  DetailItems,
  DrawerSection,
  EnumBadge,
  MiniStat,
  useLocale,
} from "../shared";
import type { ActivityRecord } from "../types";

export function ActivityShow() {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const closeTo = useContextualCloseTo();
  const { id } = useParams<{ id: string }>();
  const nestedDrawer = useOutlet();
  const nav = useRecordNav({
    listId: "activities",
    currentId: id,
    pathFor: (recordId) => `/activities/show/${recordId}`,
  });
  useDrawerShortcuts({
    onPrev: nav.goPrev,
    onNext: nav.goNext,
    onEdit: () => openChild("edit"),
  });
  const { result: record, query } = useShow<ActivityRecord>({
    resource: "hub_sales_activities",
    id,
    meta: { appends: ["deal"] },
  });

  const { result: activities } = useList<ActivityRecord>({
    resource: "hub_sales_activities",
    pagination: { mode: "server", currentPage: 1, pageSize: 6 },
    sorters: [{ field: "date", order: "desc" }],
    filters: record?.deal_id
      ? [{ field: "deal_id", operator: "eq", value: record.deal_id }]
      : [],
    errorNotification: false,
    queryOptions: { retry: false, enabled: Boolean(record?.deal_id) },
  });

  const daysAgo = daysSince(record?.date);
  const siblings = activities.data
    .filter((activity) => String(activity.id) !== String(record?.id))
    .slice(0, 5);

  const displayName =
    record?.subject ||
    translate(
      "sales.activities.detail.unnamed",
      { ns: "starter" },
      "Untitled activity"
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
        "sales.activities.drawer.show.description",
        { ns: "starter" },
        "Full details of this logged activity."
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
              resource="hub_sales_activities"
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
                "sales.activities.detail.loadError.title",
                { ns: "starter" },
                "Unable to load activity"
              )}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "sales.activities.detail.loadError.description",
                { ns: "starter" },
                "The activity may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniStat
                label={translate(
                  "sales.activities.detail.logged",
                  { ns: "starter" },
                  "Logged"
                )}
                value={formatDate(record?.date, locale)}
              />
              <MiniStat
                label={translate(
                  "sales.activities.detail.daysAgo",
                  { ns: "starter" },
                  "Days ago"
                )}
                value={
                  daysAgo === null
                    ? "—"
                    : translate(
                        "sales.deals.columns.daysAgo",
                        { ns: "starter" },
                        "{{days}}d ago"
                      ).replace("{{days}}", String(daysAgo))
                }
              />
              <MiniStat
                label={translate(
                  "sales.activities.detail.dealStage",
                  { ns: "starter" },
                  "Deal stage"
                )}
                value={labelFor(
                  DEAL_STAGES,
                  record?.deal?.stage,
                  translate
                )}
              />
              <MiniStat
                label={translate(
                  "sales.activities.detail.dealAmount",
                  { ns: "starter" },
                  "Deal amount"
                )}
                value={formatCurrency(record?.deal?.amount, locale)}
              />
            </div>

            <DetailItems
              title={translate(
                "sales.activities.detail.profile",
                { ns: "starter" },
                "Details"
              )}
              items={[
                [
                  translate(
                    "sales.activities.fields.type",
                    { ns: "starter" },
                    "Type"
                  ),
                  <EnumBadge
                    key="type"
                    value={record?.type ?? "call"}
                    label={labelFor(ACTIVITY_TYPES, record?.type ?? "call", translate)}
                  />,
                ],
                [
                  translate(
                    "sales.activities.fields.date",
                    { ns: "starter" },
                    "Date"
                  ),
                  formatDateTime(record?.date, locale),
                ],
                [
                  translate(
                    "sales.activities.fields.deal",
                    { ns: "starter" },
                    "Deal"
                  ),
                  record?.deal?.id ? (
                    <Link
                      key="deal"
                      to={`/deals/show/${encodeURIComponent(
                        String(record.deal.id)
                      )}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {record.deal.title || "—"}
                    </Link>
                  ) : (
                    "—"
                  ),
                ],
              ]}
            />
            <section className="space-y-2">
              <h3 className="text-sm font-medium">
                {translate(
                  "sales.activities.fields.notes",
                  { ns: "starter" },
                  "Notes"
                )}
              </h3>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {record?.notes ||
                  translate(
                    "sales.activities.detail.noNotes",
                    { ns: "starter" },
                    "No notes recorded."
                  )}
              </p>
            </section>

            <DrawerSection
              title={translate(
                "sales.activities.detail.moreOnDeal",
                { ns: "starter" },
                "More on this deal"
              )}
            >
              {siblings.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  {translate(
                    "sales.activities.detail.noSiblings",
                    { ns: "starter" },
                    "No other activity logged for this deal."
                  )}
                </p>
              ) : (
                <ol className="relative space-y-4 border-l pl-5">
                  {siblings.map((activity) => (
                    <li key={String(activity.id)} className="relative">
                      <span className="absolute -left-[1.65rem] top-2 size-2 rounded-full bg-blue-500 ring-4 ring-background" />
                      <Link
                        to={`/activities/show/${encodeURIComponent(
                          String(activity.id)
                        )}`}
                        className="group block space-y-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                          <span className="text-sm font-medium underline-offset-2 group-hover:underline">
                            {activity.subject || "—"}
                          </span>
                          <span className="text-xs whitespace-nowrap text-muted-foreground">
                            {formatDateTime(activity.date, locale)}
                          </span>
                        </div>
                        <EnumBadge
                          value={activity.type ?? "call"}
                          label={labelFor(
                            ACTIVITY_TYPES,
                            activity.type ?? "call",
                            translate
                          )}
                        />
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </DrawerSection>
          </div>
        )}
      </div>
    </RouteDrawer>
  );
}
