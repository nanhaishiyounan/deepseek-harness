import { useList, useTranslate } from "@refinedev/core";
import {
  Building2,
  Calculator,
  ChevronRight,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  Trash2,
  UserRoundX,
  Users,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { CanAccess } from "@/components/access-control/can-access";
import { AccessDenied } from "@/components/access-control/access-denied";
import { Breadcrumb } from "@/components/app-shell/breadcrumb";
import { LoadingState } from "@/components/app-shell/loading-state";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { hrRoutes } from "../routes";
import {
  downloadCsv,
  EmptyState,
  ErrorState,
  ExportCsvButton,
  KpiBar,
  Toolbar,
  ToolbarSearch,
} from "@/lib/table-kit";
import type { DepartmentRecord, EmployeeRecord } from "../types";

type TreeNode = DepartmentRecord & {
  children: TreeNode[];
  depth: number;
  direct: number;
  total: number;
  parentName: string | null;
};

export function DepartmentsLayout() {
  return (
    <CanAccess
      resource="hub_hr_departments"
      action="list"
      fallback={<AccessDenied />}
    >
      <DepartmentTree />
    </CanAccess>
  );
}

function DepartmentTree() {
  const translate = useTranslate();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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

  const employeeSummary = useMemo(() => {
    const directByDept = new Map<string, number>();
    let unassigned = 0;
    for (const employee of empResult.data) {
      if (employee.status === "terminated") continue;
      const key =
        employee.department_id != null ? String(employee.department_id) : "";
      if (!key) {
        unassigned += 1;
        continue;
      }
      directByDept.set(key, (directByDept.get(key) ?? 0) + 1);
    }
    return { directByDept, unassigned };
  }, [empResult.data]);

  const roots = useMemo(
    () => buildTree(deptResult.data, employeeSummary.directByDept),
    [deptResult.data, employeeSummary.directByDept]
  );

  const flatNodes = useMemo(() => flattenTree(roots), [roots]);
  const term = search.trim().toLowerCase();
  const matched = useMemo(() => {
    if (!term) return null;
    const ids = new Set<string>();
    collectMatches(roots, term, ids);
    return ids;
  }, [roots, term]);
  const visibleRoots = useMemo(
    () => roots.filter((root) => !matched || matched.has(String(root.id))),
    [matched, roots]
  );

  const largestTeam = useMemo(
    () =>
      flatNodes.reduce<TreeNode | null>(
        (largest, node) => (!largest || node.total > largest.total ? node : largest),
        null
      ),
    [flatNodes]
  );
  const populatedTeams = flatNodes.filter((node) => node.total > 0);
  const averageTeamSize = populatedTeams.length
    ? Math.round(
        populatedTeams.reduce((sum, node) => sum + node.total, 0) /
          populatedTeams.length
      )
    : 0;

  const toggle = useCallback((id: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const collapseAll = () => {
    setCollapsed(
      new Set(
        flatNodes
          .filter((node) => node.children.length > 0)
          .map((node) => String(node.id))
      )
    );
  };

  const exportCsv = () => {
    downloadCsv(
      "departments.csv",
      [
        translate(
          "hr.departments.export.department",
          { ns: "starter" },
          "Department"
        ),
        translate("hr.departments.fields.code", { ns: "starter" }, "Code"),
        translate(
          "hr.departments.export.parent",
          { ns: "starter" },
          "Parent"
        ),
        translate(
          "hr.departments.export.directHeadcount",
          { ns: "starter" },
          "Direct headcount"
        ),
        translate(
          "hr.departments.export.totalHeadcount",
          { ns: "starter" },
          "Total headcount"
        ),
      ],
      flatNodes.map((node) => [
        node.name ?? "",
        node.code ?? "",
        node.parentName ?? "",
        node.direct,
        node.total,
      ])
    );
  };

  const loading = deptQuery.isLoading || empQuery.isLoading;
  const failed = deptQuery.isError || empQuery.isError;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center text-muted-foreground">
          <Breadcrumb />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.035em]">
              {translate("hr.departments.title", { ns: "starter" }, "Departments")}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {translate(
                "hr.departments.subtitle",
                { ns: "starter" },
                "The org structure — teams nested under their parent, with current headcount."
              )}
            </p>
          </div>
          <Button onClick={() => navigate(hrRoutes.departmentsCreate)}>
            <Plus />
            {translate("hr.departments.actions.add", { ns: "starter" }, "Add department")}
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
      ) : roots.length === 0 ? (
        <EmptyState
          title={translate(
            "hr.departments.empty.title",
            { ns: "starter" },
            "No departments yet"
          )}
          description={translate(
            "hr.departments.empty.description",
            { ns: "starter" },
            "Add your first team to start the org chart."
          )}
          icon={<Building2 className="size-8" />}
          action={
            <Button size="sm" onClick={() => navigate(hrRoutes.departmentsCreate)}>
              <Plus />
              {translate(
                "hr.departments.actions.add",
                { ns: "starter" },
                "Add department"
              )}
            </Button>
          }
        />
      ) : (
        <>
          <KpiBar
            items={[
              {
                key: "departments",
                label: translate(
                  "hr.departments.kpi.departments",
                  { ns: "starter" },
                  "Departments"
                ),
                value: String(flatNodes.length),
                icon: <Building2 className="size-4" />,
                tone: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
              },
              {
                key: "largest",
                label: translate(
                  "hr.departments.kpi.largestTeam",
                  { ns: "starter" },
                  "Largest team"
                ),
                value: String(largestTeam?.total ?? 0),
                hint: largestTeam?.name || "—",
                icon: <Users className="size-4" />,
                tone: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
              },
              {
                key: "unassigned",
                label: translate(
                  "hr.departments.kpi.unassigned",
                  { ns: "starter" },
                  "Unassigned people"
                ),
                value: String(employeeSummary.unassigned),
                icon: <UserRoundX className="size-4" />,
                tone: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
              },
              {
                key: "average",
                label: translate(
                  "hr.departments.kpi.averageTeamSize",
                  { ns: "starter" },
                  "Average team size"
                ),
                value: String(averageTeamSize),
                icon: <Calculator className="size-4" />,
                tone: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
              },
            ]}
          />

          <Toolbar>
            <ToolbarSearch i18nPrefix="hr.toolkit"
              value={search}
              onChange={setSearch}
              placeholder={translate(
                "hr.departments.search",
                { ns: "starter" },
                "Find a department or code..."
              )}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCollapsed(new Set())}
              >
                <Maximize2 className="size-4" />
                {translate(
                  "hr.departments.actions.expandAll",
                  { ns: "starter" },
                  "Expand all"
                )}
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll}>
                <Minimize2 className="size-4" />
                {translate(
                  "hr.departments.actions.collapseAll",
                  { ns: "starter" },
                  "Collapse all"
                )}
              </Button>
              <ExportCsvButton i18nPrefix="hr.toolkit" onExport={exportCsv} />
            </div>
          </Toolbar>

          <Card>
            <CardContent className="p-2 sm:p-3">
              {visibleRoots.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  {translate(
                    "hr.departments.noMatches",
                    { ns: "starter" },
                    "No departments match that search."
                  )}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {visibleRoots.map((node) => (
                    <TreeRow
                      key={String(node.id)}
                      node={node}
                      matched={matched}
                      term={term}
                      collapsed={collapsed}
                      onToggle={toggle}
                      onEdit={(id) => navigate(`/departments/edit/${id}`)}
                      onShow={(id) => navigate(`/departments/show/${id}`)}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function TreeRow({
  node,
  matched,
  term,
  collapsed,
  onToggle,
  onEdit,
  onShow,
}: {
  node: TreeNode;
  matched: Set<string> | null;
  term: string;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onEdit: (id: string | number) => void;
  onShow: (id: string | number) => void;
}) {
  const translate = useTranslate();
  const id = String(node.id);
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(id);
  const isHit =
    term.length > 0 &&
    ((node.name ?? "").toLowerCase().includes(term) ||
      (node.code ?? "").toLowerCase().includes(term));

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-lg py-2 pr-2 hover:bg-accent/60",
          isHit && "border-primary/60 ring-1 ring-primary/25"
        )}
        style={{ paddingLeft: node.depth * 20 + 4 }}
      >
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
          <ChevronRight
            className={cn(
              "size-4 transition-transform",
              !isCollapsed && hasChildren && "rotate-90"
            )}
          />
        </button>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/12 text-blue-600 dark:text-blue-400">
          <Building2 className="size-4" />
        </span>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => onShow(node.id)}
        >
          <span className="truncate text-sm font-medium text-primary underline-offset-2 hover:underline">
            {node.name}
          </span>
          {node.code ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {node.code}
            </span>
          ) : null}
        </button>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {node.direct}{" "}
          {node.direct === 1
            ? translate("hr.departments.tree.person", { ns: "starter" }, "person")
            : translate("hr.departments.tree.people", { ns: "starter" }, "people")}
          {hasChildren ? (
            <span className="ml-1 text-muted-foreground/70">
              (
              {translate(
                "hr.departments.tree.total",
                { ns: "starter", count: node.total },
                `${node.total} in tree`
              )}
              )
            </span>
          ) : null}
        </span>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            title={translate("hr.common.edit", { ns: "starter" }, "Edit")}
            onClick={() => onEdit(node.id)}
          >
            <Pencil />
          </Button>
          <DeleteButton
            resource="hub_hr_departments"
            recordItemId={node.id}
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 />
          </DeleteButton>
        </div>
      </div>
      {hasChildren && !isCollapsed ? (
        <ul className="space-y-0.5">
          {node.children
            .filter((child) => !matched || matched.has(String(child.id)))
            .map((child) => (
              <TreeRow
                key={String(child.id)}
                node={child}
                matched={matched}
                term={term}
                collapsed={collapsed}
                onToggle={onToggle}
                onEdit={onEdit}
                onShow={onShow}
              />
            ))}
        </ul>
      ) : null}
    </li>
  );
}

