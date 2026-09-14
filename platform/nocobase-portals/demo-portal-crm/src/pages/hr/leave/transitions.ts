import type { LeaveRequestRecord } from "../types";

export type LeaveDecisionStatus = "approved" | "rejected" | "pending";

/**
 * The only definition of a leave status write. Decisions always carry the
 * actor, timestamp and comment; reopening clears the previous decision as one
 * row update so list, detail and bulk entry points cannot drift apart.
 */
export function leaveTransitionValues(
  status: LeaveDecisionStatus,
  approverId?: string | number,
  comment?: string,
  now = new Date().toISOString()
): Partial<LeaveRequestRecord> {
  if (status === "pending") {
    return {
      status,
      approver_id: null,
      approved_at: null,
      decision_comment: null,
    };
  }
  return {
    status,
    approver_id: approverId ?? null,
    approved_at: now,
    decision_comment: comment?.trim() || null,
  };
}
