import { useList, useNotification, useShow, useTranslate, useUpdate } from "@refinedev/core";
import {
  ArrowRightLeft,
  CalendarClock,
  Eye,
  Link2,
  Pencil,
  Plus,
  Printer,
  Undo2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useOutlet, useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { EditButton } from "@/components/resources/buttons/edit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import { cn } from "@/lib/utils";
import {
  ASSET_CATEGORIES,
  ASSET_STATUSES,
  ASSET_TRANSITIONS,
  MAINTENANCE_STATUSES,
  MAINTENANCE_TYPES,
  assigneeName,
  categoryBadgeClass,
  daysUntil,
  depreciationFor,
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
import {
  DetailItems,
  DrawerSection,
  EmptyRow,
  Pill,
  SimpleTable,
  useLocale,
} from "../shared";
import type {
  AssetRecord,
  AssignmentRecord,
  MaintenanceRecord,
} from "../types";
import { runAssignmentAssetTransition } from "../assignments/transitions";

type DetailTab = "overview" | "assignments" | "maintenance" | "timeline";

export function AssetShow() {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const closeTo = useContextualCloseTo();
  const { id } = useParams<{ id: string }>();
  const nested = useOutlet();
  const [tab, setTab] = useState<DetailTab>("overview");
  const { result: record, query } = useShow<AssetRecord>({
    resource: "hub_as_assets",
    id,
  });

  const { result: assignments } = useList<AssignmentRecord>({
    resource: "hub_as_assignments",
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    sorters: [{ field: "assigned_date", order: "desc" }],
    filters: id ? [{ field: "asset_id", operator: "eq", value: id }] : [],
    meta: { appends: ["assignee"] },
    errorNotification: false,
    queryOptions: { enabled: Boolean(id), retry: false },
  });

  const { result: maintenance } = useList<MaintenanceRecord>({
    resource: "hub_as_maintenance",
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    sorters: [{ field: "scheduled_date", order: "desc" }],
    filters: id ? [{ field: "assetId", operator: "eq", value: id }] : [],
    errorNotification: false,
    queryOptions: { enabled: Boolean(id), retry: false },
  });

  const displayName =
    record?.name ||
    record?.tag ||
    translate("assets.assets.detail.unnamed", { ns: "starter" }, "Asset");

  const depreciation = record ? depreciationFor(record) : null;
  const activeAssignment = assignments.data.find((row) => !row.returned_date);

  // Nearest scheduled service that is still open — the pre-emptive warning an
  // ITAM console shows at the top of the record.
  const nextService = useMemo(() => {
    const open = maintenance.data
      .filter((row) => row.status !== "Done" && row.scheduled_date)
      .sort((a, b) =>
        String(a.scheduled_date).localeCompare(String(b.scheduled_date))
      );
    return open[0];
  }, [maintenance.data]);
  const nextServiceDays = daysUntil(nextService?.scheduled_date);

  const tabs: Array<{ value: DetailTab; label: string; count?: number }> = [
    {
      value: "overview",
      label: translate("assets.assets.tabs.overview", { ns: "starter" }, "Overview"),
    },
    {
      value: "assignments",
      label: translate("assets.assets.tabs.assignments", { ns: "starter" }, "Assignments"),
      count: assignments.data.length,
    },
    {
      value: "maintenance",
      label: translate("assets.assets.tabs.maintenance", { ns: "starter" }, "Maintenance"),
      count: maintenance.data.length,
    },
    {
      value: "timeline",
      label: translate("assets.assets.tabs.timeline", { ns: "starter" }, "Timeline"),
    },
  ];

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
        "assets.assets.drawer.show.description",
        { ns: "starter" },
        "Profile and full assignment history for this device."
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
              title={translate("assets.common.copyLink", { ns: "starter" }, "Copy link")}
              onClick={() => void navigator.clipboard?.writeText(window.location.href)}
            >
              <Link2 />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              title={translate("assets.assets.print.action", { ns: "starter" }, "Print record")}
              onClick={() =>
                printAssetRecord({
                  asset: record,
                  assignments: assignments.data,
                  maintenance: maintenance.data,
                  locale,
                })
              }
            >
              <Printer />
            </Button>
            <EditButton
              resource="hub_as_assets"
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
                "assets.assets.detail.loadError.title",
                { ns: "starter" },
                "Unable to load asset"
              )}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "assets.assets.detail.loadError.description",
                { ns: "starter" },
                "The asset may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-5">
            {nextService && nextServiceDays !== null && nextServiceDays <= 30 && (
              <Alert variant={nextServiceDays < 0 ? "destructive" : "default"}>
                <CalendarClock className="size-4" />
                <AlertTitle>
                  {nextServiceDays < 0
                    ? translate(
                        "assets.assets.serviceAlert.overdue",
                        { ns: "starter" },
                        "Maintenance overdue"
                      )
                    : translate(
                        "assets.assets.serviceAlert.due",
                        { ns: "starter" },
                        "Maintenance due soon"
                      )}
                </AlertTitle>
                <AlertDescription>
                  {`${nextService.title ?? ""} — ${formatDate(
                    nextService.scheduled_date,
                    locale
                  )}`}
                </AlertDescription>
              </Alert>
            )}

            {record && (
              <LifecycleActions
                asset={record}
                hasActiveAssignment={Boolean(activeAssignment)}
              />
            )}

            <Tabs value={tab} onValueChange={(value) => setTab(value as DetailTab)}>
              <TabsList>
                {tabs.map((item) => (
                  <TabsTrigger key={item.value} value={item.value}>
                    {item.label}
                    {typeof item.count === "number" && (
                      <span className="ml-1 rounded bg-muted px-1 text-[11px] tabular-nums text-muted-foreground">
                        {item.count}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {tab === "overview" && (
              <div className="space-y-6">
                <DetailItems
                  title={translate("assets.assets.detail.profile", { ns: "starter" }, "Profile")}
                  items={[
                    [
                      translate("assets.assets.fields.tag", { ns: "starter" }, "Tag"),
                      <span key="tag" className="font-mono text-xs">
                        {record?.tag || "—"}
                      </span>,
                    ],
                    [
                      translate("assets.assets.fields.category", { ns: "starter" }, "Category"),
                      record?.category ? (
                        <Pill
                          key="cat"
                          label={labelFor(ASSET_CATEGORIES, record.category, translate)}
                          className={categoryBadgeClass(record.category)}
                        />
                      ) : (
                        "—"
                      ),
                    ],
                    [
                      translate("assets.assets.fields.status", { ns: "starter" }, "Status"),
                      <Pill
                        key="status"
                        label={labelFor(ASSET_STATUSES, record?.status ?? "in_stock", translate)}
                        className={statusBadgeClass(record?.status ?? "in_stock")}
                      />,
                    ],
                    [
                      translate("assets.assets.detail.heldBy", { ns: "starter" }, "Held by"),
                      activeAssignment ? assigneeName(activeAssignment.assignee) : "—",
                    ],
                    [
                      translate("assets.assets.fields.value", { ns: "starter" }, "Value"),
                      formatCurrency(record?.value, locale),
                    ],
                    [
                      translate("assets.assets.fields.purchaseDate", { ns: "starter" }, "Purchase date"),
                      formatDate(record?.purchase_date, locale),
                    ],
                  ]}
                />

                {depreciation && (
                  <DrawerSection
                    title={translate(
                      "assets.assets.depreciation.title",
                      { ns: "starter" },
                      "Depreciation"
                    )}
                  >
                    <div className="space-y-3 rounded-lg border p-4">
                      <div className="flex items-end justify-between gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {translate(
                              "assets.assets.depreciation.netBookValue",
                              { ns: "starter" },
                              "Net book value"
                            )}
                          </p>
                          <p className="text-2xl font-semibold tabular-nums">
                            {formatCurrency(depreciation.netBookValue, locale)}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {translate(
                            "assets.assets.depreciation.schedule",
                            { ns: "starter" },
                            "Straight-line, {{months}} months"
                          ).replace("{{months}}", String(depreciation.usefulLifeMonths))}
                        </p>
                      </div>
                      <Progress value={depreciation.percentDepreciated} />
                      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          {translate(
                            "assets.assets.depreciation.accumulated",
                            { ns: "starter" },
                            "Accumulated {{value}}"
                          ).replace(
                            "{{value}}",
                            formatCurrency(depreciation.accumulated, locale)
                          )}
                        </span>
                        <span>
                          {translate(
                            "assets.assets.depreciation.inService",
                            { ns: "starter" },
                            "{{months}} months in service"
                          ).replace("{{months}}", String(depreciation.monthsInService))}
                        </span>
                      </div>
                      {depreciation.isFullyDepreciated && (
                        <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                          {translate(
                            "assets.assets.depreciation.fully",
                            { ns: "starter" },
                            "Fully depreciated — a refresh candidate."
                          )}
                        </p>
                      )}
                    </div>
                  </DrawerSection>
                )}
              </div>
            )}

            {tab === "assignments" && id && (
              <AssignmentHistory
                assetId={id}
                assetStatus={record?.status ?? "in_stock"}
                assignments={assignments.data}
                locale={locale}
              />
            )}

            {tab === "maintenance" && (
              <MaintenanceHistory records={maintenance.data} locale={locale} />
            )}

            {tab === "timeline" && record && (
              <LifecycleTimeline
                asset={record}
                assignments={assignments.data}
                maintenance={maintenance.data}
                locale={locale}
              />
            )}
          </div>
        )}
      </div>
    </RouteDrawer>
  );
}

