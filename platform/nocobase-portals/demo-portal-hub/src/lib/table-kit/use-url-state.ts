import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => {
    const out = { ...defaults };
    for (const key of Object.keys(defaults) as Array<keyof T & string>) {
      const value = params.get(key);
      if (value !== null) out[key] = value as T[keyof T & string];
    }
    return out;
  }, [params, defaults]);
  const setState = useCallback(
    (patch: Partial<T>) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined || value === "" || value === defaults[key]) {
              next.delete(key);
            } else {
              next.set(key, String(value));
            }
          }
          return next;
        },
        { replace: true }
      );
    },
    [defaults, setParams]
  );
  const query = useMemo(() => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(state)) {
      if (value && value !== defaults[key]) next.set(key, String(value));
    }
    return next.toString();
  }, [state, defaults]);
  const applyQuery = useCallback(
    (serialized: string) =>
      setParams(new URLSearchParams(serialized), { replace: true }),
    [setParams]
  );
  const reset = useCallback(
    () => setParams(new URLSearchParams(), { replace: true }),
    [setParams]
  );
  return { state, setState, query, applyQuery, reset };
}
