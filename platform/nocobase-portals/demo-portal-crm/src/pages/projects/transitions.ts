type CompletionState = {
  completed_at?: string | null;
};

function completedAtFor(
  complete: boolean,
  wasComplete: boolean,
  record?: CompletionState | null,
  now = new Date().toISOString()
) {
  if (!complete) return null;
  if (wasComplete && record?.completed_at) return record.completed_at;
  return now;
}

/** One definition for every task status write and its completion audit stamp. */
export function taskTransitionValues(
  status: string,
  record?: (CompletionState & { status?: string | null }) | null
) {
  return {
    status,
    completed_at: completedAtFor(status === "done", record?.status === "done", record),
  };
}

/** One definition for every project status write and its completion audit stamp. */
export function projectTransitionValues(
  status: string,
  record?: (CompletionState & { status?: string | null }) | null
) {
  return {
    status,
    completed_at: completedAtFor(status === "done", record?.status === "done", record),
  };
}

/** One definition for every milestone completion write and its audit stamp. */
export function milestoneTransitionValues(
  done: boolean,
  record?: (CompletionState & { done?: boolean | null }) | null
) {
  return {
    done,
    completed_at: completedAtFor(done, Boolean(record?.done), record),
  };
}
