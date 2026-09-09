import { useList, useTranslate } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FolderTree, Layers } from "lucide-react";
import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { nocobaseClient } from "@nocobase/portal-sdk/client";
import { cn } from "@/lib/utils";
import type { CategoryNode, CategoryRecord } from "./types";

type AggregateRow = Record<string, string | number | null>;

/** Fetch all categories + per-category article counts, build a rolled-up tree. */
export function useCategoryTree() {
  const categories = useList<CategoryRecord>({
    resource: "hub_kb_categories",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    sorters: [{ field: "name", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const counts = useQuery({
    queryKey: ["knowledge", "category-counts"],
    queryFn: async () => {
      const rows = await nocobaseClient.action<AggregateRow[]>(
        "hub_kb_articles",
        "query",
        {
          body: {
            measures: [{ field: ["id"], aggregation: "count", alias: "count" }],
            dimensions: [{ field: ["category_id"], alias: "category_id" }],
          },
        }
      );
      const map = new Map<string, number>();
      for (const row of rows ?? []) {
        if (row.category_id != null) {
          map.set(String(row.category_id), Number(row.count ?? 0));
        }
      }
      return map;
    },
  });

  const { tree, total } = useMemo(() => {
    const records = categories.result.data ?? [];
    const directCount = counts.data ?? new Map<string, number>();

    const byId = new Map<string, CategoryNode>();
    for (const record of records) {
      byId.set(String(record.id), {
        ...record,
        children: [],
        descendantIds: [String(record.id)],
        articleCount: directCount.get(String(record.id)) ?? 0,
      });
    }

    const roots: CategoryNode[] = [];
    for (const node of byId.values()) {
      const parentId = node.parent_id != null ? String(node.parent_id) : null;
      const parent = parentId ? byId.get(parentId) : null;
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    // Roll descendant ids + counts up to ancestors (children already summed
    // once parents collect them recursively).
    const rollUp = (node: CategoryNode): void => {
      for (const child of node.children) {
        rollUp(child);
        node.descendantIds.push(...child.descendantIds);
        node.articleCount += child.articleCount;
      }
    };
    roots.forEach(rollUp);

    const sortRecursive = (nodes: CategoryNode[]): void => {
      nodes.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
      nodes.forEach((node) => sortRecursive(node.children));
    };
    sortRecursive(roots);

    const totalCount = Array.from(directCount.values()).reduce(
      (sum, value) => sum + value,
      0
    );
    return { tree: roots, total: totalCount };
  }, [categories.result.data, counts.data]);

  return {
    tree,
    total,
    isLoading: categories.query.isLoading || counts.isLoading,
  };
}

type CategoryTreeFilterProps = {
  tree: CategoryNode[];
  total: number;
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

export function CategoryTreeFilter({
  tree,
  total,
  isLoading,
  selectedId,
  onSelect,
}: CategoryTreeFilterProps) {
  const translate = useTranslate();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  return (
    <nav className="space-y-0.5">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
          selectedId === null
            ? "bg-primary/10 font-medium text-primary"
            : "text-foreground hover:bg-accent"
        )}
      >
        <span className="flex items-center gap-2">
          <Layers className="size-4" />
          {translate("knowledge.tree.all", { ns: "starter" }, "All articles")}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {total}
        </span>
      </button>
      {tree.map((node) => (
        <CategoryTreeItem
          key={String(node.id)}
          node={node}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </nav>
  );
}

function CategoryTreeItem({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: CategoryNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const translate = useTranslate();
  const hasChildren = node.children.length > 0;
  const [open, setOpen] = useState(true);
  const isSelected = selectedId === String(node.id);
  const untitled = translate(
    "knowledge.common.untitled",
    { ns: "starter" },
    "Untitled"
  );

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 rounded-lg pr-2 transition-colors",
          isSelected ? "bg-primary/10" : "hover:bg-accent"
        )}
        style={{ paddingLeft: depth * 12 }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={
              open
                ? translate("knowledge.tree.collapse", { ns: "starter" }, "Collapse")
                : translate("knowledge.tree.expand", { ns: "starter" }, "Expand")
            }
            onClick={() => setOpen((value) => !value)}
            className="flex size-6 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform",
                open && "rotate-90"
              )}
            />
          </button>
        ) : (
          <span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground/60">
            <FolderTree className="size-3.5" />
          </span>
        )}
        <button
          type="button"
          onClick={() => onSelect(String(node.id))}
          className={cn(
            "flex min-w-0 flex-1 items-center justify-between gap-2 py-2 text-left text-sm",
            isSelected ? "font-medium text-primary" : "text-foreground"
          )}
        >
          <span className="truncate">{node.name || untitled}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {node.articleCount}
          </span>
        </button>
      </div>
      {hasChildren && open ? (
        <div className="space-y-0.5">
          {node.children.map((child) => (
            <CategoryTreeItem
              key={String(child.id)}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Flatten the tree into indented options for a <select>-style parent picker. */
export function flattenForSelect(
  nodes: CategoryNode[],
  untitled = "Untitled",
  depth = 0
): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  for (const node of nodes) {
    out.push({
      id: String(node.id),
      label: `${"  ".repeat(depth)}${node.name ?? untitled}`,
    });
    out.push(...flattenForSelect(node.children, untitled, depth + 1));
  }
  return out;
}

/** Find the ids to filter by when a category is selected (self + descendants). */
export function descendantIdsOf(
  tree: CategoryNode[],
  categoryId: string
): string[] {
  const stack = [...tree];
  while (stack.length) {
    const node = stack.pop()!;
    if (String(node.id) === categoryId) {
      return node.descendantIds;
    }
    stack.push(...node.children);
  }
  return [categoryId];
}
