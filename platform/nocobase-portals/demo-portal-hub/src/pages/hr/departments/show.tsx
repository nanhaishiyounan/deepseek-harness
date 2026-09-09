import { useList, useShow, useTranslate } from "@refinedev/core";
import { Link2, Pencil, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useOutlet, useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
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
import type {
  DepartmentRecord,
  EmployeeRecord,
  LeaveRequestRecord,
} from "../types";

type Tab = "overview" | "people" | "timeOff";
type DepartmentDetailRecord = DepartmentRecord & { updatedAt?: string };

export function DepartmentShow() {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const closeTo = useContextualCloseTo();
  const { id } = useParams<{ id: string }>();
  const nestedDrawer = useOutlet();
  const [tab, setTab] = useState<Tab>("overview");
  const [copied, setCopied] = useState(false);

  const { result: record, query } = useShow<DepartmentDetailRecord>({
    resource: "hub_hr_departments",
    id,
    meta: { appends: ["parent"] },
  });

  const { result: employeeResult } = useList<EmployeeRecord>({
    resource: "hub_hr_employees",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    sorters: [{ field: "name", order: "asc" }],
    filters: [{ field: "department_id", operator: "eq", value: id }],
    errorNotification: false,
    queryOptions: { enabled: Boolean(id), retry: false },
  });

  const { result: childResult } = useList<DepartmentRecord>({
    resource: "hub_hr_departments",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    filters: [{ field: "parentId", operator: "eq", value: id }],
    errorNotification: false,
    queryOptions: { enabled: Boolean(id), retry: false },
  });

  const employees = useMemo(
    () =>
      [...employeeResult.data].sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? "")
      ),
    [employeeResult.data]
  );
  const employeeIds = useMemo(
    () => employees.map((employee) => employee.id),
    [employees]
  );

  const { result: leaveResult } = useList<LeaveRequestRecord>({
    resource: "hub_hr_leave_requests",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    filters: [
      { field: "employee_id", operator: "in", value: employeeIds },
    ],
    meta: { appends: ["employee"] },
    errorNotification: false,
    queryOptions: { enabled: employeeIds.length > 0, retry: false },
  });

  const leaveRequests = useMemo(
    () =>
      [...leaveResult.data].sort((a, b) =>
        String(b.start_date ?? "").localeCompare(String(a.start_date ?? ""))
      ),
    [leaveResult.data]
  );

  const currentStaff = useMemo(
    () => employees.filter((employee) => employee.status !== "terminated"),
    [employees]
  );
  const averageTenure = useMemo(() => {
    const now = Date.now();
    const tenures = currentStaff.flatMap((employee) => {
      if (!employee.hire_date) return [];
      const hiredAt = new Date(employee.hire_date).getTime();
      return Number.isNaN(hiredAt)
        ? []
        : [(now - hiredAt) / (365.25 * 24 * 60 * 60 * 1000)];
    });
    return tenures.length
      ? tenures.reduce((sum, years) => sum + years, 0) / tenures.length
      : 0;
  }, [currentStaff]);

  const approvedDaysThisYear = useMemo(() => {
    const year = String(new Date().getFullYear());
    return leaveRequests.reduce(
      (days, request) =>
        request.status === "approved" &&
        String(request.start_date ?? "").startsWith(year)
          ? days + Number(request.days ?? 0)
          : days,
      0
    );
  }, [leaveRequests]);

  const displayName =
    record?.name ||
    translate("hr.departments.detail.unnamed", { ns: "starter" }, "Department");

  const copyLink = () => {
    if (typeof window === "undefined") return;
    void navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const tabs: Array<{ value: Tab; label: string }> = [
    {
      value: "overview",
      label: translate(
        "hr.departments.tabs.overview",
        { ns: "starter" },
        "Overview"
      ),
    },
    {
      value: "people",
      label: translate(
        "hr.departments.tabs.people",
        { ns: "starter" },
        "People"
      ),
    },
    {
      value: "timeOff",
      label: translate(
        "hr.departments.tabs.timeOff",
        { ns: "starter" },
        "Time off"
      ),
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
        "hr.departments.drawer.show.description",
        { ns: "starter" },
        "Team headcount and current members."
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
              <Link2 className={cn("size-4", copied && "text-emerald-600")} />
            </Button>
            <EditButton
              resource="hub_hr_departments"
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
                "hr.departments.detail.loadError.title",
                { ns: "starter" },
                "Unable to load department"
              )}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "hr.departments.detail.loadError.description",
                { ns: "starter" },
                "The department may no longer exist, or you may not have permission to view it."
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

            {tab === "overview" ? (
              <>
                <DetailItems
                  title={translate(
                    "hr.departments.detail.info",
                    { ns: "starter" },
                    "Info"
                  )}
                  items={[
                    [
                      translate(
                        "hr.departments.fields.code",
                        { ns: "starter" },
                        "Code"
                      ),
                      record?.code || "—",
                    ],
                    [
                      translate(
                        "hr.departments.fields.parent",
                        { ns: "starter" },
                        "Parent department"
                      ),
                      record?.parent?.name || "—",
                    ],
                  ]}
                />
                <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                  <Metric
                    value={currentStaff.length}
                    label={translate(
                      "hr.departments.metrics.headcount",
                      { ns: "starter" },
                      "Headcount"
                    )}
                  />
                  <Metric
                    value={
                      currentStaff.filter(
                        (employee) => employee.status === "onleave"
                      ).length
                    }
                    label={translate(
                      "hr.departments.metrics.onLeave",
                      { ns: "starter" },
                      "On leave right now"
                    )}
                  />
                  <Metric
                    value={childResult.data.length}
                    label={translate(
                      "hr.departments.metrics.subTeams",
                      { ns: "starter" },
                      "Sub-teams"
                    )}
                  />
                  <Metric
                    value={averageTenure.toFixed(1)}
                    label={translate(
                      "hr.departments.metrics.averageTenure",
                      { ns: "starter" },
                      "Average tenure (years)"
                    )}
                  />
                </div>
                <Separator />
                <RecordMeta record={record} locale={locale} />
              </>
            ) : null}

            {tab === "people" ? (
              <DepartmentMembersSection
                employees={employees}
                openChild={openChild}
              />
            ) : null}

            {tab === "timeOff" ? (
              <DepartmentLeaveSection
                requests={leaveRequests}
                approvedDaysThisYear={approvedDaysThisYear}
                locale={locale}
              />
            ) : null}
          </div>
        )}
      </div>
    </RouteDrawer>
  );
}

