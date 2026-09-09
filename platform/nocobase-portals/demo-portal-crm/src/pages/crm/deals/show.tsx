import { useList, useShow, useTranslate, useUpdate } from "@refinedev/core";
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  Eye,
  Gauge,
  HandCoins,
  History,
  Pencil,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import type { ReactNode } from "react";
import { useOutlet, useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import { cn } from "@/lib/utils";
import { CrmAIContext, CrmAIShortcut, useDealDetailTasks } from "../ai-assistant";
import { AuditTrail, CopyLinkButton, RelativeTime } from "../audit-trail";
import { RecordLink, useOpenRecord } from "../record-links";
import { RecordPager } from "../record-pager";
import { useTrackRecentRecord } from "../recent-records";
import {
  ACTIVITY_TYPES,
  DEAL_STAGES,
  DEAL_STAGE_PROBABILITY,
  FOLLOW_UP_STATUSES,
  QUOTE_STATUSES,
  formatCurrency,
  formatDate,
  formatDateTime,
  labelFor,
} from "../constants";
import {
  useContextualCloseTo,
  useOpenContextualChild,
} from "../route-surfaces";
import { DRAWER_WIDE, DetailItems, DrawerSection, EnumBadge, useLocale } from "../shared";
import type {
  ActivityRecord,
  DealRecord,
  FollowUpRecord,
  QuoteRecord,
} from "../types";
import { StageProgress, useStageTransition } from "./stage-actions";
import { daysInStage, stageAgeTone } from "./stage-machine";

export function DealShow({ idParam = "id" }: { idParam?: string }) {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const openRecord = useOpenRecord();
  const closeTo = useContextualCloseTo();
  const params = useParams<Record<string, string>>();
  const id = params[idParam];
  const nested = useOutlet();
  const { result: record, query } = useShow<DealRecord>({
    resource: "crm_deals",
    id,
    meta: { appends: ["customer", "contact", "owner", "createdBy", "updatedBy"] },
  });
  useTrackRecentRecord("deal", record?.id, record?.title);
  const aiTasks = useDealDetailTasks(translate);
  const stageTransition = useStageTransition();
  const age = record ? daysInStage(record) : null;
  const ageTone = stageAgeTone(age);

  const displayName =
    record?.title ||
    translate("crm.deals.detail.unnamed", { ns: "starter" }, "Untitled deal");
  const stage = record?.stage ?? "inquiry";
  const probability = DEAL_STAGE_PROBABILITY[stage] ?? 0;
  const weighted = Number(record?.amount ?? 0) * probability;

  return (
    <CrmAIContext
      id="crm-deal-detail"
      title={translate("crm.ai.context.deal", { ns: "starter" }, "Deal detail")}
      getContext={() => ({
        resource: "crm_deals",
        record: record
          ? {
              id: record.id,
              title: record.title,
              stage: record.stage,
              amount: record.amount,
              weighted_amount: weighted,
              expected_close_date: record.expected_close_date,
              closed_date: record.closed_date,
              customer: record.customer?.company_name ?? null,
              contact: record.contact?.name ?? null,
              owner: record.owner?.nickname ?? null,
              notes: record.notes,
            }
          : null,
      })}
    >
    <RouteDrawer
      className={DRAWER_WIDE}
      title={
        query.isLoading && !record ? <Skeleton className="h-6 w-40" /> : displayName
      }
      description={translate(
        "crm.deals.drawer.show.description",
        { ns: "starter" },
        "Deal value, linked quotes and logged activity."
      )}
      closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
      closeTo={closeTo}
      nested={nested}
      actions={
        <div className="flex items-center gap-2">
          {idParam === "id" ? (
            <RecordPager
              kind="deal"
              id={id}
              buildPath={(next) => `../show/${next}`}
            />
          ) : null}
          <CrmAIShortcut tasks={aiTasks} />
          <CopyLinkButton />
          {record ? (
            <EditButton
              resource="crm_deals"
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
              {translate("crm.deals.detail.loadError.title", { ns: "starter" }, "Unable to load deal")}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "crm.deals.detail.loadError.description",
                { ns: "starter" },
                "The deal may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-xl border bg-gradient-to-br from-blue-500/10 via-sky-500/5 to-transparent p-5">
                <div className="flex items-center justify-between">
                  <HandCoins className="size-5 text-blue-600" />
                  <EnumBadge value={stage} label={labelFor(DEAL_STAGES, stage, translate)} />
                </div>
                <p className="mt-5 text-sm text-muted-foreground">
                  {translate("crm.deals.fields.amount", { ns: "starter" }, "Amount")}
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">
                  {formatCurrency(record?.amount, locale)}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  {age !== null ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
                        ageTone === "danger"
                          ? "bg-red-500/15 text-red-700 dark:text-red-300"
                          : ageTone === "warning"
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Clock className="size-3" />
                      {translate(
                        "crm.deals.detail.stageAge",
                        { ns: "starter", count: age },
                        `${age} days in stage`
                      )}
                    </span>
                  ) : null}
                  <RelativeTime value={record?.updatedAt} />
                </div>
              </div>
              <div className="rounded-xl border p-5">
                <div className="flex items-center justify-between">
                  <Gauge className="size-5 text-blue-600" />
                  <span className="text-sm font-medium tabular-nums">{Math.round(probability * 100)}%</span>
                </div>
                <p className="mt-5 text-sm text-muted-foreground">
                  {translate("crm.deals.detail.weighted", { ns: "starter" }, "Weighted value")}
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">
                  {formatCurrency(weighted, locale)}
                </p>
                <Progress value={probability * 100} className="mt-4" />
              </div>
            </div>

            <DrawerSection
              title={translate("crm.deals.stage.title", { ns: "starter" }, "Stage progression")}
            >
              <StageProgress
                deal={record}
                onRequest={(to) => {
                  if (record) stageTransition.request(record, to);
                }}
              />
            </DrawerSection>

            <DetailItems
              title={translate("crm.deals.detail.overview", { ns: "starter" }, "Overview")}
              items={[
                [
                  translate("crm.deals.fields.customer", { ns: "starter" }, "Customer"),
                  <span key="customer" className="inline-flex items-center gap-2">
                    <Building2 className="size-4 text-muted-foreground" />
                    <RecordLink
                      label={record?.customer?.company_name}
                      onClick={() =>
                        record?.customer_id &&
                        openRecord.customer(record.customer_id)
                      }
                    />
                  </span>,
                ],
                [
                  translate("crm.deals.fields.contact", { ns: "starter" }, "Contact"),
                  <span key="contact" className="inline-flex items-center gap-2">
                    <User className="size-4 text-muted-foreground" />
                    {record?.contact?.name || "—"}
                  </span>,
                ],
                [
                  translate("crm.deals.fields.expectedClose", { ns: "starter" }, "Expected close"),
                  formatDate(record?.expected_close_date, locale),
                ],
                [
                  translate("crm.deals.fields.closedDate", { ns: "starter" }, "Closed date"),
                  formatDate(record?.closed_date, locale),
                ],
                [
                  translate("crm.deals.fields.notes", { ns: "starter" }, "Notes"),
                  record?.notes || "—",
                ],
              ]}
            />

            {id ? (
              <>
                <Separator />
                <QuotesSection dealId={id} locale={locale} openChild={openChild} />
                <Separator />
                <ActivitiesSection dealId={id} locale={locale} openChild={openChild} />
                <Separator />
                <DealFollowUpsSection dealId={id} locale={locale} />
                <Separator />
                <AuditTrail record={record} locale={locale} />
              </>
            ) : null}
          </div>
        )}
      </div>
    </RouteDrawer>
    {stageTransition.dialog}
    </CrmAIContext>
  );
}

type OpenChild = (to: string) => void;

function SimpleTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 font-medium">{header}</th>
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
    <td colSpan={colSpan} className="px-3 py-6 text-center text-muted-foreground">{text}</td>
  </tr>
);

