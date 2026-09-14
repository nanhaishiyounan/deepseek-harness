import { useList, useTranslate } from "@refinedev/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Eye,
  Folder,
  FolderOpen,
  Gauge,
  Layers3,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router";
import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { Breadcrumb } from "@/components/app-shell/breadcrumb";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCategoryTree } from "../category-tree";
import {
  getCategoryEditPath,
  getCategoryShowPath,
  knowledgeRoutes,
} from "../routes";
import {
  downloadCsv,
  EmptyState,
  ErrorState,
  ExportCsvButton,
  KpiBar,
  Toolbar,
  ToolbarSearch,
} from "@/lib/table-kit";
import type { CategoryNode, CategoryRecord } from "../types";

type FlatCategory = {
  node: CategoryNode;
  parent: CategoryNode | null;
  depth: number;
  directCount: number;
};

const directArticleCount = (node: CategoryNode) =>
  Math.max(
    0,
    node.articleCount -
      node.children.reduce((sum, child) => sum + child.articleCount, 0)
  );

function flattenCategories(
  nodes: CategoryNode[],
  parent: CategoryNode | null = null,
  depth = 0
): FlatCategory[] {
  return nodes.flatMap((node) => [
    { node, parent, depth, directCount: directArticleCount(node) },
    ...flattenCategories(node.children, node, depth + 1),
  ]);
}

function collectMatches(
  nodes: CategoryNode[],
  term: string,
  visible: Set<string>,
  hits: Set<string>
): boolean {
  let any = false;
  for (const node of nodes) {
    const id = String(node.id);
    const self =
      (node.name ?? "").toLowerCase().includes(term) ||
      (node.description ?? "").toLowerCase().includes(term);
    const child = collectMatches(node.children, term, visible, hits);
    if (self) hits.add(id);
    if (self || child) {
      visible.add(id);
      any = true;
    }
  }
  return any;
}

export function CategoriesLayout() {
  return (
    <CanAccess
      resource="hub_kb_categories"
      action="list"
      fallback={<AccessDenied />}
    >
      <CategoriesTree />
    </CanAccess>
  );
}

