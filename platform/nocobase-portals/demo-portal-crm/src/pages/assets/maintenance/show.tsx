import { useShow, useTranslate, useUpdate } from "@refinedev/core";
import { ArrowRightLeft, CalendarClock, Pencil, Printer } from "lucide-react";
import { useMemo } from "react";
import { Link, useOutlet, useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { EditButton } from "@/components/resources/buttons/edit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import {
  ASSET_CATEGORIES,
  ASSET_STATUSES,
  MAINTENANCE_STATUSES,
  MAINTENANCE_TRANSITIONS,
  MAINTENANCE_TYPES,
  categoryBadgeClass,
  daysUntil,
  formatCurrency,
  formatDate,
  labelFor,
  maintenanceStatusBadgeClass,
  maintenanceTypeBadgeClass,
  statusBadgeClass,
  todayIso,
} from "../constants";
import { escapeHtml, openPrintWindow } from "@/lib/table-kit";
import {
  useContextualCloseTo,
  useOpenContextualChild,
} from "../route-surfaces";
import { getAssetShowPath } from "../routes";
import { DetailItems, Pill, useLocale } from "../shared";
import type { MaintenanceRecord } from "../types";

// Detail drawer for a single maintenance record. `idParam` lets it read the
// record id from a differently-named route param when it is opened as a nested
// surface from the asset detail drawer (`.../maintenance/show/:mId`).
export function MaintenanceShow({
  idParam = "id",
}: { idParam?: string } = {}) {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const closeTo = useContextualCloseTo();
  const params = useParams<Record<string, string>>();
  const id = params[idParam];
  const nested = useOutlet();
  const { mutate: updateMaintenance, mutation } = useUpdate<MaintenanceRecord>();
  const { result: record, query } = useShow<MaintenanceRecord>({
    resource: "hub_as_maintenance",
    id,
    meta: { appends: ["asset"] },
  });

  const displayName =
    record?.title ||
    translate("assets.maintenance.show.unnamed", { ns: "starter" }, "Maintenance");
  const unavailable = translate(
    "assets.common.notAvailable",
    { ns: "starter" },
    "—"
  );
  const scheduledDays = useMemo(
    () => daysUntil(record?.scheduled_date),
    [record?.scheduled_date]
  );
  const currentStatus = record?.status ?? "Scheduled";
  const transitionTargets = useMemo(
    () => MAINTENANCE_TRANSITIONS[currentStatus] ?? [],
    [currentStatus]
  );

  const transitionTo = (target: string) => {
    if (!record) return;
    updateMaintenance({
      resource: "hub_as_maintenance",
      id: record.id,
      values: {
        status: target,
        ...(target === "Done"
          ? { completed_date: todayIso() }
          : currentStatus === "Done"
            ? { completed_date: null }
            : {}),
      },
    });
  };

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
        "assets.maintenance.show.description",
        { ns: "starter" },
        "Details for this maintenance record."
      )}
      closeLabel={translate("assets.common.close", { ns: "starter" }, "Close")}
      closeTo={closeTo}
      nested={nested}
      actions={
        record ? (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              title={translate(
                "assets.maintenance.show.print.action",
                { ns: "starter" },
                "Print work order"
              )}
              onClick={() =>
                printWorkOrder({ record, locale, translate })
              }
            >
              <Printer />
            </Button>
            <EditButton
              resource="hub_as_maintenance"
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
                "assets.maintenance.show.error.title",
                { ns: "starter" },
                "Unable to load maintenance record"
              )}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "assets.maintenance.show.error.description",
                { ns: "starter" },
                "The record may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : record ? (
          <div className="space-y-5">
            {record.status !== "Done" &&
              scheduledDays !== null &&
              scheduledDays <= 7 && (
                <Alert variant={scheduledDays < 0 ? "destructive" : "default"}>
                  <CalendarClock className="size-4" />
                  <AlertTitle>
                    {scheduledDays < 0
                      ? translate(
                          "assets.maintenance.show.alert.overdueTitle",
                          { ns: "starter" },
                          "Work overdue"
                        )
                      : translate(
                          "assets.maintenance.show.alert.dueTitle",
                          { ns: "starter" },
                          "Work due soon"
                        )}
                  </AlertTitle>
                  <AlertDescription>
                    {(scheduledDays < 0
                      ? translate(
                          "assets.maintenance.show.alert.overdueDescription",
                          { ns: "starter" },
                          "Overdue by {{count}} days · Scheduled {{date}}"
                        )
                      : translate(
                          "assets.maintenance.show.alert.dueDescription",
                          { ns: "starter" },
                          "Due in {{count}} days · Scheduled {{date}}"
                        ))
                      .replace("{{count}}", String(Math.abs(scheduledDays)))
                      .replace(
                        "{{date}}",
                        formatDate(record.scheduled_date, locale)
                      )}
                  </AlertDescription>
                </Alert>
              )}

            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2">
              <span className="text-xs text-muted-foreground">
                {translate(
                  "assets.maintenance.show.lifecycle.label",
                  { ns: "starter" },
                  "Work-order status"
                )}
              </span>
              <Pill
                label={labelFor(MAINTENANCE_STATUSES, currentStatus, translate)}
                className={maintenanceStatusBadgeClass(currentStatus)}
              />
              <ArrowRightLeft className="size-3.5 text-muted-foreground" />
              {transitionTargets.map((target) => (
                <Button
                  key={target}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  disabled={mutation.isPending}
                  onClick={() => transitionTo(target)}
                >
                  {translate(
                    "assets.maintenance.show.lifecycle.moveTo",
                    { ns: "starter" },
                    "Move to {{status}}"
                  ).replace(
                    "{{status}}",
                    labelFor(MAINTENANCE_STATUSES, target, translate)
                  )}
                </Button>
              ))}
            </div>

            {record.asset ? (
              <Link
                to={getAssetShowPath(record.asset.id)}
                className="flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {record.asset.name || unavailable}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {record.asset.tag || unavailable}
                  </p>
                </div>
                <Pill
                  label={labelFor(ASSET_STATUSES, record.asset.status, translate)}
                  className={statusBadgeClass(record.asset.status)}
                />
                <Pill
                  label={labelFor(ASSET_CATEGORIES, record.asset.category, translate)}
                  className={categoryBadgeClass(record.asset.category)}
                />
              </Link>
            ) : null}

            <DetailItems
              title={translate(
                "assets.maintenance.show.overview",
                { ns: "starter" },
                "Overview"
              )}
              items={[
              [
                translate("assets.maintenance.fields.asset", { ns: "starter" }, "Asset"),
                record?.asset ? (
                  <span key="asset" className="flex flex-col">
                    <span className="font-medium">{record.asset.name || unavailable}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {record.asset.tag || unavailable}
                    </span>
                  </span>
                ) : (
                  unavailable
                ),
              ],
              [
                translate(
                  "assets.maintenance.show.assetTag",
                  { ns: "starter" },
                  "Asset tag"
                ),
                <span key="asset-tag" className="font-mono text-xs">
                  {record.asset?.tag || unavailable}
                </span>,
              ],
              [
                translate("assets.maintenance.fields.type", { ns: "starter" }, "Type"),
                record?.type ? (
                  <Pill
                    key="type"
                    label={labelFor(MAINTENANCE_TYPES, record.type, translate)}
                    className={maintenanceTypeBadgeClass(record.type)}
                  />
                ) : (
                  unavailable
                ),
              ],
              [
                translate("assets.maintenance.fields.status", { ns: "starter" }, "Status"),
                record?.status ? (
                  <Pill
                    key="status"
                    label={labelFor(MAINTENANCE_STATUSES, record.status, translate)}
                    className={maintenanceStatusBadgeClass(record.status)}
                  />
                ) : (
                  unavailable
                ),
              ],
              [
                translate("assets.maintenance.fields.scheduledDate", { ns: "starter" }, "Scheduled date"),
                formatDate(record?.scheduled_date, locale),
              ],
              [
                translate("assets.maintenance.fields.completedDate", { ns: "starter" }, "Completed date"),
                formatDate(record?.completed_date, locale),
              ],
              [
                translate("assets.maintenance.fields.cost", { ns: "starter" }, "Cost"),
                record.cost != null ? formatCurrency(record.cost, locale) : unavailable,
              ],
              [
                translate("assets.maintenance.fields.vendor", { ns: "starter" }, "Vendor"),
                record.vendor || unavailable,
              ],
              [
                translate("assets.maintenance.fields.notes", { ns: "starter" }, "Notes"),
                record.notes || unavailable,
              ],
            ]}
            />
          </div>
        ) : null}
      </div>
    </RouteDrawer>
  );
}

