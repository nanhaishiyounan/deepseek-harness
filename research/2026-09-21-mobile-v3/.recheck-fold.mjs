/**
 * Recheck harness: replay the live session events through the checked-out
 * foldHistory + the firstOfTurn rule and print the item sequence the source
 * of record should produce (verification artifact, not production code).
 */
import { readFileSync } from 'node:fs'
import { foldHistory } from '../../packages/client/ui-mobile/src/client/fold.ts'

const events = JSON.parse(readFileSync(new URL('./.recheck-events.json', import.meta.url), 'utf8'))
const folded = foldHistory(events)

const isUserOwned = (item) =>
  item !== undefined && ((item.kind === 'text' && item.role === 'user') || item.kind === 'action')

let avatar = 0
let ghost = 0
const lines = []
folded.items.forEach((item, index) => {
  const previous = folded.items[index - 1]
  const first = previous === undefined || isUserOwned(previous)
  let brief = item.kind
  if (item.kind === 'text') brief = `${item.role}:${item.text.slice(0, 22).replace(/\n/g, ' ')}`
  if (item.kind === 'tool') brief = `tool ${item.name} state=${item.state} protocol=${String(item.protocol === true)} label=${item.label}`
  if (item.kind === 'field-ask') brief = `field-ask ${item.payload.field.label}`
  if (item.kind === 'ask') brief = `ask ${item.payload.question.slice(0, 16)}`
  if (item.kind === 'task-card') brief = `task-card ${item.payload?.title ?? item.draft.collection}`
  if (item.kind === 'receipt') brief = `receipt row=${item.payload.rowId}`
  if (item.kind === 'action') brief = `action ${item.action}`
  const aiOwned = item.kind !== 'text' || item.role !== 'user'
  if (aiOwned && item.kind !== 'tool' && item.kind !== 'action') {
    if (first) avatar += 1; else ghost += 1
  }
  lines.push(`${first ? '[AVATAR]' : aiOwned ? '[ghost]' : '        '} ${brief}`)
})
console.log(lines.join('\n'))
console.log(`\nSUMMARY: items=${folded.items.length} avatarFirstSegments=${avatar} ghostContinuations=${ghost}`)
