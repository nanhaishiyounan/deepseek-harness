type TransitionStep = () => Promise<unknown>;

/**
 * Front-end compatibility transition until the backend exposes an atomic
 * assign/return action. Every entry point uses the same ordering and restores
 * the assignment row if the asset-status write fails.
 */
export async function runAssignmentAssetTransition({
  updateAssignment,
  updateAsset,
  rollbackAssignment,
}: {
  updateAssignment: TransitionStep;
  updateAsset: TransitionStep;
  rollbackAssignment: TransitionStep;
}) {
  await updateAssignment();
  try {
    await updateAsset();
  } catch (error) {
    await rollbackAssignment();
    throw error;
  }
}
