import type { BaseRecord, HttpError } from "@refinedev/core";
import type { UseTableReturnType } from "@refinedev/react-table";
import { useEffect, useRef } from "react";
import { hubStorageKey, readStorage, writeStorage } from "./storage";

export function useColumnVisibilityPersistence<TData extends BaseRecord>(
  storageKey: string,
  table: UseTableReturnType<TData, HttpError>
) {
  const visibility = table.reactTable.getState().columnVisibility;
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    writeStorage(hubStorageKey(`${storageKey}.columns`), visibility);
  }, [storageKey, visibility]);
}

export const storedColumnVisibility = (storageKey: string) =>
  readStorage<Record<string, boolean>>(
    hubStorageKey(`${storageKey}.columns`),
    {}
  );
