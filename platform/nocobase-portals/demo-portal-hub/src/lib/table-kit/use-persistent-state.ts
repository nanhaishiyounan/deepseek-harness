import { useEffect, useState } from "react";
import { hubStorageKey, readStorage, writeStorage } from "./storage";

/** localStorage-backed state; falls back to in-memory when storage is blocked. */
export function usePersistentState<T>(key: string, fallback: T) {
  const storageKey = hubStorageKey(key);
  const [value, setValue] = useState<T>(() => readStorage(storageKey, fallback));

  useEffect(() => {
    writeStorage(storageKey, value);
  }, [storageKey, value]);

  return [value, setValue] as const;
}
