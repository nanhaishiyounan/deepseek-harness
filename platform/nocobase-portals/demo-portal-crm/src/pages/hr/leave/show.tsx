import { useGetIdentity, useList, useShow, useTranslate, useUpdate } from "@refinedev/core";
import { AlertTriangle, Check, Pencil, Users, X } from "lucide-react";
import { useMemo } from "react";
import { useNavigate, useOutlet, useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { EditButton } from "@/components/resources/buttons/edit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import { cn } from "@/lib/utils";
import {
  LEAVE_STATUSES,
  LEAVE_TYPES,
  formatDate,
  labelFor,
} from "../constants";
import {
  useContextualCloseTo,
  useOpenContextualChild,
} from "../route-surfaces";
import { DetailItems, DrawerSection, EnumBadge, useLocale } from "../shared";
import { ActivityTimeline, type ActivityEntry } from "@/lib/table-kit";
import type { LeaveRequestRecord } from "../types";
import {
  leaveTransitionValues,
  type LeaveDecisionStatus,
} from "./transitions";

/** Legal transitions — the buttons never offer an invalid move. */
const TRANSITIONS: Record<string, string[]> = {
  pending: ["approved", "rejected"],
  approved: ["pending"],
  rejected: ["pending"],
};

export function LeaveShow({ idParam = "id" }: { idParam?: string } = {}) {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const closeTo = useContextualCloseTo();
  const params = useParams();
  const id = params[idParam];
  const nestedDrawer = useOutlet();
  const { result: record, query } = useShow<LeaveRequestRecord>({
    resource: "hub_hr_leave_requests",
    id,
    meta: {
      appends: [
        "employee",
        "employee.manager",
        "employee.department",
        "approver",
      ],
    },
  });
  const { mutate: updateLeave, mutation } = useUpdate<LeaveRequestRecord>();
  const { data: identity } = useGetIdentity<{ id?: string | number }>();

  const status = record?.status ?? "pending";
  const allowed = TRANSITIONS[status] ?? [];

  const setStatus = (next: LeaveDecisionStatus) => {
    if (!record || !allowed.includes(next)) return;
    let values: Partial<LeaveRequestRecord> | null = null;
    if (next === "pending") {
      if (
        !window.confirm(
          translate(
            "hr.leave.actions.reopenConfirm",
            { ns: "starter" },
            "Reopen this request and clear its previous decision?"
          )
        )
      ) {
        return;
      }
      values = leaveTransitionValues(next);
    } else {
      if (identity?.id == null) {
        window.alert(
          translate(
            "hr.leave.actions.identityRequired",
            { ns: "starter" },
            "Your user identity could not be resolved. The decision was not saved."
          )
        );
        return;
      }
      const comment = window.prompt(
        translate(
          "hr.leave.actions.commentPrompt",
          { ns: "starter" },
          "Enter a decision comment (required)"
        )
      );
      if (comment === null) return;
      if (!comment.trim()) {
        window.alert(
          translate(
            "hr.leave.actions.commentRequired",
            { ns: "starter" },
            "A decision comment is required."
          )
        );
        return;
      }
      values = leaveTransitionValues(next, identity.id, comment);
    }
    updateLeave({
      resource: "hub_hr_leave_requests",
      id: record.id,
      values,
      successNotification: {
        type: "success",
        message: translate(
          `hr.leave.notification.${next}`,
          { ns: "starter" },
          `Request ${next}`
        ),
      },
    });
  };

  const displayName =
    record?.employee?.name ||
    translate("hr.leave.detail.unnamed", { ns: "starter" }, "Leave request");

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
        "hr.leave.drawer.show.description",
        { ns: "starter" },
        "Review the request and record a decision."
      )}
      closeLabel={translate("hr.common.close", { ns: "starter" }, "Close")}
      closeTo={closeTo}
      nested={nestedDrawer}
      actions={
        record ? (
          <EditButton
            resource="hub_hr_leave_requests"
            recordItemId={record.id}
            variant="outline"
            size="icon-sm"
            onClick={() => openChild("edit")}
          >
            <Pencil />
          </EditButton>
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
                "hr.leave.detail.loadError.title",
                { ns: "starter" },
                "Unable to load request"
              )}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "hr.leave.detail.loadError.description",
                { ns: "starter" },
                "The request may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <DetailItems
              title={translate("hr.leave.detail.info", { ns: "starter" }, "Request")}
              items={[
                [
                  translate("hr.leave.fields.employee", { ns: "starter" }, "Employee"),
                  record?.employee?.name || "—",
                ],
                [
                  translate("hr.leave.fields.type", { ns: "starter" }, "Type"),
                  <EnumBadge
                    key="type"
                    value={record?.type ?? "annual"}
                    label={labelFor(LEAVE_TYPES, record?.type ?? "annual", translate)}
                  />,
                ],
                [
                  translate("hr.leave.fields.dates", { ns: "starter" }, "Dates"),
                  `${formatDate(record?.start_date, locale)} – ${formatDate(record?.end_date, locale)}`,
                ],
                [
                  translate("hr.leave.fields.days", { ns: "starter" }, "Days"),
                  record?.days ?? "—",
                ],
                [
                  translate("hr.leave.fields.status", { ns: "starter" }, "Status"),
                  <EnumBadge
                    key="status"
                    value={status}
                    label={labelFor(LEAVE_STATUSES, status, translate)}
                  />,
                ],
                [
                  translate("hr.leave.fields.reason", { ns: "starter" }, "Reason"),
                  record?.reason || "—",
                ],
                ...(status !== "pending"
                  ? [
                      [
                        translate(
                          "hr.leave.fields.decisionComment",
                          { ns: "starter" },
                          "Decision comment"
                        ),
                        record?.decision_comment || "—",
                      ] as [string, string],
                    ]
                  : []),
              ]}
            />

            <div className="flex flex-wrap items-center gap-2">
              {allowed.includes("approved") ? (
                <Button
                  variant="outline"
                  className="border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400"
                  disabled={mutation.isPending}
                  onClick={() => setStatus("approved")}
                >
                  <Check />
                  {translate("hr.leave.actions.approve", { ns: "starter" }, "Approve")}
                </Button>
              ) : null}
              {allowed.includes("rejected") ? (
                <Button
                  variant="outline"
                  className="border-red-500/40 text-red-700 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
                  disabled={mutation.isPending}
                  onClick={() => setStatus("rejected")}
                >
                  <X />
                  {translate("hr.leave.actions.reject", { ns: "starter" }, "Reject")}
                </Button>
              ) : null}
              {allowed.includes("pending") ? (
                <Button
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() => setStatus("pending")}
                >
                  {translate("hr.leave.actions.reopen", { ns: "starter" }, "Reopen")}
                </Button>
              ) : null}
            </div>

            <Separator />
            <ApprovalChain record={record} status={status} />

            {record ? (
              <>
                <Separator />
                <TeamConflicts record={record} locale={locale} />
              </>
            ) : null}

            <Separator />
            <DrawerSection
              title={translate(
                "hr.leave.detail.history",
                { ns: "starter" },
                "Decision history"
              )}
            >
              <ActivityTimeline
                locale={locale}
                emptyText={translate(
                  "hr.leave.detail.historyEmpty",
                  { ns: "starter" },
                  "No decision recorded yet."
                )}
                entries={buildHistory(record, status, translate)}
              />
            </DrawerSection>
          </div>
        )}
      </div>
    </RouteDrawer>
  );
}

