/**
 * W4-R2 fix: retire the unregistered TextAreaFieldModel edit rows. The W
 * round (c07993210a) pointed form textarea fields at TextAreaFieldModel in
 * both nocobase-w8-quality.mts and nocobase-w6-mfg-exec.mts; the client
 * registry has no such class (B4's live "Model class 'TextAreaFieldModel'
 * not found"), so every quality/mfg form carrying one rendered the field
 * as a red error instead of an input. The field's own uiSchema
 * (Input.TextArea) shapes the multiline rendering — InputFieldModel is the
 * correct edit model (the w3-approval-visual form).
 *
 * Live rows are switched use-only (parentId/subKey passed through, props
 * and stepParams untouched); the source editModelFor branches are removed
 * in the same batch so a rebuild cannot reintroduce them. Idempotent: a
 * clean tree logs one line and exits 0.
 *
 * Usage: node --import tsx/esm examples/kb-agent/scripts/w4-r2-fix.mts
 */
import { dataOf, listFlowModels, signInWithRetry } from './nocobase-flow-page-lib.mts'

const token = await signInWithRetry()
const models = await listFlowModels(token, 'W4R2')

const offenders = models.filter(row => row?.use === 'TextAreaFieldModel')
if (offenders.length === 0) {
  console.log('w4-r2: no TextAreaFieldModel rows (already retired)')
} else {
  for (const row of offenders) {
    await dataOf(token, 'POST', '/api/flowModels:save', {
      uid: row.uid,
      ...(row.parentId === undefined ? {} : { parentId: row.parentId }),
      ...(row.subKey === undefined ? {} : { subKey: row.subKey }),
      use: 'InputFieldModel',
    })
    console.log(`retired ${String(row.uid)} TextAreaFieldModel -> InputFieldModel`)
  }
}

// Fail-loud recheck on a fresh read.
const after = await listFlowModels(token, 'W4R2')
const remain = after.filter(row => row?.use === 'TextAreaFieldModel')
if (remain.length > 0) {
  console.error(`w4-r2: ${String(remain.length)} TextAreaFieldModel rows remain (${remain.map(row => String(row.uid)).join(', ')})`)
  process.exitCode = 1
} else {
  console.log('w4-r2: 0 TextAreaFieldModel rows remain — every edit field model is a registered class')
}
