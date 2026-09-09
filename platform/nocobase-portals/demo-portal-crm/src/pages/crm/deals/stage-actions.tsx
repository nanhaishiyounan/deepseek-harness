import { useNotification, useTranslate, useUpdate } from "@refinedev/core";
import { AlertTriangle, ArrowRight, Ban, Trophy } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DEAL_STAGES, labelFor } from "../constants";
import type { DealRecord } from "../types";
import {
  LOST_REASONS,
  canTransition,
  isOpenStage,
  nextStage,
  stageBlockers,
  stageTransitionValues,
} from "./stage-machine";

/**
 * Single entry point for every stage change in the module — the pipeline board
 * (drag and drop) and the deal drawer (buttons) both go through it, so an
 * illegal or incomplete move is refused the same way in both places.
 */
export function useStageTransition() {
  const translate = useTranslate();
  const { open } = useNotification();
  const { mutate: updateDeal } = useUpdate<DealRecord>();
  const [pending, setPending] = useState<{ deal: DealRecord; to: string } | null>(
    null
  );
  const [reason, setReason] = useState<string>(LOST_REASONS[0].value);

  const commit = (deal: DealRecord, to: string, lostReason?: string) => {
    const notes =
      lostReason !== undefined
        ? `${translate("crm.deals.lostReasonNote", { ns: "starter" }, "Lost reason")}: ${labelFor(
            LOST_REASONS,
            lostReason,
            translate
          )}${deal.notes ? `\n${deal.notes}` : ""}`
        : undefined;
    updateDeal(
      {
        resource: "crm_deals",
        id: deal.id,
        values: stageTransitionValues(to, notes),
      },
      {
        onSuccess: () =>
          open?.({
            type: "success",
            message: translate(
              "crm.deals.stage.moved",
              { ns: "starter" },
              "Stage updated"
            ),
            description: `${deal.title ?? ""} → ${labelFor(DEAL_STAGES, to, translate)}`,
          }),
      }
    );
  };

  /** Returns false when the move was refused, so callers can revert optimism. */
  const request = (deal: DealRecord, to: string): boolean => {
    if (deal.stage === to) return false;
    if (!canTransition(deal.stage, to)) {
      open?.({
        type: "error",
        message: translate(
          "crm.deals.stage.illegal",
          { ns: "starter" },
          "That stage move is not allowed"
        ),
        description: translate(
          "crm.deals.stage.illegalDetail",
          { ns: "starter" },
          "Deals advance one stage at a time, can be marked lost while open, and re-open into Negotiation."
        ),
      });
      return false;
    }
    const blockers = stageBlockers(deal, to, translate);
    if (blockers.length > 0) {
      open?.({
        type: "error",
        message: translate(
          "crm.deals.stage.blocked",
          { ns: "starter" },
          "Complete the deal before moving it"
        ),
        description: blockers.map((blocker) => blocker.message).join(" "),
      });
      return false;
    }
    if (to === "won" || to === "lost") {
      setReason(LOST_REASONS[0].value);
      setPending({ deal, to });
      return true;
    }
    commit(deal, to);
    return true;
  };

  const dialog = (
    <AlertDialog
      open={Boolean(pending)}
      onOpenChange={(next) => !next && setPending(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pending?.to === "won"
              ? translate("crm.deals.stage.confirmWon", { ns: "starter" }, "Close this deal as won?")
              : translate("crm.deals.stage.confirmLost", { ns: "starter" }, "Close this deal as lost?")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pending?.to === "won"
              ? translate(
                  "crm.deals.stage.confirmWonDetail",
                  { ns: "starter" },
                  "The close date is stamped with today and the deal leaves the open forecast."
                )
              : translate(
                  "crm.deals.stage.confirmLostDetail",
                  { ns: "starter" },
                  "Pick a reason so the loss shows up in reporting. It is written to the deal notes."
                )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {pending?.to === "lost" ? (
          <Select value={reason} onValueChange={(value) => setReason(value ?? LOST_REASONS[0].value)}>
            <SelectTrigger className="w-full">
              <SelectValue>{labelFor(LOST_REASONS, reason, translate)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {LOST_REASONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {labelFor(LOST_REASONS, option.value, translate)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>
            {translate("crm.common.cancel", { ns: "starter" }, "Cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!pending) return;
              commit(
                pending.deal,
                pending.to,
                pending.to === "lost" ? reason : undefined
              );
              setPending(null);
            }}
          >
            {translate("crm.common.confirm", { ns: "starter" }, "Confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { request, dialog };
}

/**
 * Stage stepper with the only moves a deal is allowed to make from where it is.
 * Replaces "pick any stage from a dropdown", which is how demo CRMs let a deal
 * jump from Inquiry to Won without a value or a close date.
 */
export function StageProgress({
  deal,
  onRequest,
}: {
  deal: DealRecord | undefined;
  onRequest: (to: string) => void;
}) {
  const translate = useTranslate();
  if (!deal) return null;

  const stage = deal.stage ?? "inquiry";
  const openStages = DEAL_STAGES.filter((item) => item.value !== "lost");
  const currentIndex = openStages.findIndex((item) => item.value === stage);
  const forward = nextStage(stage);
  const blockers = forward ? stageBlockers(deal, forward, translate) : [];

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-1">
        {openStages.map((item, index) => {
          const reached = currentIndex >= 0 && index <= currentIndex;
          return (
            <div key={item.value} className="flex items-center gap-1">
              <span
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium",
                  stage === item.value
                    ? "bg-primary text-primary-foreground"
                    : reached
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
                )}
              >
                {labelFor(DEAL_STAGES, item.value, translate)}
              </span>
              {index < openStages.length - 1 ? (
                <ArrowRight className="size-3 text-muted-foreground" />
              ) : null}
            </div>
          );
        })}
        {stage === "lost" ? (
          <span className="ml-2 rounded-md bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-700 dark:text-red-300">
            {labelFor(DEAL_STAGES, "lost", translate)}
          </span>
        ) : null}
      </div>

      {blockers.length > 0 && isOpenStage(stage) ? (
        <ul className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
          {blockers.map((blocker) => (
            <li key={blocker.field} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {blocker.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {forward && forward !== "won" ? (
          <Button size="sm" disabled={blockers.length > 0} onClick={() => onRequest(forward)}>
            <ArrowRight />
            {translate("crm.deals.stage.advance", { ns: "starter" }, "Advance to")}{" "}
            {labelFor(DEAL_STAGES, forward, translate)}
          </Button>
        ) : null}
        {stage === "negotiation" ? (
          <Button size="sm" disabled={blockers.length > 0} onClick={() => onRequest("won")}>
            <Trophy />
            {translate("crm.deals.stage.markWon", { ns: "starter" }, "Mark won")}
          </Button>
        ) : null}
        {isOpenStage(stage) ? (
          <Button size="sm" variant="outline" onClick={() => onRequest("lost")}>
            <Ban />
            {translate("crm.deals.stage.markLost", { ns: "starter" }, "Mark lost")}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => onRequest("negotiation")}>
            <ArrowRight />
            {translate("crm.deals.stage.reopen", { ns: "starter" }, "Re-open deal")}
          </Button>
        )}
      </div>
    </div>
  );
}
