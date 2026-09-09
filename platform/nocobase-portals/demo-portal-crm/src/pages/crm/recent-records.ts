import { useEffect, useRef } from "react";

export type RecentRecordKind =
  | "customer"
  | "contact"
  | "lead"
  | "deal"
  | "quote"
  | "product";

export type RecentRecord = {
  kind: RecentRecordKind;
  id: string;
  label: string;
  at: number;
};

const STORAGE_KEY = "crm.recent";
const MAX_RECENT_RECORDS = 8;
const RECENT_RECORD_KINDS: RecentRecordKind[] = [
  "customer",
  "contact",
  "lead",
  "deal",
  "quote",
  "product",
];

function isRecentRecord(value: unknown): value is RecentRecord {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    RECENT_RECORD_KINDS.includes(entry.kind as RecentRecordKind) &&
    typeof entry.id === "string" &&
    typeof entry.label === "string" &&
    typeof entry.at === "number" &&
    Number.isFinite(entry.at)
  );
}

export function readRecentRecords(): RecentRecord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isRecentRecord)
      .sort((left, right) => right.at - left.at)
      .slice(0, MAX_RECENT_RECORDS);
  } catch {
    return [];
  }
}

export function trackRecentRecord(
  entry: Omit<RecentRecord, "at">
): void {
  const next = [
    { ...entry, at: Date.now() },
    ...readRecentRecords().filter(
      (recent) => recent.kind !== entry.kind || recent.id !== entry.id
    ),
  ].slice(0, MAX_RECENT_RECORDS);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage disabled — recent records simply stop persisting */
  }
}

export function useTrackRecentRecord(
  kind: RecentRecordKind,
  id: string | number | null | undefined,
  label: string | null | undefined
): void {
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    const normalizedLabel = label?.trim();
    if (id === null || id === undefined || !normalizedLabel) return;

    const normalizedId = String(id);
    const signature = JSON.stringify([kind, normalizedId, normalizedLabel]);
    if (lastTracked.current === signature) return;

    trackRecentRecord({ kind, id: normalizedId, label: normalizedLabel });
    lastTracked.current = signature;
  }, [kind, id, label]);
}
