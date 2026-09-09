import { useNotification, useShow, useTranslate, useUpdate } from "@refinedev/core";
import { Pencil, Printer, Undo2 } from "lucide-react";
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
  assigneeName,
  categoryBadgeClass,
  formatDate,
  labelFor,
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
import type { AssetRecord, AssignmentRecord } from "../types";
import { runAssignmentAssetTransition } from "./transitions";

// Detail drawer for a single assignment. `idParam` lets it read the record id
// from a differently-named route param when it is opened as a nested surface
// from the asset detail drawer (`.../assignments/show/:asgId`).
export function AssignmentShow({
  idParam = "id",
}: { idParam?: string } = {}) {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const closeTo = useContextualCloseTo();
  const params = useParams<Record<string, string>>();
  const id = params[idParam];
  const nested = useOutlet();
  const notify = useNotification();
  const { mutateAsync: updateAssignment, mutation: assignmentMutation } =
    useUpdate<AssignmentRecord>();
  const { mutateAsync: updateAsset } = useUpdate<AssetRecord>();
  const { result: record, query } = useShow<AssignmentRecord>({
    resource: "hub_as_assignments",
    id,
    meta: { appends: ["asset", "assignee"] },
  });

  const active = record ? !record.returned_date : false;
  const unavailable = translate(
    "assets.common.notAvailable",
    { ns: "starter" },
    "—"
  );
  const heldFor = useMemo(() => {
    if (!record?.assigned_date) return unavailable;
    const start = new Date(record.assigned_date).getTime();
    const end = new Date(record.returned_date ?? todayIso()).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) return unavailable;
    const days = Math.max(
      0,
      Math.floor((end - start) / (1000 * 60 * 60 * 24))
    );
    return translate(
      "assets.assignments.daysValue",
      { ns: "starter" },
      "{{count}} days"
    ).replace("{{count}}", String(days));
  }, [record?.assigned_date, record?.returned_date, translate, unavailable]);

  const returnAssignment = async () => {
    if (!record) return;
    const assetId = record.asset?.id ?? record.asset_id;
    try {
      await runAssignmentAssetTransition({
        updateAssignment: () =>
          updateAssignment({
            resource: "hub_as_assignments",
            id: record.id,
            values: { returned_date: todayIso() },
            successNotification: false,
          }),
        updateAsset: () =>
          assetId == null
            ? Promise.resolve()
            : updateAsset({
                resource: "hub_as_assets",
                id: assetId,
                values: { status: "in_stock" },
                successNotification: false,
              }),
        rollbackAssignment: () =>
          updateAssignment({
            resource: "hub_as_assignments",
            id: record.id,
            values: { returned_date: record.returned_date ?? null },
            successNotification: false,
          }),
      });
    } catch {
      notify.open?.({
        type: "error",
        message: translate(
          "assets.assignments.returnFailed",
          { ns: "starter" },
          "The return failed and the assignment was restored. Try again."
        ),
      });
    }
  };

  const displayName =
    record?.asset?.name ||
    record?.asset?.tag ||
    translate("assets.assignments.show.unnamed", { ns: "starter" }, "Assignment");

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
        "assets.assignments.show.description",
        { ns: "starter" },
        "Details for this device assignment."
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
                "assets.assignments.show.print.action",
                { ns: "starter" },
                "Print handover receipt"
              )}
              onClick={() =>
                printHandoverReceipt({ record, heldFor, locale, translate })
              }
            >
              <Printer />
            </Button>
            <EditButton
              resource="hub_as_assignments"
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
                "assets.assignments.show.error.title",
                { ns: "starter" },
                "Unable to load assignment"
              )}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "assets.assignments.show.error.description",
                { ns: "starter" },
                "The assignment may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : record ? (
          <div className="space-y-5">
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

            <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/30 px-3 py-2">
              <span className="text-xs text-muted-foreground">
                {translate(
                  "assets.assignments.columns.status",
                  { ns: "starter" },
                  "Status"
                )}
              </span>
              {active ? (
                <Pill
                  label={translate(
                    "assets.assignments.active",
                    { ns: "starter" },
                    "Active"
                  )}
                  className="bg-blue-500/15 text-blue-700 dark:text-blue-300"
                />
              ) : (
                <span className="text-sm font-medium">
                  {translate(
                    "assets.assignments.show.returnedOn",
                    { ns: "starter" },
                    "Returned {{date}}"
                  ).replace(
                    "{{date}}",
                    formatDate(record.returned_date, locale)
                  )}
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {translate(
                  "assets.assignments.columns.heldFor",
                  { ns: "starter" },
                  "Held for"
                )}
                <span className="ml-1 font-medium text-foreground">{heldFor}</span>
              </span>
              {active ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={assignmentMutation.isPending}
                  onClick={returnAssignment}
                >
                  <Undo2 />
                  {translate(
                    "assets.assignments.show.recordReturn",
                    { ns: "starter" },
                    "Record return"
                  )}
                </Button>
              ) : null}
            </div>

            <DetailItems
              title={translate(
                "assets.assignments.show.overview",
                { ns: "starter" },
                "Overview"
              )}
              items={[
              [
                translate("assets.assignments.fields.asset", { ns: "starter" }, "Asset"),
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
                translate("assets.assignments.fields.assignee", { ns: "starter" }, "Assignee"),
                assigneeName(record?.assignee),
              ],
              [
                translate("assets.assignments.fields.assignedDate", { ns: "starter" }, "Assigned date"),
                formatDate(record?.assigned_date, locale),
              ],
              [
                translate("assets.assignments.columns.status", { ns: "starter" }, "Status"),
                active ? (
                  <Pill
                    key="status"
                    label={translate("assets.assignments.active", { ns: "starter" }, "Active")}
                    className="bg-blue-500/15 text-blue-700 dark:text-blue-300"
                  />
                ) : (
                  <span key="status">
                    {translate(
                      "assets.assignments.show.returnedOn",
                      { ns: "starter" },
                      "Returned {{date}}"
                    ).replace(
                      "{{date}}",
                      formatDate(record.returned_date, locale)
                    )}
                  </span>
                ),
              ],
              [
                translate("assets.assignments.fields.note", { ns: "starter" }, "Note"),
                record.note || unavailable,
              ],
            ]}
            />
          </div>
        ) : null}
      </div>
    </RouteDrawer>
  );
}

