/**
 * W24-B2 increment proof: insert one row on the PG side, run the third sync
 * round, and show the lakehouse count advances by exactly one (the watermark
 * moved beyond the round-2 cursor). The inserted row is then removed from PG;
 * the lakehouse keeps it (append-only history).
 */
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import * as LakehouseEngine from '@deepseek-ai/dsh-lakehouse-engine'
import * as LakehouseSync from '@deepseek-ai/dsh-lakehouse-sync'

const PG_DSN = process.env.DSH_LAKEHOUSE_SYNC_DSN ?? 'dbname=nocobase host=127.0.0.1 port=5432 user=nocobase'
const lines: string[] = []
const log = (text: string): void => { lines.push(text); console.log(text) }

const ctx = new Context()
await ctx.plugin(LakehouseEngine, {
  catalog: { kind: 'ducklake', catalogPath: 'workspace/lakehouse/ducklake/catalog.ducklake', dataPath: 'workspace/lakehouse/ducklake/files' },
  maxRows: 1000,
})
await ctx.plugin(LakehouseSync, {
  dsn: PG_DSN,
  tables: ['wfl_mobile_work'],
  watermarkCandidates: ['updatedAt', 'updated_at'],
})
const engine = ctx.lakehouseEngine
const sync = ctx.lakehouseSync

const before = await engine.query('SELECT count(*) FROM lake.synced_nocobase.wfl_mobile_work')
log(`[before] lakehouse wfl_mobile_work rows=${String(before.rows[0]?.[0])}`)
const priorWm = await engine.readState('watermark:synced_nocobase.wfl_mobile_work')
log(`[before] persisted watermark=${priorWm ?? 'null'}`)

// One source insert with a watermark strictly beyond the current cursor.
const stamp = Date.now()
writeFileSync('/tmp/b2-insert.sql',
  `INSERT INTO wfl_mobile_work (id, "user", client_id, title, owner_display, due, suggestion, status, created_at, updated_at, pinned, demo)\n`
  + `VALUES (999000001, 'b2-acceptance', 'b2-proof', 'W24-B2 增量验证行', '验收', '2026-10-10', '插入-同步-可见证明', 'todo', ${String(stamp)}, ${String(stamp)}, false, false)\n`
  + 'RETURNING id;\n')
execSync('psql -h 127.0.0.1 -p 5432 -U nocobase -d nocobase -f /tmp/b2-insert.sql')
log('[source] inserted one PG row id=999000001')

const third = await sync.runOnce()
log(`[sync#3] mode=${third.tables[0]?.mode} appended=${String(third.tables[0]?.appended)} watermark=${third.tables[0]?.watermark}`)

const after = await engine.query('SELECT count(*) FROM lake.synced_nocobase.wfl_mobile_work')
const delta = Number(after.rows[0]?.[0]) - Number(before.rows[0]?.[0])
log(`[after] lakehouse wfl_mobile_work rows=${String(after.rows[0]?.[0])} (delta=${String(delta)})`)
const proof = await engine.query("SELECT count(*) FROM lake.synced_nocobase.wfl_mobile_work WHERE title = 'W24-B2 增量验证行'")
log(`[after] the inserted row visible in the lakehouse: ${proof.rows[0]?.[0] === 1 ? 'YES' : 'NO'}`)

// Clean the source; the lakehouse keeps its append-only history.
execSync('psql -h 127.0.0.1 -p 5432 -U nocobase -d nocobase -Atc "DELETE FROM wfl_mobile_work WHERE id = 999000001"')
log('[source] the PG proof row was removed (lakehouse history stays append-only)')

log(delta === 1 ? '[verdict] INCREMENT OK — one source row became exactly one lakehouse row' : '[verdict] INCREMENT FAILED')
await ctx.fiber.dispose()
writeFileSync('research/2026-10-09-w24-rebuild/b2-lakehouse/03-increment-proof.txt', `${lines.join('\n')}\n`)
console.log('\nevidence written to research/2026-10-09-w24-rebuild/b2-lakehouse/03-increment-proof.txt')
