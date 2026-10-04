/**
 * Code 128 / GS1-128 encoder-decoder (the W6-B3 label spine, zero
 * dependencies by design — one implementation serves the labels SPA, the
 * engine's GET /label/lot.svg, and the acceptance round-trip assertion).
 *
 * GS1-128 is Code 128 with FNC1 in first position: AI(01) GTIN-14, AI(10)
 * batch, AI(11) production date YYMMDD, AI(17) expiry YYMMDD — the food
 * batch label's legal minimum set (GS1 ref.gs1.org/ai/). Mixed digit/alpha
 * payloads ride the B/C code-set switch (Code C packs digit pairs); the
 * encoder emits the standard 11-module patterns and the decoder re-reads the
 * bar widths — generate-then-decode round-trips, which is exactly what a
 * scanner does to the printed bars.
 */

/** The 107 Code 128 patterns (start A/B/C, data, checks, stop), 11 modules each — BWIPP's table. */
const PATTERNS: readonly string[] = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100',
  '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
  '11001000100', '11000100100', '10110011100', '10011011100', '10011001110',
  '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
  '11001001110', '11011100100', '11001110100', '11101101110', '11101001100',
  '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000',
  '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
  '11000101000', '11000100010', '10110111000', '10110001110', '10001101110',
  '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
  '11000101110', '11011101000', '11011100010', '11011101110', '11101011000',
  '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100',
  '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
  '10110000100', '10011010000', '10011000010', '10000110100', '10000110010',
  '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
  '10100111100', '10010111100', '10010011110', '10111100100', '10011110100',
  '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110',
  '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
  '10111101110', '11101011110', '11110101110', '11010000100', '11010010000',
  '11010011100', '1100011101011',
]

/** Code-set-B value for one ASCII char; Code-C packs digit pairs. */
const valueB = (char: string): number => char.charCodeAt(0) - 32

/** FNC1's Code B value (the GS1 separator after the leading AI group). */
const FNC1_B = 102

/** The symbol's code-set sequence (one entry per symbol character). */
interface SymbolChar {
  readonly pattern: string
  readonly value: number
  readonly text: string
}

/**
 * Encode one payload into Code 128 symbol characters: START C when the head
 * is ≥4 digits (the GS1 GTIN head always is), FNC1 in first position for
 * GS1 mode, B/C switching for alpha segments (batch numbers), check
 * character, stop pattern.
 * @param payload - the raw text (no AI brackets — the GS1 data string).
 * @param gs1 - whether to mark the symbol GS1-128 (leading FNC1).
 * @returns the symbol characters plus the human-readable text.
 */
/**
 * Escape text for embedding in SVG/XML markup (attribute values included):
 * the five predefined entities, with XML-1.0-illegal control characters
 * stripped first (an image-mode SVG decoder refuses the whole document over
 * one stray U+001D).
 * @param text - the raw text.
 * @returns the escaped text.
 */
