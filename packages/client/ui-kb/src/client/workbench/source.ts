/**
 * Pure presentation helpers shared by the workbench's hit cards and document
 * list: the business-language source label, keyword highlighting, and the
 * relative-time phrasing. No state, no IO.
 * @module @deepseek-ai/dsh-client-ui-kb/client/workbench/source
 */

/** One slice of highlighted content: plain text or a marked match. */
export interface HighlightSegment {
  readonly text: string
  readonly mark: boolean
}

/**
 * Derive the business-language document label from a source path: the file
 * base name without its extension, dashes read as spaces. Root prefixes and
 * directories never show (the full path stays available as the hover title).
 * @param sourcePath - the hit's full relative source path.
 * @returns the display label (the raw base name when it has no dot part).
 */
export function documentLabelOf(sourcePath: string): string {
  /* v8 ignore next -- split always yields a last element; the arm only
     satisfies noUncheckedIndexedAccess. */
  const base = sourcePath.split('/').at(-1) ?? sourcePath
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  return stem.replaceAll('-', ' ')
}

/**
 * Split content into plain and marked segments around case-insensitive
 * occurrences of the search terms. Overlapping matches merge; empty or blank
 * terms are ignored.
 * @param content - the passage text.
 * @param terms - the raw query terms (whitespace-separated words).
 * @returns the ordered segments; one unmarked segment when nothing matches.
 */
export function highlightSegments(content: string, terms: readonly string[]): readonly HighlightSegment[] {
  const needles = [...new Set(terms.map(term => term.trim().toLowerCase()).filter(term => term !== ''))]
  if (needles.length === 0 || content === '') return [{ text: content, mark: false }]

  // Collect [start, end) match intervals, then merge overlaps.
  const lower = content.toLowerCase()
  const spans: [number, number][] = []
  for (const needle of needles) {
    let from = 0
    for (;;) {
      const at = lower.indexOf(needle, from)
      if (at === -1) break
      spans.push([at, at + needle.length])
      from = at + needle.length
    }
  }
  if (spans.length === 0) return [{ text: content, mark: false }]
  spans.sort((left, right) => left[0] - right[0] || left[1] - right[1])

  const segments: HighlightSegment[] = []
  let cursor = 0
  for (const [start, end] of spans) {
    if (start < cursor) continue
    if (start > cursor) segments.push({ text: content.slice(cursor, start), mark: false })
    segments.push({ text: content.slice(start, end), mark: true })
    cursor = end
  }
  if (cursor < content.length) segments.push({ text: content.slice(cursor), mark: false })
  return segments
}

/**
 * Phrase the distance between a record time and now in one relative-time
 * step (minutes, hours, or days) using the platform formatter.
 * @param at - the record's epoch milliseconds.
 * @param now - the current epoch milliseconds.
 * @param language - the display language.
 * @returns the localized relative-time phrase.
 */
export function relativeTimeOf(at: number, now: number, language: 'zh' | 'en'): string {
  const minutes = Math.max(0, Math.round((now - at) / 60000))
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: 'auto' })
  if (minutes < 1) return formatter.format(0, 'minute')
  if (minutes < 60) return formatter.format(-minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return formatter.format(-hours, 'hour')
  return formatter.format(-Math.floor(hours / 24), 'day')
}
