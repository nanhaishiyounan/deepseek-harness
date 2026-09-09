import { useList, useShow, useTranslate } from "@refinedev/core";
import {
  CalendarPlus,
  Copy,
  Link2,
  Pencil,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useOutlet, useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import { cn } from "@/lib/utils";
import {
  EMPLOYEE_STATUSES,
  LEAVE_STATUSES,
  LEAVE_TYPES,
  formatDate,
  labelFor,
} from "../constants";
import {
  useContextualCloseTo,
  useOpenContextualChild,
} from "../route-surfaces";
import {
  DetailItems,
  DrawerSection,
  EmptyRow,
  EnumBadge,
  SimpleTable,
  useLocale,
} from "../shared";
import { ActivityTimeline, type ActivityEntry } from "@/lib/table-kit";
import type { EmployeeRecord, LeaveRequestRecord } from "../types";

type Tab = "profile" | "leave" | "team" | "activity";

export function EmployeeShow({ idParam = "id" }: { idParam?: string } = {}) {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const closeTo = useContextualCloseTo();
  const params = useParams();
  const id = params[idParam];
  const nestedDrawer = useOutlet();
  const [tab, setTab] = useState<Tab>("profile");
  const [copied, setCopied] = useState(false);

  const { result: record, query } = useShow<EmployeeRecord>({
    resource: "hub_hr_employees",
    id,
    meta: { appends: ["department", "manager", "createdBy", "updatedBy"] },
  });

  const displayName =
    record?.name ||
    translate("hr.employees.detail.unnamed", { ns: "starter" }, "Employee");

  const copyLink = () => {
    if (typeof window === "undefined") return;
    void navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const tabs: Array<{ value: Tab; label: string }> = [
    {
      value: "profile",
      label: translate("hr.employees.tabs.profile", { ns: "starter" }, "Profile"),
    },
    {
      value: "leave",
      label: translate("hr.employees.tabs.leave", { ns: "starter" }, "Time off"),
    },
    {
      value: "team",
      label: translate("hr.employees.tabs.team", { ns: "starter" }, "Team"),
    },
    {
      value: "activity",
      label: translate("hr.employees.tabs.activity", { ns: "starter" }, "Activity"),
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
        "hr.employees.drawer.show.description",
        { ns: "starter" },
        "Profile, reporting line and leave history."
      )}
      closeLabel={translate("hr.common.close", { ns: "starter" }, "Close")}
      closeTo={closeTo}
      nested={nestedDrawer}
      actions={
        record ? (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={copyLink}
              title={translate(
                "hr.common.copyLink",
                { ns: "starter" },
                "Copy link"
              )}
            >
              {copied ? <Copy className="size-4" /> : <Link2 className="size-4" />}
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => window.print()}
              title={translate("hr.common.print", { ns: "starter" }, "Print")}
            >
              <Printer className="size-4" />
            </Button>
            <EditButton
              resource="hub_hr_employees"
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
                "hr.employees.detail.loadError.title",
                { ns: "starter" },
                "Unable to load employee"
              )}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "hr.employees.detail.loadError.description",
                { ns: "starter" },
                "The record may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
              <TabsList className="w-full">
                {tabs.map((item) => (
                  <TabsTrigger key={item.value} value={item.value}>
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {tab === "profile" ? (
              <>
                <DetailItems
                  title={translate(
                    "hr.employees.detail.profile",
                    { ns: "starter" },
                    "Profile"
                  )}
                  items={[
                    [
                      translate("hr.employees.fields.title", { ns: "starter" }, "Title"),
                      record?.job_title || "—",
                    ],
                    [
                      translate("hr.employees.fields.status", { ns: "starter" }, "Status"),
                      <EnumBadge
                        key="status"
                        value={record?.status ?? "active"}
                        label={labelFor(
                          EMPLOYEE_STATUSES,
                          record?.status ?? "active",
                          translate
                        )}
                      />,
                    ],
                    [
                      translate(
                        "hr.employees.fields.department",
                        { ns: "starter" },
                        "Department"
                      ),
                      record?.department?.name || "—",
                    ],
                    [
                      translate(
                        "hr.employees.fields.manager",
                        { ns: "starter" },
                        "Manager"
                      ),
                      record?.manager?.name || "—",
                    ],
                    [
                      translate("hr.employees.fields.email", { ns: "starter" }, "Email"),
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
                        "hr.employees.fields.hireDate",
                        { ns: "starter" },
                        "Hire date"
                      ),
                      formatDate(record?.hire_date, locale),
                    ],
                  ]}
                />
                <Separator />
                <RecordMeta record={record} locale={locale} />
              </>
            ) : null}

            {tab === "leave" && id ? (
              <>
                <LeaveBalanceSection employeeId={id} />
                <Separator />
                <LeaveHistorySection
                  employeeId={id}
                  locale={locale}
                  openChild={openChild}
                />
              </>
            ) : null}

            {tab === "team" && id ? (
              <>
                <ReportsSection managerId={id} />
                {record?.manager ? (
                  <>
                    <Separator />
                    <DrawerSection
                      title={translate(
                        "hr.employees.detail.reportingLine",
                        { ns: "starter" },
                        "Reporting line"
                      )}
                    >
                      <ManagerChain employee={record} />
                    </DrawerSection>
                  </>
                ) : null}
              </>
            ) : null}

            {tab === "activity" && id ? (
              <ActivitySection employee={record} employeeId={id} locale={locale} />
            ) : null}
          </div>
        )}
      </div>
    </RouteDrawer>
  );
}

