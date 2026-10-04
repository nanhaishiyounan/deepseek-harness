#!/usr/bin/env node
/**
 * W6-B6 acceptance driver: CDP headless drive of the CRM workbench
 * end-to-end on the real services (:13110 engine, :13000 NocoBase, :3080 web).
 *
 * CRM legs (evidence files in demos/acceptance-w6/, w6-b6-NN-*):
 *   01 pipe board render (stat cards + five stage columns with Σamount /
 *      weighted sums + the XSS-probe customer name rendered as text)
 *   02 drag move inquiry→quote (synthetic DataTransfer drag events) + psql
 *      recon (stage/probability/status + crm_stage_audit actor)
 *   03 customer 360 (real customer 1 漯河宏发: orders/quotes/AR cards +
 *      the报价→订单→发货→收款 timeline) + psql recon
 *   04 quote→SO conversion through the dialog (server-minted code + product
 *      line) + the idempotent replay refusal + psql recon; 04b the negative
 *      legs (no-token 401, buyer 403, XSS inert)
 * Fix-debt legs (w6-b6fix-NN-*, the insp SPA as quality_lead):
 *   fix-01 the report's judged column (first reading 合格, never 恒 —)
 *   fix-02 reviewer backfill (psql + the rendered 审核人 slot)
 *   fix-03 the conceded inspection's critical alert still open in the ledger
 *   fix-04 a failed verdict's result page carries no report entry/hint
 *   fix-05 disposal globals do not leak between two wizards (A reason ≠ B)
 *   fix-06 the已完成 tab lists judged inspections with the late sign-off entry
 * Assertions land in w6-b6-shot-meta.json; failures exit non-zero.
 */
import { spawn, spawnSync, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const ENGINE = 'http://127.0.0.1:13110'
const NOCO = 'http://localhost:13000'
const OUT = new URL('.', import.meta.url).pathname
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9341
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const envFile = execSync('cat platform/nocobase/.env').toString()
const envOf = (key) => envFile.split('\n').map((l) => l.trim()).find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1)
const psql = (sql) => {
  const run = spawnSync('psql', [
    '-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres',
    '-d', envOf('DB_DATABASE') ?? 'nocobase', '-t', '-A', '-c', sql,
  ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' }, timeout: 20_000 })
  if (run.status !== 0) throw new Error(`psql failed: ${sql}\n${run.stderr ?? ''}`)
  return run.stdout ?? ''
}
const sqlLit = (value) => `'${value.replaceAll("'", "''")}'`

// one extra rehearsal inspection for the failed-verdict legs (QI-W6B5-* so
// w6b5-insp --cleanup owns it too), fresh so the wizard can judge it failed
const seedB6FixInspection = () => {
  const product = psql("SELECT id FROM hub_inv_products WHERE status = 'active' ORDER BY id LIMIT 1;").trim()
  psql(`INSERT INTO qm_inspections (code, insp_type, ref_type, ref_no, lot_no, lot_qty, result, status, product_id, supplier_id, note)
VALUES ('QI-W6B5-B6FIX', 'IPQC', 'completion', 'W6B6-CMP-DEMO', 'W6B6-LOT-FIX', 120, 'pending', 'pending', ${product}, NULL, 'W6-B6 修复债演练（failed 结果页无报告入口/处置不泄漏）——可清理（QI-W6B5 前缀归 w6b5 --cleanup）')
ON CONFLICT DO NOTHING;`)
}

// ─── live triple probe ───
const probe = async (url) => (await fetch(url).then((r) => r.status).catch(() => 0))
const live = {
  engine: await probe(`${ENGINE}/healthz`),
  nocobase: await probe(`${NOCO}/api/app:getInfo`),
  web: await probe('http://localhost:3080/'),
}
console.log(`live: engine=${String(live.engine)} nocobase=${String(live.nocobase)} web=${String(live.web)}`)

// ─── headless chrome ───
const chromeProc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=/tmp/w6b6-shot-profile', '--window-size=1440,1000', '--disable-gpu', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
chromeProc.stderr.on('data', (chunk) => process.stderr.write(`[chrome] ${chunk}`))
chromeProc.unref()

let target = null
for (let attempt = 0; attempt < 25 && target === null; attempt += 1) {
  await sleep(1000)
  try { target = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json() } catch { /* not up yet */ }
}
if (target === null) throw new Error('headless chrome did not come up')

const ws = new WebSocket(target.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq
  pending.set(id, { resolve, reject })
  ws.send(JSON.stringify({ id, method, params }))
})
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.id != null && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result)
  }
}
await new Promise((resolve) => (ws.onopen = resolve))
await send('Page.enable')
await send('Runtime.enable')