function buildHistory(
  record: LeaveRequestRecord | undefined,
  status: string,
  translate: ReturnType<typeof useTranslate>
): ActivityEntry[] {
  if (!record) return [];
  const entries: ActivityEntry[] = [
    {
      id: "submitted",
      at: record.createdAt,
      actor: record.employee?.name ?? null,
      title: translate("hr.leave.history.submitted", { ns: "starter" }, "Request submitted"),
      tone: "bg-slate-400",
    },
  ];
  if (status !== "pending" && (record.approved_at || record.updatedAt)) {
    entries.unshift({
      id: "decision",
      at: record.approved_at ?? record.updatedAt,
      actor: record.approver?.nickname ?? record.updatedBy?.nickname ?? null,
      title:
        status === "approved"
          ? translate("hr.leave.history.approved", { ns: "starter" }, "Approved")
          : translate("hr.leave.history.rejected", { ns: "starter" }, "Rejected"),
      tone: status === "approved" ? "bg-emerald-500" : "bg-red-500",
    });
  }
  return entries;
}

/** Requester → line manager → HR, with the current step highlighted. */
function ApprovalChain({
  record,
  status,
}: {
  record: LeaveRequestRecord | undefined;
  status: string;
}) {
  const translate = useTranslate();
  const steps = [
    {
      key: "requester",
      label: translate("hr.leave.chain.requester", { ns: "starter" }, "Requested by"),
      who: record?.employee?.name ?? "—",
      state: "done" as const,
    },
    {
      key: "manager",
      label: translate("hr.leave.chain.manager", { ns: "starter" }, "Line manager"),
      who:
        record?.employee?.manager?.name ??
        translate("hr.leave.chain.noManager", { ns: "starter" }, "No manager on file"),
      state:
        status === "pending"
          ? ("current" as const)
          : status === "approved"
            ? ("done" as const)
            : ("rejected" as const),
    },
    {
      key: "hr",
      label: translate("hr.leave.chain.hr", { ns: "starter" }, "HR review"),
      who: translate("hr.leave.chain.hrTeam", { ns: "starter" }, "People team"),
      state:
        status === "approved"
          ? ("done" as const)
          : status === "rejected"
            ? ("skipped" as const)
            : ("pending" as const),
    },
  ];

  const tone: Record<string, string> = {
    done: "border-emerald-500/50 bg-emerald-500/5",
    current: "border-amber-500/60 bg-amber-500/5",
    rejected: "border-red-500/50 bg-red-500/5",
    pending: "border-border/70",
    skipped: "border-border/70 opacity-60",
  };

  return (
    <DrawerSection
      title={translate("hr.leave.detail.chain", { ns: "starter" }, "Approval chain")}
    >
      <ol className="grid gap-2 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={cn("rounded-lg border p-3", tone[step.state])}
          >
            <p className="text-xs text-muted-foreground">
              {index + 1}. {step.label}
            </p>
            <p className="mt-1 truncate text-sm font-medium">{step.who}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {translate(
                `hr.leave.chain.state.${step.state}`,
                { ns: "starter" },
                step.state
              )}
            </p>
          </li>
        ))}
      </ol>
    </DrawerSection>
  );
}

