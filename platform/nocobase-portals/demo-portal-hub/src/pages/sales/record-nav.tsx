import { useTranslate } from "@refinedev/core";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";

type RecordNavState = {
  ids: string[];
  index: number;
  total: number;
  prevId: string | null;
  nextId: string | null;
  goPrev: () => void;
  goNext: () => void;
};

export function publishVisibleIds(
  listId: string,
  ids: Array<string | number>
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      `hub.sales.${listId}.visibleIds`,
      JSON.stringify(ids.map(String))
    );
  } catch {
    // The list owns the user's current filters, sort and page, so it publishes
    // that exact ordering for the drawer to page through.
  }
}

function readVisibleIds(listId: string): string[] {
  if (typeof window === "undefined" || !listId) return [];
  try {
    const raw = window.sessionStorage.getItem(
      `hub.sales.${listId}.visibleIds`
    );
    if (!raw) return [];
    const ids = JSON.parse(raw) as unknown;
    return Array.isArray(ids) ? ids.map(String) : [];
  } catch {
    return [];
  }
}

export function useRecordNav({
  listId,
  currentId,
  pathFor,
}: {
  listId: string;
  currentId: string | number | undefined;
  pathFor: (id: string) => string;
}): RecordNavState {
  const navigate = useNavigate();
  const [ids] = useState(() => readVisibleIds(listId));
  const currentIndex =
    currentId === undefined ? -1 : ids.indexOf(String(currentId));
  const index = currentIndex + 1;
  const prevId = currentIndex > 0 ? ids[currentIndex - 1] : null;
  const nextId =
    currentIndex >= 0 && currentIndex < ids.length - 1
      ? ids[currentIndex + 1]
      : null;

  const goPrev = useCallback(() => {
    if (prevId) navigate(pathFor(prevId), { replace: true });
  }, [navigate, pathFor, prevId]);
  const goNext = useCallback(() => {
    if (nextId) navigate(pathFor(nextId), { replace: true });
  }, [navigate, nextId, pathFor]);

  return {
    ids,
    index,
    total: ids.length,
    prevId,
    nextId,
    goPrev,
    goNext,
  };
}

export function RecordNav({ state }: { state: RecordNavState }) {
  const translate = useTranslate();
  if (state.total < 2 || state.index === 0) return null;

  const prevLabel = translate(
    "sales.nav.prev",
    { ns: "starter" },
    "Previous record"
  );
  const nextLabel = translate(
    "sales.nav.next",
    { ns: "starter" },
    "Next record"
  );

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={prevLabel}
        title={`${prevLabel} (k)`}
        disabled={state.prevId === null}
        onClick={state.goPrev}
      >
        <ChevronUp />
      </Button>
      <span className="text-xs text-muted-foreground tabular-nums">
        {translate(
          "sales.nav.position",
          { ns: "starter" },
          "{{index}} of {{total}}"
        )
          .replace("{{index}}", String(state.index))
          .replace("{{total}}", String(state.total))}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={nextLabel}
        title={`${nextLabel} (j)`}
        disabled={state.nextId === null}
        onClick={state.goNext}
      >
        <ChevronDown />
      </Button>
    </div>
  );
}

export function useDrawerShortcuts({
  onPrev,
  onNext,
  onEdit,
}: {
  onPrev?: () => void;
  onNext?: () => void;
  onEdit?: () => void;
}): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target;
      if (target instanceof HTMLElement) {
        const tagName = target.tagName.toLowerCase();
        if (
          tagName === "input" ||
          tagName === "textarea" ||
          tagName === "select" ||
          target.isContentEditable
        )
          return;
      }

      const key = event.key.toLowerCase();
      const handler =
        key === "k" || key === "["
          ? onPrev
          : key === "j" || key === "]"
            ? onNext
            : key === "e"
              ? onEdit
              : undefined;
      if (!handler) return;
      event.preventDefault();
      handler();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onEdit, onNext, onPrev]);
}