const evaluate = async (expression) => {
  const outcome = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (outcome?.exceptionDetails !== undefined) throw new Error(`evaluate failed: ${JSON.stringify(outcome.exceptionDetails).slice(0, 300)}\n${expression.slice(0, 200)}`)
  return outcome?.result?.value
}
const waitFor = async (expression, rounds = 20, delay = 1000) => {
  for (let round = 0; round < rounds; round += 1) {
    if (await evaluate(expression).catch(() => false)) return
    await sleep(delay)
  }
  throw new Error(`waitFor timed out: ${expression.slice(0, 120)}`)
}
const shoot = async (name) => {
  await send('Page.captureScreenshot', { format: 'png' }).then((shot) => {
    writeFileSync(`${OUT}${name}`, Buffer.from(shot.data, 'base64'))
    console.log(`shot: ${name}`)
  })
}

const meta = { assertions: {} }
const assert = (name, ok, detail = '') => {
  meta.assertions[name] = ok === true
  console.log(`  ${ok === true ? '✓' : '✗'} ${name}${detail === '' ? '' : ` — ${String(detail).slice(0, 140)}`}`)
  if (ok !== true) process.exitCode = 1
}
assert('liveTriple', live.engine === 200 && live.nocobase === 200 && live.web === 200)

const HELPERS = `
  const setVal = (sel, v) => { const el = document.querySelector(sel); if (!el) throw new Error('missing ' + sel); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set ?? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) };
  const clickSel = (sel) => { const el = document.querySelector(sel); if (!el) throw new Error('missing ' + sel); el.click(); return el.textContent.trim().slice(0, 60) };
`

// ═══ CRM legs (as sales_rep — 销售部 writable) ═══

await send('Page.navigate', { url: `${ENGINE}/crm?fresh=${String(Date.now())}` })
await waitFor(`document.getElementById('login-view') !== null`)
await evaluate(`(() => { localStorage.removeItem('CRM_TOKEN'); location.href = '${ENGINE}/crm'; return true })()`)
await waitFor(`document.getElementById('login-view') !== null && document.getElementById('login-view').classList.contains('on')`)
await evaluate(`window.__w6b6errors = []; window.addEventListener('error', (e) => window.__w6b6errors.push(String(e.message))); true`)

// sign in through the SPA (engine /terminal/session)
await evaluate(`(() => { ${HELPERS}
  setVal('#login-account', 'sales_rep'); setVal('#login-password', 'Sales#2026'); clickSel('#login-btn'); return true })()`)
await waitFor(`document.querySelectorAll('#board .col').length >= 5`, 30, 1000)
meta.identity = await evaluate(`document.getElementById('who').textContent`)
assert('crmSignin', String(meta.identity).includes('sales_rep'), String(meta.identity))
await shoot('w6-b6-01-pipe-board.png')

// 01: board render — five columns with sums + weighted stats + XSS probe inert
meta.board = await evaluate(`(() => {
  const cols = [...document.querySelectorAll('#board .col')].map((col) => ({
    stage: col.dataset.stage,
    sum: col.querySelector('.sum')?.textContent ?? '',
    cards: col.querySelectorAll('.kcard').length,
  }))
  return {
    cols,
    stats: document.getElementById('pipe-stats').textContent.replace(/\\s+/g, ' ').trim(),
    weighted: document.getElementById('pipe-stats').textContent.includes('加权管道'),
    xssText: [...document.querySelectorAll('.kcard .cust')].some((n) => n.textContent.includes('<img src=x')),
    xssElement: document.querySelector('.kcard .cust img[src=x]') !== null,
    dwellBadge: [...document.querySelectorAll('.kcard .dwell')].length,
  }
})()`)
assert('pipeFiveColumns', meta.board.cols.length === 5, meta.board.cols.map((c) => `${c.stage}:${String(c.cards)}`).join(' '))
assert('pipeColumnSums', meta.board.cols.every((col) => col.sum.includes('Σ金额') && col.sum.includes('加权')), meta.board.cols[0]?.sum)
assert('pipeWeightedStat', meta.board.weighted === true, meta.board.stats.slice(0, 90))
assert('pipeXssInert', meta.board.xssText === true && meta.board.xssElement === false && (await evaluate(`window.__w6b6xss`)) === undefined, 'payload as text, no element, no window flag')

