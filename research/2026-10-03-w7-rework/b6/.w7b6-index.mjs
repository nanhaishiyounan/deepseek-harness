// W7-B6 page-universe index generator — the 114-unit census reconciled against
// (a) the B6 final after set (research/.../b6/after/, this batch's 114-shot
// walk), (b) each rework batch's own acceptance PNGs (demos/acceptance-w7/
// w7-b1..b5-*), and (c) the B0 before baseline (research/.../b0/before/).
// R1: numbering and uids come from the live census the probe rebuilt and
// wrote to w7-b6-census-live.json (run .w7b6-probe.mjs first — the frozen
// audit snapshot is never read here, its uids went stale at the B5 rebuild).
// Output: research/2026-10-03-w7-rework/b6/after-index.md, one row per unit
// with every source named honestly (which batch shot it, and where).
// Usage (repo root): node research/2026-10-03-w7-rework/b6/.w7b6-index.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DIR = fileURLToPath(new URL('./', import.meta.url))
const DEMOS = fileURLToPath(new URL('../../../demos/acceptance-w7/', import.meta.url))
const LIVE = readFileSync(`${DIR}w7-b6-census-live.json`, 'utf8')
const census = JSON.parse(LIVE)
if (typeof census.rebuiltAt !== 'string' || !Array.isArray(census.pages)) throw new Error('w7-b6-census-live.json is not a live-census dump — run .w7b6-probe.mjs first')
const pages = census.pages

const slug = (title) => String(title).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 24)
const afterFiles = new Set(readdirSync(`${DIR}after/`))
const beforeFiles = new Set(readdirSync(`${DIR}../b0/before/`))
const demoFiles = readdirSync(DEMOS).filter((name) => name.endsWith('.png'))

/** Find this unit's batch-shot evidence: exact-title match in the w7-bN acceptance set. */
const batchShot = (title) => {
  const target = slug(title)
  const hits = []
  for (const name of demoFiles) {
    const m = /^w7-(b[0-9]+|m[0-9]+|b6)-(?:r\d+-)?\d+-.*\.png$/.exec(name)
    if (m === null) continue
    const stem = name.replace(/^w7-[a-z0-9]+-(?:r\d+-)?\d+-/, '').replace(/\.png$/, '')
    if (stem === target || stem === title) hits.push(name)
  }
  return hits
}

const rows = []
let covered = 0
for (const entry of pages) {
  const name = `${String(entry.index).padStart(3, '0')}-${slug(entry.title)}.png`
  const final = afterFiles.has(name) ? `b6/after/${name}` : 'MISSING'
  const before = beforeFiles.has(name) ? `b0/before/${name}` : 'MISSING'
  const shots = batchShot(entry.title)
  if (final !== 'MISSING') covered += 1
  rows.push({ index: entry.index, title: entry.title, uid: entry.schemaUid, final, before, shots })
}

const lines = []
lines.push('# W7-B6 114 页面单元终验索引')
lines.push('')
lines.push(`生成：${new Date().toISOString()}（R1 修复轮时点；census 活重建于 ${census.rebuiltAt}——uid 取自当次 desktopRoutes，B5 重建轮换后的现值）。after 全量 = B6 终验 114 张截图（\`b6/after/\`；R1 对效期看板/批次追溯/配方版本与变更三页按现活 uid 重拍，旧 404 帧已被替换）；before = B0 全站换肤前基线（\`b0/before/\`）；批次图 = B1~B5 各批验收时点的 demos 截图（同名页按标题匹配，如实列出命中，可能多张/无——B6 终验图独立于批次图，不以后者存在为前提）。`)
lines.push('')
lines.push(`覆盖：终验 after ${String(covered)}/114，before ${String(rows.filter((r) => r.before !== 'MISSING').length)}/114。`)
lines.push('')
lines.push('| # | 页面 | schemaUid | B6 终验 after | B0 before | 批次验收图（demos/acceptance-w7/） |')
lines.push('|---|---|---|---|---|---|')
for (const row of rows) {
  const link = (p) => `[${p.split('/').pop()}](../../../research/2026-10-03-w7-rework/${p})`
  lines.push(`| ${String(row.index).padStart(3, '0')} | ${row.title} | ${row.uid} | ${row.final.endsWith('.png') ? link(row.final) : `**${row.final}**`} | ${row.before.endsWith('.png') ? link(row.before) : `**${row.before}**`} | ${row.shots.length > 0 ? row.shots.map((s) => `[${s.replace('.png', '')}](../../../demos/acceptance-w7/${s})`).join('<br>') : '—（该页属 B0 全局换肤+B6 终验覆盖，无单批验收图）'} |`)
}
writeFileSync(`${DIR}after-index.md`, lines.join('\n') + '\n')
console.log(`index written: ${String(covered)}/114 final after, ${String(rows.filter((r) => r.before !== 'MISSING').length)}/114 before, ${String(rows.reduce((n, r) => n + r.shots.length, 0))} batch shots linked (census @ ${census.rebuiltAt})`)
