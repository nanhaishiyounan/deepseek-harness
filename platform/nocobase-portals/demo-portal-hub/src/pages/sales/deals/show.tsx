import { useList, useShow, useTranslate, useUpdate } from "@refinedev/core";
import { AlertTriangle, Check, Pencil, Plus, X } from "lucide-react";
import { useOutlet, useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { EditButton } from "@/components/resources/buttons/edit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import { cn } from "@/lib/utils";
import {
  ACTIVITY_TYPES,
  DEAL_STAGES,
  OPEN_DEAL_STAGES,
  STAGE_PROBABILITY,
  daysSince,
  formatCurrency,
  formatDate,
  formatDateTime,
  labelFor,
  nextStages,
  weightedAmount,
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
  userLabel,
} from "../shared";
import type { ActivityRecord, DealRecord } from "../types";

const PATH_STAGES = ["inquiry", "quote", "negotiation", "won"] as const;

export function DealShow({ idParam = "id" }: { idParam?: string } = {}) {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const closeTo = useContextualCloseTo();
  const params = useParams<Record<string, string>>();
  const id = params[idParam];
  const nestedDrawer = useOutlet();
  const { mutate: updateDeal } = useUpdate();
  const nav = useRecordNav({
    listId: idParam === "id" ? "deals" : "",
    currentId: id,
    pathFor: (recordId) => `/deals/show/${recordId}`,
  });
  useDrawerShortcuts({
    onPrev: nav.goPrev,
    onNext: nav.goNext,
    onEdit: () => openChild("edit"),
  });

  const { result: record, query } = useShow<DealRecord>({
    resource: "hub_sales_deals",
    id,
    meta: { appends: ["account", "owner"] },
  });

  const { result: activities } = useList<ActivityRecord>({
    resource: "hub_sales_activities",
    pagination: { mode: "server", currentPage: 1, pageSize: 50 },
    sorters: [{ field: "date", order: "desc" }],
    filters: id ? [{ field: "deal_id", operator: "eq", value: id }] : [],
    errorNotification: false,
    queryOptions: { retry: false, enabled: Boolean(id) },
  });

  const stage = record?.stage ?? "inquiry";
  const isOpen = OPEN_DEAL_STAGES.includes(stage);
  const daysToClose = record?.expected_close_date
    ? -(daysSince(record.expected_close_date) ?? 0)
    : null;
  const isOverdue = isOpen && daysToClose !== null && daysToClose < 0;
  const lastTouchDays = daysSince(activities.data[0]?.date);

  const move = (next: string) => {
    if (!record) return;
    updateDeal({
      resource: "hub_sales_deals",
      id: record.id,
      values: { stage: next },
    });
  };

  const displayName =
    record?.title ||
    translate("sales.deals.detail.unnamed", { ns: "starter" }, "Untitled deal");

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
        "sales.deals.drawer.show.description",
        { ns: "starter" },
        "Value, stage and activity history for this deal."
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
              resource="hub_sales_deals"
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
                "sales.deals.detail.loadError.title",
                { ns: "starter" },
                "Unable to load deal"
              )}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "sales.deals.detail.loadError.description",
                { ns: "starter" },
                "The deal may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            {/* Sales path — clicking a later stage is how the deal advances. */}
            <StagePath stage={stage} onMove={move} />

            {isOverdue ? (
              <Alert variant="destructive">
                <AlertTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-4" />
                  {translate(
                    "sales.deals.detail.overdue.title",
                    { ns: "starter" },
                    "Past its expected close date"
                  )}
                </AlertTitle>
                <AlertDescription>
                  {translate(
                    "sales.deals.detail.overdue.description",
                    { ns: "starter" },
                    "This deal was due to close {{days}} days ago. Update the date or close it out."
                  ).replace("{{days}}", String(Math.abs(daysToClose ?? 0)))}
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniStat
                label={translate(
                  "sales.deals.fields.amount",
                  { ns: "starter" },
                  "Amount"
                )}
                value={formatCurrency(record?.amount, locale)}
              />
              <MiniStat
                label={translate(
                  "sales.deals.columns.weighted",
                  { ns: "starter" },
                  "Weighted"
                )}
                value={formatCurrency(
                  weightedAmount(record?.amount, stage),
                  locale
                )}
              />
              <MiniStat
                label={translate(
                  "sales.deals.detail.probability",
                  { ns: "starter" },
                  "Probability"
                )}
                value={`${Math.round((STAGE_PROBABILITY[stage] ?? 0) * 100)}%`}
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
            </div>

            <DetailItems
              title={translate(
                "sales.deals.detail.profile",
                { ns: "starter" },
                "Overview"
              )}
              items={[
                [
                  translate("sales.deals.fields.account", { ns: "starter" }, "Account"),
                  record?.account?.name || "—",
                ],
                [
                  translate("sales.deals.fields.stage", { ns: "starter" }, "Stage"),
                  <EnumBadge
                    key="stage"
                    value={stage}
                    label={labelFor(DEAL_STAGES, stage, translate)}
                  />,
                ],
                [
                  translate(
                    "sales.deals.fields.expectedClose",
                    { ns: "starter" },
                    "Expected close"
                  ),
                  <span
                    key="close"
                    className={cn(
                      isOverdue && "font-medium text-red-600 dark:text-red-400"
                    )}
                  >
                    {formatDate(record?.expected_close_date, locale)}
                    {isOpen && daysToClose !== null
                      ? ` · ${
                          daysToClose >= 0
                            ? translate(
                                "sales.deals.columns.daysLeft",
                                { ns: "starter" },
                                "in {{days}}d"
                              ).replace("{{days}}", String(daysToClose))
                            : translate(
                                "sales.deals.columns.daysOverdue",
                                { ns: "starter" },
                                "{{days}}d late"
                              ).replace("{{days}}", String(-daysToClose))
                        }`
                      : ""}
                  </span>,
                ],
                [
                  translate("sales.deals.fields.owner", { ns: "starter" }, "Owner"),
                  userLabel(record?.owner),
                ],
                [
                  translate(
                    "sales.deals.detail.createdAt",
                    { ns: "starter" },
                    "Created"
                  ),
                  formatDate(record?.createdAt, locale),
                ],
                [
                  translate(
                    "sales.deals.detail.activityCount",
                    { ns: "starter" },
                    "Logged activities"
                  ),
                  String(activities.data.length),
                ],
              ]}
            />

            <Separator />

            <DrawerSection
              title={translate(
                "sales.deals.detail.activities",
                { ns: "starter" },
                "Activity history"
              )}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openChild("activities/create")}
                >
                  <Plus />
                  {translate(
                    "sales.activities.actions.log",
                    { ns: "starter" },
                    "Log activity"
                  )}
                </Button>
              }
            >
              <SimpleTable
                headers={[
                  translate("sales.activities.fields.date", { ns: "starter" }, "Date"),
                  translate("sales.activities.fields.type", { ns: "starter" }, "Type"),
                  translate(
                    "sales.activities.fields.subject",
                    { ns: "starter" },
                    "Subject"
                  ),
                ]}
              >
                {activities.data.length === 0 ? (
                  <EmptyRow
                    colSpan={3}
                    text={translate(
                      "sales.activities.empty",
                      { ns: "starter" },
                      "No activity logged for this deal yet."
                    )}
                  />
                ) : (
                  activities.data.map((activity) => (
                    <tr key={String(activity.id)}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatDateTime(activity.date, locale)}
                      </td>
                      <td className="px-3 py-2">
                        <EnumBadge
                          value={activity.type ?? "call"}
                          label={labelFor(
                            ACTIVITY_TYPES,
                            activity.type ?? "call",
                            translate
                          )}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium">
                        {activity.subject || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </SimpleTable>
            </DrawerSection>
          </div>
        )}
      </div>
    </RouteDrawer>
  );
}