// 02: drag move — synthetic DataTransfer drag events inquiry→quote
const dealId = Number(psql("SELECT id FROM crm_deals WHERE name = 'W6B6演练·管道迁移' LIMIT 1;").trim() || '0')
const stageBefore = psql(`SELECT COALESCE(stage,'') || '|' || COALESCE(probability::text,'') FROM crm_deals WHERE id = ${String(dealId)};`).trim()
const dragTarget = stageBefore.startsWith('inquiry') ? 'quote' : stageBefore.startsWith('quote') ? 'negotiation' : 'inquiry'
const dragDone = await evaluate(`(() => {
  const card = [...document.querySelectorAll('.kcard')].find((n) => n.textContent.includes('W6B6演练'))
  const target = document.querySelector('.col[data-stage="${dragTarget}"]')
  if (card === undefined || target === null) return { ok: false, why: 'card/target missing' }
  const dt = new DataTransfer()
  card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
  card.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }))
  return { ok: true }
})()`)
assert('dragDispatched', dragDone.ok === true, JSON.stringify(dragDone))
await waitFor(`document.getElementById('ok') !== null && document.getElementById('ok').style.display === 'block'`, 15, 1000)
await shoot('w6-b6-02-drag-moved.png')
const stageAfter = psql(`SELECT COALESCE(stage,'') || '|' || COALESCE(probability::text,'') || '|' || COALESCE(status,'') FROM crm_deals WHERE id = ${String(dealId)};`).trim()
const auditRow = psql(`SELECT COALESCE(actor,'') || '|' || to_stage || '|' || probability FROM crm_stage_audit WHERE deal_id = ${String(dealId)} ORDER BY id DESC LIMIT 1;`).trim()
assert('dragWriteback', stageAfter.startsWith(`${dragTarget}|`) && auditRow.startsWith('sales_rep|'), `deal=${stageAfter} audit=${auditRow}`)
writeFileSync(`${OUT}w6-b6-02-psql-recon.log`, `# W6-B6 管道拖拽迁移 psql 对账（sales_rep 会话拖拽 → inquiry→${dragTarget}）\n# 迁移前: ${stageBefore}\n# 迁移后 crm_deals(stage|probability|status): ${stageAfter}\n# crm_stage_audit(actor|to_stage|probability): ${auditRow}\n`)