/** Warns when teammates in the same department are off on overlapping dates. */
function TeamConflicts({
  record,
  locale,
}: {
  record: LeaveRequestRecord;
  locale: string;
}) {
  const translate = useTranslate();
  const navigate = useNavigate();
  const departmentId = record.employee?.department_id;

  const { result } = useList<LeaveRequestRecord>({
    resource: "hub_hr_leave_requests",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    filters: [
      { field: "status", operator: "eq", value: "approved" },
      {
        field: "end_date",
        operator: "gte",
        value: String(record.start_date ?? "").slice(0, 10),
      },
      {
        field: "start_date",
        operator: "lte",
        value: String(record.end_date ?? record.start_date ?? "").slice(0, 10),
      },
    ],
    meta: { appends: ["employee"] },
    errorNotification: false,
    queryOptions: { retry: false, enabled: Boolean(record.start_date) },
  });

  const clashes = useMemo(
    () =>
      result.data.filter(
        (row) =>
          String(row.id) !== String(record.id) &&
          departmentId != null &&
          String(row.employee?.department_id ?? "") === String(departmentId)
      ),
    [departmentId, record.id, result.data]
  );

  return (
    <DrawerSection
      title={translate(
        "hr.leave.detail.conflicts",
        { ns: "starter" },
        "Team coverage"
      )}
    >
      {clashes.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="size-4" />
          {translate(
            "hr.leave.detail.noConflicts",
            { ns: "starter" },
            "Nobody else in this department is off on these dates."
          )}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-4" />
            {translate(
              "hr.leave.detail.conflictCount",
              { ns: "starter", count: clashes.length },
              `${clashes.length} teammate(s) already off on these dates`
            )}
          </p>
          <ul className="space-y-1">
            {clashes.map((clash) => (
              <li key={String(clash.id)}>
                <button
                  type="button"
                  onClick={() => navigate(`/leave/show/${clash.id}`)}
                  className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm hover:border-primary/50"
                >
                  <span className="truncate font-medium">
                    {clash.employee?.name || "—"}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatDate(clash.start_date, locale)} –{" "}
                    {formatDate(clash.end_date, locale)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DrawerSection>
  );
}
