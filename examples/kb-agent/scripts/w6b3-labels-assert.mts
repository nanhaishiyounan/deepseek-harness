/**
 * W6-B3/W6-R3 label round-trip assertions (the scanner's view plus the
 * browser's): fetch the engine's rendered /label/lot.svg for one
 * fully-dated FG lot, re-read the bar widths out of the SVG paths, decode
 * them through the shared {@link ../labels/src/code128.ts} decoder, and
 * reconcile the parsed GS1 AIs against wms_lots (01 GTIN product-level 14
 * digits / 10 batch / 11 production / 17 expiry — the legal minimum four).
 *
 * W6-R3 legs: the browser-render layer (a real headless-Chrome CDP session
 * loads the SVG and proves the paths draw with non-zero width — lesson 19),
 * the XSS negative (a `<script>`-carrying batch number must come back
 * fully escaped, no executable node — lesson 20), and the GS1/ISO 15417
 * external-standard vector leg (STOP termination 2-3-3-1-1-1-2 = 13
 * modules, check character mod 103, mid-FNC1 exactly after the
 * variable-length AI(10) — lesson 24/GS1 GenSpec §7.8.4).
 *
 * Usage: node --import tsx/esm examples/kb-agent/scripts/w6b3-labels-assert.mts
 */
import { spawn, spawnSync, execSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { decodeCode128, encodeCode128, gs1Payload, parseGs1 } from '../labels/src/code128.ts'

const here = (script: string): string => fileURLToPath(new URL(script, import.meta.url))
const psql = (sql: string): string => {
  const env = readFileSync(here('../../../platform/nocobase/.env'), 'utf8')
  const envOf = (key: string): string | undefined => env.split('\n').map(line => line.trim()).find(line => line.startsWith(`${key}=`))?.slice(key.length + 1)
  const run = spawnSync('psql', [
    '-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres',
    '-d', envOf('DB_DATABASE') ?? envOf('DB_NAME') ?? 'nocobase', '-t', '-A', '-c', sql,
  ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' }, timeout: 20_000, maxBuffer: 16 * 1024 * 1024 })
  if (run.status !== 0) throw new Error(`psql failed: ${(run.stderr ?? '').slice(0, 300)}`)
  return run.stdout.trim()
}

const failures: string[] = []
const check = (name: string, ok: boolean, detail = ''): void => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail === '' ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(name)
}

// ─── the live-engine leg ───

const row = psql(`SELECT l.lot_no || '|' || l.production_date || '|' || l.expiry_date FROM wms_lots l
WHERE l.production_date IS NOT NULL AND l.expiry_date IS NOT NULL
  AND EXISTS (SELECT 1 FROM mfg_completions c WHERE c.lot_no = l.lot_no)
ORDER BY l.id LIMIT 1;`)
if (row === '') throw new Error('无四日期齐全的成品批次（先跑 w6b3-trace --migrate）')
const [lotNo, production, expiry] = row.split('|')
console.log(`w6b3-labels: --assert 开始（锚点 ${lotNo ?? ''}）`)
const svg = await fetch(`http://127.0.0.1:13110/label/lot.svg?lot_no=${encodeURIComponent(String(lotNo))}&code=gs1`).then(response => response.text())
check('引擎 /label/lot.svg 渲染产出', svg.includes('data-w6b3-label') && svg.includes('GS1-128'), `${String(svg.length)}B`)

// W6-R3 P0-1: the bars must be real <path> elements (the bare-run-length
// regression rendered zero pixels in every consumer).
const pathCount = (svg.match(/<path d=/g) ?? []).length
check('条码为真实 <path> 元素（lesson19 渲染 0 像素修复）', pathCount > 10, `${String(pathCount)} 条`)

// Bar paths (M x 0h wv40H xz) → module-width sequence: bars first, spaces
// read from the gaps — the widths a scanner's photo row would measure. The
// narrowest bar is one module (Code128's minimum run), so it calibrates the
// scale; every run then rounds to whole modules.
const bars = [...svg.matchAll(/M(\d+) 0h(\d+)v40H\1z/g)]
  .map(match => [Number(match[1]), Number(match[2])] as const)
  .sort((a, b) => a[0] - b[0])
if (bars.length < 10) throw new Error(`SVG bar paths ${String(bars.length)} 条——渲染形态异常`)
const scale = Math.min(...bars.map(([, w]) => w))
const widths: number[] = []
let cursor = bars[0]?.[0] ?? 0
for (const [x, w] of bars) {
  const gap = Math.round((x - cursor) / scale)
  if (gap > 0) widths.push(gap)
  widths.push(Math.max(1, Math.round(w / scale)))
  cursor = x + w
}
const decoded = decodeCode128(widths)
const parsed = parseGs1(decoded)
check('条码回读：SVG bars 解码出 GS1 元素串', parsed.batch === lotNo, `解码批号 ${parsed.batch}`)
check('AI(10) 批号 = wms_lots.lot_no', parsed.batch === lotNo)
check('AI(11) 生产日期与库一致', parsed.productionDate === production, `${parsed.productionDate} == ${String(production)}`)
check('AI(17) 到期日与库一致', parsed.expiryDate === expiry, `${parsed.expiryDate} == ${String(expiry)}`)
check('AI(01) GTIN 为 14 位产品级编码', /^\d{14}$/.test(parsed.gtin), parsed.gtin)
check('法定最低信息集文本行（批号/日期）', svg.includes(String(lotNo)) && /生产/.test(svg))

// ─── W6-R3: the GS1 / ISO-IEC-15417 external-standard vector leg ───
// The standard facts are independent of this repo's implementation: the
// STOP termination (11 modules + 2-module bar = width sequence 2-3-3-1-1-1-2
// over 13 modules), the check character (weighted sum mod 103 over START..
// data with weight 1 for position 0), and the mid-FNC1 delimiter exactly
// after the variable-length AI(10) before AI(11) (GS1 GenSpec §7.8.4).
{
  const probe = gs1Payload({ gtin: '6901234567892', batch: 'B-26', productionDate: '2026-09-01', expiryDate: '2026-10-01' })
  const { chars } = encodeCode128(probe, true)
  const modules = chars.map(char => char.pattern).join('')
  check('外部向量：STOP 终止条 13 模块（2-3-3-1-1-1-2）', modules.endsWith('1100011101011'))
  const stopWidths = (() => {
    const tail = '1100011101011'
    const runs: number[] = []
    let run = 1
    for (let index = 1; index < tail.length; index += 1) {
      if (tail[index] === tail[index - 1]) run += 1
      else { runs.push(run); run = 1 }
    }
    runs.push(run)
    return runs.join('')
  })()
  check('外部向量：STOP 宽度序列 2331112（ISO 15417）', stopWidths === '2331112', stopWidths)
  let sum = 0
  chars.slice(0, -2).forEach((char, index) => { sum += index === 0 ? char.value : char.value * index })
  const checkChar = chars[chars.length - 2]
  check('外部向量：校验字符 = 加权和 mod 103', checkChar?.value === sum % 103, `${String(checkChar?.value)} vs ${String(sum % 103)}`)
  const texts = chars.map(char => char.text)
  const lastBatchChar = texts.indexOf('6')
  const midFnc1 = texts.indexOf('FNC1', 2)
  check('外部向量：变长 AI(10) 后紧跟 mid-FNC1（GS1 §7.8.4）', midFnc1 === lastBatchChar + 1, `batch末位@${String(lastBatchChar)} FNC1@${String(midFnc1)}：${texts.slice(Math.max(0, lastBatchChar - 2), midFnc1 + 2).join(',')}`)
  check('外部向量：头部 FNC1 与 mid-FNC1 之间无第三个分隔（固定长 AI 01 直达）', texts.slice(2, midFnc1).every(text => text !== 'FNC1'), texts.slice(2, Math.min(texts.length, 12)).join(','))
  const quietPx = Number(/translate\(([\d.]+), 6\)/.exec(svg)?.[1] ?? 0)
  const modulePx = Number(/scale\(([\d.]+), 1\)/.exec(svg)?.[1] ?? 0)
  check('外部向量：静区 ≥10 模块宽（GS1 5.4.6）', quietPx >= 10 * modulePx - 0.01, `quiet=${String(Math.round(quietPx))}px 10X=${String(Math.round(10 * modulePx))}px`)
}

// ─── W6-R3 P0-2: the XSS negative leg ───
// A batch number carrying markup must reach the SVG fully escaped (the
// five predefined entities), with no executable node surviving.
const AMP = String.fromCharCode(38)
const LT = String.fromCharCode(60)
const GT = String.fromCharCode(62)
const SQ = String.fromCharCode(39)
const DQ = String.fromCharCode(34)
// The injection carrier stays within the 1-20 visible-ASCII batch budget
// (a longer payload is refused fail-loud by gs1Payload — the JSON error
// body carries the raw text under application/json, which browsers never
// execute as markup) while still covering all five escape targets.
const XSS_LOT = `${LT}script${GT}${AMP}${SQ}${DQ}x`
{
  const productId = psql(`SELECT id FROM hub_inv_products LIMIT 1;`)
  psql(`INSERT INTO wms_lots (lot_no, production_date, expiry_date, status, product_id)
VALUES ('${XSS_LOT.replaceAll(String.fromCharCode(39), String.fromCharCode(39, 39))}', CURRENT_DATE - 30, CURRENT_DATE + 60, 'quarantined', ${productId});`)
  try {
    const xssSvg = await fetch(`http://127.0.0.1:13110/label/lot.svg?lot_no=${encodeURIComponent(XSS_LOT)}&code=gs1`).then(response => response.text())
    const rawOpen = `${LT}script`
    const rawClose = `${LT}/script`
    check('XSS 负向：无未转义 <script 开标签（SVG 区）', !xssSvg.slice(xssSvg.indexOf('</rect>')).includes(rawOpen))
    check('XSS 负向：无未转义 </script 闭标签', !xssSvg.includes(rawClose))
    check('XSS 负向：注入五字符全以实体形态出现', xssSvg.includes(AMP + 'lt;script' + AMP + 'gt;') && xssSvg.includes(AMP + 'amp;') && xssSvg.includes(AMP + '#39;') && xssSvg.includes(AMP + 'quot;'), 'lt/script/amp/#39/quot')
  } finally {
    psql(`DELETE FROM wms_lots WHERE lot_no = '${XSS_LOT.replaceAll(String.fromCharCode(39), String.fromCharCode(39, 39))}';`)
  }
}

// ─── W6-R3 P0-1: the browser-render layer ───
// A real headless-Chrome CDP session loads the SVG document and proves the
// paths draw: element count > 0 and rendered width > 0 (the lesson-19
// regression had neither). Same CDP posture as demos/acceptance-w6/w6-b3-shoot.mjs.
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const RENDER_PROBE = `(() => {
  const paths = document.querySelectorAll('path')
  let drawn = 0, totalWidth = 0
  for (const p of paths) { try { const b = p.getBBox(); if (b.width > 0) { drawn++; totalWidth += b.width } } catch {} }
  const barGroup = document.querySelector('g')
  return { paths: paths.length, drawn, totalWidth: Math.round(totalWidth), svgWidth: document.querySelector('svg')?.getAttribute('width') }
})()`
{
  const dir = mkdtempSync(`${tmpdir()}/w6r3-svg-`)
  const file = `${dir}/lot.svg`
  writeFileSync(file, svg)
  const port = 9353
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${String(port)}`, '--headless=new', '--no-first-run', '--disable-gpu',
    `--user-data-dir=${dir}/profile`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'], detached: true })
  chrome.unref()
  let target: { webSocketDebuggerUrl?: string } | null = null
  for (let attempt = 0; attempt < 20 && target === null; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 500))
    try {
      const json = await (await fetch(`http://localhost:${String(port)}/json/list`)).json() as { webSocketDebuggerUrl?: string; type?: string }[]
      target = json.find(entry => entry.type === 'page') ?? null
    } catch { /* chrome not up yet */ }
  }
  if (target?.webSocketDebuggerUrl === undefined) {
    check('浏览器渲染层：CDP 会话建立', false, 'headless chrome did not come up')
  } else {
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    let seq = 0
    const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
    const send = (method: string, params: Record<string, unknown> = {}): Promise<never> => new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
    ws.onmessage = (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: unknown }
      if (message.id !== undefined && pending.has(message.id)) {
        const waiter = pending.get(message.id)
        pending.delete(message.id)
        if (message.error !== undefined) waiter?.reject(new Error(JSON.stringify(message.error)))
        else waiter?.resolve(message.result)
      }
    }
    await new Promise<void>(resolve => { ws.onopen = () => { resolve() } })
    await send('Page.enable')
    await send('Page.navigate', { url: `file://${file}` })
    await new Promise(resolve => setTimeout(resolve, 1500))
    const evaluated = await send('Runtime.evaluate', { expression: RENDER_PROBE, returnByValue: true }) as { result?: { value?: { paths: number; drawn: number; totalWidth: number; svgWidth: string | null } } }
    const probe = evaluated.result?.value
    check('浏览器渲染层：path 元素数量 > 0', (probe?.paths ?? 0) > 10, `paths=${String(probe?.paths ?? 0)}`)
    check('浏览器渲染层：实际渲染宽度 > 0（getBBox）', (probe?.drawn ?? 0) > 10 && (probe?.totalWidth ?? 0) > 0, `drawn=${String(probe?.drawn ?? 0)} totalWidth=${String(probe?.totalWidth ?? 0)}px svg=${probe?.svgWidth ?? '?'}px`)
    ws.close()
  }
  try { process.kill(-chrome.pid ?? 0, 'SIGKILL') } catch { /* already gone */ }
  execSync(`pkill -f "remote-debugging-port=${String(port)}" 2>/dev/null || true`)
  rmSync(dir, { recursive: true, force: true })
}

console.log(`w6b3-labels: --assert ${failures.length === 0 ? 'PASS' : `FAIL（${String(failures.length)}）`}`)
if (failures.length > 0) process.exitCode = 1
