import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

export type RecordCursorKind =
  | "customer"
  | "contact"
  | "lead"
  | "deal"
  | "quote"
  | "product";

export type RecordCursor = {
  index: number;
  total: number;
  previousId: string | null;
  nextId: string | null;
};

const orders = new Map<RecordCursorKind, string[]>();
const listeners = new Map<RecordCursorKind, Set<() => void>>();
const SIGNATURE_SEPARATOR = "\u001f";

function storageKey(kind: RecordCursorKind): string {
  return `crm.cursor.${kind}`;
}

function readOrder(kind: RecordCursorKind): string[] {
  const cached = orders.get(kind);
  if (cached) return cached;

  let stored: string[] = [];
  try {
    const raw = window.sessionStorage.getItem(storageKey(kind));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      stored = parsed
        .filter(
          (value): value is string | number =>
            typeof value === "string" || typeof value === "number"
        )
        .map((value) => String(value));
    }
  } catch {
    /* storage disabled — the cursor remains available for this page load */
  }

  orders.set(kind, stored);
  return stored;
}

function signature(kind: RecordCursorKind): string {
  return readOrder(kind).join(SIGNATURE_SEPARATOR);
}

function subscribe(kind: RecordCursorKind, listener: () => void): () => void {
  const kindListeners = listeners.get(kind) ?? new Set<() => void>();
  kindListeners.add(listener);
  listeners.set(kind, kindListeners);
  return () => {
    kindListeners.delete(listener);
    if (kindListeners.size === 0) listeners.delete(kind);
  };
}

/** Called by a list to publish the ids it is currently rendering, in display order. */
export function useRecordCursorSource(
  kind: RecordCursorKind,
  ids: Array<string | number>
): void {
  const lastPublished = useRef<string | null>(null);

  useEffect(() => {
    const normalized = ids.map((id) => String(id));
    const joined = normalized.join(SIGNATURE_SEPARATOR);
    const nextSignature = `${kind}:${joined}`;
    if (lastPublished.current === nextSignature) return;
    lastPublished.current = nextSignature;
    if (signature(kind) === joined) return;

    orders.set(kind, normalized);
    try {
      window.sessionStorage.setItem(storageKey(kind), JSON.stringify(normalized));
    } catch {
      /* storage disabled — the cursor remains available for this page load */
    }
    listeners.get(kind)?.forEach((listener) => listener());
  }, [ids, kind]);
}

/** Called by a drawer to locate itself inside the last published order. */
export function useRecordCursor(
  kind: RecordCursorKind,
  id: string | number | null | undefined
): RecordCursor {
  const subscribeToKind = useCallback(
    (listener: () => void) => subscribe(kind, listener),
    [kind]
  );
  const getSnapshot = useCallback(() => signature(kind), [kind]);
  useSyncExternalStore(subscribeToKind, getSnapshot, () => "");

  const order = readOrder(kind);
  const total = order.length;
  const index =
    id === null || id === undefined ? -1 : order.indexOf(String(id));
  if (index < 0) {
    return { index: -1, total, previousId: null, nextId: null };
  }

  return {
    index,
    total,
    previousId: order[index - 1] ?? null,
    nextId: order[index + 1] ?? null,
  };
}