function Metric({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function RecordMeta({
  record,
  locale,
}: {
  record: DepartmentDetailRecord | undefined;
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
          {translate("hr.common.createdAt", { ns: "starter" }, "Created")}: {" "}
        </dt>
        <dd className="inline tabular-nums">{stamp(record?.createdAt)}</dd>
      </div>
      <div>
        <dt className="inline">
          {translate(
            "hr.common.updatedAt",
            { ns: "starter" },
            "Last updated"
          )}: {" "}
        </dt>
        <dd className="inline tabular-nums">{stamp(record?.updatedAt)}</dd>
      </div>
    </dl>
  );
}

function DepartmentMembersSection({
  employees,
  openChild,
}: {
  employees: EmployeeRecord[];
  openChild: (to: string) => void;
}) {
  const translate = useTranslate();

  return (
    <DrawerSection
      title={translate(
        "hr.departments.detail.members",
        { ns: "starter" },
        "Members"
      )}
    >
      <SimpleTable
        headers={[
          translate("hr.employees.fields.name", { ns: "starter" }, "Name"),
          translate("hr.employees.fields.title", { ns: "starter" }, "Title"),
          translate("hr.employees.fields.status", { ns: "starter" }, "Status"),
        ]}
      >
        {employees.length === 0 ? (
          <EmptyRow
            colSpan={3}
            text={translate(
              "hr.departments.detail.membersEmpty",
              { ns: "starter" },
              "No one is assigned to this department yet."
            )}
          />
        ) : (
          employees.map((employee) => (
            <tr
              key={String(employee.id)}
              className="cursor-pointer hover:bg-accent/40"
              onClick={() =>
                openChild(
                  `employees/show/${encodeURIComponent(String(employee.id))}`
                )
              }
            >
              <td className="px-3 py-2 font-medium">
                <span className="inline-flex items-center gap-1.5 text-primary underline-offset-2 hover:underline">
                  <Users className="size-3.5" />
                  {employee.name || "—"}
                </span>
              </td>
              <td className="px-3 py-2">{employee.job_title || "—"}</td>
              <td className="px-3 py-2">
                <EnumBadge
                  value={employee.status ?? "active"}
                  label={labelFor(
                    EMPLOYEE_STATUSES,
                    employee.status ?? "active",
                    translate
                  )}
                />
              </td>
            </tr>
          ))
        )}
      </SimpleTable>
    </DrawerSection>
  );
}

function DepartmentLeaveSection({
  requests,
  approvedDaysThisYear,
  locale,
}: {
  requests: LeaveRequestRecord[];
  approvedDaysThisYear: number;
  locale: string;
}) {
  const translate = useTranslate();

  return (
    <DrawerSection
      title={translate(
        "hr.departments.tabs.timeOff",
        { ns: "starter" },
        "Time off"
      )}
    >
      <p className="text-sm text-muted-foreground tabular-nums">
        {translate(
          "hr.departments.timeOff.summary",
          {
            ns: "starter",
            requests: requests.length,
            days: approvedDaysThisYear,
          },
          `${requests.length} requests, ${approvedDaysThisYear} days approved this year`
        )}
      </p>
      <SimpleTable
        headers={[
          translate("hr.leave.fields.employee", { ns: "starter" }, "Employee"),
          translate("hr.leave.fields.type", { ns: "starter" }, "Type"),
          translate("hr.leave.fields.dates", { ns: "starter" }, "Dates"),
          translate("hr.leave.fields.days", { ns: "starter" }, "Days"),
          translate("hr.leave.fields.status", { ns: "starter" }, "Status"),
        ]}
      >
        {requests.length === 0 ? (
          <EmptyRow
            colSpan={5}
            text={translate(
              "hr.departments.timeOff.empty",
              { ns: "starter" },
              "No leave requests for this department."
            )}
          />
        ) : (
          requests.map((request) => (
            <tr key={String(request.id)}>
              <td className="px-3 py-2 font-medium">
                {request.employee?.name || "—"}
              </td>
              <td className="px-3 py-2">
                <EnumBadge
                  value={request.type ?? "annual"}
                  label={labelFor(
                    LEAVE_TYPES,
                    request.type ?? "annual",
                    translate
                  )}
                />
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {formatDate(request.start_date, locale)} – {" "}
                {formatDate(request.end_date, locale)}
              </td>
              <td className="px-3 py-2 tabular-nums">{request.days ?? "—"}</td>
              <td className="px-3 py-2">
                <EnumBadge
                  value={request.status ?? "pending"}
                  label={labelFor(
                    LEAVE_STATUSES,
                    request.status ?? "pending",
                    translate
                  )}
                />
              </td>
            </tr>
          ))
        )}
      </SimpleTable>
    </DrawerSection>
  );
}
