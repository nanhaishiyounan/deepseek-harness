import type { useTranslate } from "@refinedev/core";
import { DEAL_STAGE_PROBABILITY, OPEN_DEAL_STAGES } from "../constants";
import type { DealRecord } from "../types";

type Translate = ReturnType<typeof useTranslate>;

/**
 * Stage progression rules. A production pipeline does not let a rep pick any
 * stage from a dropdown: a deal moves forward one step at a time, can be lost
 * from anywhere while it is open, and only reaches Won from Negotiation.
 * Re-opening a closed deal is allowed but drops it back into Negotiation.
 */
export const STAGE_ORDER = ["inquiry", "quote", "negotiation", "won", "lost"] as const;

const FORWARD: Record<string, string | null> = {
  inquiry: "quote",
  quote: "negotiation",
  negotiation: "won",
  won: null,
  lost: null,
};

export const isOpenStage = (stage: string | null | undefined) =>
  OPEN_DEAL_STAGES.includes(stage ?? "");

export const nextStage = (stage: string | null | undefined) =>
  FORWARD[stage ?? "inquiry"] ?? null;

export function canTransition(from: string | null | undefined, to: string) {
  const current = from ?? "inquiry";
  if (current === to) return false;
  if (to === "lost") return isOpenStage(current);
  if (to === "negotiation" && !isOpenStage(current)) return true; // re-open
  if (isOpenStage(current)) return FORWARD[current] === to;
  return false;
}

export type StageBlocker = { field: string; message: string };

/**
 * Field-level requirements enforced before a deal is allowed into the next
 * stage. These are the checks a sales manager would expect: no forecast without
 * a value, no negotiation without a close date.
 */
export function stageBlockers(
  deal: DealRecord | undefined,
  to: string,
  translate: Translate
): StageBlocker[] {
  const blockers: StageBlocker[] = [];
  const needsAmount = to === "quote" || to === "negotiation" || to === "won";
  const needsCloseDate = to === "negotiation" || to === "won";

  if (needsAmount && !(Number(deal?.amount ?? 0) > 0)) {
    blockers.push({
      field: "amount",
      message: translate(
        "crm.deals.stage.blocker.amount",
        { ns: "starter" },
        "Set a deal amount before moving it forward."
      ),
    });
  }
  if (needsCloseDate && !deal?.expected_close_date) {
    blockers.push({
      field: "expected_close_date",
      message: translate(
        "crm.deals.stage.blocker.closeDate",
        { ns: "starter" },
        "An expected close date is required from Negotiation onwards."
      ),
    });
  }
  if (to === "won" && !deal?.customer_id && !deal?.customer) {
    blockers.push({
      field: "customer_id",
      message: translate(
        "crm.deals.stage.blocker.customer",
        { ns: "starter" },
        "Link the deal to an account before closing it as won."
      ),
    });
  }
  return blockers;
}

/** Reasons offered when a deal is closed as lost. Stored as a note prefix. */
export const LOST_REASONS = [
  { value: "price", label: "Price", i18nKey: "crm.deals.lostReason.price" },
  { value: "competitor", label: "Lost to competitor", i18nKey: "crm.deals.lostReason.competitor" },
  { value: "timing", label: "Timing / budget frozen", i18nKey: "crm.deals.lostReason.timing" },
  { value: "no_decision", label: "No decision", i18nKey: "crm.deals.lostReason.noDecision" },
  { value: "requirements", label: "Requirements not met", i18nKey: "crm.deals.lostReason.requirements" },
] as const;

export const todayIso = () => new Date().toISOString().slice(0, 10);

/** Values written to `crm_deals` for a stage move — no extra fields needed. */
export function stageTransitionValues(to: string, notes?: string) {
  const values: Record<string, unknown> = { stage: to };
  values.closed_date = to === "won" || to === "lost" ? todayIso() : null;
  if (notes !== undefined) values.notes = notes;
  return values;
}

export const weightedAmount = (deal: DealRecord) =>
  Number(deal.amount ?? 0) * (DEAL_STAGE_PROBABILITY[deal.stage ?? ""] ?? 0);

/**
 * Days the deal has been sitting where it is. `updatedAt` is the only stamp the
 * collection carries, so a deal that has not been edited since it entered the
 * stage reports its true age and an edited one reports time since that edit —
 * the same approximation a "last modified" based stage-age report makes.
 */
export function daysInStage(deal: DealRecord): number | null {
  const since = deal.updatedAt ?? deal.createdAt;
  if (!since) return null;
  const days = Math.floor(
    (Date.now() - new Date(since).getTime()) / 86_400_000
  );
  return Number.isFinite(days) ? Math.max(days, 0) : null;
}

/** Age thresholds that colour the stage-age badge on a pipeline card. */
export const stageAgeTone = (days: number | null) =>
  days === null
    ? "muted"
    : days >= 30
      ? "danger"
      : days >= 14
        ? "warning"
        : "muted";
