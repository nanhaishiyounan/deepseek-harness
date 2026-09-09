import { useList, type CrudFilter } from "@refinedev/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { publishVisibleIds } from "../record-nav";
import type {
  BuiltInView,
  CustomView,
  GridDensity,
  ListSort,
} from "./types";

const PREFIX = "hub.sales";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be full or blocked (private mode) — preferences are a
    // convenience, never a correctness requirement.
  }
}

export type UseSalesListOptions = {
  /** Stable key used for the localStorage preference namespace. */
  listId: string;
  resource: string;
  /** Field the quick-search box filters on (`contains`). */
  searchField: string;
  defaultSort: ListSort;
  views: BuiltInView[];
  /** Relations to append on every request. */
  appends?: string[];
  /** Columns hidden by default, by column id. */
  initiallyHidden?: string[];
};

/**
 * Owns everything a production list page needs: paging, server sorting, facet
 * filters, quick search, saved views, column visibility, density, selection —
 * plus URL round-tripping so a filtered list can be pasted into chat, and
 * localStorage persistence so the layout survives a reload.
 *
 * Deliberately built on `useList` rather than `@refinedev/react-table` so the
 * same descriptors drive the grid, the column picker and the CSV export.
 */
export function useSalesList<TRecord extends { id: string | number }>({
  listId,
  resource,
  searchField,
  defaultSort,
  views,
  appends,
  initiallyHidden,
}: UseSalesListOptions) {
  const prefsKey = `${PREFIX}.${listId}.prefs`;
  const viewsKey = `${PREFIX}.${listId}.views`;
  const [searchParams, setSearchParams] = useSearchParams();

  type Prefs = {
    hidden: string[];
    density: GridDensity;
    pageSize: number;
  };

  const [prefs, setPrefs] = useState<Prefs>(() =>
    readJson<Prefs>(prefsKey, {
      hidden: initiallyHidden ?? [],
      density: "comfortable",
      pageSize: 20,
    })
  );
  useEffect(() => writeJson(prefsKey, prefs), [prefsKey, prefs]);

  const [customViews, setCustomViews] = useState<CustomView[]>(() =>
    readJson<CustomView[]>(viewsKey, [])
  );
  useEffect(() => writeJson(viewsKey, customViews), [viewsKey, customViews]);

  // --- filter state, seeded once from the URL so deep links restore ---------
  const initial = useRef({
    view: searchParams.get("view") ?? views[0]?.id ?? "all",
    q: searchParams.get("q") ?? "",
    facets: (() => {
      const raw = searchParams.get("f");
      if (!raw) return {} as Record<string, string[]>;
      try {
        return JSON.parse(decodeURIComponent(raw)) as Record<string, string[]>;
      } catch {
        return {} as Record<string, string[]>;
      }
    })(),
  });

  const [viewId, setViewId] = useState(initial.current.view);
  const [search, setSearch] = useState(initial.current.q);
  const [facets, setFacets] = useState<Record<string, string[]>>(
    initial.current.facets
  );
  const [sort, setSort] = useState<ListSort>(defaultSort);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Array<string | number>>([]);

  // Debounce the search box so typing does not fire a request per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const activeBuiltIn = useMemo(
    () => views.find((view) => view.id === viewId),
    [views, viewId]
  );
  const activeCustom = useMemo(
    () => customViews.find((view) => view.id === viewId),
    [customViews, viewId]
  );

  // The built-in view a custom view was saved on top of still contributes its
  // base filters (e.g. "open deals" + the user's own facet narrowing).
  const baseView = activeCustom
    ? views.find((view) => view.id === activeCustom.baseViewId)
    : activeBuiltIn;

  useEffect(() => {
    // Keep the URL in step so the current list state is shareable.
    const next = new URLSearchParams(searchParams);
    next.set("view", viewId);
    if (debouncedSearch) next.set("q", debouncedSearch);
    else next.delete("q");
    if (Object.keys(facets).length > 0)
      next.set("f", encodeURIComponent(JSON.stringify(facets)));
    else next.delete("f");
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams identity churns
  }, [viewId, debouncedSearch, facets]);

  const filters = useMemo(() => {
    const list: CrudFilter[] = [...(baseView?.filters ?? [])];
    for (const [field, values] of Object.entries(facets)) {
      if (!values || values.length === 0) continue;
      list.push({
        field,
        operator: values.length > 1 ? "in" : "eq",
        value: values.length > 1 ? values : values[0],
      });
    }
    if (debouncedSearch.trim()) {
      list.push({
        field: searchField,
        operator: "contains",
        value: debouncedSearch.trim(),
      });
    }
    return list;
  }, [baseView, facets, debouncedSearch, searchField]);

  // Any filter change resets to the first page — otherwise a narrow filter can
  // land the user on an empty page 4.
  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [filters]);

  const { result, query } = useList<TRecord>({
    resource,
    pagination: { mode: "server", currentPage: page, pageSize: prefs.pageSize },
    sorters: [sort],
    filters,
    meta: appends ? { appends } : undefined,
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const rows = result.data;
  const total = result.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / prefs.pageSize));

  useEffect(() => {
    publishVisibleIds(
      listId,
      rows.map((row) => row.id)
    );
  }, [listId, rows]);

  const toggleSort = useCallback((field: string) => {
    setSort((current) =>
      current.field === field
        ? { field, order: current.order === "asc" ? "desc" : "asc" }
        : { field, order: "asc" }
    );
  }, []);

  const setFacet = useCallback((field: string, values: string[]) => {
    setFacets((current) => {
      const next = { ...current };
      if (values.length === 0) delete next[field];
      else next[field] = values;
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFacets({});
    setSearch("");
  }, []);

  const applyView = useCallback(
    (id: string, custom?: CustomView) => {
      setViewId(id);
      if (custom) {
        setFacets(custom.facets);
        setSearch(custom.search);
        setSort(custom.sort ?? defaultSort);
        return;
      }
      const builtIn = views.find((view) => view.id === id);
      setFacets({});
      setSearch("");
      setSort(builtIn?.sort ?? defaultSort);
    },
    [defaultSort, views]
  );

  const saveView = useCallback(
    (name: string) => {
      const id = `custom-${Date.now()}`;
      const view: CustomView = {
        id,
        name,
        baseViewId: baseView?.id ?? views[0]?.id ?? "all",
        facets,
        search: debouncedSearch,
        sort,
      };
      setCustomViews((current) => [...current, view]);
      setViewId(id);
    },
    [baseView, debouncedSearch, facets, sort, views]
  );

  const deleteView = useCallback(
    (id: string) => {
      setCustomViews((current) => current.filter((view) => view.id !== id));
      setViewId((current) =>
        current === id ? (views[0]?.id ?? "all") : current
      );
    },
    [views]
  );

  const toggleColumn = useCallback((columnId: string) => {
    setPrefs((current) => ({
      ...current,
      hidden: current.hidden.includes(columnId)
        ? current.hidden.filter((id) => id !== columnId)
        : [...current.hidden, columnId],
    }));
  }, []);

  const toggleRow = useCallback((id: string | number) => {
    setSelected((current) =>
      current.some((value) => String(value) === String(id))
        ? current.filter((value) => String(value) !== String(id))
        : [...current, id]
    );
  }, []);

  const toggleAllRows = useCallback(() => {
    setSelected((current) =>
      current.length === rows.length ? [] : rows.map((row) => row.id)
    );
  }, [rows]);

  const filterCount =
    Object.values(facets).reduce((sum, values) => sum + values.length, 0) +
    (debouncedSearch.trim() ? 1 : 0);

  return {
    // data
    rows,
    total,
    query,
    filters,
    sorters: [sort] as ListSort[],
    // paging
    page,
    setPage,
    pageCount,
    pageSize: prefs.pageSize,
    setPageSize: (size: number) => {
      setPrefs((current) => ({ ...current, pageSize: size }));
      setPage(1);
    },
    // sorting
    sort,
    toggleSort,
    // filtering
    search,
    setSearch,
    facets,
    setFacet,
    clearFilters,
    filterCount,
    // views
    views,
    customViews,
    viewId,
    applyView,
    saveView,
    deleteView,
    // display prefs
    density: prefs.density,
    setDensity: (density: GridDensity) =>
      setPrefs((current) => ({ ...current, density })),
    hiddenColumns: prefs.hidden,
    toggleColumn,
    // selection
    selected,
    setSelected,
    toggleRow,
    toggleAllRows,
  };
}
