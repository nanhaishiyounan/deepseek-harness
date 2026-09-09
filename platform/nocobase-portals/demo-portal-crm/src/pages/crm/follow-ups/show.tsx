import { useList, useOne, useTranslate, useUpdate } from "@refinedev/core";
import { CheckCircle2, Pencil } from "lucide-react";
import { useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import { FOLLOW_UP_STATUSES, formatDate, labelFor } from "../constants";
import { RecordLink, useOpenRecord } from "../record-links";
import { crmRoutes } from "../routes";
import { useContextualCloseTo, useOpenContextualChild } from "../route-surfaces";
import { AuditTrail, CopyLinkButton } from "../audit-trail";
import { DRAWER_WIDE, DetailItems, DrawerSection, EnumBadge, useLocale } from "../shared";
import type { FollowUpRecord } from "../types";

export function FollowUpShow({ idParam = "id" }: { idParam?: string }) {
  const params = useParams<Record<string, string>>();
  const id = params[idParam];
  const translate = useTranslate();
  const locale = useLocale();
  const closeTo = useContextualCloseTo();
  const openChild = useOpenContextualChild();
  const openRecord = useOpenRecord();
  const { mutate: updateFollowUp } = useUpdate<FollowUpRecord>();

  const { result: followUp, query } = useOne<FollowUpRecord>({
    resource: "crm_follow_ups",
    id,
    meta: { appends: ["customer", "owner", "deal", "createdBy", "updatedBy"] },
    queryOptions: { enabled: Boolean(id), retry: false },
  });

  const related = useList<FollowUpRecord>({
    resource: "crm_follow_ups",
    filters: followUp?.customer_id
      ? [{ field: "customer_id", operator: "eq", value: followUp.customer_id }]
      : [],
    pagination: { mode: "server", currentPage: 1, pageSize: 10 },
    sorters: [{ field: "due_date", order: "asc" }],
    errorNotification: false,
    queryOptions: { enabled: Boolean(followUp?.customer_id), retry: false },
  });
  const siblings = related.result.data.filter(
    (record) => String(record.id) !== String(id)
  );
  const today = new Date().toISOString().slice(0, 10);
  const overdue =
    followUp?.status !== "done" && (followUp?.due_date ?? "") < today;

  return (
    <RouteDrawer
      className={DRAWER_WIDE}
      title={
        followUp?.subject ??
        translate("crm.followUps.detail.title", { ns: "starter" }, "Follow-up details")
      }
      description={translate(
        "crm.followUps.detail.description",
        { ns: "starter" },
        "The reminder, who owns it and the account it belongs to."
      )}
      closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
      closeTo={closeTo}
      actions={
        followUp ? (
          <div className="flex items-center gap-2">
            <CopyLinkButton />
            {followUp.status !== "done" ? (
              <Button
                onClick={() =>
                  updateFollowUp({
                    resource: "crm_follow_ups",
                    id: followUp.id,
                    values: { status: "done" },
                  })
                }
              >
                <CheckCircle2 />
                {translate("crm.followUps.actions.markDone", { ns: "starter" }, "Mark done")}
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() =>
                openChild(`${crmRoutes.followUps}/edit/${followUp.id}`)
              }
            >
              <Pencil />
              {translate("crm.common.edit", { ns: "starter" }, "Edit")}
            </Button>
          </div>
        ) : null
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {query.isLoading ? (
          <LoadingState className="min-h-64" />
        ) : followUp ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent p-5">
              <div>
                <p className="text-sm text-muted-foreground">
                  {translate("crm.followUps.fields.dueDate", { ns: "starter" }, "Due date")}
                </p>
                <p
                  className={
                    overdue
                      ? "mt-1 text-2xl font-semibold text-red-600 dark:text-red-400"
                      : "mt-1 text-2xl font-semibold"
                  }
                >
                  {formatDate(followUp.due_date, locale)}
                </p>
                {overdue ? (
                  <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                    {translate("crm.followUps.overdue", { ns: "starter" }, "Overdue")}
                  </p>
                ) : null}
              </div>
              <EnumBadge
                value={followUp.status}
                label={labelFor(FOLLOW_UP_STATUSES, followUp.status, translate)}
              />
            </div>

            <DetailItems
              title={translate("crm.followUps.detail.summary", { ns: "starter" }, "Follow-up summary")}
              items={[
                [
                  translate("crm.followUps.fields.customer", { ns: "starter" }, "Customer"),
                  <RecordLink
                    key="customer"
                    label={followUp.customer?.company_name}
                    onClick={() =>
                      followUp.customer_id && openRecord.customer(followUp.customer_id)
                    }
                  />,
                ],
                [
                  translate("crm.followUps.fields.owner", { ns: "starter" }, "Owner"),
                  followUp.owner?.nickname || "—",
                ],
                [
                  translate("crm.followUps.fields.deal", { ns: "starter" }, "Deal"),
                  <RecordLink
                    key="deal"
                    label={followUp.deal?.title}
                    onClick={() => followUp.dealId && openRecord.deal(followUp.dealId)}
                  />,
                ],
                [
                  translate("crm.followUps.fields.status", { ns: "starter" }, "Status"),
                  labelFor(FOLLOW_UP_STATUSES, followUp.status, translate),
                ],
              ]}
            />

            {followUp.notes ? (
              <>
                <Separator />
                <DrawerSection
                  title={translate("crm.followUps.fields.notes", { ns: "starter" }, "Notes")}
                >
                  <p className="text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
                    {followUp.notes}
                  </p>
                </DrawerSection>
              </>
            ) : null}

            <Separator />
            <DrawerSection
              title={translate(
                "crm.followUps.detail.related",
                { ns: "starter" },
                "Other follow-ups for this customer"
              )}
            >
              {siblings.length ? (
                <ul className="space-y-2">
                  {siblings.map((record) => (
                    <li
                      key={String(record.id)}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <RecordLink
                          label={record.subject}
                          onClick={() => openRecord.followUp(record.id)}
                        />
                        <p className="text-xs text-muted-foreground">
                          {formatDate(record.due_date, locale)}
                        </p>
                      </div>
                      <EnumBadge
                        value={record.status}
                        label={labelFor(FOLLOW_UP_STATUSES, record.status, translate)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {translate(
                    "crm.followUps.detail.relatedEmpty",
                    { ns: "starter" },
                    "No other follow-ups are open for this customer."
                  )}
                </p>
              )}
            </DrawerSection>

            <AuditTrail record={followUp} locale={locale} />
          </div>
        ) : null}
      </div>
    </RouteDrawer>
  );
}
