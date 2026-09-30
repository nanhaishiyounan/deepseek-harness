/**
 * W5-R2 CR-2 guard proof (research artifact): the guarded wms_stock destroy
 * (filter {id, qty_on_hand:0, qty_allocated:0, qty_locked:0}) deletes only
 * zero rows. Positive: a qty=0 row dies (count=1). Negative: a qty>0 row
 * survives it (count=0, row intact) — the old bare filterByTk delete would
 * have dropped it inside the TOCTOU window. The qty>0 row is re-zeroed and
 * destroyed in the cleanup so the ledger reconciles again.
 * Usage: node --import tsx/esm research/2026-09-29-w5-rework/r2-destroy-guard.mts
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dataOf, signInWithRetry } from '../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts'

/** The exact guarded-destroy call applyStockDelta/sweepZeroStockRows now make. */
const guardedDestroy = async (token: string, id: number): Promise<number> => {
  const filter = encodeURIComponent(JSON.stringify({ id, qty_on_hand: 0, qty_allocated: 0, qty_locked: 0 }))
  const destroyed = await dataOf(token, 'POST', `/api/wms_stock:destroy?filter=${filter}`) as unknown
  return Array.isArray(destroyed) ? destroyed.length : Number(destroyed)
}

const rowExists = async (token: string, id: number): Promise<boolean> => {
  const row = await dataOf(token, 'GET', `/api/wms_stock:get?filterByTk=${id}`).catch(() => null) as Record<string, unknown> | null
  return row != null && row.id != null
}

const token = await signInWithRetry()
const anchor = (await dataOf(token, 'GET', '/api/wms_stock:list?pageSize=5') as Array<Record<string, any>>)[0]
if (anchor === undefined) throw new Error('no live wms_stock row to anchor the product/bin/lot keys')

let failures = 0
const check = (name: string, ok: boolean, detail = ''): void => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail === '' ? '' : ` — ${detail}`}`)
  if (!ok) failures += 1
}

// Positive: a resting-at-zero row is removable by the guarded destroy.
const zeroRow = await dataOf(token, 'POST', '/api/wms_stock:create', {
  product_id: anchor.product_id, bin_id: anchor.bin_id, lot_id: anchor.lot_id,
  qty_on_hand: 0, qty_available: 0, qty_allocated: 0, qty_locked: 0, version: 1,
}) as Record<string, any>
const positiveCount = await guardedDestroy(token, Number(zeroRow.id))
check('正例：qty=0 行被守卫 destroy 删除（count=1）', positiveCount === 1, `count=${String(positiveCount)}`)
check('正例：删除后行不可读', !(await rowExists(token, Number(zeroRow.id))))

// Negative: a re-filled (qty>0) row survives the same guarded destroy —
// this is exactly the concurrent-refill TOCTOU window CR-2 closes.
const filledRow = await dataOf(token, 'POST', '/api/wms_stock:create', {
  product_id: anchor.product_id, bin_id: anchor.bin_id, lot_id: anchor.lot_id,
  qty_on_hand: 5, qty_available: 5, qty_allocated: 0, qty_locked: 0, version: 1,
}) as Record<string, any>
const negativeCount = await guardedDestroy(token, Number(filledRow.id))
check('负例：qty>0 行经守卫 destroy 存活（count=0）', negativeCount === 0, `count=${String(negativeCount)}`)
check('负例：行仍可读（未被误删）', await rowExists(token, Number(filledRow.id)))

// Cleanup: re-zero the filled row and destroy it through the same guard so
// stock == Σmovements reconciles again (the fill was register-only).
await dataOf(token, 'POST', `/api/wms_stock:update?filterByTk=${filledRow.id}`, { qty_on_hand: 0, qty_available: 0 })
const cleanupCount = await guardedDestroy(token, Number(filledRow.id))
check('清理：qty>0 行清零后经守卫 destroy 移除', cleanupCount === 1, `count=${String(cleanupCount)}`)

// The ledger must still balance after the probe traffic.
const ledger = spawnSync('node', ['--import', 'tsx/esm', fileURLToPath(new URL('../../examples/kb-agent/scripts/nocobase-h5-wms.mts', import.meta.url)), '--assert-ledger'], { encoding: 'utf8', timeout: 120_000 })
check('stock == Σmovements 对账仍平', ledger.status === 0 && String(ledger.stdout).includes('ledger balanced'), String(ledger.stdout).split('\n').find(line => line.includes('balanced')) ?? '未捕获')

if (failures > 0) process.exitCode = 1
console.log(failures === 0 ? 'r2-destroy-guard: all green' : `r2-destroy-guard: ${String(failures)} failure(s)`)
