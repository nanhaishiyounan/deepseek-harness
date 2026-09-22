/**
 * Form-assistant draft parsing: the pure extraction that turns the assistant
 * message's fenced JSON draft (the `mobile-form-assistant` persona contract)
 * into the task card's editable model, the user's confirm-push message back
 * into the final field set, and the push receipt into a row anchor. No React
 * imports.
 */

/** One AI-prefilled form draft: the task card's whole data. */
export interface FormDraft {
  /** Target NocoBase collection (the nb_create destination). */
  readonly collection: string
  /** Human title of the card (the business object being registered). */
  readonly title: string
  /** Field values keyed by the collection's field name; all strings. */
  readonly fields: Readonly<Record<string, string>>
}

/** Receipt of a confirmed push: where the row landed. */
export interface PushReceipt {
  readonly collection: string
  readonly rowId: number
}

/** A user confirm-push message: the final field set the review card locked in. */
export interface ConfirmPush {
  readonly collection: string
  readonly fields: Readonly<Record<string, string>>
}

/** One fenced code block with its source span (the whole fence included). */
interface FencedSpan {
  readonly body: string
  readonly whole: string
  readonly start: number
  readonly end: number
}

/** All fenced code blocks of a message (language tag optional). */
function fencedBlocks(text: string): FencedSpan[] {
  const blocks: FencedSpan[] = []
  const pattern = /```[a-zA-Z]*\s*\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    // The capture group is mandatory in the pattern, so the fallback arm exists for the type, not a reachable miss.
    /* v8 ignore next -- the capture group always binds. */
    const body = match[1] ?? ''
    const start = match.index
    blocks.push({ body, whole: match[0], start, end: start + match[0].length })
  }
  return blocks
}

/** Coerce one draft field value to its display string. */
function fieldString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

/**
 * Parse every valid form draft out of an assistant message, in order. A
 * multi-step plan (supplier → order → items) carries one draft per step, and
 * each becomes its own task card.
 * @param text - the assistant message's full text.
 * @returns the drafts the message carries (empty when none).
 */
export function parseFormDrafts(text: string): FormDraft[] {
  const drafts: FormDraft[] = []
  for (const block of fencedBlocks(text)) {
    const candidate = parseDraftObject(block.body)
    if (candidate !== undefined) drafts.push(candidate)
  }
  return drafts
}

/**
 * Split a v2 assistant message into its narrative and its fenced drafts:
 * every fence that parses as a draft leaves the narrative (the bubble never
 * repeats the protocol), while non-draft fences stay as ordinary text.
 * @param text - the assistant message's full text.
 * @returns the narrative and the drafts in source order.
 */
export function splitDraftMessage(text: string): { narrative: string; drafts: FormDraft[] } {
  const kept: string[] = []
  const drafts: FormDraft[] = []
  let last = 0
  for (const block of fencedBlocks(text)) {
    const draft = parseDraftObject(block.body)
    if (draft === undefined) continue
    kept.push(text.slice(last, block.start))
    drafts.push(draft)
    last = block.end
  }
  kept.push(text.slice(last))
  return { narrative: kept.join('').trim(), drafts }
}

/**
 * Drop `//` line comments the model interleaves into draft blocks.
 * @param block - the raw fenced-JSON block text.
 * @returns the block with comment lines removed.
 */
export function stripJsonComments(block: string): string {
  return block
    .split('\n')
    .filter(line => !line.trim().startsWith('//'))
    .join('\n')
}

/** Validate one fenced block's parsed JSON against the draft shape. */
function parseDraftObject(block: string): FormDraft | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripJsonComments(block))
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const obj = parsed as Record<string, unknown>
  if (typeof obj['collection'] !== 'string' || obj['collection'] === '') return undefined
  const rawFields = obj['fields']
  if (typeof rawFields !== 'object' || rawFields === null || Array.isArray(rawFields)) return undefined
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(rawFields)) {
    const text = fieldString(value)
    if (text !== undefined) fields[key] = text
  }
  if (Object.keys(fields).length === 0) return undefined
  const title = typeof obj['title'] === 'string' && obj['title'] !== '' ? obj['title'] : obj['collection']
  return { collection: obj['collection'], title, fields }
}

/**
 * Detect the push receipt in an assistant message: the persona's confirmed
 * nb_create reply names the landing row (`业务表 <collection> 行 id=<n>`).
 * @param text - the assistant message's full text.
 * @returns the receipt anchor, or undefined when the message is not one.
 */
export function parsePushReceipt(text: string): PushReceipt | undefined {
  const idMatch = /id\s*[=:：]\s*(\d+)/.exec(text)
  if (idMatch === null) return undefined
  // The receipt names the table possibly backticked (`hub_po_suppliers`).
  const collectionMatch = /(?:业务表|collection)[`'"\s:：]*([A-Za-z][A-Za-z0-9_]*)/.exec(text)
  if (collectionMatch === null) return undefined
  // The capture group is mandatory in the pattern, so the fallback arm exists for the type, not a reachable miss.
  /* v8 ignore next -- the capture group always binds. */
  return { collection: collectionMatch[1] ?? '', rowId: Number(idMatch[1]) }
}

/**
 * Parse the user's confirm-push message (the review card's submit action):
 * `确认推送：…调用 nb_create…` carrying the final `{collection, fields}` JSON.
 * @param text - the user message the review card sent.
 * @returns the confirmed collection and final fields, or undefined when the
 * message is not a confirm-push.
 */
export function parseConfirmPush(text: string): ConfirmPush | undefined {
  if (!text.startsWith('确认推送：')) return undefined
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  // The slice always starts at '{', so a successful parse is an object.
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return undefined
  }
  const obj = parsed as Record<string, unknown>
  if (typeof obj['collection'] !== 'string' || obj['collection'] === '') return undefined
  const rawFields = obj['fields']
  if (typeof rawFields !== 'object' || rawFields === null || Array.isArray(rawFields)) return undefined
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(rawFields)) {
    const text = fieldString(value)
    if (text !== undefined) fields[key] = text
  }
  if (Object.keys(fields).length === 0) return undefined
  return { collection: obj['collection'], fields }
}
