import { useList, useOne, useTranslate } from "@refinedev/core";
import { Pencil } from "lucide-react";
import { useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import { ACTIVITY_TYPES, formatDateTime, labelFor } from "../constants";
import { RecordLink, useOpenRecord } from "../record-links";
import { crmRoutes } from "../routes";
import { useContextualCloseTo, useOpenContextualChild } from "../route-surfaces";
import { AuditTrail, CopyLinkButton } from "../audit-trail";
import { DRAWER_WIDE, DetailItems, DrawerSection, EnumBadge, useLocale } from "../shared";
import type { ActivityRecord } from "../types";

export function ActivityShow({ idParam = "id" }: { idParam?: string }) {
  const params = useParams<Record<string, string>>();
  const id = params[idParam];
  const translate = useTranslate();
  const locale = useLocale();
  const closeTo = useContextualCloseTo();
  const openChild = useOpenContextualChild();
  const openRecord = useOpenRecord();

  const { result: activity, query } = useOne<ActivityRecord>({
    resource: "crm_activities",
    id,
    meta: { appends: ["customer", "contact", "deal", "createdBy", "updatedBy"] },
    queryOptions: { enabled: Boolean(id), retry: false },
  });

  const related = useList<ActivityRecord>({
    resource: "crm_activities",
    filters: activity?.customer_id
      ? [{ field: "customer_id", operator: "eq", value: activity.customer_id }]
      : [],
    pagination: { mode: "server", currentPage: 1, pageSize: 10 },
    sorters: [{ field: "date", order: "desc" }],
    errorNotification: false,
    queryOptions: { enabled: Boolean(activity?.customer_id), retry: false },
  });
  const timeline = related.result.data.filter(
    (record) => String(record.id) !== String(id)
  );

  return (
    <RouteDrawer
      className={DRAWER_WIDE}
      title={
        activity?.subject ??
        translate("crm.activities.detail.title", { ns: "starter" }, "Activity details")
      }
      description={translate(
        "crm.activities.detail.description",
        { ns: "starter" },
        "What happened, who was involved and what comes next."
      )}
      closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
      closeTo={closeTo}
      actions={
        <div className="flex items-center gap-2">
          <CopyLinkButton />
          {activity ? (
            <Button variant="outline" onClick={() => openChild(`${crmRoutes.activities}/edit/${activity.id}`)}>
              <Pencil />
              {translate("crm.common.edit", { ns: "starter" }, "Edit")}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {query.isLoading ? (
          <LoadingState className="min-h-64" />
        ) : activity ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-gradient-to-br from-blue-500/10 via-sky-500/5 to-transparent p-5">
              <div>
                <p className="text-sm text-muted-foreground">
                  {translate("crm.activities.fields.date", { ns: "starter" }, "Date & time")}
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {formatDateTime(activity.date, locale)}
                </p>
              </div>
              <EnumBadge
                value={activity.type}
                label={labelFor(ACTIVITY_TYPES, activity.type, translate)}
              />
            </div>

            <DetailItems
              title={translate("crm.activities.detail.summary", { ns: "starter" }, "Activity summary")}
              items={[
                [
                  translate("crm.activities.fields.customer", { ns: "starter" }, "Customer"),
                  <RecordLink
                    key="customer"
                    label={activity.customer?.company_name}
                    onClick={() =>
                      activity.customer_id && openRecord.customer(activity.customer_id)
                    }
                  />,
                ],
                [
                  translate("crm.activities.fields.contact", { ns: "starter" }, "Contact"),
                  activity.contact?.name || "—",
                ],
                [
                  translate("crm.activities.fields.deal", { ns: "starter" }, "Deal"),
                  <RecordLink
                    key="deal"
                    label={activity.deal?.title}
                    onClick={() => activity.dealId && openRecord.deal(activity.dealId)}
                  />,
                ],
                [
                  translate("crm.activities.fields.type", { ns: "starter" }, "Type"),
                  labelFor(ACTIVITY_TYPES, activity.type, translate),
                ],
              ]}
            />

            {activity.notes ? (
              <>
                <Separator />
                <DrawerSection
                  title={translate("crm.activities.fields.notes", { ns: "starter" }, "Notes")}
                >
                  <p className="text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
                    {activity.notes}
                  </p>
                </DrawerSection>
              </>
            ) : null}

            <Separator />
            <DrawerSection
              title={translate(
                "crm.activities.detail.timeline",
                { ns: "starter" },
                "Other activities for this customer"
              )}
            >
              {timeline.length ? (
                <ul className="space-y-2">
                  {timeline.map((record) => (
                    <li
                      key={String(record.id)}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <RecordLink
                          label={record.subject}
                          onClick={() => openRecord.activity(record.id)}
                        />
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(record.date, locale)}
                        </p>
                      </div>
                      <EnumBadge
                        value={record.type}
                        label={labelFor(ACTIVITY_TYPES, record.type, translate)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {translate(
                    "crm.activities.detail.timelineEmpty",
                    { ns: "starter" },
                    "No other activities logged for this customer yet."
                  )}
                </p>
              )}
            </DrawerSection>

            <AuditTrail record={activity} locale={locale} />
          </div>
        ) : null}
      </div>
    </RouteDrawer>
  );
}