function CategoriesTree() {
  const translate = useTranslate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { tree, total, isLoading } = useCategoryTree();

  // This observer shares the category query used by useCategoryTree and exposes
  // its error/refetch state without duplicating the tree-building logic.
  const categoryStatus = useList<CategoryRecord>({
    resource: "hub_kb_categories",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    sorters: [{ field: "name", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const flat = useMemo(() => flattenCategories(tree), [tree]);
  const term = search.trim().toLowerCase();
  const { visible, hits } = useMemo(() => {
    if (!term) return { visible: null, hits: new Set<string>() };
    const nextVisible = new Set<string>();
    const nextHits = new Set<string>();
    collectMatches(tree, term, nextVisible, nextHits);
    return { visible: nextVisible, hits: nextHits };
  }, [term, tree]);

  const emptyCategories = flat.filter(
    ({ node }) => node.articleCount === 0
  ).length;
  const largestDirectCount = flat.reduce(
    (largest, item) => Math.max(largest, item.directCount),
    0
  );
  const average = flat.length > 0 ? total / flat.length : 0;
  const countQueryState = queryClient.getQueryState([
    "knowledge",
    "category-counts",
  ]);
  const failed =
    categoryStatus.query.isError || countQueryState?.status === "error";

  const toggle = useCallback((id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const collapseAll = () =>
    setCollapsed(
      new Set(
        flat
          .filter(({ node }) => node.children.length > 0)
          .map(({ node }) => String(node.id))
      )
    );

  const handleExport = useCallback(() => {
    const untitled = translate(
      "knowledge.common.untitled",
      { ns: "starter" },
      "Untitled"
    );
    downloadCsv(
      translate(
        "knowledge.categories.export.filename",
        { ns: "starter" },
        "knowledge-categories.csv"
      ),
      [
        translate(
          "knowledge.categories.export.category",
          { ns: "starter" },
          "Category"
        ),
        translate(
          "knowledge.categories.export.parent",
          { ns: "starter" },
          "Parent"
        ),
        translate(
          "knowledge.categories.export.description",
          { ns: "starter" },
          "Description"
        ),
        translate(
          "knowledge.categories.export.directArticles",
          { ns: "starter" },
          "Direct articles"
        ),
        translate(
          "knowledge.categories.export.treeArticles",
          { ns: "starter" },
          "Articles in tree"
        ),
      ],
      flat.map(({ node, parent, directCount }) => [
        node.name || untitled,
        parent?.name ?? "",
        node.description ?? "",
        directCount,
        node.articleCount,
      ])
    );
  }, [flat, translate]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center text-muted-foreground">
          <Breadcrumb />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.035em]">
              {translate(
                "knowledge.categories.title",
                { ns: "starter" },
                "Categories"
              )}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {translate(
                "knowledge.categories.subtitle",
                { ns: "starter", count: total },
                `The topic tree that organizes ${total} articles. Nest categories to build up to two levels.`
              )}
            </p>
          </div>
          <Button
            nativeButton={false}
            render={<Link to={knowledgeRoutes.categoriesCreate} />}
          >
            <Plus />
            {translate(
              "knowledge.categories.new",
              { ns: "starter" },
              "New category"
            )}
          </Button>
        </div>
      </div>

      <KpiBar
        items={[
          {
            key: "categories",
            label: translate(
              "knowledge.categories.kpi.categories",
              { ns: "starter" },
              "Categories"
            ),
            value: String(flat.length),
            icon: <Folder className="size-4" />,
          },
          {
            key: "roots",
            label: translate(
              "knowledge.categories.kpi.roots",
              { ns: "starter" },
              "Top-level topics"
            ),
            value: String(tree.length),
            icon: <Layers3 className="size-4" />,
          },
          {
            key: "empty",
            label: translate(
              "knowledge.categories.kpi.empty",
              { ns: "starter" },
              "Empty categories"
            ),
            value: String(emptyCategories),
            hint: translate(
              "knowledge.categories.kpi.empty.hint",
              { ns: "starter" },
              "Content gaps"
            ),
            icon: <TriangleAlert className="size-4" />,
            tone: "bg-red-500/15 text-red-700 dark:text-red-300",
          },
          {
            key: "average",
            label: translate(
              "knowledge.categories.kpi.average",
              { ns: "starter" },
              "Articles per category"
            ),
            value: average.toFixed(1),
            icon: <Gauge className="size-4" />,
          },
        ]}
      />

      <Toolbar>
        <ToolbarSearch i18nPrefix="knowledge.toolkit"
          value={search}
          onChange={setSearch}
          placeholder={translate(
            "knowledge.categories.search",
            { ns: "starter" },
            "Search categories..."
          )}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCollapsed(new Set())}
          >
            <Maximize2 />
            {translate(
              "knowledge.categories.expandAll",
              { ns: "starter" },
              "Expand all"
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            <Minimize2 />
            {translate(
              "knowledge.categories.collapseAll",
              { ns: "starter" },
              "Collapse all"
            )}
          </Button>
          <ExportCsvButton i18nPrefix="knowledge.toolkit" onExport={handleExport} />
        </div>
      </Toolbar>

      {failed ? (
        <ErrorState i18nPrefix="knowledge.toolkit"
          onRetry={() => {
            void categoryStatus.query.refetch();
            void queryClient.refetchQueries({
              queryKey: ["knowledge", "category-counts"],
            });
          }}
        />
      ) : isLoading || categoryStatus.query.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : tree.length === 0 ? (
        <EmptyState
          icon={<Folder className="size-8" />}
          title={translate(
            "knowledge.categories.empty.title",
            { ns: "starter" },
            "No categories yet"
          )}
          description={translate(
            "knowledge.categories.empty.description",
            { ns: "starter" },
            "Create your first category to start organizing articles."
          )}
          action={
            <Button
              nativeButton={false}
              render={<Link to={knowledgeRoutes.categoriesCreate} />}
            >
              <Plus />
              {translate(
                "knowledge.categories.new",
                { ns: "starter" },
                "New category"
              )}
            </Button>
          }
        />
      ) : visible && visible.size === 0 ? (
        <EmptyState
          icon={<Folder className="size-8" />}
          title={translate(
            "knowledge.categories.search.empty.title",
            { ns: "starter" },
            "No categories found"
          )}
          description={translate(
            "knowledge.categories.search.empty.description",
            { ns: "starter" },
            "Try a different name or description."
          )}
        />
      ) : (
        <Card>
          <CardContent className="p-2 sm:p-3">
            <ul className="space-y-0.5">
              {tree
                .filter((node) => !visible || visible.has(String(node.id)))
                .map((node) => (
                  <CategoryTreeRow
                    key={String(node.id)}
                    node={node}
                    depth={0}
                    visible={visible}
                    hits={hits}
                    term={term}
                    collapsed={collapsed}
                    largestDirectCount={largestDirectCount}
                    onToggle={toggle}
                  />
                ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CategoryTreeRow({
  node,
  depth,
  visible,
  hits,
  term,
  collapsed,
  largestDirectCount,
  onToggle,
}: {
  node: CategoryNode;
  depth: number;
  visible: Set<string> | null;
  hits: Set<string>;
  term: string;
  collapsed: Set<string>;
  largestDirectCount: number;
  onToggle: (id: string) => void;
}) {
  const translate = useTranslate();
  const id = String(node.id);
  const hasChildren = node.children.length > 0;
  const isCollapsed = !term && collapsed.has(id);
  const isHit = hits.has(id);
  const directCount = directArticleCount(node);
  const width =
    largestDirectCount > 0 ? (directCount / largestDirectCount) * 100 : 0;
  const untitled = translate(
    "knowledge.common.untitled",
    { ns: "starter" },
    "Untitled"
  );

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-lg py-2 pr-2 transition-colors hover:bg-accent/60",
          isHit && "bg-primary/5 ring-1 ring-primary/30"
        )}
        style={{ paddingLeft: depth * 20 + 4 }}
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
              ? translate(
                  "knowledge.categories.expand",
                  { ns: "starter" },
                  "Expand category"
                )
              : translate(
                  "knowledge.categories.collapse",
                  { ns: "starter" },
                  "Collapse category"
                )
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
          {hasChildren && !isCollapsed ? (
            <FolderOpen className="size-4" />
          ) : (
            <Folder className="size-4" />
          )}
        </span>
        <Link
          to={getCategoryShowPath(node.id)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-sm font-medium text-primary underline-offset-2 hover:underline">
            {node.name || untitled}
          </span>
          {node.description ? (
            <span className="block truncate text-xs text-muted-foreground">
              {node.description}
            </span>
          ) : null}
        </Link>
        <div className="hidden w-24 shrink-0 sm:block">
          <div
            aria-label={translate(
              "knowledge.categories.coverageBar",
              { ns: "starter", count: directCount },
              `Coverage: ${directCount} direct articles`
            )}
            className={cn(
              "h-1.5 overflow-hidden rounded-full",
              directCount === 0 ? "bg-amber-500/35" : "bg-muted"
            )}
          >
            <div
              className={cn(
                "h-full rounded-full",
                directCount === 0 ? "bg-amber-500" : "bg-blue-500"
              )}
              style={{ width: `${width}%` }}
            />
          </div>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {translate(
            "knowledge.categories.directArticles",
            { ns: "starter", count: directCount },
            `${directCount} direct`
          )}
          {hasChildren ? (
            <span className="ml-1 text-muted-foreground/75">
              {translate(
                "knowledge.categories.treeArticles",
                { ns: "starter", count: node.articleCount },
                `(${node.articleCount} in tree)`
              )}
            </span>
          ) : null}
        </span>
        <CategoryRowActions id={node.id} />
      </div>
      {hasChildren && !isCollapsed ? (
        <ul className="space-y-0.5">
          {node.children
            .filter((child) => !visible || visible.has(String(child.id)))
            .map((child) => (
              <CategoryTreeRow
                key={String(child.id)}
                node={child}
                depth={depth + 1}
                visible={visible}
                hits={hits}
                term={term}
                collapsed={collapsed}
                largestDirectCount={largestDirectCount}
                onToggle={onToggle}
              />
            ))}
        </ul>
      ) : null}
    </li>
  );
}

function CategoryRowActions({ id }: { id: string | number }) {
  return (
    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      <Button
        variant="ghost"
        size="icon"
        nativeButton={false}
        render={<Link to={getCategoryShowPath(id)} />}
      >
        <Eye />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        nativeButton={false}
        render={<Link to={getCategoryEditPath(id)} />}
      >
        <Pencil />
      </Button>
      <DeleteButton
        resource="hub_kb_categories"
        recordItemId={id}
        variant="ghost"
        size="icon"
        className="text-destructive hover:text-destructive"
      >
        <Trash2 />
      </DeleteButton>
    </div>
  );
}