function QuotesSection({
  dealId,
  locale,
  openChild,
}: {
  dealId: string;
  locale: string;
  openChild: OpenChild;
}) {
  const translate = useTranslate();
  const { result } = useList<QuoteRecord>({
    resource: "crm_quotes",
    pagination: { mode: "server", currentPage: 1, pageSize: 50 },
    sorters: [{ field: "issue_date", order: "desc" }],
    filters: [
      { field: "deal_id", operator: "eq", value: dealId },
      { field: "is_current", operator: "eq", value: true },
    ],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  return (
    <DrawerSection
      title={translate("crm.deals.detail.quotes", { ns: "starter" }, "Quotes")}
      action={
        <Button variant="outline" size="sm" onClick={() => openChild("quotes/create")}>
          <Plus />
          {translate("crm.quotes.actions.add", { ns: "starter" }, "Add quote")}
        </Button>
      }
    >
      <SimpleTable
        headers={[
          translate("crm.quotes.fields.number", { ns: "starter" }, "Quote"),
          translate("crm.quotes.fields.version", { ns: "starter" }, "Version"),
          translate("crm.quotes.fields.status", { ns: "starter" }, "Status"),
          translate("crm.quotes.fields.validUntil", { ns: "starter" }, "Valid until"),
          translate("crm.quotes.fields.total", { ns: "starter" }, "Total"),
          translate("crm.common.actions", { ns: "starter" }, "Actions"),
        ]}
      >
        {result.data.length === 0 ? (
          <EmptyRow colSpan={6} text={translate("crm.deals.quotes.empty", { ns: "starter" }, "No quotes for this deal yet.")} />
        ) : (
          result.data.map((quote) => (
            <tr key={String(quote.id)}>
              <td className="px-3 py-2 font-mono font-medium">
                <RecordLink
                  label={quote.quote_number}
                  onClick={() =>
                    openChild(`quotes/show/${encodeURIComponent(String(quote.id))}`)
                  }
                />
              </td>
              <td className="px-3 py-2 font-medium tabular-nums">
                v{Number(quote.version ?? 1)}
              </td>
              <td className="px-3 py-2">
                <EnumBadge value={quote.status ?? "draft"} label={labelFor(QUOTE_STATUSES, quote.status ?? "draft", translate)} />
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{formatDate(quote.valid_until, locale)}</td>
              <td className="px-3 py-2 tabular-nums">{formatCurrency(quote.total, locale)}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openChild(`quotes/show/${encodeURIComponent(String(quote.id))}`)}
                  >
                    <Eye />
                    <span className="sr-only">{translate("crm.quotes.actions.view", { ns: "starter" }, "View quote")}</span>
                  </Button>
                  {Number(quote.version ?? 1) > 1 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        openChild(`quotes/show/${encodeURIComponent(String(quote.id))}`)
                      }
                    >
                      <History />
                      {translate(
                        "crm.quotes.versions.historyCount",
                        { ns: "starter", count: Number(quote.version ?? 1) },
                        `${Number(quote.version ?? 1)} versions`
                      )}
                    </Button>
                  ) : null}
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
 * Reminders attached to the deal. Closing the loop from the deal itself is what
 * keeps a rep out of the follow-up list — the same "next step" panel a real
 * opportunity record carries.
 */
function DealFollowUpsSection({
  dealId,
  locale,
}: {
  dealId: string;
  locale: string;
}) {
  const translate = useTranslate();
  const openRecord = useOpenRecord();
  const { mutate: updateFollowUp } = useUpdate<FollowUpRecord>();
  const { result } = useList<FollowUpRecord>({
    resource: "crm_follow_ups",
    pagination: { mode: "server", currentPage: 1, pageSize: 50 },
    sorters: [{ field: "due_date", order: "asc" }],
    filters: [{ field: "dealId", operator: "eq", value: dealId }],
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <DrawerSection
      title={translate("crm.deals.detail.followUps", { ns: "starter" }, "Next steps")}
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
              "crm.deals.followUps.empty",
              { ns: "starter" },
              "No next step scheduled for this deal."
            )}
          />
        ) : (
          result.data.map((followUp) => {
            const isDone = followUp.status === "done";
            const isOverdue = !isDone && (followUp.due_date ?? "") < today;
            return (
              <tr key={String(followUp.id)}>
                <td
                  className={cn(
                    "px-3 py-2 whitespace-nowrap",
                    isOverdue && "font-medium text-red-600 dark:text-red-400"
                  )}
                >
                  {isOverdue ? <CalendarClock className="mr-1 inline size-3.5" /> : null}
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
                  {isDone ? null : (
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
  dealId,
  locale,
  openChild,
}: {
  dealId: string;
  locale: string;
  openChild: OpenChild;
}) {
  const translate = useTranslate();
  const openRecord = useOpenRecord();
  const { result } = useList<ActivityRecord>({
    resource: "crm_activities",
    pagination: { mode: "server", currentPage: 1, pageSize: 50 },
    sorters: [{ field: "date", order: "desc" }],
    filters: [{ field: "dealId", operator: "eq", value: dealId }],
    meta: { appends: ["contact"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  return (
    <DrawerSection
      title={translate("crm.deals.detail.activities", { ns: "starter" }, "Activity log")}
      action={
        <Button variant="outline" size="sm" onClick={() => openChild("activities/create")}>
          <Plus />
          {translate("crm.activities.actions.add", { ns: "starter" }, "Log activity")}
        </Button>
      }
    >
      <SimpleTable
        headers={[
          translate("crm.activities.fields.date", { ns: "starter" }, "Date"),
          translate("crm.activities.fields.type", { ns: "starter" }, "Type"),
          translate("crm.activities.fields.subject", { ns: "starter" }, "Subject"),
          translate("crm.common.actions", { ns: "starter" }, "Actions"),
        ]}
      >
        {result.data.length === 0 ? (
          <EmptyRow colSpan={4} text={translate("crm.deals.activities.empty", { ns: "starter" }, "No activity logged against this deal yet.")} />
        ) : (
          result.data.map((activity) => (
            <tr key={String(activity.id)}>
              <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(activity.date, locale)}</td>
              <td className="px-3 py-2">
                <EnumBadge value={activity.type ?? "call"} label={labelFor(ACTIVITY_TYPES, activity.type ?? "call", translate)} />
              </td>
              <td className="px-3 py-2 font-medium">
                <RecordLink
                  label={activity.subject}
                  onClick={() => openRecord.activity(activity.id)}
                />
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openChild(`activities/edit/${encodeURIComponent(String(activity.id))}`)}
                  >
                    <Pencil />
                  </Button>
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