type OpenChild = (to: string) => void;

function RecordMeta({
  record,
  locale,
}: {
  record: EmployeeRecord | undefined;
  locale: string;
}) {
  const translate = useTranslate();
  const stamp = (value: string | null | undefined) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value))
      : "—";
  return (
    <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
      <div>
        <dt className="inline">
          {translate("hr.common.createdAt", { ns: "starter" }, "Created")}:{" "}
        </dt>
        <dd className="inline tabular-nums">{stamp(record?.createdAt)}</dd>
      </div>
      <div>
        <dt className="inline">
          {translate("hr.common.updatedAt", { ns: "starter" }, "Last updated")}:{" "}
        </dt>
        <dd className="inline tabular-nums">{stamp(record?.updatedAt)}</dd>
      </div>
    </dl>
  );
}

function ManagerChain({ employee }: { employee: EmployeeRecord }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button
        type="button"
        className="rounded-md border px-2.5 py-1.5 font-medium hover:border-primary/50"
        onClick={() => navigate(`/employees/show/${employee.manager?.id}`)}
      >
        {employee.manager?.name || "—"}
        <span className="ml-1.5 text-xs text-muted-foreground">
          {employee.manager?.job_title || ""}
        </span>
      </button>
      <span className="text-muted-foreground">→</span>
      <span className="rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 font-medium">
        {employee.name}
      </span>
    </div>
  );
}