/**
 * Opportunity path. Stages the deal cannot legally reach are inert, so the only
 * way forward is the next legal step or an explicit win/lose.
 */
function StagePath({
  stage,
  onMove,
}: {
  stage: string;
  onMove: (next: string) => void;
}) {
  const translate = useTranslate();
  const allowed = nextStages(stage);
  const currentIndex = PATH_STAGES.indexOf(stage as (typeof PATH_STAGES)[number]);
  const isLost = stage === "lost";

  return (
    <div className="space-y-3">
      <div className="flex overflow-hidden rounded-lg border">
        {PATH_STAGES.map((pathStage, index) => {
          const reached = !isLost && currentIndex >= index;
          const isCurrent = stage === pathStage;
          const clickable = allowed.includes(pathStage);
          return (
            <button
              key={pathStage}
              type="button"
              disabled={!clickable}
              onClick={() => onMove(pathStage)}
              className={cn(
                "flex-1 border-r px-2 py-2 text-xs font-medium last:border-r-0 transition-colors",
                reached
                  ? "bg-primary/12 text-primary"
                  : "bg-muted/30 text-muted-foreground",
                isCurrent && "bg-primary text-primary-foreground",
                clickable && "hover:bg-primary/20 hover:text-primary"
              )}
            >
              {labelFor(DEAL_STAGES, pathStage, translate)}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {allowed.map((next) => (
          <Button
            key={next}
            variant={next === "won" ? "default" : next === "lost" ? "destructive" : "outline"}
            size="sm"
            onClick={() => onMove(next)}
          >
            {next === "won" ? <Check /> : next === "lost" ? <X /> : null}
            {translate(
              "sales.pipeline.card.advance",
              { ns: "starter" },
              "Move to {{stage}}"
            ).replace("{{stage}}", labelFor(DEAL_STAGES, next, translate))}
          </Button>
        ))}
        {isLost ? (
          <span className="text-xs text-muted-foreground">
            {translate(
              "sales.deals.detail.lostHint",
              { ns: "starter" },
              "Closed lost — reopening puts it back into negotiation."
            )}
          </span>
        ) : null}
      </div>
    </div>
  );
}
