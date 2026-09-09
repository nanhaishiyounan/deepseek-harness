import { useTranslate } from "@refinedev/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRecordCursor, type RecordCursorKind } from "./record-cursor";
import { useOpenContextualChild } from "./route-surfaces";

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function RecordPager({
  kind,
  id,
  buildPath,
}: {
  kind: RecordCursorKind;
  id: string | number | null | undefined;
  buildPath: (id: string) => string;
}) {
  const translate = useTranslate();
  const openChild = useOpenContextualChild();
  const rootRef = useRef<HTMLDivElement>(null);
  const { index, total, previousId, nextId } = useRecordCursor(kind, id);
  const navigateTo = useCallback(
    (targetId: string) => openChild(buildPath(targetId)),
    [buildPath, openChild]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      const targetDialog = target?.closest('[role="dialog"]');
      const pagerDialog = rootRef.current?.closest('[role="dialog"]');
      if (targetDialog && targetDialog !== pagerDialog) return;

      const targetId =
        event.key === "ArrowLeft" || event.key === "["
          ? previousId
          : event.key === "ArrowRight" || event.key === "]"
            ? nextId
            : null;
      if (!targetId) return;

      event.preventDefault();
      navigateTo(targetId);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [navigateTo, nextId, previousId]);

  if (index < 0 || total < 2) return null;

  const position = index + 1;
  const previousLabel = translate(
    "crm.pager.previous",
    { ns: "starter" },
    "Previous record"
  );
  const nextLabel = translate(
    "crm.pager.next",
    { ns: "starter" },
    "Next record"
  );

  return (
    <div ref={rootRef} className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex">
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!previousId}
                aria-label={previousLabel}
                onClick={() => previousId && navigateTo(previousId)}
              >
                <ChevronLeft />
              </Button>
            </span>
          }
        />
        <TooltipContent>
          {translate(
            "crm.pager.previousHint",
            { ns: "starter" },
            "Previous record (← or [)"
          )}
        </TooltipContent>
      </Tooltip>
      <span className="min-w-14 text-center text-xs tabular-nums text-muted-foreground">
        {translate(
          "crm.pager.position",
          { ns: "starter", index: position, total },
          `${position} of ${total}`
        )}
      </span>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex">
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!nextId}
                aria-label={nextLabel}
                onClick={() => nextId && navigateTo(nextId)}
              >
                <ChevronRight />
              </Button>
            </span>
          }
        />
        <TooltipContent>
          {translate(
            "crm.pager.nextHint",
            { ns: "starter" },
            "Next record (→ or ])"
          )}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
