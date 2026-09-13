import { useCallback, useEffect, useMemo, useState } from "react";
import type { Density } from "./density";
import { readStorage, writeStorage } from "./storage";

export type TablePrefs = {
  hidden: string[];
  density: Density;
};

export function useTablePrefs(storageKey: string, defaultHidden: string[] = []) {
  const [prefs, setPrefs] = useState<TablePrefs>(() => ({
    hidden: defaultHidden,
    density: "comfortable",
    ...readStorage<Partial<TablePrefs>>(`${storageKey}:prefs`, {}),
  }));

  useEffect(() => {
    writeStorage(`${storageKey}:prefs`, prefs);
  }, [storageKey, prefs]);

  const columnVisibility = useMemo(
    () =>
      prefs.hidden.reduce<Record<string, boolean>>((acc, id) => {
        acc[id] = false;
        return acc;
      }, {}),
    [prefs.hidden]
  );
  const setHidden = useCallback(
    (hidden: string[]) => setPrefs((previous) => ({ ...previous, hidden })),
    []
  );
  const setDensity = useCallback(
    (density: Density) => setPrefs((previous) => ({ ...previous, density })),
    []
  );

  return {
    density: prefs.density,
    hidden: prefs.hidden,
    columnVisibility,
    setHidden,
    setDensity,
  };
}