function printHandoverReceipt({
  record,
  heldFor,
  locale,
  translate,
}: {
  record: AssignmentRecord;
  heldFor: string;
  locale: string;
  translate: ReturnType<typeof useTranslate>;
}) {
  const unavailable = translate(
    "assets.common.notAvailable",
    { ns: "starter" },
    "—"
  );
  const title = translate(
    "assets.assignments.show.print.title",
    { ns: "starter" },
    "Device handover receipt"
  );
  const active = !record.returned_date;
  const status = active
    ? translate("assets.assignments.active", { ns: "starter" }, "Active")
    : translate(
        "assets.assignments.returnedPrefix",
        { ns: "starter" },
        "Returned"
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
      <span class="badge">${escapeHtml(status)}</span>
    </div>
    <div class="grid">
      ${field(
        translate("assets.assignments.fields.asset", { ns: "starter" }, "Asset"),
        record.asset?.name || unavailable
      )}
      ${field(
        translate("assets.assignments.show.print.assetTag", { ns: "starter" }, "Asset tag"),
        record.asset?.tag || unavailable
      )}
      ${field(
        translate("assets.assets.fields.category", { ns: "starter" }, "Category"),
        labelFor(ASSET_CATEGORIES, record.asset?.category, translate)
      )}
      ${field(
        translate("assets.assignments.fields.assignee", { ns: "starter" }, "Assignee"),
        assigneeName(record.assignee)
      )}
      ${field(
        translate("assets.assignments.fields.assignedDate", { ns: "starter" }, "Assigned date"),
        formatDate(record.assigned_date, locale)
      )}
      ${field(
        translate("assets.assignments.fields.returnedDate", { ns: "starter" }, "Returned date"),
        formatDate(record.returned_date, locale)
      )}
      ${field(
        translate("assets.assignments.columns.heldFor", { ns: "starter" }, "Held for"),
        heldFor
      )}
    </div>
    <h2>${escapeHtml(
      translate("assets.assignments.fields.note", { ns: "starter" }, "Note")
    )}</h2>
    <p>${escapeHtml(record.note || unavailable)}</p>
    <h2>${escapeHtml(
      translate("assets.assignments.show.print.signatures", { ns: "starter" }, "Signatures")
    )}</h2>
    <div class="grid">
      ${field(
        translate("assets.assignments.show.print.issuedBy", { ns: "starter" }, "Issued by"),
        "____________________________"
      )}
      ${field(
        translate("assets.assignments.show.print.receivedBy", { ns: "starter" }, "Received by"),
        "____________________________"
      )}
    </div>
    <footer>${escapeHtml(printedOn)}</footer>
  `;

  openPrintWindow(escapeHtml(title), body);
}