/** Days taken and pending this calendar year, split by leave type. */
function LeaveBalanceSection({ employeeId }: { employeeId: string }) {
  const translate = useTranslate();
  const yearStart = `${new Date().getFullYear()}-01-01`;

  const { result } = useList<LeaveRequestRecord>({
    resource: "hub_hr_leave_requests",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    filters: [
      { field: "employee_id", operator: "eq", value: employeeId },
      { field: "start_date", operator: "gte", value: yearStart },
    ],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const totals = useMemo(() => {
    const taken = new Map<string, number>();
    let pending = 0;
    for (const leave of result.data) {
      const days = Number(leave.days ?? 0);
      if (leave.status === "approved") {
        const type = leave.type ?? "annual";
        taken.set(type, (taken.get(type) ?? 0) + days);
      } else if ((leave.status ?? "pending") === "pending") {
        pending += days;
      }
    }
    return { taken, pending };
  }, [result.data]);

  return (
    <DrawerSection
      title={translate(
        "hr.employees.detail.balance",
        { ns: "starter", year: new Date().getFullYear() },
        "Time off this year"
      )}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {LEAVE_TYPES.map((type) => (
          <div key={type.value} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              {labelFor(LEAVE_TYPES, type.value, translate)}
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {(totals.taken.get(type.value) ?? 0).toFixed(1)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {translate("hr.employees.detail.daysTaken", { ns: "starter" }, "days taken")}
            </p>
          </div>
        ))}
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-xs text-muted-foreground">
            {translate("hr.enums.leaveStatus.pending", { ns: "starter" }, "Pending")}
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {totals.pending.toFixed(1)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {translate(
              "hr.employees.detail.daysAwaiting",
              { ns: "starter" },
              "days awaiting"
            )}
          </p>
        </div>
      </div>
    </DrawerSection>
  );
}

function ReportsSection({ managerId }: { managerId: string }) {
  const translate = useTranslate();
  const navigate = useNavigate();
  const { result } = useList<EmployeeRecord>({
    resource: "hub_hr_employees",
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    sorters: [{ field: "name", order: "asc" }],
    filters: [{ field: "manager_id", operator: "eq", value: managerId }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  return (
    <DrawerSection
      title={translate("hr.employees.detail.reports", { ns: "starter" }, "Direct reports")}
    >
      <SimpleTable
        headers={[
          translate("hr.employees.fields.name", { ns: "starter" }, "Name"),
          translate("hr.employees.fields.title", { ns: "starter" }, "Title"),
          translate("hr.employees.fields.status", { ns: "starter" }, "Status"),
        ]}
      >
        {result.data.length === 0 ? (
          <EmptyRow
            colSpan={3}
            text={translate(
              "hr.employees.detail.reportsEmpty",
              { ns: "starter" },
              "No one reports to this person."
            )}
          />
        ) : (
          result.data.map((report) => (
            <tr
              key={String(report.id)}
              className="cursor-pointer hover:bg-accent/40"
              onClick={() => navigate(`/employees/show/${report.id}`)}
            >
              <td className="px-3 py-2 font-medium text-primary underline-offset-2 hover:underline">
                {report.name || "—"}
              </td>
              <td className="px-3 py-2">{report.job_title || "—"}</td>
              <td className="px-3 py-2">
                <EnumBadge
                  value={report.status ?? "active"}
                  label={labelFor(EMPLOYEE_STATUSES, report.status ?? "active", translate)}
                />
              </td>
            </tr>
          ))
        )}
      </SimpleTable>
    </DrawerSection>
  );
}

function LeaveHistorySection({
  employeeId,
  locale,
  openChild,
}: {
  employeeId: string;
  locale: string;
  openChild: OpenChild;
}) {
  const translate = useTranslate();
  const { result } = useList<LeaveRequestRecord>({
    resource: "hub_hr_leave_requests",
    pagination: { mode: "server", currentPage: 1, pageSize: 50 },
    sorters: [{ field: "start_date", order: "desc" }],
    filters: [{ field: "employee_id", operator: "eq", value: employeeId }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  return (
    <DrawerSection
      title={translate("hr.employees.detail.leaveHistory", { ns: "starter" }, "Leave history")}
      action={
        <Button variant="outline" size="sm" onClick={() => openChild("leave/create")}>
          <Plus />
          {translate("hr.employees.actions.logLeave", { ns: "starter" }, "Log leave")}
        </Button>
      }
    >
      <SimpleTable
        headers={[
          translate("hr.leave.fields.type", { ns: "starter" }, "Type"),
          translate("hr.leave.fields.dates", { ns: "starter" }, "Dates"),
          translate("hr.leave.fields.days", { ns: "starter" }, "Days"),
          translate("hr.leave.fields.status", { ns: "starter" }, "Status"),
          translate("hr.common.actions", { ns: "starter" }, "Actions"),
        ]}
      >
        {result.data.length === 0 ? (
          <EmptyRow
            colSpan={5}
            text={translate(
              "hr.employees.detail.leaveEmpty",
              { ns: "starter" },
              "No leave requests on record."
            )}
          />
        ) : (
          result.data.map((leave) => (
            <tr
              key={String(leave.id)}
              className="cursor-pointer hover:bg-accent/40"
              onClick={() => openChild(`leave/show/${encodeURIComponent(String(leave.id))}`)}
            >
              <td className="px-3 py-2">
                <EnumBadge
                  value={leave.type ?? "annual"}
                  label={labelFor(LEAVE_TYPES, leave.type ?? "annual", translate)}
                />
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {formatDate(leave.start_date, locale)} –{" "}
                {formatDate(leave.end_date, locale)}
              </td>
              <td className="px-3 py-2 tabular-nums">{leave.days ?? "—"}</td>
              <td className="px-3 py-2">
                <EnumBadge
                  value={leave.status ?? "pending"}
                  label={labelFor(LEAVE_STATUSES, leave.status ?? "pending", translate)}
                />
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      openChild(`leave/edit/${encodeURIComponent(String(leave.id))}`)
                    }
                  >
                    <Pencil />
                  </Button>
                  <DeleteButton
                    resource="hub_hr_leave_requests"
                    recordItemId={leave.id}
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

/**
 * Audit trail assembled from the record's own timestamps plus every leave
 * request raised against it — the closest thing to a change log the schema
 * currently records.
 */
function ActivitySection({
  employee,
  employeeId,
  locale,
}: {
  employee: EmployeeRecord | undefined;
  employeeId: string;
  locale: string;
}) {
  const translate = useTranslate();
  const { result } = useList<LeaveRequestRecord>({
    resource: "hub_hr_leave_requests",
    pagination: { mode: "server", currentPage: 1, pageSize: 50 },
    sorters: [{ field: "createdAt", order: "desc" }],
    filters: [{ field: "employee_id", operator: "eq", value: employeeId }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const entries = useMemo<ActivityEntry[]>(() => {
    const out: ActivityEntry[] = [];
    if (employee?.updatedAt && employee.updatedAt !== employee.createdAt) {
      out.push({
        id: "updated",
        at: employee.updatedAt,
        actor: employee.updatedBy?.nickname ?? null,
        title: translate(
          "hr.employees.activity.updated",
          { ns: "starter" },
          "Profile updated"
        ),
        tone: "bg-blue-500",
      });
    }
    for (const leave of result.data) {
      const status = leave.status ?? "pending";
      out.push({
        id: `leave-${leave.id}`,
        at: leave.createdAt,
        actor: null,
        title: translate(
          "hr.employees.activity.leave",
          {
            ns: "starter",
            type: labelFor(LEAVE_TYPES, leave.type ?? "annual", translate),
          },
          `${labelFor(LEAVE_TYPES, leave.type ?? "annual", translate)} leave requested`
        ),
        detail: (
          <span className="flex items-center gap-2">
            {formatDate(leave.start_date, locale)} –{" "}
            {formatDate(leave.end_date, locale)}
            <EnumBadge
              value={status}
              label={labelFor(LEAVE_STATUSES, status, translate)}
            />
          </span>
        ),
        tone:
          status === "approved"
            ? "bg-emerald-500"
            : status === "rejected"
              ? "bg-red-500"
              : "bg-amber-500",
      });
    }
    if (employee?.hire_date) {
      out.push({
        id: "hired",
        at: employee.hire_date,
        actor: null,
        title: translate("hr.employees.activity.hired", { ns: "starter" }, "Joined the company"),
        tone: "bg-teal-500",
      });
    }
    if (employee?.createdAt) {
      out.push({
        id: "created",
        at: employee.createdAt,
        actor: employee.createdBy?.nickname ?? null,
        title: translate(
          "hr.employees.activity.created",
          { ns: "starter" },
          "Record created"
        ),
        tone: "bg-slate-400",
      });
    }
    return out.sort((a, b) =>
      String(b.at ?? "").localeCompare(String(a.at ?? ""))
    );
  }, [employee, locale, result.data, translate]);

  return (
    <DrawerSection
      title={translate(
        "hr.employees.detail.activity",
        { ns: "starter" },
        "Activity log"
      )}
      action={
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs text-muted-foreground"
          )}
        >
          <CalendarPlus className="size-3.5" />
          {translate(
            "hr.employees.activity.count",
            { ns: "starter", count: entries.length },
            `${entries.length} events`
          )}
        </span>
      }
    >
      <ActivityTimeline
        entries={entries}
        locale={locale}
        emptyText={translate(
          "hr.employees.activity.empty",
          { ns: "starter" },
          "Nothing recorded yet."
        )}
      />
    </DrawerSection>
  );
}
