import { useList, useTranslate } from "@refinedev/core";
import {
  CheckCircle2,
  Circle,
  LogOut,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Breadcrumb } from "@/components/app-shell/breadcrumb";
import { LoadingState } from "@/components/app-shell/loading-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { EMPLOYEE_STATUSES, formatDate, labelFor } from "./constants";
import { EnumBadge, useLocale } from "./shared";
import {
  EmptyState,
  ErrorState,
  KpiBar,
  ToolbarSearch,
  downloadCsv,
  ExportCsvButton,
} from "@/lib/table-kit";
import type { EmployeeRecord } from "./types";

type Stage = "onboarding" | "offboarding";

const WINDOW_DAYS = 90;

const daysSince = (value: string | null | undefined) => {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86400000);
};

/**
 * A joiner is "ready" once the four things the directory actually stores are
 * filled in. Each item maps to a real field, so the progress bar is never
 * decorative.
 */
function readiness(employee: EmployeeRecord) {
  return [
    { key: "profile", done: Boolean(employee.job_title) },
    { key: "email", done: Boolean(employee.email) },
    { key: "department", done: employee.department_id != null },
    { key: "manager", done: employee.manager_id != null },
  ];
}

/** Joiners and leavers, with the setup work each one still needs. */
export function LifecyclePage() {
  const translate = useTranslate();
  const locale = useLocale();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("onboarding");
  const [search, setSearch] = useState("");

  const { result, query } = useList<EmployeeRecord>({
    resource: "hub_hr_employees",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    sorters: [{ field: "hire_date", order: "desc" }],
    meta: { appends: ["department", "manager"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const { joiners, leavers, summary } = useMemo(() => {
    const rows = result.data;
    const joiners = rows
      .filter((row) => {
        const age = daysSince(row.hire_date);
        return (
          row.status !== "terminated" && age !== null && age <= WINDOW_DAYS
        );
      })
      .sort((a, b) =>
        String(b.hire_date ?? "").localeCompare(String(a.hire_date ?? ""))
      );
    const leavers = rows.filter((row) => row.status === "terminated");
    const incomplete = joiners.filter((row) =>
      readiness(row).some((item) => !item.done)
    ).length;
    return {
      joiners,
      leavers,
      summary: {
        last30: rows.filter((row) => {
          const age = daysSince(row.hire_date);
          return row.status !== "terminated" && age !== null && age <= 30;
        }).length,
        last90: joiners.length,
        incomplete,
        leavers: leavers.length,
      },
    };
  }, [result.data]);

  const term = search.trim().toLowerCase();
  const rows = (stage === "onboarding" ? joiners : leavers).filter(
    (row) =>
      !term ||
      (row.name ?? "").toLowerCase().includes(term) ||
      (row.job_title ?? "").toLowerCase().includes(term)
  );

  const checklistLabels: Record<string, string> = {
    profile: translate(
      "hr.lifecycle.check.profile",
      { ns: "starter" },
      "Job title set"
    ),
    email: translate("hr.lifecycle.check.email", { ns: "starter" }, "Work email"),
    department: translate(
      "hr.lifecycle.check.department",
      { ns: "starter" },
      "Team assigned"
    ),
    manager: translate(
      "hr.lifecycle.check.manager",
      { ns: "starter" },
      "Manager assigned"
    ),
  };

  const kpiItems = [
    {
      key: "last30",
      label: translate("hr.lifecycle.kpi.last30", { ns: "starter" }, "Joined in 30 days"),
      value: String(summary.last30),
      hint: translate("hr.lifecycle.kpi.last30Hint", { ns: "starter" }, "Still settling in"),
      icon: <UserPlus className="size-4" />,
      tone: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-400",
    },
    {
      key: "last90",
      label: translate("hr.lifecycle.kpi.last90", { ns: "starter" }, "Joined in 90 days"),
      value: String(summary.last90),
      hint: translate("hr.lifecycle.kpi.last90Hint", { ns: "starter" }, "In onboarding"),
      icon: <Users className="size-4" />,
      tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
      active: stage === "onboarding",
      onClick: () => setStage("onboarding"),
    },
    {
      key: "incomplete",
      label: translate(
        "hr.lifecycle.kpi.incomplete",
        { ns: "starter" },
        "Setup incomplete"
      ),
      value: String(summary.incomplete),
      hint: translate(
        "hr.lifecycle.kpi.incompleteHint",
        { ns: "starter" },
        "Missing team, manager or email"
      ),
      icon: <UserX className="size-4" />,
      tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
    },
    {
      key: "leavers",
      label: translate("hr.lifecycle.kpi.leavers", { ns: "starter" }, "Leavers"),
      value: String(summary.leavers),
      hint: translate("hr.lifecycle.kpi.leaversHint", { ns: "starter" }, "Terminated on file"),
      icon: <LogOut className="size-4" />,
      tone: "text-red-600 bg-red-500/12 dark:text-red-400",
      active: stage === "offboarding",
      onClick: () => setStage("offboarding"),
    },
  ];

  const handleExport = () =>
    downloadCsv(
      `${stage}-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        translate("hr.employees.fields.name", { ns: "starter" }, "Name"),
        translate("hr.employees.fields.title", { ns: "starter" }, "Title"),
        translate("hr.employees.fields.department", { ns: "starter" }, "Department"),
        translate("hr.employees.fields.manager", { ns: "starter" }, "Manager"),
        translate("hr.employees.fields.hireDate", { ns: "starter" }, "Hire date"),
      ],
      rows.map((row) => [
        row.name,
        row.job_title,
        row.department?.name,
        row.manager?.name,
        row.hire_date ? String(row.hire_date).slice(0, 10) : "",
      ])
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center text-muted-foreground">
          <Breadcrumb />
        </div>
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.035em]">
            {translate("hr.lifecycle.title", { ns: "starter" }, "Joiners & leavers")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {translate(
              "hr.lifecycle.subtitle",
              { ns: "starter" },
              "Everyone who started in the last 90 days, what their setup still needs, and who has left."
            )}
          </p>
        </div>
      </div>

      <KpiBar items={kpiItems} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={stage} onValueChange={(value) => setStage(value as Stage)}>
          <TabsList>
            <TabsTrigger value="onboarding">
              <UserPlus className="size-3.5" />
              {translate("hr.lifecycle.tab.onboarding", { ns: "starter" }, "Onboarding")}
            </TabsTrigger>
            <TabsTrigger value="offboarding">
              <LogOut className="size-3.5" />
              {translate("hr.lifecycle.tab.offboarding", { ns: "starter" }, "Offboarding")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarSearch i18nPrefix="hr.toolkit" value={search} onChange={setSearch} />
          <ExportCsvButton i18nPrefix="hr.toolkit" onExport={handleExport} />
        </div>
      </div>

      {query.isError ? (
        <ErrorState i18nPrefix="hr.toolkit" onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <LoadingState className="min-h-64" />
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            stage === "onboarding"
              ? translate(
                  "hr.lifecycle.empty.onboarding",
                  { ns: "starter" },
                  "Nobody joined in the last 90 days"
                )
              : translate(
                  "hr.lifecycle.empty.offboarding",
                  { ns: "starter" },
                  "No leavers on file"
                )
          }
          description={translate(
            "hr.lifecycle.empty.description",
            { ns: "starter" },
            "New hires appear here automatically once their hire date is recorded."
          )}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((employee) => {
            const checks = readiness(employee);
            const done = checks.filter((check) => check.done).length;
            const age = daysSince(employee.hire_date);
            return (
              <Card key={String(employee.id)} className="flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="truncate text-left text-primary underline-offset-2 hover:underline"
                      onClick={() => navigate(`/employees/show/${employee.id}`)}
                    >
                      {employee.name || "—"}
                    </button>
                    <EnumBadge
                      value={employee.status ?? "active"}
                      label={labelFor(
                        EMPLOYEE_STATUSES,
                        employee.status ?? "active",
                        translate
                      )}
                    />
                  </CardTitle>
                  <CardDescription className="truncate">
                    {employee.job_title || "—"}
                    {employee.department?.name ? ` · ${employee.department.name}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3">
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {translate(
                      "hr.employees.fields.hireDate",
                      { ns: "starter" },
                      "Hire date"
                    )}
                    : {formatDate(employee.hire_date, locale)}
                    {age !== null && stage === "onboarding"
                      ? ` · ${translate(
                          "hr.lifecycle.dayCount",
                          { ns: "starter", count: age },
                          `day ${age}`
                        )}`
                      : ""}
                  </p>

                  {stage === "onboarding" ? (
                    <>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            done === checks.length
                              ? "bg-emerald-500"
                              : "bg-amber-500"
                          )}
                          style={{ width: `${(done / checks.length) * 100}%` }}
                        />
                      </div>
                      <ul className="space-y-1.5">
                        {checks.map((check) => (
                          <li
                            key={check.key}
                            className={cn(
                              "flex items-center gap-2 text-sm",
                              check.done
                                ? "text-muted-foreground line-through"
                                : "font-medium"
                            )}
                          >
                            {check.done ? (
                              <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <Circle className="size-4 shrink-0 text-muted-foreground" />
                            )}
                            {checklistLabels[check.key]}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <dl className="space-y-1 text-sm">
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">
                          {translate(
                            "hr.employees.fields.manager",
                            { ns: "starter" },
                            "Manager"
                          )}
                        </dt>
                        <dd className="truncate font-medium">
                          {employee.manager?.name || "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">
                          {translate(
                            "hr.employees.fields.email",
                            { ns: "starter" },
                            "Email"
                          )}
                        </dt>
                        <dd className="truncate font-medium">
                          {employee.email || "—"}
                        </dd>
                      </div>
                    </dl>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