function printWorkOrder({
  record,
  locale,
  translate,
}: {
  record: MaintenanceRecord;
  locale: string;
  translate: ReturnType<typeof useTranslate>;
}) {
  const unavailable = translate(
    "assets.common.notAvailable",
    { ns: "starter" },
    "—"
  );
  const title = record.title || translate(
    "assets.maintenance.show.unnamed",
    { ns: "starter" },
    "Maintenance"
  );
  const field = (label: string, value: string) =>
    `<div><span class="label">${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
  const printedOn = translate(
    "assets.common.printedOn",
    { ns: "starter" },
    "Printed {{date}}"
  ).replace("{{date}}", formatDate(new Date().toISOString(), locale));

  const body = `
    <div class="doc-head">
      <h1>${escapeHtml(title)}</h1>
      <span class="badge">${escapeHtml(
        labelFor(MAINTENANCE_STATUSES, record.status, translate)
      )}</span>
    </div>
    <div class="grid">
      ${field(
        translate("assets.maintenance.fields.asset", { ns: "starter" }, "Asset"),
        record.asset?.name || unavailable
      )}
      ${field(
        translate("assets.maintenance.show.assetTag", { ns: "starter" }, "Asset tag"),
        record.asset?.tag || unavailable
      )}
      ${field(
        translate("assets.maintenance.fields.type", { ns: "starter" }, "Type"),
        labelFor(MAINTENANCE_TYPES, record.type, translate)
      )}
      ${field(
        translate("assets.maintenance.fields.vendor", { ns: "starter" }, "Vendor"),
        record.vendor || unavailable
      )}
      ${field(
        translate("assets.maintenance.show.print.scheduled", { ns: "starter" }, "Scheduled"),
        formatDate(record.scheduled_date, locale)
      )}
      ${field(
        translate("assets.maintenance.show.print.completed", { ns: "starter" }, "Completed"),
        formatDate(record.completed_date, locale)
      )}
      ${field(
        translate("assets.maintenance.fields.cost", { ns: "starter" }, "Cost"),
        record.cost != null ? formatCurrency(record.cost, locale) : unavailable
      )}
    </div>
    <h2>${escapeHtml(
      translate("assets.maintenance.fields.notes", { ns: "starter" }, "Notes")
    )}</h2>
    <p>${escapeHtml(record.notes || unavailable)}</p>
    <footer>${escapeHtml(printedOn)}</footer>
  `;

  openPrintWindow(escapeHtml(title), body);
}