/**
 * Status is advanced through explicit transitions, not a free dropdown; only the
 * moves that are legal from the current state are offered.
 */
function LifecycleActions({
  asset,
  hasActiveAssignment,
}: {
  asset: AssetRecord;
  hasActiveAssignment: boolean;
}) {
  const translate = useTranslate();
  const { mutate: updateAsset, mutation } = useUpdate<AssetRecord>();
  const current = asset.status ?? "in_stock";
  const targets = ASSET_TRANSITIONS[current] ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2">
      <span className="text-xs text-muted-foreground">
        {translate("assets.assets.lifecycle.label", { ns: "starter" }, "Lifecycle")}
      </span>
      <Pill
        label={labelFor(ASSET_STATUSES, current, translate)}
        className={statusBadgeClass(current)}
      />
      <ArrowRightLeft className="size-3.5 text-muted-foreground" />
      {targets.length === 0 ? (
        <span className="text-xs text-muted-foreground">
          {translate("assets.assets.lifecycle.terminal", { ns: "starter" }, "No further moves")}
        </span>
      ) : (
        targets.map((target) => (
          <Button
            key={target}
            variant="outline"
            size="sm"
            className="text-xs"
            disabled={
              mutation.isPending ||
              // Assignment state owns availability while somebody holds it.
              hasActiveAssignment
            }
            title={
              hasActiveAssignment
                ? translate(
                    "assets.assets.lifecycle.returnFirst",
                    { ns: "starter" },
                    "Return the device before changing its lifecycle status"
                  )
                : undefined
            }
            onClick={() =>
              updateAsset({
                resource: "hub_as_assets",
                id: asset.id,
                values: { status: target },
              })
            }
          >
            {translate("assets.assets.lifecycle.moveTo", { ns: "starter" }, "Move to {{status}}").replace(
              "{{status}}",
              labelFor(ASSET_STATUSES, target, translate)
            )}
          </Button>
        ))
      )}
    </div>
  );
}

