import { useList, useTranslate } from "@refinedev/core";
import {
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  Network,
  Users,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Breadcrumb } from "@/components/app-shell/breadcrumb";
import { LoadingState } from "@/components/app-shell/loading-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { EMPLOYEE_STATUSES, labelFor } from "./constants";
import { EnumBadge } from "./shared";
import { ErrorState, ToolbarSearch } from "@/lib/table-kit";
import type { DepartmentRecord, EmployeeRecord } from "./types";

type EmpNode = EmployeeRecord & { children: EmpNode[]; reportCount: number };

// Builds a reporting-line tree from a flat list of employees (manager_id ->
// children), restricted to the employees passed in (usually one department's
// worth). Employees whose manager isn't in the same set become roots.
function buildReportingTree(employees: EmployeeRecord[]): EmpNode[] {
  const byId = new Map<string, EmpNode>();
  for (const employee of employees) {
    byId.set(String(employee.id), {
      ...employee,
      children: [],
      reportCount: 0,
    });
  }
  const roots: EmpNode[] = [];
  for (const node of byId.values()) {
    const managerId = node.manager_id != null ? String(node.manager_id) : null;
    const manager = managerId ? byId.get(managerId) : null;
    if (manager) {
      manager.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const byName = (a: EmpNode, b: EmpNode) =>
    (a.name ?? "").localeCompare(b.name ?? "");
  // Depth-first so a manager's badge can show its whole sub-tree size.
  const countReports = (node: EmpNode): number => {
    node.children.sort(byName);
    node.reportCount = node.children.reduce(
      (total, child) => total + 1 + countReports(child),
      0
    );
    return node.reportCount;
  };
  roots.sort(byName);
  roots.forEach(countReports);
  return roots;
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Ids of every node on a path that contains a search hit. */
function collectMatches(
  nodes: EmpNode[],
  term: string,
  matched: Set<string>
): boolean {
  let any = false;
  for (const node of nodes) {
    const self =
      (node.name ?? "").toLowerCase().includes(term) ||
      (node.job_title ?? "").toLowerCase().includes(term);
    const child = collectMatches(node.children, term, matched);
    if (self || child) {
      matched.add(String(node.id));
      any = true;
    }
  }
  return any;
}

export function OrgChartPage() {
  const translate = useTranslate();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [departmentFilter, setDepartmentFilter] = useState("");

  const { result: deptResult, query: deptQuery } = useList<DepartmentRecord>({
    resource: "hub_hr_departments",
    pagination: { mode: "server", currentPage: 1, pageSize: 300 },
    sorters: [{ field: "name", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const { result: empResult, query: empQuery } = useList<EmployeeRecord>({
    resource: "hub_hr_employees",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const loading = deptQuery.isLoading || empQuery.isLoading;
  const failed = deptQuery.isError || empQuery.isError;

  const sections = useMemo(() => {
    const byDept = new Map<string, EmployeeRecord[]>();
    const unassigned: EmployeeRecord[] = [];
    for (const employee of empResult.data) {
      const key =
        employee.department_id != null ? String(employee.department_id) : "";
      if (!key) {
        unassigned.push(employee);
        continue;
      }
      const bucket = byDept.get(key) ?? [];
      bucket.push(employee);
      byDept.set(key, bucket);
    }
    const deptSections = [...deptResult.data]
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
      .map((dept) => ({
        key: String(dept.id),
        name: dept.name || "—",
        code: dept.code || null,
        roots: buildReportingTree(byDept.get(String(dept.id)) ?? []),
        size: (byDept.get(String(dept.id)) ?? []).length,
      }))
      .filter((section) => section.size > 0);
    return {
      deptSections,
      unassigned: {
        key: "",
        name: translate("hr.stats.unassigned", { ns: "starter" }, "Unassigned"),
        code: null,
        roots: buildReportingTree(unassigned),
        size: unassigned.length,
      },
    };
  }, [deptResult.data, empResult.data, translate]);

  const term = search.trim().toLowerCase();

  const visibleSections = useMemo(() => {
    const all = [...sections.deptSections];
    if (sections.unassigned.size > 0) all.push(sections.unassigned);
    const scoped = departmentFilter
      ? all.filter((section) => section.key === departmentFilter)
      : all;
    if (!term) return scoped.map((section) => ({ section, matched: null }));
    return scoped
      .map((section) => {
        const matched = new Set<string>();
        collectMatches(section.roots, term, matched);
        return { section, matched };
      })
      .filter((entry) => entry.matched && entry.matched.size > 0);
  }, [departmentFilter, sections, term]);

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const collapseAll = () => {
    const ids = new Set<string>();
    const walk = (nodes: EmpNode[]) => {
      for (const node of nodes) {
        if (node.children.length > 0) ids.add(String(node.id));
        walk(node.children);
      }
    };
    visibleSections.forEach((entry) => walk(entry.section.roots));
    setCollapsed(ids);
  };

  const openEmployee = (id: string | number) => navigate(`/employees/show/${id}`);

  const totalPeople = visibleSections.reduce(
    (total, entry) => total + entry.section.size,
    0
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center text-muted-foreground">
          <Breadcrumb />
        </div>
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.035em]">
            {translate("hr.orgChart.title", { ns: "starter" }, "Org chart")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {translate(
              "hr.orgChart.subtitle",
              { ns: "starter" },
              "Who reports to whom, grouped by department. Click a person to open their profile."
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <ToolbarSearch i18nPrefix="hr.toolkit"
            value={search}
            onChange={setSearch}
            placeholder={translate(
              "hr.orgChart.search",
              { ns: "starter" },
              "Find a person or role..."
            )}
          />
          <select
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.currentTarget.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs"
          >
            <option value="">
              {translate(
                "hr.employees.allDepartments",
                { ns: "starter" },
                "All departments"
              )}
            </option>
            {sections.deptSections.map((section) => (
              <option key={section.key} value={section.key}>
                {section.name}
              </option>
            ))}
          </select>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
            <Users className="size-3.5" />
            {translate(
              "hr.orgChart.showing",
              { ns: "starter", count: totalPeople },
              `${totalPeople} people`
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCollapsed(new Set())}>
            <Maximize2 className="size-4" />
            {translate("hr.orgChart.expandAll", { ns: "starter" }, "Expand all")}
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            <Minimize2 className="size-4" />
            {translate("hr.orgChart.collapseAll", { ns: "starter" }, "Collapse all")}
          </Button>
        </div>
      </div>

      {failed ? (
        <ErrorState i18nPrefix="hr.toolkit"
          onRetry={() => {
            void deptQuery.refetch();
            void empQuery.refetch();
          }}
        />
      ) : loading ? (
        <LoadingState className="min-h-48" />
      ) : visibleSections.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {term
              ? translate(
                  "hr.orgChart.noMatches",
                  { ns: "starter" },
                  "No one matches that search."
                )
              : translate(
                  "hr.orgChart.empty",
                  { ns: "starter" },
                  "No employees on file yet."
                )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {visibleSections.map(({ section, matched }) => (
            <Card key={section.key || "unassigned"}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="size-4 text-blue-600 dark:text-blue-400" />
                  {section.name}
                  {section.code ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {section.code}
                    </span>
                  ) : null}
                  <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
                    {section.size}{" "}
                    {section.size === 1
                      ? translate("hr.departments.tree.person", { ns: "starter" }, "person")
                      : translate("hr.departments.tree.people", { ns: "starter" }, "people")}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <div className="flex flex-col gap-2">
                  {section.roots
                    .filter((root) => !matched || matched.has(String(root.id)))
                    .map((root) => (
                      <EmployeeNode
                        key={String(root.id)}
                        node={root}
                        matched={matched}
                        term={term}
                        collapsed={collapsed}
                        onToggle={toggle}
                        onOpen={openEmployee}
                        translate={translate}
                      />
                    ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function EmployeeNode({
  node,
  matched,
  term,
  collapsed,
  onToggle,
  onOpen,
  translate,
}: {
  node: EmpNode;
  matched: Set<string> | null;
  term: string;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string | number) => void;
  translate: ReturnType<typeof useTranslate>;
}) {
  const id = String(node.id);
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(id);
  const status = node.status ?? "active";
  const isHit =
    term.length > 0 &&
    ((node.name ?? "").toLowerCase().includes(term) ||
      (node.job_title ?? "").toLowerCase().includes(term));

  return (
    <div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => hasChildren && onToggle(id)}
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground",
            hasChildren ? "hover:bg-accent" : "opacity-0"
          )}
          aria-label={
            isCollapsed
              ? translate("hr.departments.tree.expand", { ns: "starter" }, "Expand")
              : translate("hr.departments.tree.collapse", { ns: "starter" }, "Collapse")
          }
        >
          {isCollapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onOpen(node.id)}
          className={cn(
            "group flex w-fit min-w-64 items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:border-primary/40 hover:shadow-sm",
            isHit && "border-primary/60 ring-1 ring-primary/25"
          )}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-500/12 text-xs font-semibold text-blue-600 dark:text-blue-400">
            {initials(node.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-primary underline-offset-2 group-hover:underline">
              {node.name || "—"}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {node.job_title || "—"}
            </span>
          </span>
          {node.reportCount > 0 ? (
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
              {translate(
                "hr.orgChart.reports",
                { ns: "starter", count: node.reportCount },
                `${node.reportCount} reports`
              )}
            </span>
          ) : null}
          <EnumBadge value={status} label={labelFor(EMPLOYEE_STATUSES, status, translate)} />
        </button>
      </div>
      {hasChildren && !isCollapsed ? (
        <div className="mt-2 ml-4 flex flex-col gap-2 border-l border-border/60 pl-5">
          {node.children
            .filter((child) => !matched || matched.has(String(child.id)))
            .map((child) => (
              <EmployeeNode
                key={String(child.id)}
                node={child}
                matched={matched}
                term={term}
                collapsed={collapsed}
                onToggle={onToggle}
                onOpen={onOpen}
                translate={translate}
              />
            ))}
        </div>
      ) : null}
    </div>
  );
}
