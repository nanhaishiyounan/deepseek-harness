import type { BaseRecord, HttpError } from "@refinedev/core";
import type { UseTableReturnType } from "@refinedev/react-table";
import type { ColumnFiltersState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { hubStorageKey, readStorage, writeStorage } from "./storage";

export type ViewFilters = ColumnFiltersState;

export type SavedView = {
  id: string;
  label: string;
  filters: ViewFilters;
  preset?: boolean;
};

export type QuerySavedView = {
  id: string;
  name: string;
  query: string;
};

export type SavedViewsApi = {
  views: SavedView[];
  activeId: string;
  apply: (view: SavedView) => void;
  save: (label: string) => void;
  remove: (id: string) => void;
};

export type QuerySavedViewsApi = {
  views: QuerySavedView[];
  save: (name: string, query: string) => QuerySavedView;
  remove: (id: string) => void;
};

const filtersEqual = (a: ViewFilters, b: ViewFilters) => {
  if (a.length !== b.length) return false;
  const normalize = (list: ViewFilters) =>
    [...list]
      .map((item) => `${item.id}:${JSON.stringify(item.value)}`)
      .sort()
      .join("|");
  return normalize(a) === normalize(b);
};

interface UseSavedViews {
  (storageKey: string): QuerySavedViewsApi;
  <TData extends BaseRecord>(
    storageKey: string,
    table: UseTableReturnType<TData, HttpError>,
    presets: SavedView[]
  ): SavedViewsApi;
}

/** Supports both URL-query views and Refine/TanStack column-filter views. */
function useSavedViewsImpl<TData extends BaseRecord>(
  storageKey: string,
  table?: UseTableReturnType<TData, HttpError>,
  presets: SavedView[] = []
): QuerySavedViewsApi | SavedViewsApi {
  const queryMode = table === undefined;
  const persistedKey = queryMode
    ? `${storageKey}:views`
    : hubStorageKey(`${storageKey}.views`);
  const [storedViews, setStoredViews] = useState<Array<SavedView | QuerySavedView>>(
    () => readStorage(persistedKey, [])
  );

  useEffect(() => {
    writeStorage(persistedKey, storedViews);
  }, [persistedKey, storedViews]);

  const columnFilters = table?.reactTable.getState().columnFilters ?? [];
  const filterViews = useMemo(
    () => [
      ...presets.map((view) => ({ ...view, preset: true })),
      ...(storedViews as SavedView[]),
    ],
    [presets, storedViews]
  );

  const remove = useCallback(
    (id: string) =>
      setStoredViews((previous) => previous.filter((view) => view.id !== id)),
    []
  );

  const saveQuery = useCallback((name: string, query: string) => {
    const view: QuerySavedView = {
      id: `${Date.now()}`,
      name: name.trim(),
      query,
    };
    setStoredViews((previous) => [
      ...previous.filter(
        (item) => !("name" in item) || item.name !== view.name
      ),
      view,
    ]);
    return view;
  }, []);

  const applyFilters = useCallback(
    (view: SavedView) => {
      table?.reactTable.setColumnFilters(view.filters);
      table?.refineCore.setCurrentPage(1);
    },
    [table]
  );

  const saveFilters = useCallback(
    (label: string) => {
      const view: SavedView = {
        id: `custom-${Date.now()}`,
        label,
        filters: columnFilters,
      };
      setStoredViews((previous) => [...previous, view]);
    },
    [columnFilters]
  );

  if (queryMode) {
    return {
      views: storedViews as QuerySavedView[],
      save: saveQuery,
      remove,
    };
  }

  return {
    views: filterViews,
    activeId:
      filterViews.find((view) => filtersEqual(view.filters, columnFilters))?.id ??
      "",
    apply: applyFilters,
    save: saveFilters,
    remove,
  };
}

export const useSavedViews = useSavedViewsImpl as UseSavedViews;