// 03: customer 360 on a real customer (id 1 漯河宏发 — has orders + payments)
await evaluate(`(() => { ${HELPERS}
  const picker = document.getElementById('cust-picker')
  picker.value = '1'; picker.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
await waitFor(`document.querySelector('#cust-detail .tl') !== null`, 20, 1000)
await sleep(500)
await shoot('w6-b6-03-customer-360.png')
meta.cust360 = await evaluate(`(() => ({
  stats: [...document.querySelectorAll('#cust-detail .stat b')].map((n) => n.textContent.trim()),
  timelineKinds: [...document.querySelectorAll('#cust-detail .tl li')].map((li) => li.className),
  orders: [...document.querySelectorAll('#cust-detail .card')].some((card) => card.textContent.includes('历史订单')),
  arCard: document.getElementById('cust-detail').textContent.includes('应收余额'),
}))()`)
assert('cust360Timeline', meta.cust360.timelineKinds.length >= 3 && meta.cust360.timelineKinds.every((kind) => /^k-(quote|order|ship|payment)$/.test(kind)), meta.cust360.timelineKinds.join(','))
assert('cust360Cards', meta.cust360.orders === true && meta.cust360.arCard === true, meta.cust360.stats.join('/'))
const custRecon = psql(`SELECT 'orders|' || count(*) FROM so_orders WHERE customer_id = 1;
SELECT 'ar|' || COALESCE(round(SUM(bal.balance)::numeric,2),0) FROM (SELECT o.amount - COALESCE((SELECT SUM(p.amount) FROM crm_payments p WHERE p.so_order_id = o.id AND p.status = 'received'),0) AS balance FROM so_orders o WHERE o.doc_status = 'approved' AND o.customer_id = 1) bal;
SELECT 'received|' || COALESCE(SUM(amount),0) FROM crm_payments WHERE customer_id = 1 AND status = 'received';
SELECT 'timeline|' || ((SELECT count(*) FROM crm_quotes q WHERE q.customer_id = 1 AND COALESCE(q.is_current, TRUE) AND q.issue_date IS NOT NULL) + (SELECT count(*) FROM so_orders o WHERE o.customer_id = 1 AND o.need_date IS NOT NULL) + (SELECT count(*) FROM so_orders o WHERE o.customer_id = 1 AND o.shipped_at IS NOT NULL) + (SELECT count(*) FROM crm_payments p WHERE p.customer_id = 1 AND p.status = 'received' AND p.paid_at IS NOT NULL));`)
writeFileSync(`${OUT}w6-b6-03-psql-recon.log`, `# W6-B6 客户360 psql 对账（customer id=1 漯河宏发）\n${custRecon}`)
assert('cust360TimelineCount', meta.cust360.timelineKinds.length === Number((custRecon.match(/timeline\|(\d+)/) ?? [])[1] ?? '-1'), `dom=${String(meta.cust360.timelineKinds.length)} psql=${String((custRecon.match(/timeline\|(\d+)/) ?? [])[1])}`)

// 04: quote→SO through the dialog (one product line), then the replay refusal
await evaluate(`(() => { ${HELPERS} return clickSel('#nav button[data-view="quote-view"]') })()`)
await waitFor(`document.querySelectorAll('#quote-list .qcard').length >= 1`, 20, 1000)
const quoteRows = await evaluate(`[...document.querySelectorAll('#quote-list .qcard')].filter((n) => n.textContent.includes('QT-W6B6-01')).length`)
assert('convertQuoteListed', quoteRows === 1, `rows=${String(quoteRows)}`)
await evaluate(`(() => { ${HELPERS}
  const card = [...document.querySelectorAll('#quote-list .qcard')].find((n) => n.textContent.includes('QT-W6B6-01'))
  card.querySelector('button.go').click(); return true })()`)
await waitFor(`document.getElementById('cv-dlg') !== null`, 15, 1000)
await evaluate(`(() => { ${HELPERS}
  clickSel('#cv-add')
  const row = document.querySelector('#cv-lines .lrow')
  row.querySelector('.cv-q').value = ''; return true })()`)
await evaluate(`(() => { ${HELPERS}
  const row = document.querySelector('#cv-lines .lrow')
  const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  s.call(row.querySelector('.cv-q'), '10'); row.querySelector('.cv-q').dispatchEvent(new Event('input', { bubbles: true }))
  s.call(row.querySelector('.cv-u'), '100'); row.querySelector('.cv-u').dispatchEvent(new Event('input', { bubbles: true }))
  return true })()`)
await sleep(200)
await shoot('w6-b6-04a-convert-dialog.png')
await evaluate(`(() => { ${HELPERS} return clickSel('#cv-go') })()`)
await waitFor(`document.getElementById('cv-dlg') === null || document.getElementById('cv-dlg').length === 0`, 20, 1000)
await waitFor(`document.getElementById('ok') !== null && document.getElementById('ok').style.display === 'block'`, 15, 1000)
meta.convertMsg = await evaluate(`document.getElementById('ok').textContent`)
assert('convertCreated', /已生成销售订单 SO-\d{4}-\d+/.test(String(meta.convertMsg)) && String(meta.convertMsg).includes('已提交审批'), String(meta.convertMsg))
await shoot('w6-b6-04b-convert-done.png')
const soCode = (String(meta.convertMsg).match(/SO-\d{4}-\d+/) ?? [])[0] ?? ''
const convertRecon = psql(`SELECT 'so|' || code || '|' || COALESCE(amount::text,'') || '|' || COALESCE(doc_status,'') || '|' || COALESCE(note,'') FROM so_orders WHERE code = ${sqlLit(soCode)};
SELECT 'lines|' || count(*) FROM so_order_lines WHERE order_id = (SELECT id FROM so_orders WHERE code = ${sqlLit(soCode)});
SELECT 'quote|' || COALESCE(status,'') || '|' || COALESCE(converted_so_code,'') FROM crm_quotes WHERE quote_number = 'QT-W6B6-01';`)
assert('convertRecon', convertRecon.includes('|1000|') && /lines\|1/.test(convertRecon) && convertRecon.includes(`converted|${soCode}`), convertRecon.replace(/\n/g, ' ; '))
// the replay refusal through the page's own channel — always on the
// rehearsal quote this run just converted
const rehearsalQuoteId = Number(psql("SELECT id FROM crm_quotes WHERE quote_number = 'QT-W6B6-01' LIMIT 1;").trim() || '0')
meta.replay = await evaluate(`(async () => {
  const token = localStorage.getItem('CRM_TOKEN') || ''
  const attempt = await fetch('/crm/quote-to-so', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ quote_id: ${String(rehearsalQuoteId)}, need_date: '', lines: [] }) }).then((r) => r.json().catch(() => ({})))
  return { refused: attempt.refused === true, duplicate: attempt.duplicate === true, existing: attempt.existing_so_code ?? '', error: attempt.error ?? '' }
})()`)
const soCount = psql(`SELECT count(*) FROM so_orders WHERE note LIKE '%QT-W6B6-01%';`).trim()
assert('convertReplayRefused', meta.replay.refused === true && meta.replay.duplicate === true && meta.replay.existing === soCode && soCount === '1', `existing=${String(meta.replay.existing)} rows=${soCount} err=${String(meta.replay.error).slice(0, 60)}`)
writeFileSync(`${OUT}w6-b6-04-psql-recon.log`, `# W6-B6 报价转单 psql 对账（QT-W6B6-01 → ${soCode}，sales_rep 会话经对话框转单）\n${convertRecon}\n# 二次转单（页面通道重放）: refused=${String(meta.replay.refused)} duplicate=${String(meta.replay.duplicate)} existing=${String(meta.replay.existing)}\n# 同源 SO 行数守恒: ${soCount}\n`)

// 04b: the negative legs (no-token 401, buyer 403 fence, XSS inert on this page)
const buyerSession = await fetch(`${NOCO}/api/auth:signIn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: 'buyer', password: 'Buyer#2026' }) }).then((r) => r.json()).catch(() => ({}))
meta.negative = await evaluate(`(async () => {
  const buyerToken = ${JSON.stringify(buyerSession?.data?.token ?? '')}
  const noToken = await fetch('/crm/pipe.json').then((r) => r.status)
  const buyerMove = await fetch('/crm/move', { method: 'POST', headers: { authorization: 'Bearer ' + buyerToken, 'content-type': 'application/json' }, body: JSON.stringify({ deal_id: ${String(dealId)}, to_stage: 'negotiation' }) }).then((r) => r.json().catch(() => ({})))
  const buyerConvert = await fetch('/crm/quote-to-so', { method: 'POST', headers: { authorization: 'Bearer ' + buyerToken, 'content-type': 'application/json' }, body: JSON.stringify({ quote_id: 1, need_date: '', lines: [] }) }).then((r) => r.json().catch(() => ({})))
  return {
    noTokenStatus: noToken,
    buyerRefused: buyerMove.ok === false && String(buyerMove.error ?? '').includes('围栏'),
    buyerRefusedMsg: buyerMove.error ?? '',
    buyerConvertRefused: buyerConvert.ok === false && String(buyerConvert.error ?? '').includes('围栏'),
  }
})()`)
assert('negNoToken401', meta.negative.noTokenStatus === 401, `status=${String(meta.negative.noTokenStatus)}`)
assert('negBuyer403', meta.negative.buyerRefused === true && meta.negative.buyerConvertRefused === true, String(meta.negative.buyerRefusedMsg).slice(0, 90))
const stageAfterNeg = psql(`SELECT COALESCE(stage,'') FROM crm_deals WHERE id = ${String(dealId)};`).trim()
assert('negBuyerNoWrite', stageAfterNeg === dragTarget, `stage=${stageAfterNeg}（buyer 未移动）`)
await shoot('w6-b6-04c-negative-xss.png')
writeFileSync(`${OUT}w6-b6-04-negative.log`, `# W6-B6 负向（越权/XSS）\n# no-token /crm/pipe.json → HTTP ${String(meta.negative.noTokenStatus)}\n# buyer /crm/move → ${String(meta.negative.buyerRefusedMsg).slice(0, 120)}\n# buyer /crm/quote-to-so → refused=${String(meta.negative.buyerConvertRefused)}\n# XSS 探针客户名（W6B6<img src=x onerror>）渲染为文本：domElement=${String(meta.board.xssElement)} windowFlag=${String((await evaluate('window.__w6b6xss')) === undefined ? 'undefined（未触发）' : 'TRIGGERED')}\n# buyer 越权后 deal stage 守恒: ${stageAfterNeg}\n`)

// ═══ fix-debt legs (the insp SPA as quality_lead) ═══

seedB6FixInspection()
await send('Page.navigate', { url: `${ENGINE}/insp` })
await waitFor(`document.getElementById('login-view') !== null`)
await evaluate(`window.__w6fixerrors = []; window.addEventListener('error', (e) => window.__w6fixerrors.push(String(e.message))); true`)
await evaluate(`(() => { ${HELPERS}
  setVal('#login-account', 'quality_lead'); setVal('#login-password', 'Quality#2026'); clickSel('#login-btn'); return true })()`)
await waitFor(`document.getElementById('queue-view') !== null && !document.getElementById('queue-view').classList.contains('hidden')`, 30, 1000)

// fix-06: the已完成 tab + the late sign-off entry
meta.doneTab = await evaluate(`(() => { ${HELPERS}
  const btn = [...document.querySelectorAll('#queue-tabs button')].find((b) => b.textContent.includes('已完成'))
  if (btn === undefined) return { ok: false, why: 'no done tab' }
  btn.click()
  const cards = [...document.querySelectorAll('#queue-cards .qcard')]
  return {
    ok: true,
    count: cards.length,
    hasReportNo: cards.some((c) => c.textContent.includes('QR-2026-')),
    hasEntry: cards.some((c) => (c.textContent.includes('查看 / 签发报告') || c.textContent.includes('查看报告'))),
    fqcRow: cards.some((c) => c.textContent.includes('QI-W6B5-F1') && c.textContent.includes('查看 / 签发报告')),
  }
})()`)
assert('fix06DoneTab', meta.doneTab.ok === true && meta.doneTab.count >= 1 && meta.doneTab.hasEntry === true, `count=${String(meta.doneTab.count)} rows`)
assert('fix06FqcLateSign', meta.doneTab.fqcRow === true, 'QI-W6B5-F1 行内可签发入口')
await shoot('w6-b6fix-06-history-fqc-entry.png')
// the entry opens the report view (issue replay = duplicate, the idempotent sign)
await evaluate(`(() => { ${HELPERS}
  const card = [...document.querySelectorAll('#queue-cards .qcard')].find((c) => c.textContent.includes('QI-W6B5-F1'))
  card.querySelector('button.go').click(); return true })()`)
await waitFor(`document.getElementById('report-view') !== null && !document.getElementById('report-view').classList.contains('hidden')`, 20, 1000)
await sleep(800)
await shoot('w6-b6fix-06b-report-opened.png')
assert('fix06OpensReport', await evaluate(`document.getElementById('rp-frame') !== null`) === true, '报告视图经补签入口打开')

// fix-01: the report's judged column (first reading renders 合格, not —)
const reportHtml = await fetch(`${ENGINE}/insp/report?code=QI-W6B5-01&token=${encodeURIComponent(String(await evaluate(`localStorage.getItem('INSP_TOKEN')`) ?? ''))}`).then((r) => r.text())
const judgedCells = [...reportHtml.matchAll(/<td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td>(合格|不合格|—)<\/td>/gu)].map((m) => m[4])
assert('fix01JudgedNotDash', judgedCells.length > 0 && judgedCells.some((cell) => cell !== '—'), `cells=${judgedCells.join('/')}`)
await send('Page.navigate', { url: `${ENGINE}/insp/report?code=QI-W6B5-01&token=${encodeURIComponent(String(await evaluate(`localStorage.getItem('INSP_TOKEN')`) ?? ''))}` })
await sleep(600)
await shoot('w6-b6fix-01-judged-column.png')
await send('Page.navigate', { url: `${ENGINE}/insp` })
await waitFor(`document.getElementById('queue-view') !== null && !document.getElementById('queue-view').classList.contains('hidden')`, 30, 1000)

// fix-02/03: reviewer backfill + the conceded alert still in the ledger (psql)
const reviewerRecon = psql(`SELECT 'report|' || report_no || '|' || COALESCE(reviewer,'') || '|' || COALESCE(reported_as,'') FROM (SELECT report_no, reviewer, reporter AS reported_as FROM qm_factory_reports WHERE inspection_code LIKE 'QI-W6B5-%' ORDER BY id) r;`)
const concessionRecon = psql(`SELECT 'concession|' || i.code || '|' || a.status || '|' || COALESCE(a.resolved_by,'') FROM qm_inspections i LEFT JOIN wfl_alerts a ON a.dedup_key = 'inspection_fail:qm_inspections:' || i.id WHERE i.result = 'concession';`)
assert('fix02ReviewerBackfilled', /report\|QR-\d{4}-\d+\|\S+\|/.test(reviewerRecon) && !/\|\|/.test(reviewerRecon.replace(/report\|QR-\d{4}-\d+\|/gu, '')), reviewerRecon.replace(/\n/g, ' ; '))
assert('fix03ConcessionAlertOpen', concessionRecon.includes('|open|') && !concessionRecon.includes('|resolved|system'), concessionRecon.replace(/\n/g, ' ; '))
writeFileSync(`${OUT}w6-b6fix-02-reviewer.log`, `# W6-B6 修复债② 审核人回填（签发后 reviewer 非空=签发人，渲染按档案回读）\n${reviewerRecon}\n`)
writeFileSync(`${OUT}w6-b6fix-03-concession-alert.log`, `# W6-B6 修复债③ 特采消警语义（让步后 critical 预警仍在册，人工关闭才 resolved——resolved_by 不再是 system）\n${concessionRecon}\n`)

// fix-05 + fix-04: the two-wizard leak probe, then the failed-verdict legs on QI-W6B5-B6FIX
const openWizardByCode = (code) => `(() => { ${HELPERS}
  const btn = [...document.querySelectorAll('#queue-tabs button')].find((b) => b.textContent.includes('IQC') || b.textContent.includes('IPQC'))
  if (btn !== undefined && ![...document.querySelectorAll('#queue-tabs button')].some((b) => b.classList.contains('active') && b.textContent.includes('已完成')) === false) btn.click()
  return true })()`
void openWizardByCode
// go back to the pending tab and open wizard A (QI-W6B5-B6FIX), drive it to a fail verdict + disposal reason
await evaluate(`(() => { ${HELPERS}
  const btn = [...document.querySelectorAll('#queue-tabs button')].find((b) => b.textContent.includes('IPQC')) ?? [...document.querySelectorAll('#queue-tabs button')].find((b) => b.textContent.includes('IQC'))
  if (btn !== undefined) btn.click(); return true })()`)
await waitFor(`[...document.querySelectorAll('#queue-cards .qcard')].some((c) => c.textContent.includes('QI-W6B5-B6FIX'))`, 20, 1000)
await evaluate(`(() => { ${HELPERS}
  const card = [...document.querySelectorAll('#queue-cards .qcard')].find((c) => c.textContent.includes('QI-W6B5-B6FIX'))
  card.querySelector('button.go').click(); return true })()`)
await waitFor(`document.getElementById('wizard-view') !== null && !document.getElementById('wizard-view').classList.contains('hidden')`, 20, 1000)
await evaluate(`(() => { ${HELPERS} return clickSel('#w-plan-btn') })()`)
await waitFor(`document.querySelectorAll('#w-plan .pill').length >= 5`, 20, 1000)
await evaluate(`(() => { ${HELPERS}
  setSel2('table.readings select[data-i="0"][data-f="pass"]', 'false')
  setSel2('table.readings select[data-i="0"][data-f="defect_class"]', 'critical')
  return true
  function setSel2(sel, v) { const el = document.querySelector(sel); const s = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true })) }
})()`)
await evaluate(`(() => { ${HELPERS}
  const btn = document.querySelector('button.confirm-fail'); if (btn === null) throw new Error('no confirm-fail button'); btn.click(); return btn.textContent })()`)
await sleep(150)
await evaluate(`(() => { const btn = document.querySelector('button.confirm-fail'); if (btn !== null) btn.click(); return true })()`)
await waitFor(`document.querySelector('.disposal button[data-act="concession"]') !== null`, 20, 1000)
await evaluate(`(() => { ${HELPERS}
  document.querySelector('.disposal button[data-act="concession"]').click()
  setVal('#w-disp-reason', 'A 单让步理由——不应泄入 B 单')
  return document.getElementById('w-disp-reason').value })()`)
meta.leakA = await evaluate(`document.getElementById('w-disp-reason')?.value ?? ''`)
await shoot('w6-b6fix-05a-wizard-a-reason.png')
// back to the queue, open wizard B (the other pending card) — the reason must be empty
await evaluate(`(() => { ${HELPERS} return clickSel('#w-back') })()`)
await waitFor(`document.getElementById('queue-view') !== null && !document.getElementById('queue-view').classList.contains('hidden')`, 20, 1000)
// pending cards across every group tab (the second wizard may live in
// another insp_type group) — read the queue API instead of the visible tab
const pendingAll = await evaluate(`(async () => {
  const token = localStorage.getItem('INSP_TOKEN') || ''
  const queue = await fetch('/insp/queue.json', { headers: { authorization: 'Bearer ' + token } }).then((r) => r.json())
  return queue.groups.flatMap((g) => g.cards.map((c) => ({ code: c.code, group: g.key, lot: Number(c.lot_qty ?? 0) })))
})()`)
// N ≥ 2 so the plan lookup always answers (the leak probe needs the fail
// verdict, which needs a sampling plan).
const other = pendingAll.find((row) => row.code !== 'QI-W6B5-B6FIX' && row.lot >= 2) ?? null
const otherCard = String(other?.code ?? '')
const otherGroup = String(other?.group ?? '')
assert('leakWizardBAvailable', otherCard !== '', `pending=${pendingAll.map((row) => row.code).join(',')}`)
if (otherCard !== '') {
  await evaluate(`(() => { ${HELPERS}
    const btn = [...document.querySelectorAll('#queue-tabs button')].find((b) => b.textContent.includes(${JSON.stringify(otherGroup)}))
    if (btn !== undefined) btn.click(); return true })()`)
}
if (otherCard !== '') {
  await waitFor(`[...document.querySelectorAll('#queue-cards .qcard')].some((c) => c.textContent.includes(${JSON.stringify(otherCard)}))`, 15, 1000)
  await evaluate(`(() => { ${HELPERS}
    const card = [...document.querySelectorAll('#queue-cards .qcard')].find((c) => c.textContent.includes(${JSON.stringify(otherCard)}))
    card.querySelector('button.go').click(); return true })()`)
  await waitFor(`document.getElementById('wizard-view') !== null && !document.getElementById('wizard-view').classList.contains('hidden')`, 20, 1000)
  await evaluate(`(() => { ${HELPERS} return clickSel('#w-plan-btn') })()`)
  await waitFor(`document.querySelectorAll('#w-plan .pill').length >= 5`, 20, 1000)
  await evaluate(`(() => {
    const setSel = (sel, v) => { const s = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; s.call(sel, v); sel.dispatchEvent(new Event('change', { bubbles: true })) }
    setSel(document.querySelector('table.readings select[data-i="0"][data-f="pass"]'), 'false')
    setSel(document.querySelector('table.readings select[data-i="0"][data-f="defect_class"]'), 'critical')
    return true })()`)
  await evaluate(`(() => { const btn = document.querySelector('button.confirm-fail'); if (btn !== null) btn.click(); return true })()`)
  await sleep(150)
  await evaluate(`(() => { const btn = document.querySelector('button.confirm-fail'); if (btn !== null) btn.click(); return true })()`)
  await waitFor(`document.querySelector('.disposal') !== null && document.getElementById('w-disp-reason') !== null`, 20, 1000)
  meta.leakB = await evaluate(`document.getElementById('w-disp-reason')?.value ?? '（无输入框）'`)
  assert('fix05NoLeak', meta.leakB === '', `A=${String(meta.leakA).slice(0, 30)} B=${String(meta.leakB).slice(0, 30)}`)
  await shoot('w6-b6fix-05b-wizard-b-empty.png')
  await evaluate(`(() => { ${HELPERS} return clickSel('#w-back') })()`)
  await waitFor(`document.getElementById('queue-view') !== null && !document.getElementById('queue-view').classList.contains('hidden')`, 20, 1000)
}
// reopen the B6FIX wizard (also must start clean), drive to the failed submit
await evaluate(`(() => { ${HELPERS}
  const btn = [...document.querySelectorAll('#queue-tabs button')].find((b) => b.textContent.includes('IPQC')) ?? [...document.querySelectorAll('#queue-tabs button')].find((b) => b.textContent.includes('IQC'))
  if (btn !== undefined) btn.click(); return true })()`)
await waitFor(`[...document.querySelectorAll('#queue-cards .qcard')].some((c) => c.textContent.includes('QI-W6B5-B6FIX'))`, 20, 1000)
await evaluate(`(() => { ${HELPERS}
  const card = [...document.querySelectorAll('#queue-cards .qcard')].find((c) => c.textContent.includes('QI-W6B5-B6FIX'))
  card.querySelector('button.go').click(); return true })()`)
await waitFor(`document.getElementById('wizard-view') !== null && !document.getElementById('wizard-view').classList.contains('hidden')`, 20, 1000)
const reopenClean = await evaluate(`document.getElementById('w-disp-reason') === null || document.getElementById('w-disp-reason')?.value === ''`)
assert('fix05ReopenClean', reopenClean === true, '重开向导处置理由为空')
await evaluate(`(() => { ${HELPERS} return clickSel('#w-plan-btn') })()`)
await waitFor(`document.querySelectorAll('#w-plan .pill').length >= 5`, 20, 1000)
await evaluate(`(() => {
  const sel = document.querySelector('table.readings select[data-i="0"][data-f="pass"]')
  const s = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
  s.call(sel, 'false'); sel.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
await evaluate(`(() => { const btn = document.querySelector('button.confirm-fail'); if (btn !== null) btn.click(); return true })()`)
await sleep(150)
await evaluate(`(() => { const btn = document.querySelector('button.confirm-fail'); if (btn !== null) btn.click(); return true })()`)
await waitFor(`document.querySelector('.verdict.fail') !== null`, 15, 1000)
await shoot('w6-b6fix-04a-fail-wizard.png')
// No disposal action picked — the submit lands the failed verdict without
// the NC side effects; the result page is what this leg asserts.
await evaluate(`(() => { ${HELPERS} return clickSel('#w-submit') })()`)
await waitFor(`document.getElementById('result-view') !== null && !document.getElementById('result-view').classList.contains('hidden')`, 40, 1000)
await sleep(600)
await shoot('w6-b6fix-04b-fail-result-no-report.png')
meta.failResult = await evaluate(`(() => ({
  text: document.getElementById('result-view').textContent.replace(/\\s+/g, ' ').trim().slice(0, 260),
  reportBtn: document.getElementById('r-report') !== null,
  reportEntry: document.getElementById('result-view').textContent.includes('出具九要素报告'),
}))()`)
assert('fix04NoReportEntry', meta.failResult.reportBtn === false && meta.failResult.reportEntry === false, meta.failResult.text.slice(0, 110))
const b6fixRow = psql(`SELECT 'after|' || COALESCE(result,'') FROM qm_inspections WHERE code = 'QI-W6B5-B6FIX';`)
assert('fix04VerdictFailed', b6fixRow.includes('failed'), b6fixRow)
writeFileSync(`${OUT}w6-b6fix-04-failed-no-report.log`, `# W6-B6 修复债④ failed 结果页无报告入口（按钮与提示均不渲染；服务端签发围栏仍为权威闸）\n# QI-W6B5-B6FIX 判定后 result: ${b6fixRow.trim()}\n# DOM: #r-report 存在=${String(meta.failResult.reportBtn)}；result 页含「出具九要素报告」=${String(meta.failResult.reportEntry)}\n`)

const verdict = Object.values(meta.assertions).every(Boolean)
writeFileSync(`${OUT}w6-b6-shot-meta.json`, JSON.stringify(meta, null, 2) + '\n')
console.log(JSON.stringify({ ...meta, allGreen: verdict }, null, 2))
try { process.kill(-chromeProc.pid, 'SIGTERM') } catch { /* already gone */ }
process.exit(verdict ? 0 : 1)