function AssignmentHistory({
  assetId,
  assetStatus,
  assignments,
  locale,
}: {
  assetId: string;
  assetStatus: string;
  assignments: AssignmentRecord[];
  locale: string;
}) {
  const translate = useTranslate();
  const notify = useNotification();
  const openChild = useOpenContextualChild();
  const { mutateAsync: updateAssignment } = useUpdate<AssignmentRecord>();
  const { mutateAsync: updateAsset } = useUpdate<AssetRecord>();

  const hasActive = assignments.some((row) => !row.returned_date);

  const returnAssignment = async (assignment: AssignmentRecord) => {
    try {
      await runAssignmentAssetTransition({
        updateAssignment: () =>
          updateAssignment({
            resource: "hub_as_assignments",
            id: assignment.id,
            values: { returned_date: todayIso() },
            successNotification: false,
          }),
        updateAsset: () =>
          assetStatus === "assigned"
            ? updateAsset({
                resource: "hub_as_assets",
                id: assetId,
                values: { status: "in_stock" },
                successNotification: false,
              })
            : Promise.resolve(),
        rollbackAssignment: () =>
          updateAssignment({
            resource: "hub_as_assignments",
            id: assignment.id,
            values: { returned_date: assignment.returned_date ?? null },
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

  return (
    <DrawerSection
      title={translate("assets.assets.history.title", { ns: "starter" }, "Assignment history")}
      action={
        <Button
          variant="outline"
          size="sm"
          disabled={hasActive}
          title={
            hasActive
              ? translate(
                  "assets.assets.history.returnActiveFirst",
                  { ns: "starter" },
                  "Return the active assignment before reassigning"
                )
              : translate("assets.assets.history.assignThis", { ns: "starter" }, "Assign this device")
          }
          onClick={() => openChild("assign")}
        >
          <Plus />
          {translate("assets.assets.history.assign", { ns: "starter" }, "Assign")}
        </Button>
      }
    >
      <SimpleTable
        headers={[
          translate("assets.assets.history.headers.assignee", { ns: "starter" }, "Assignee"),
          translate("assets.assets.history.headers.assigned", { ns: "starter" }, "Assigned"),
          translate("assets.assets.history.headers.returned", { ns: "starter" }, "Returned"),
          translate("assets.assets.history.headers.heldFor", { ns: "starter" }, "Held for"),
          translate("assets.common.actions", { ns: "starter" }, "Actions"),
        ]}
      >
        {assignments.length === 0 ? (
          <EmptyRow
            colSpan={5}
            text={translate(
              "assets.assets.history.empty",
              { ns: "starter" },
              "Never assigned. Use Assign to hand this device to someone."
            )}
          />
        ) : (
          assignments.map((assignment) => {
            const active = !assignment.returned_date;
            return (
              <tr key={String(assignment.id)}>
                <td className="px-3 py-2 font-medium">
                  {assigneeName(assignment.assignee)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {formatDate(assignment.assigned_date, locale)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {active ? (
                    <Pill
                      label={translate("assets.assignments.active", { ns: "starter" }, "Active")}
                      className="bg-blue-500/15 text-blue-700 dark:text-blue-300"
                    />
                  ) : (
                    formatDate(assignment.returned_date, locale)
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                  {heldForDays(assignment, translate)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      title={translate("assets.common.view", { ns: "starter" }, "View")}
                      onClick={() =>
                        openChild(
                          `assignments/show/${encodeURIComponent(String(assignment.id))}`
                        )
                      }
                    >
                      <Eye />
                    </Button>
                    {active ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => returnAssignment(assignment)}
                      >
                        <Undo2 />
                        {translate("assets.assignments.actions.return", { ns: "starter" }, "Return")}
                      </Button>
                    ) : null}
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

function MaintenanceHistory({
  records,
  locale,
}: {
  records: MaintenanceRecord[];
  locale: string;
}) {
  const translate = useTranslate();
  const openChild = useOpenContextualChild();

  const totalCost = records.reduce((sum, row) => sum + Number(row.cost ?? 0), 0);

  return (
    <DrawerSection
      title={translate("assets.assets.maintenance.title", { ns: "starter" }, "Maintenance")}
      action={
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {translate(
              "assets.assets.maintenance.lifetimeCost",
              { ns: "starter" },
              "Lifetime cost {{value}}"
            ).replace("{{value}}", formatCurrency(totalCost, locale))}
          </span>
          <Button
            variant="outline"
            size="sm"
            title={translate("assets.assets.maintenance.logThis", { ns: "starter" }, "Log maintenance for this device")}
            onClick={() => openChild("maintenance/create")}
          >
            <Plus />
            {translate("assets.assets.maintenance.log", { ns: "starter" }, "Log")}
          </Button>
        </div>
      }
    >
      <SimpleTable
        headers={[
          translate("assets.maintenance.columns.title", { ns: "starter" }, "Title"),
          translate("assets.maintenance.columns.type", { ns: "starter" }, "Type"),
          translate("assets.maintenance.columns.status", { ns: "starter" }, "Status"),
          translate("assets.maintenance.columns.scheduled", { ns: "starter" }, "Scheduled"),
          translate("assets.maintenance.fields.cost", { ns: "starter" }, "Cost"),
          translate("assets.common.actions", { ns: "starter" }, "Actions"),
        ]}
      >
        {records.length === 0 ? (
          <EmptyRow
            colSpan={6}
            text={translate(
              "assets.assets.maintenance.empty",
              { ns: "starter" },
              "No maintenance logged. Use Log to record service work."
            )}
          />
        ) : (
          records.map((record) => {
            const overdue =
              record.status !== "Done" && (daysUntil(record.scheduled_date) ?? 1) < 0;
            return (
              <tr key={String(record.id)} className={cn(overdue && "bg-destructive/5")}>
                <td className="px-3 py-2 font-medium">{record.title || "—"}</td>
                <td className="px-3 py-2">
                  {record.type ? (
                    <Pill
                      label={labelFor(MAINTENANCE_TYPES, record.type, translate)}
                      className={maintenanceTypeBadgeClass(record.type)}
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2">
                  {record.status ? (
                    <Pill
                      label={labelFor(MAINTENANCE_STATUSES, record.status, translate)}
                      className={maintenanceStatusBadgeClass(record.status)}
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 whitespace-nowrap",
                    overdue && "font-medium text-destructive"
                  )}
                >
                  {formatDate(record.scheduled_date, locale)}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {formatCurrency(record.cost, locale)}
                </td>
                <td className="px-3 py-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    title={translate("assets.common.view", { ns: "starter" }, "View")}
                    onClick={() =>
                      openChild(
                        `maintenance/show/${encodeURIComponent(String(record.id))}`
                      )
                    }
                  >
                    <Eye />
                  </Button>
                </td>
              </tr>
            );
          })
        )}
      </SimpleTable>
    </DrawerSection>
  );
}

type TimelineEntry = {
  key: string;
  date: string;
  title: string;
  detail?: string;
  tone: string;
};

/**
 * A real, record-derived history: purchase, every hand-over and return, every
 * piece of service work. The backend has no audit-log collection, so this is
 * assembled from the child records rather than invented.
 */
function LifecycleTimeline({
  asset,
  assignments,
  maintenance,
  locale,
}: {
  asset: AssetRecord;
  assignments: AssignmentRecord[];
  maintenance: MaintenanceRecord[];
  locale: string;
}) {
  const translate = useTranslate();

  const entries = useMemo(() => {
    const list: TimelineEntry[] = [];

    if (asset.purchase_date) {
      list.push({
        key: "purchase",
        date: asset.purchase_date,
        title: translate("assets.assets.timeline.purchased", { ns: "starter" }, "Purchased"),
        detail: formatCurrency(asset.value, locale),
        tone: "bg-blue-500",
      });
    }

    for (const assignment of assignments) {
      if (assignment.assigned_date) {
        list.push({
          key: `assign-${assignment.id}`,
          date: assignment.assigned_date,
          title: translate("assets.assets.timeline.assigned", { ns: "starter" }, "Assigned"),
          detail: assigneeName(assignment.assignee),
          tone: "bg-sky-500",
        });
      }
      if (assignment.returned_date) {
        list.push({
          key: `return-${assignment.id}`,
          date: assignment.returned_date,
          title: translate("assets.assets.timeline.returned", { ns: "starter" }, "Returned"),
          detail: assigneeName(assignment.assignee),
          tone: "bg-teal-500",
        });
      }
    }

    for (const record of maintenance) {
      if (record.scheduled_date) {
        list.push({
          key: `sched-${record.id}`,
          date: record.scheduled_date,
          title: translate("assets.assets.timeline.serviceScheduled", { ns: "starter" }, "Service scheduled"),
          detail: record.title ?? undefined,
          tone: "bg-amber-500",
        });
      }
      if (record.completed_date) {
        list.push({
          key: `done-${record.id}`,
          date: record.completed_date,
          title: translate("assets.assets.timeline.serviceCompleted", { ns: "starter" }, "Service completed"),
          detail: [record.title, record.vendor].filter(Boolean).join(" — ") || undefined,
          tone: "bg-emerald-500",
        });
      }
    }

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [asset, assignments, locale, maintenance, translate]);

  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        {translate(
          "assets.assets.timeline.empty",
          { ns: "starter" },
          "Nothing has happened to this device yet."
        )}
      </p>
    );
  }

  return (
    <DrawerSection
      title={translate("assets.assets.timeline.title", { ns: "starter" }, "Lifecycle timeline")}
    >
      <ol className="relative space-y-4 border-l pl-5">
        {entries.map((entry) => (
          <li key={entry.key} className="relative">
            <span
              className={cn(
                "absolute -left-[1.6rem] top-1.5 size-2.5 rounded-full ring-4 ring-background",
                entry.tone
              )}
            />
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{entry.title}</p>
              <time className="text-xs text-muted-foreground">
                {formatDate(entry.date, locale)}
              </time>
            </div>
            {entry.detail && (
              <p className="text-xs text-muted-foreground">{entry.detail}</p>
            )}
          </li>
        ))}
      </ol>
    </DrawerSection>
  );
}

function heldForDays(
  assignment: AssignmentRecord,
  translate: ReturnType<typeof useTranslate>
) {
  if (!assignment.assigned_date) return "—";
  const start = new Date(assignment.assigned_date).getTime();
  const end = assignment.returned_date
    ? new Date(assignment.returned_date).getTime()
    : Date.now();
  const days = Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
  return translate("assets.assets.history.days", { ns: "starter" }, "{{count}} days").replace(
    "{{count}}",
    String(days)
  );
}

/** Standalone printable asset record — the sheet auditors ask for. */
function printAssetRecord({
  asset,
  assignments,
  maintenance,
  locale,
}: {
  asset: AssetRecord;
  assignments: AssignmentRecord[];
  maintenance: MaintenanceRecord[];
  locale: string;
}) {
  const depreciation = depreciationFor(asset);
  const field = (label: string, value: string) =>
    `<div><span class="label">${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;

  const body = `
    <div class="doc-head">
      <div>
        <h1>${escapeHtml(asset.name ?? "Asset")}</h1>
        <p class="muted">${escapeHtml(asset.tag ?? "")}</p>
      </div>
      <span class="badge">${escapeHtml(labelFor(ASSET_STATUSES, asset.status))}</span>
    </div>
    <h2>Profile</h2>
    <div class="grid">
      ${field("Category", labelFor(ASSET_CATEGORIES, asset.category))}
      ${field("Purchase date", formatDate(asset.purchase_date, locale))}
      ${field("Acquisition value", formatCurrency(asset.value, locale))}
      ${field(
        "Net book value",
        depreciation ? formatCurrency(depreciation.netBookValue, locale) : "—"
      )}
    </div>
    <h2>Assignment history</h2>
    <table>
      <thead><tr><th>Assignee</th><th>Assigned</th><th>Returned</th><th>Note</th></tr></thead>
      <tbody>
        ${
          assignments.length === 0
            ? '<tr><td colspan="4" class="muted">Never assigned</td></tr>'
            : assignments
                .map(
                  (row) =>
                    `<tr><td>${escapeHtml(assigneeName(row.assignee))}</td><td>${escapeHtml(
                      formatDate(row.assigned_date, locale)
                    )}</td><td>${escapeHtml(
                      row.returned_date ? formatDate(row.returned_date, locale) : "Active"
                    )}</td><td>${escapeHtml(row.note ?? "")}</td></tr>`
                )
                .join("")
        }
      </tbody>
    </table>
    <h2>Maintenance</h2>
    <table>
      <thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Scheduled</th><th class="num">Cost</th></tr></thead>
      <tbody>
        ${
          maintenance.length === 0
            ? '<tr><td colspan="5" class="muted">No service work logged</td></tr>'
            : maintenance
                .map(
                  (row) =>
                    `<tr><td>${escapeHtml(row.title ?? "")}</td><td>${escapeHtml(
                      row.type ?? ""
                    )}</td><td>${escapeHtml(row.status ?? "")}</td><td>${escapeHtml(
                      formatDate(row.scheduled_date, locale)
                    )}</td><td class="num">${escapeHtml(
                      formatCurrency(row.cost, locale)
                    )}</td></tr>`
                )
                .join("")
        }
      </tbody>
    </table>
    <footer>Printed ${escapeHtml(formatDate(new Date().toISOString(), locale))}</footer>
  `;

  openPrintWindow(`${asset.tag ?? "asset"} — record`, body);
}
