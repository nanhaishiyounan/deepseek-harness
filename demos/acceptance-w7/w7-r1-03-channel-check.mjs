// W7-R1 P1-6 evidence: BLOCK_UPDATE_CHANNEL consistency check between the
// exporting script and every document that names the deployed-JSBlock update
// channel. The B6+M3 note pair, QUICKSTART.zh, and the W7 deliverables index
// had all claimed `flowSurfaces:updateSettings` — a channel the bin-map fix
// never used (the stored code rides the server-shaped stepParams.jsSettings,
// which no direct-update API accepts intact). This check fails loud if a doc
// re-attaches the wrong channel or the constant drifts from what docs quote.
// CI-optional: cheap grep-level contract, run into w7-r1-03-channel-check.log.
// Usage (repo root): node demos/acceptance-w7/w7-r1-03-channel-check.mjs
import { readFileSync } from 'node:fs'

const SCRIPT = readFileSync('examples/kb-agent/scripts/w7b6-binmap.mts', 'utf8')
const constant = /^export const BLOCK_UPDATE_CHANNEL = '([^']+)'$/m.exec(SCRIPT)
if (constant === null) throw new Error('w7b6-binmap.mts no longer exports BLOCK_UPDATE_CHANNEL')
const channel = constant[1]
if (channel !== 'destroy+addBlock') throw new Error(`BLOCK_UPDATE_CHANNEL drifted to '${channel}' — update the docs named below together`)

/** Each entry: a doc that names the channel, and the substring it must carry. */
const DOCS = [
  ['examples/kb-agent/QUICKSTART.zh.md', 'BLOCK_UPDATE_CHANNEL'],
  ['.agents/notes/implemented/architecture/2026-10-04-w7-b6-m3-final-verification.md', 'BLOCK_UPDATE_CHANNEL'],
  ['.agents/notes/implemented/architecture/2026-10-04-w7-b6-m3-final-verification.zh.md', 'BLOCK_UPDATE_CHANNEL'],
  ['research/2026-10-03-w7-rework/99-w7-deliverables.md', 'BLOCK_UPDATE_CHANNEL'],
]

const failures = []
for (const [path, mustContain] of DOCS) {
  const text = readFileSync(path, 'utf8')
  if (!text.includes(mustContain)) failures.push(`${path}: no ${mustContain} reference`)
  for (const line of text.split('\n')) {
    if (line.includes('w7b6-binmap') || line.includes('BIN_MAP_CODE')) {
      if (/flowSurfaces:updateSettings/.test(line) && !/写不进|never|no direct-update/.test(line)) {
        failures.push(`${path}: still presents flowSurfaces:updateSettings as the bin-map channel: ${line.slice(0, 120)}`)
      }
    }
  }
  console.log(`${path}: ${text.includes(mustContain) ? 'OK' : 'MISSING ' + mustContain}`)
}
console.log(`BLOCK_UPDATE_CHANNEL = '${channel}'`)
if (failures.length > 0) {
  console.log(`CHANNEL CHECK FAIL (${String(failures.length)}):`)
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exit(1)
}
console.log('CHANNEL CHECK GREEN — docs and constant agree on destroy+addBlock')
