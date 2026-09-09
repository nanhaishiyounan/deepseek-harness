import type { CrudFilter } from "@refinedev/core";
import type { ReactNode } from "react";

/** Row density — persisted per list, like Salesforce's display density. */
export type GridDensity = "compact" | "comfortable";

export type ListSort = { field: string; order: "asc" | "desc" };

/**
 * A column descriptor. Deliberately plain data (no @tanstack coupling) so the
 * same definition drives rendering, the column-picker and the CSV export.
 */
export type GridColumn<TRecord> = {
  id: string;
  header: string;
  /** Backend field to sort by; omit to make the column unsortable. */
  sortField?: string;
  /** Fixed width, e.g. "12rem". */
  width?: string;
  align?: "left" | "right";
  /** Hidden until the user enables it in the column picker. */
  defaultHidden?: boolean;
  /** Never offered in the column picker (selection / row actions). */
  locked?: boolean;
  cell: (record: TRecord) => ReactNode;
  /** Plain-text projection used by the CSV export. */
  csv?: (record: TRecord) => string;
};

/** A facet dropdown in the toolbar (status, stage, owner, …). */
export type GridFacet = {
  field: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  /** Single-select facets emit `eq` instead of `in`. */
  single?: boolean;
};

/** A curated view shipped with the page ("My open deals", "Due this week"). */
export type BuiltInView = {
  id: string;
  label: string;
  filters?: CrudFilter[];
  sort?: ListSort;
  /** Shown as a count badge next to the chip when the view is not active. */
  describe?: string;
};

/** A view the user saved from the current filter/sort state. */
export type CustomView = {
  id: string;
  name: string;
  baseViewId: string;
  facets: Record<string, string[]>;
  search: string;
  sort: ListSort | null;
};