function buildTree(
  rows: DepartmentRecord[],
  directByDept: Map<string, number>
): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const row of rows) {
    byId.set(String(row.id), {
      ...row,
      children: [],
      depth: 0,
      direct: directByDept.get(String(row.id)) ?? 0,
      total: 0,
      parentName: null,
    });
  }
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.parentId != null ? String(node.parentId) : null;
    const parent = parentId ? byId.get(parentId) : null;
    if (parent) {
      node.parentName = parent.name ?? null;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const finalize = (node: TreeNode, depth: number): number => {
    node.depth = depth;
    node.children.sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "")
    );
    node.total = node.children.reduce(
      (total, child) => total + finalize(child, depth + 1),
      node.direct
    );
    return node.total;
  };
  roots.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  roots.forEach((root) => finalize(root, 0));
  return roots;
}

function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const flat: TreeNode[] = [];
  const visit = (items: TreeNode[]) => {
    for (const item of items) {
      flat.push(item);
      visit(item.children);
    }
  };
  visit(nodes);
  return flat;
}

function collectMatches(
  nodes: TreeNode[],
  term: string,
  matched: Set<string>
): boolean {
  let any = false;
  for (const node of nodes) {
    const self =
      (node.name ?? "").toLowerCase().includes(term) ||
      (node.code ?? "").toLowerCase().includes(term);
    const child = collectMatches(node.children, term, matched);
    if (self || child) {
      matched.add(String(node.id));
      any = true;
    }
  }
  return any;
}