export function escapeXml(text: string): string {
  // XML 1.0 cannot carry control characters below #x20 (the GS1 GS
  // separator U+001D rides the payload; a stray one in the human text
  // would make image-mode SVG decoding fail fatally) — strip them.
  const printable = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  return printable.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

export function encodeCode128(payload: string, gs1: boolean): { readonly chars: readonly SymbolChar[]; readonly text: string } {
  if (payload.length === 0) throw new Error('Code128 payload 为空')
  const chars: SymbolChar[] = []
  let rest = payload
  let codeSet: 'B' | 'C' = /^\d{4}/.test(rest) ? 'C' : 'B'
  if (gs1 && /^\d{14}/.test(rest)) {
    chars.push({ pattern: PATTERNS[105], value: 105, text: 'START C' }, { pattern: PATTERNS[102], value: 102, text: 'FNC1' })
  } else if (gs1) {
    chars.push({ pattern: PATTERNS[104], value: 104, text: 'START B' }, { pattern: PATTERNS[FNC1_B], value: FNC1_B, text: 'FNC1' })
    codeSet = 'B'
  } else {
    chars.push(codeSet === 'C'
      ? { pattern: PATTERNS[105], value: 105, text: 'START C' }
      : { pattern: PATTERNS[104], value: 104, text: 'START B' })
  }
  while (rest.length > 0) {
    const wantC = /^\d{4}/.test(rest) || (codeSet === 'C' && /^\d\d$/.test(rest) && chars[chars.length - 1]?.text === 'FNC1')
    const target: 'B' | 'C' = wantC ? 'C' : 'B'
    if (target !== codeSet) {
      chars.push(target === 'C'
        ? { pattern: PATTERNS[99], value: 99, text: 'CODE C' }
        : { pattern: PATTERNS[100], value: 100, text: 'CODE B' })
      codeSet = target
    }
    if (codeSet === 'C') {
      const pair = rest.slice(0, 2)
      if (!/^\d\d$/.test(pair)) throw new Error(`Code C 数字对无效：${pair}`)
      chars.push({ pattern: PATTERNS[Number(pair)], value: Number(pair), text: pair })
      rest = rest.slice(2)
      continue
    }
    const head = rest[0] ?? ''
    // GS1 mid-FNC1 rides the GS separator (U+001D) in the element string:
    // encode it as FNC1 (value 102, same pattern in both code sets) — the
    // mandatory delimiter after a variable-length AI (GS1 GenSpec §7.8.4).
    if (head === '\x1d') {
      chars.push({ pattern: PATTERNS[102], value: 102, text: 'FNC1' })
      rest = rest.slice(1)
      continue
    }
    if (head.charCodeAt(0) < 32 || head.charCodeAt(0) > 126) throw new Error(`Code128 字符超出可编码范围：${head}`)
    chars.push({ pattern: PATTERNS[valueB(head)], value: valueB(head), text: head })
    rest = rest.slice(1)
  }
  let sum = 0
  chars.forEach((char, index) => { sum += index === 0 ? char.value : char.value * index })
  const check = sum % 103
  chars.push({ pattern: PATTERNS[check], value: check, text: `CHECK ${String(check)}` })
  // STOP is the standard 13-module termination pattern (11 modules + the
  // 2-module termination bar, ISO/IEC 15417: width sequence 2-3-3-1-1-1-2)
  // — never padded with extra modules.
  chars.push({ pattern: PATTERNS[106], value: 106, text: 'STOP' })
  return { chars, text: gs1 ? `(${payload.slice(0, 2)})${payload.slice(2)}` : payload }
}

/**
 * Decode a bar-width sequence back to text — the scanner's view of the
 * printed bars (the acceptance round-trip leg): widths → 11-module binary →
 * pattern lookup → code-set state machine.
 * @param widths - alternating bar/space widths in modules.
 * @returns the decoded payload (GS1 FNC1 dropped, code-set switch marks resolved).
 */
export function decodeCode128(widths: readonly number[]): string {
  // Widths alternate bar/space starting with a bar — rebuild the module line
  // by filling each run with its phase's bit.
  const bits = widths.map((width, index) => (index % 2 === 0 ? '1' : '0').repeat(width)).join('')
  const byPattern = new Map(PATTERNS.map(pattern => [pattern, PATTERNS.indexOf(pattern)]))
  let codeSet = 'B'
  const out: string[] = []
  const values: number[] = []
  for (let index = 0; index + 11 <= bits.length; index += 11) {
    const value = byPattern.get(bits.slice(index, index + 11))
    if (value === undefined) break // the stop region's 13-module tail mismatches
    if (value === 106) break
    values.push(value)
  }
  // The last collected value is the check character — payload excludes it.
  for (const value of values.slice(0, -1)) {
    if (value === 105 || value === 99) { codeSet = 'C'; continue }
    if (value === 104 || value === 100) { codeSet = 'B'; continue }
    if (value === 103) continue // START A never emitted here
    if (value === 102) { if (out.length > 0) out.push('\x1d'); continue } // leading FNC1 dropped, mid GS kept
    if (codeSet === 'C') { out.push(String(value).padStart(2, '0')) } else { out.push(String.fromCharCode(value + 32)) }
  }
  return out.join('')
}

/**
 * Render one label's Code 128 bars as a standalone SVG document (the engine
 * route returns this verbatim; the SPA embeds it). The legal minimum lines
 * (batch / product / expiry / supplier — 食安法第 50/51 条记录要素) ride the
 * text zone under the bars.
 * @param spec - the barcode payload, the human lines, the geometry.
 * @returns the complete SVG document string.
 */
export function labelSvg(spec: {
  readonly payload: string
  readonly gs1: boolean
  readonly human: string
  readonly lines: readonly string[]
  readonly widthMm: number
  readonly heightMm: number
  readonly title: string
}): string {
  const { chars, text } = encodeCode128(spec.payload, spec.gs1)
  const modules = chars.map(char => char.pattern).join('')
  const barDs: string[] = []
  let runStart = -1
  for (let index = 0; index < modules.length; index += 1) {
    const isBar = modules[index] === '1'
    if (isBar && runStart < 0) runStart = index
    if (!isBar && runStart >= 0) {
      barDs.push(`M${String(runStart)} 0h${String(index - runStart)}v40H${String(runStart)}z`)
      runStart = -1
    }
  }
  if (runStart >= 0) barDs.push(`M${String(runStart)} 0h${String(modules.length - runStart)}v40H${String(runStart)}z`)
  // Every bar is a real <path> element (a bare run-length string inside <g>
  // renders nothing — the W6-R3 lesson 19); a scanner-grade SVG needs one
  // drawable element per bar run.
  const bars = barDs.map(d => `<path d="${d}"/>`).join('')
  const quiet = 10
  const scale = (spec.widthMm - quiet * 2) / modules.length
  const svgWidth = spec.widthMm * 3.78 // mm→px @96dpi
  const svgHeight = spec.heightMm * 3.78
  const barHeight = 40
  const textRows = [spec.human, ...spec.lines]
  const textBlock = textRows.map((line, rowIndex) =>
    `<text x="${String(svgWidth / 2)}" y="${String(barHeight + 18 + rowIndex * 14)}" text-anchor="middle" font-size="${String(rowIndex === 0 ? 13 : 11)}" font-weight="${rowIndex === 0 ? 700 : 400}" font-family="monospace" fill="#111">${escapeXml(line)}</text>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${String(Math.round(svgWidth))}" height="${String(Math.round(svgHeight))}" viewBox="0 0 ${String(Math.round(svgWidth))} ${String(Math.round(svgHeight))}" data-w6b3-label="${escapeXml(spec.title)}">
<title>${escapeXml(spec.title)}</title>
<rect width="100%" height="100%" fill="#fff"/>
<g transform="translate(${String(quiet * 3.78)}, 6) scale(${String(scale * 3.78)}, 1)" fill="#000">${bars}</g>
${textBlock}
<text x="${String(svgWidth - 6)}" y="${String(svgHeight - 5)}" text-anchor="end" font-size="8" fill="#999">${spec.gs1 ? 'GS1-128 ' : 'Code128 '}${escapeXml(text.slice(0, 40))}</text>
</svg>`
}

/** The GS1 lot field quadruple both {@link gs1Payload} and {@link parseGs1} speak. */
interface Gs1LotFields {
  readonly gtin: string
  readonly batch: string
  readonly productionDate: string
  readonly expiryDate: string
}

/**
 * Build the food batch GS1 payload: AI(01) GTIN-14 + AI(10) batch + AI(11)
 * production YYMMDD + AI(17) expiry YYMMDD — the legal minimum four (what
 * the label is, which batch, when made, when due). Field separators ride
 * FNC1 (the fixed-length AIs 01/11/17 need none; AI(10) is last so it needs
 * none either — a well-formed GS1 element string with zero GS characters).
 * @param spec - the GTIN, batch number, production/expiry dates.
 * @returns the GS1 element string.
 */
export function gs1Payload(spec: Gs1LotFields): string {
  if (!/^\d{13,14}$/.test(spec.gtin)) throw new Error(`GTIN 需 13/14 位数字（收到 ${spec.gtin}）`)
  const yy = (isoDate: string): string => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new Error(`日期需 YYYY-MM-DD（收到 ${isoDate}）`)
    return `${isoDate.slice(2, 4)}${isoDate.slice(5, 7)}${isoDate.slice(8, 10)}`
  }
  if (!/^[\x20-\x7e]{1,20}$/.test(spec.batch)) throw new Error(`批号需 1-20 可见 ASCII（收到 ${spec.batch}）`)
  // AI(10) is variable-length: the element string must delimit its end with
  // GS (U+001D → mid-FNC1) before AI(11) follows (fixed-length AIs 01/11/17
  // need no delimiter). The encoder maps GS to FNC1; the decoder re-emits it.
  return `01${spec.gtin.padStart(14, '0')}10${spec.batch}\x1d11${yy(spec.productionDate)}17${yy(spec.expiryDate)}`
}

/**
 * Parse a decoded GS1 element string back into its four AIs (the acceptance
 * decoder leg): the fixed-length 01/11/17 fields read positionally, 10 takes
 * the tail up to the mid-FNC1 GS separator (mandatory after the
 * variable-length AI(10); a pre-FNC1 element string without it still parses).
 * @param payload - the decoded GS1 element string.
 * @returns the four parsed fields.
 */
export function parseGs1(payload: string): Gs1LotFields {
  const match = /^01(\d{14})10([^\x1d]*)(?:\x1d)?11(\d{6})17(\d{6})$/.exec(payload)
  if (match === null) throw new Error(`GS1 解析失败：${payload.slice(0, 60)}`)
  const isoOf = (yymmdd: string): string => `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`
  return { gtin: match[1] ?? '', batch: match[2] ?? '', productionDate: isoOf(match[3] ?? ''), expiryDate: isoOf(match[4] ?? '') }
}
