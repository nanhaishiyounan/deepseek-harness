import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

/**
 * Filter state that lives in the URL so a narrowed list can be shared,
 * bookmarked and survives a refresh — the behaviour every production CRM has
 * and the reason "send me that view" works there.
 *
 * Only values that differ from the default are serialized, so an untouched list
 * keeps a clean `/leads` URL.
 */
export type UrlState = Record<string, string>;

export function useUrlState<T extends UrlState>(
  defaults: T
): {
  state: T;
  setState: (patch: Partial<T>) => void;
  replaceState: (next: Partial<T>) => void;
  reset: () => void;
  /** Serialized fingerprint, handy for `useResetPageOnFilterChange`. */
  fingerprint: string;
  isDirty: boolean;
} {
  const [searchParams, setSearchParams] = useSearchParams();

  const state = useMemo(() => {
    const next: UrlState = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const value = searchParams.get(key);
      if (value !== null) next[key] = value;
    }
    return next as T;
  }, [defaults, searchParams]);

  const write = useCallback(
    (next: T) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          for (const [key, value] of Object.entries(next)) {
            if (value === defaults[key] || value === "") params.delete(key);
            else params.set(key, value);
          }
          return params;
        },
        { replace: true }
      );
    },
    [defaults, setSearchParams]
  );

  const setState = useCallback(
    (patch: Partial<T>) => write({ ...state, ...patch }),
    [state, write]
  );

  const replaceState = useCallback(
    (next: Partial<T>) => write({ ...defaults, ...next }),
    [defaults, write]
  );

  const reset = useCallback(() => write({ ...defaults }), [defaults, write]);

  const fingerprint = useMemo(
    () =>
      Object.keys(defaults)
        .sort()
        .map((key) => `${key}=${state[key]}`)
        .join("|"),
    [defaults, state]
  );

  const isDirty = useMemo(
    () => Object.keys(defaults).some((key) => state[key] !== defaults[key]),
    [defaults, state]
  );

  return { state, setState, replaceState, reset, fingerprint, isDirty };
}
