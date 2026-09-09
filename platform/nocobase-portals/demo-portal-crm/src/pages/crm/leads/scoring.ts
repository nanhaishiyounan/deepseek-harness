import type { useTranslate } from "@refinedev/core";
import type { LeadRecord } from "../types";

type Translate = ReturnType<typeof useTranslate>;

/**
 * Explainable lead scoring. The stored `score` stays the source of truth for
 * sorting and filtering; this breaks the number down into the factors a rep can
 * act on, the way a scoring model card does in Salesforce or HubSpot.
 */
export type ScoreFactor = {
  key: string;
  label: string;
  points: number;
  max: number;
  met: boolean;
};

const SOURCE_POINTS: Record<string, number> = {
  referral: 25,
  partner: 20,
  event: 15,
  website: 12,
  outbound: 8,
};

const STATUS_POINTS: Record<string, number> = {
  converted: 30,
  qualified: 25,
  working: 15,
  new: 5,
  unqualified: 0,
};

export function scoreFactors(
  lead: LeadRecord | undefined,
  translate: Translate
): ScoreFactor[] {
  const source = lead?.source ?? "";
  const status = lead?.status ?? "new";
  return [
    {
      key: "company",
      label: translate("crm.leads.scoring.company", { ns: "starter" }, "Company identified"),
      points: lead?.company ? 15 : 0,
      max: 15,
      met: Boolean(lead?.company),
    },
    {
      key: "email",
      label: translate("crm.leads.scoring.email", { ns: "starter" }, "Business email on file"),
      points: lead?.email ? 15 : 0,
      max: 15,
      met: Boolean(lead?.email),
    },
    {
      key: "phone",
      label: translate("crm.leads.scoring.phone", { ns: "starter" }, "Phone number on file"),
      points: lead?.phone ? 10 : 0,
      max: 10,
      met: Boolean(lead?.phone),
    },
    {
      key: "owner",
      label: translate("crm.leads.scoring.owner", { ns: "starter" }, "Assigned to an owner"),
      points: lead?.owner_id ? 5 : 0,
      max: 5,
      met: Boolean(lead?.owner_id),
    },
    {
      key: "source",
      label: translate("crm.leads.scoring.source", { ns: "starter" }, "Source quality"),
      points: SOURCE_POINTS[source] ?? 0,
      max: 25,
      met: (SOURCE_POINTS[source] ?? 0) > 0,
    },
    {
      key: "status",
      label: translate("crm.leads.scoring.status", { ns: "starter" }, "Qualification progress"),
      points: STATUS_POINTS[status] ?? 0,
      max: 30,
      met: (STATUS_POINTS[status] ?? 0) > 0,
    },
  ];
}

export const modelledScore = (factors: ScoreFactor[]) =>
  Math.min(
    100,
    factors.reduce((sum, factor) => sum + factor.points, 0)
  );

/** Grade bands. `A` is worked first in every rep's queue. */
export type LeadGrade = "A" | "B" | "C" | "D";

export const gradeFor = (score: number | null | undefined): LeadGrade => {
  const value = Number(score ?? 0);
  if (value >= 80) return "A";
  if (value >= 60) return "B";
  if (value >= 40) return "C";
  return "D";
};

export const GRADE_RANGES: Record<LeadGrade, { min: number; max: number }> = {
  A: { min: 80, max: 100 },
  B: { min: 60, max: 79 },
  C: { min: 40, max: 59 },
  D: { min: 0, max: 39 },
};

export const gradeClass = (grade: LeadGrade) =>
  grade === "A"
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : grade === "B"
      ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
      : grade === "C"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : "bg-muted text-muted-foreground";
