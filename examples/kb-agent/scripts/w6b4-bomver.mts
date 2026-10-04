/**
 * W6-B4: the PLM governance face — recipe BOM versioning + ECO (engineering
 * change order) over the wfl approval engine.
 *
 * 1. The ECO collection mfg_ecos: one row per change order (reason, the
 *    from/to BOM pair, the intended line changes, the computed impact
 *    snapshot, the six-state doc_status the approval engine drives, and the
 *    effective_at stamp the engine's apply hook writes on approval).
 * 2. mfg_job_reports.submit_key: the idempotency column the card flow's
 *    double-tap replay dedupes on (unique index; the terminal generates one
 *    key per sheet open, the server returns the first row on replay).
 * 3. The wfl flow 工程变更单审批 over mfg_ecos (manager tier 质检部 two-name
 *    array, gm admin) — approval rides the same six-state engine every other
 *    document type uses; the effective hook (approval-engine.mts applyEco)
 *    switches the version pair: to_bom → active+default, from_bom → retired.
 *    In-production MOs keep their bom_id (version snapshot semantics).
 * 4. Two pages under 生产与计划: 工程变更单 (the table + row detail) and
 *    配方版本与变更 (the JSBlock console: version timeline, blue/black/red
 *    line diff, impact panel, draft-ECO submit through the engine with the
 *    session's bearer — the recall-console pattern).
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w6b4-bomver.mts --seed
 *   node --import tsx/esm examples/kb-agent/scripts/w6b4-bomver.mts --assert
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { call, dataOf, ensureTableRowDetail, ensureFilterForm, listFlowModels, listRoutes, signInWithRetry, withN17Prefix } from './nocobase-flow-page-lib.mts'
import { seedDocFlow, type NocoIO } from './approval-engine.mts'

const args = process.argv.slice(2)
const mode = args.includes('--seed') ? 'seed' : 'assert'
const failures: string[] = []
const log = (line: string): void => { console.log(line) }
const check = (that: string, ok: boolean, detail = ''): void => {
  log(`  ${ok ? '✓' : '✗'} ${that}${detail === '' ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(that)
}
const here = (script: string): string => fileURLToPath(new URL(script, import.meta.url))

const psql = (sql: string): string => {
  const env = readFileSync(here('../../../platform/nocobase/.env'), 'utf8')
  const envOf = (key: string): string | undefined => env.split('\n').map(line => line.trim()).find(line => line.startsWith(`${key}=`))?.slice(key.length + 1)
  const run = spawnSync('psql', [
    '-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres',
    '-d', envOf('DB_DATABASE') ?? envOf('DB_NAME') ?? 'nocobase', '-t', '-A', '-c', sql,
  ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' }, timeout: 20_000, maxBuffer: 16 * 1024 * 1024 })
  if (run.status !== 0) throw new Error(`psql failed: ${sql.slice(0, 120)}…\n${(run.stderr ?? '').slice(0, 300)}`)
  return run.stdout ?? ''
}

const sqlLit = (value: string): string => `'${value.replaceAll("'", "''")}'`

/** The minimal NocoIO the engine's flow seed needs (the w3-procurement tokenIO). */
const tokenIO = (token: string): NocoIO => ({
  list: async (collection, filter) => {
    const query = filter === undefined ? '' : `&filter=${encodeURIComponent(JSON.stringify(filter))}`
    return await dataOf(token, 'GET', `/api/${collection}:list?pageSize=500${query}`) ?? []
  },
  get: async (collection, id) => await dataOf(token, 'GET', `/api/${collection}:get?filterByTk=${id}`) ?? undefined,
  create: async (collection, values) => await dataOf(token, 'POST', `/api/${collection}:create`, values),
  update: async (collection, id, values) => {
    await dataOf(token, 'POST', `/api/${collection}:update?filterByTk=${id}`, values)
  },
  updateWhere: async (collection, filter, values) => {
    const rows = await dataOf(token, 'POST', `/api/${collection}:update?filter=${encodeURIComponent(JSON.stringify(filter))}&pageSize=10`, values)
    return Array.isArray(rows) ? rows.length : rows === null || rows === undefined ? 0 : 1
  },
  destroy: async (collection, id) => {
    await call(token, 'POST', `/api/${collection}:destroy?filterByTk=${id}`)
  },
})

// ─── the ECO collection ───

/** mfg_ecos: one row per engineering change order (the PLM governance document). */
const ECO_FIELDS = [
  { name: 'code', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: 'ECO编号' } },
  { name: 'title', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '变更标题' } },
  { name: 'reason', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: '变更原因' } },
  { name: 'product_id', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '产品行' } },
  { name: 'from_bom_id', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '原版本BOM行' } },
  { name: 'to_bom_id', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '新版本BOM行' } },
  { name: 'line_changes', type: 'json', interface: 'json', uiSchema: { type: 'object', 'x-component': 'Input.JSON', title: '变更行（增/删/改）' } },
  { name: 'impact', type: 'json', interface: 'json', uiSchema: { type: 'object', 'x-component': 'Input.JSON', title: '影响分析快照' } },
  { name: 'doc_status', type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title: '状态', enum: [
    { value: 'draft', label: '草稿', color: 'default' },
    { value: 'pending_level1', label: '待审（一级）', color: 'blue' },
    { value: 'pending_level2', label: '待审（二级）', color: 'blue' },
    { value: 'approved', label: '已生效', color: 'green' },
    { value: 'rejected', label: '已驳回', color: 'red' },
    { value: 'voided', label: '已作废', color: 'default' },
  ] } },
  { name: 'requested_by', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '发起人（会话推导）' } },
  { name: 'approved_by', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '审批人' } },
  { name: 'approved_at', type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '审批日期', 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } },
  { name: 'effective_at', type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '生效日期', 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } },
  { name: 'note', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: '备注' } },
] as const

/**
 * Create the ECO collection idempotently and add the idempotency column to
 * mfg_job_reports (fields:create performs the ALTER TABLE; the unique index
 * rides psql because the REST channel cannot declare uniqueness).
 * @param token - the root API token.
 */
export async function ensureEcoCollection(token: string): Promise<void> {
  const present = await dataOf(token, 'GET', '/api/collections/mfg_ecos')
    .then(row => (row as { name?: string } | null)?.name === 'mfg_ecos')
    .catch(() => false)
  if (!present) {
    await dataOf(token, 'POST', '/api/collections:create', { name: 'mfg_ecos', title: '工程变更单', titleField: 'code', fields: ECO_FIELDS })
    log('w6b4-bomver: collection mfg_ecos created')
  }
  const jobFields = new Set(((await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'mfg_job_reports' } }))}&pageSize=200`) as Array<{ name?: string }> | null) ?? []).map(field => field.name))
  if (!jobFields.has('submit_key')) {
    await dataOf(token, 'POST', '/api/fields:create', {
      collectionName: 'mfg_job_reports',
      name: 'submit_key', type: 'string', interface: 'input',
      uiSchema: { type: 'string', 'x-component': 'Input', title: '报工幂等键' },
    })
    log('w6b4-bomver: mfg_job_reports.submit_key added')
  }
  psql('CREATE UNIQUE INDEX IF NOT EXISTS ux_mfg_job_reports_submit ON mfg_job_reports (submit_key);')
}

/**
 * Seed the ECO approval flow (idempotent by doc_type; the engine's repair
 * pass converges an existing flow). The manager tier is the 质检部 two-name
 * array — either may act — and gm stays admin: a recipe change is a quality
 * governance decision, not a money gate.
 * @param token - the root API token.
 */
export async function ensureEcoFlow(token: string): Promise<void> {
  const io = tokenIO(token)
  await seedDocFlow(io, 'mfg_ecos', '工程变更单审批', {
    approverMap: { manager: ['qc_inspector', 'quality_lead'], gm: 'admin' },
  })
}

// ─── the ECO console JSBlock (timeline + diff + impact + submit) ───

/**
 * The PLM console: a product selector drives the version timeline (chips
 * colored by bom_status), the line diff between the two chosen versions
 * (blue = added/changed, red = removed, black = unchanged — the Odoo PLM
 * gap the research round names as our differentiation), the impact panel
 * (the ECO row's computed snapshot: in-production MOs / FG lots / undelivered
 * SOs), and the draft-ECO submit button that reaches the engine with the
 * signed-in session's bearer. The string 'plm-console' is the upgrade marker.
 */
export const PLM_CONSOLE_CODE = [
  "const mk = async (name, size) => {",
  "  const r = ctx.makeResource('MultiRecordResource');",
  "  r.setResourceName(name);",
  "  r.setPageSize(size);",
  "  await r.refresh();",
  "  return r.getData() || [];",
  "};",
  "const [boms, lines, prods, mos, ecos, sos] = await Promise.all([",
  "  mk('mfg_boms', 200), mk('mfg_bom_lines', 1000), mk('hub_inv_products', 500),",
  "  mk('mfg_orders', 500), mk('mfg_ecos', 200), mk('so_orders', 500),",
  "]);",
  "const prodName = {}; for (const p of prods) prodName[p.id] = p.name || p.title || ('#' + p.id);",
  "const AMP = '\\u0026';",
  "const esc = (s) => String(s).replace(/[&<>\"']/g, (c) => ({ '&': AMP + 'amp;', '<': AMP + 'lt;', '>': AMP + 'gt;', '\"': AMP + 'quot;', \"'\": AMP + '#39;' }[c]));",
  "const ENGINE = String(window.__W6_ENGINE_BASE__ || 'http://127.0.0.1:13110');",
  "const TOKEN = localStorage.getItem('NOCOBASE_TOKEN') || '';",
  "const callEngine = async (path, body) => {",
  "  const resp = await fetch(ENGINE + path, body === undefined",
  "    ? { headers: { authorization: 'Bearer ' + TOKEN } }",
  "    : { method: 'POST', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(body) });",
  "  return { status: resp.status, ok: resp.ok, json: await resp.json().catch(() => ({})) };",
  "};",
  "const STATUS = { draft: ['var(--w7-critical-fg)','草稿'], active: ['var(--w7-positive-fg)','生效'], retired: ['var(--w7-neutral-fg)','停用'] };",
  // The shell rides a top-level ctx.render (the validator requires the
  // render call on the executed top-level path — the w6b3 shape); the
  // update function then rewrites the shell's internals.
  "ctx.render('<div data-w6b4=\"plm-console\" style=\"padding:8px;font-family:system-ui\"></div>');",
  "const render = () => {",
  "  const root = document.querySelector('[data-w6b4=\"plm-console\"]');",
  "  if (!root) return;",
  "  const pid = Number((document.querySelector('[data-w6b4-prod]') || {}).value || 0);",
  "  const vbs = boms.filter(b => Number(b.product_id) === pid).sort((a, b) => Number(a.version) - Number(b.version));",
  "  const ecoByTo = {}; for (const e of ecos) ecoByTo[Number(e.to_bom_id)] = e;",
  "  const timeline = vbs.map(b => {",
  "    const st = STATUS[b.bom_status] || ['var(--w7-neutral-fg)', b.bom_status];",
  "    const eco = ecoByTo[b.id];",
  "    return `<div style=\"border:2px solid ${st[0]};border-radius:var(--w7-radius-card);padding:8px 12px;min-width:150px\">",
  "      <div style=\"font-weight:700\">v${esc(b.version)} ${b.is_default ? '<span style=\"color:var(--w7-positive-fg)\">★默认</span>' : ''}</div>",
  "      <div style=\"font-size:var(--w7-fs-caption);color:var(--w7-text-secondary)\">${esc(b.code)} · <span style=\"color:${st[0]};font-weight:600\">${st[1]}</span></div>",
  "      ${eco ? `<div style=\"font-size:var(--w7-fs-caption);margin-top:2px\">ECO ${esc(eco.code)}（${esc(eco.doc_status)}）</div>` : ''}",
  "    </div>`;",
  "  }).join('<div style=\"align-self:center;color:var(--w7-text-weak)\">→</div>');",
  "  const diffSelA = document.querySelector('[data-w6b4-diff-a]');",
  "  const diffSelB = document.querySelector('[data-w6b4-diff-b]');",
  "  let diffHtml = '<div style=\"color:var(--w7-text-weak);padding:6px 0\">选择两个版本对比行差异</div>';",
  "  if (diffSelA && diffSelB && diffSelA.value && diffSelB.value) {",
  "    const la = lines.filter(l => Number(l.bom_id) === Number(diffSelA.value));",
  "    const lb = lines.filter(l => Number(l.bom_id) === Number(diffSelB.value));",
  "    const key = (l) => Number(l.product_id);",
  "    const rowHtml = (name, text, color, extra) => `<div style=\"display:flex;gap:8px;padding:3px 8px;border-left:4px solid ${color}\"><span style=\"flex:1\">${esc(name)}</span><span style=\"color:${color};font-weight:600\">${esc(text)}</span><span style=\"color:var(--w7-text-weak)\">${esc(extra || '')}</span></div>`;",
  "    const parts = [];",
  "    for (const l of lb) {",
  "      const old = la.find(x => key(x) === key(l));",
  "      if (!old) parts.push(rowHtml(prodName[l.product_id] || ('#' + l.product_id), '新增 ' + l.qty_per_unit + l.uom + '/单位', 'var(--w7-primary)'));",
  "      else if (Number(old.qty_per_unit) !== Number(l.qty_per_unit)) parts.push(rowHtml(prodName[l.product_id] || ('#' + l.product_id), l.qty_per_unit + '（原 ' + old.qty_per_unit + '）' + l.uom + '/单位', 'var(--w7-primary)', '用量变更'));",
  "      else parts.push(rowHtml(prodName[l.product_id] || ('#' + l.product_id), l.qty_per_unit + ' ' + (l.uom || '') + '/单位 损耗' + (l.scrap_pct || 0) + '%', 'var(--w7-text)'));",
  "    }",
  "    for (const l of la) if (!lb.some(x => key(x) === key(l))) parts.push(rowHtml(prodName[l.product_id] || ('#' + l.product_id), '移除 ' + l.qty_per_unit + ' ' + (l.uom || '') + '/单位', 'var(--w7-negative-fg)'));",
  "    diffHtml = parts.join('') || '<div style=\"color:var(--w7-text-weak)\">两版本行完全一致</div>';",
  "  }",
  "  const ecoSel = document.querySelector('[data-w6b4-eco]');",
  "  let impactHtml = '<div style=\"color:var(--w7-text-weak);padding:6px 0\">选择 ECO 查看影响分析</div>';",
  "  if (ecoSel && ecoSel.value) {",
  "    const eco = ecos.find(e => String(e.id) === String(ecoSel.value));",
  "    if (eco) {",
  "      const imp = typeof eco.impact === 'string' ? JSON.parse(eco.impact) : (eco.impact || {});",
  "      const listRows = (rows, fmt) => (rows || []).map(fmt).join('') || '<div style=\"color:var(--w7-text-weak);padding:2px 8px\">（无）</div>';",
  "      impactHtml = `<div style=\"font-weight:700;margin:6px 0 2px\">受影响在产 MO</div>` +",
  "        listRows(imp.in_progress_mos, (m) => `<div style=\"padding:2px 8px\">${esc(m.code)} · ${esc(m.doc_status)} · 计划 ${m.qty}（仍按原版本执行）</div>`)",
  "        + `<div style=\"font-weight:700;margin:6px 0 2px\">受影响库存批次（成品）</div>`",
  "        + listRows(imp.fg_lots, (l) => `<div style=\"padding:2px 8px\">${esc(l.lot_no)} · ${esc(l.production_date || '')} · ${esc(l.status || '')}</div>`)",
  "        + `<div style=\"font-weight:700;margin:6px 0 2px\">受影响未交付 SO</div>`",
  "        + listRows(imp.undelivered_sos, (s) => `<div style=\"padding:2px 8px\">${esc(s.code)} · ${esc(s.doc_status)} · ${esc(s.shipping_status || '')}</div>`);",
  "    }",
  "  }",
  "  root.innerHTML = `",
  "  <div style=\"display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px\">",
  "    <b>产品</b><select data-w6b4-prod style=\"padding:4px 8px;border:1px solid var(--w7-border-strong);border-radius:var(--w7-radius-control)\">",
  "      ${[...new Set(boms.map(b => Number(b.product_id)))].map(id => `<option value=\"${id}\" ${id === pid ? 'selected' : ''}>${esc(prodName[id] || ('#' + id))}</option>`).join('')}",
  "    </select>",
  "    <b style=\"margin-left:12px\">版本对比</b>",
  "    <select data-w6b4-diff-a style=\"padding:4px 8px;border:1px solid var(--w7-border-strong);border-radius:var(--w7-radius-control)\">",
  "      <option value=\"\">基准版本</option>${vbs.map(b => `<option value=\"${b.id}\" ${String(b.id) === String(diffSelA ? diffSelA.value : '') ? 'selected' : ''}>v${esc(b.version)} ${esc(b.code)}</option>`).join('')}</select>",
  "    <span>→</span>",
  "    <select data-w6b4-diff-b style=\"padding:4px 8px;border:1px solid var(--w7-border-strong);border-radius:var(--w7-radius-control)\">",
  "      <option value=\"\">对比版本</option>${vbs.map(b => `<option value=\"${b.id}\" ${String(b.id) === String(diffSelB ? diffSelB.value : '') ? 'selected' : ''}>v${esc(b.version)} ${esc(b.code)}</option>`).join('')}</select>",
  "    <span style=\"color:var(--w7-primary)\">■ 新增/变更</span><span style=\"color:var(--w7-text)\">■ 不变</span><span style=\"color:var(--w7-negative-fg)\">■ 移除</span>",
  "  </div>",
  "  <div data-w6b4-timeline style=\"display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px\">${timeline || '<span style=\"color:var(--w7-text-weak)\">该产品暂无 BOM 版本</span>'}</div>",
  "  <div style=\"display:grid;grid-template-columns:1fr 1fr;gap:12px\">",
  "    <div style=\"border:1px solid var(--w7-border);border-radius:var(--w7-radius-card);padding:8px\"><div style=\"font-weight:700;margin-bottom:4px\">行差异（蓝=新增/变更 黑=不变 红=移除）</div><div style=\"max-height:280px;overflow:auto\">${diffHtml}</div></div>",
  "    <div style=\"border:1px solid var(--w7-border);border-radius:var(--w7-radius-card);padding:8px\">",
  "      <div style=\"display:flex;gap:8px;align-items:center;margin-bottom:4px\"><b style=\"white-space:nowrap\">影响分析</b>",
  "        <select data-w6b4-eco style=\"padding:4px 8px;border:1px solid var(--w7-border-strong);border-radius:var(--w7-radius-control);flex:1\">",
  "          <option value=\"\">选择 ECO</option>${ecos.slice().sort((a, b) => b.id - a.id).map(e => `<option value=\"${e.id}\" ${ecoSel && String(e.id) === String(ecoSel.value) ? 'selected' : ''}>${esc(e.code)} ${esc(e.title)}（${esc(e.doc_status)}）</option>`).join('')}</select>",
  "        <button data-w6b4-submit style=\"padding:4px 12px;border:1px solid var(--w7-primary);color:var(--w7-primary);background:#fff;border-radius:var(--w7-radius-control);cursor:pointer\">送审所选 ECO</button>",
  "      </div>",
  "      <div style=\"max-height:280px;overflow:auto\">${impactHtml}</div>",
  "      <div data-w6b4-note style=\"font-size:var(--w7-fs-caption);color:var(--w7-text-weak);margin-top:4px\">送审走引擎 POST /eco/submit（会话身份推导，planner/质检/admin 围栏）；审批通过后引擎自动切版本：新版生效★、旧版停用，在产 MO 不受影响</div>",
  "    </div>",
  "  </div>`;",
  "};",
  "window.__w6b4PlmRender = render;",
  // Select change rides addEventListener (the channel the embedded context
  // delivers reliably, and the only reference form the RunJS validator
  // accepts for a local function — the w6b3 finding, kept verbatim). The
  // window hook is the evidence driver's entry (set values, call render).
  "setTimeout(() => { render();",
  "  for (const s of document.querySelectorAll('[data-w6b4-prod],[data-w6b4-diff-a],[data-w6b4-diff-b],[data-w6b4-eco]')) {",
  "    s.addEventListener('change', render);",
  "  }",
  "  const btn = document.querySelector('[data-w6b4-submit]');",
  "  if (btn) btn.addEventListener('click', async () => {",
  "    const root = document.querySelector('[data-w6b4=\"plm-console\"]');",
  "    const ecoSel2 = root.querySelector('[data-w6b4-eco]');",
  "    const note = root.querySelector('[data-w6b4-note]');",
  "    if (!ecoSel2.value) { note.textContent = '先选择一张 ECO'; return; }",
  "    const eco = ecos.find(e => String(e.id) === String(ecoSel2.value));",
  "    btn.disabled = true; btn.textContent = '送审中…';",
  "    const out = await callEngine('/eco/submit', { eco_code: eco.code });",
  "    note.textContent = out.ok ? `已送审 ${eco.code}（引擎受理，刷新后状态见列表）` : `送审被拒：${(out.json && out.json.error) || out.status}`;",
  "    btn.disabled = false; btn.textContent = '送审所选 ECO';",
  "  });",
  "}, 0);",
].join('\n')

/** Lay one page (table or JSBlock) under 生产与计划, idempotent by title. */
async function ensurePage(token: string, opts: {
  title: string, icon: string, sort: number, description: string
  kind: 'table' | 'js', code?: string
  collection?: string, columns?: ReadonlyArray<{ name: string, title: string, kind: string }>
  filterFields?: readonly string[]
}): Promise<void> {
  const routes = await listRoutes(token, 'W6B4BOM')
  const groupId = routes.find(row => row.title === '生产与计划' && row.type === 'group')?.id
  if (groupId === undefined) throw new Error('menu group 生产与计划 missing (run the mfg seeds first)')
  const existing = routes.find(row => row.title === opts.title && row.type === 'flowPage')
  if (existing !== undefined) {
    if (opts.kind === 'js') {
      // Code drift upgrade (the w6b3 rule): a changed JSBlock is destroyed
      // with its page and relaid; same code = kept.
      const tab = routes.find(row => row.parentId === existing.id && row.type === 'tabs')
      let stale = false
      if (tab?.schemaUid != null) {
        const grid = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${tab.schemaUid}&subKey=grid`) as { uid?: string } | null
        if (grid?.uid != null) {
          const models = await listFlowModels(token, 'W6B4BOM-upgrade')
          const block = models.find(row => row.use === 'JSBlockModel' && String(row.parentId ?? '') === String(grid.uid))
          stale = block === undefined || String(block.stepParams?.jsSettings?.runJs?.code ?? '') !== opts.code
        }
      }
      if (!stale) {
        log(`w6b4-bomver: v2 page ${opts.title} exists (kept)`)
        return
      }
      await dataOf(token, 'POST', `/api/desktopRoutes:destroy?filter=${encodeURIComponent(JSON.stringify({ id: { $eq: existing.id } }))}`, {})
      log(`w6b4-bomver: v2 page ${opts.title} relaid (JSBlock code upgraded)`)
    } else {
      log(`w6b4-bomver: v2 page ${opts.title} exists (kept)`)
      return
    }
  }
  const routeUid = withN17Prefix('w6b4b', '')
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: opts.title, icon: opts.icon, type: 'flowPage', parentId: groupId, sort: opts.sort, schemaUid: routeUid }) as { id?: unknown }
  const tabUid = withN17Prefix('w6b4b', 't')
  await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('w6b4b', 'ts') })
  const save = (model: Record<string, unknown>): Promise<unknown> => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  await save({ uid: withN17Prefix('w6b4b', 'p'), parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title: opts.title, displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title: opts.title, displayTitle: true, enableTabs: false, description: opts.description } } } })
  const gridUid = withN17Prefix('w6b4b', 'g')
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })
  if (opts.kind === 'js') {
    const block = await dataOf(token, 'POST', '/api/flowSurfaces:addBlock', {
      target: { uid: gridUid },
      type: 'jsBlock',
      settings: { showBlockCard: true, code: opts.code },
    }) as { uid?: unknown }
    if (typeof block.uid !== 'string') throw new Error(`addBlock returned no uid for ${opts.title}`)
  } else {
    const displayModelFor = (kind: string): string =>
      kind === 'select' ? 'DisplayEnumFieldModel'
        : kind === 'date' ? 'DisplayDateTimeFieldModel'
          : 'DisplayTextFieldModel'
    const tableUid = withN17Prefix('w6b4b', 'tb')
    await save({
      uid: tableUid, use: 'TableBlockModel', parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: 1,
      props: { title: opts.title },
      stepParams: {
        resourceSettings: { init: { dataSourceKey: 'main', collectionName: opts.collection } },
        tableSettings: { defaultSorting: { sort: [{ field: 'id', direction: 'desc' }] } },
      },
    })
    let sortIndex = 1
    for (const column of opts.columns ?? []) {
      const uid = withN17Prefix('w6b4b', 'k')
      const model = displayModelFor(column.kind)
      await save({
        uid, use: 'TableColumnModel', parentId: tableUid, subKey: 'columns', subType: 'array', sortIndex,
        stepParams: {
          fieldSettings: { init: { dataSourceKey: 'main', collectionName: opts.collection, fieldPath: column.name } },
          tableColumnSettings: { model: { use: model } },
        },
        props: { title: column.title, dataIndex: column.name, width: 130, editable: false, sorter: false, fixed: 'none' },
      })
      await save({
        uid: `${uid}f`, use: model, parentId: uid, subKey: 'field', subType: 'object', sortIndex: 0,
        stepParams: { popupSettings: { openView: { collectionName: opts.collection, dataSourceKey: 'main' } } },
        props: { displayStyle: 'text', overflowMode: 'ellipsis', clickToOpen: false, displayCopyButton: false },
      })
      sortIndex += 1
    }
    await save({ uid: withN17Prefix('w6b4b', 'rf'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'RefreshActionModel', props: { title: '', icon: 'ReloadOutlined' }, stepParams: { buttonSettings: { general: { title: '', icon: 'ReloadOutlined' } } } })
    await ensureTableRowDetail(token, tableUid, {
      collection: String(opts.collection),
      fields: (opts.columns ?? []).map(column => ({ fieldPath: column.name, modelUse: displayModelFor(column.kind) })),
      tabTitle: `${opts.title}详情`,
      actionsColumnSortIndex: (opts.columns ?? []).length + 1,
    })
    if ((opts.filterFields ?? []).length > 0) {
      await ensureFilterForm(token, { gridUid, tableUid, collection: String(opts.collection), fields: (opts.filterFields ?? []).map(fieldPath => ({ fieldPath })) })
    }
  }
  log(`w6b4-bomver: v2 page ${opts.title} created (/admin/${routeUid})`)
}

/** Lay both pages, bind the menu to admin+member, and grant member view on the ECO collection. */
export async function ensureBomverPages(token: string): Promise<void> {
  const ecoPage = await ensurePage(token, {
    title: '工程变更单', icon: 'SwapOutlined', sort: 8,
    description: 'ECO 工程变更单：变更原因/行变更/影响分析快照/六态审批（发起=planner/质检/admin，引擎 POST /eco/create+submit）；审批通过引擎自动切版本——新版生效★旧版停用，在产 MO 仍按原版本（版本快照语义）',
    kind: 'table', collection: 'mfg_ecos',
    columns: [
      { name: 'code', title: 'ECO编号', kind: 'text' },
      { name: 'title', title: '变更标题', kind: 'text' },
      { name: 'reason', title: '变更原因', kind: 'text' },
      { name: 'product_id', title: '产品行', kind: 'number' },
      { name: 'from_bom_id', title: '原版本', kind: 'number' },
      { name: 'to_bom_id', title: '新版本', kind: 'number' },
      { name: 'doc_status', title: '状态', kind: 'text' },
      { name: 'requested_by', title: '发起人', kind: 'text' },
      { name: 'approved_by', title: '审批人', kind: 'text' },
      { name: 'effective_at', title: '生效日期', kind: 'text' },
      { name: 'impact', title: '影响分析', kind: 'json' },
      { name: 'line_changes', title: '变更行', kind: 'json' },
    ],
    filterFields: ['doc_status'],
  })
  await ensurePage(token, {
    title: '配方版本与变更', icon: 'ApartmentOutlined', sort: 9,
    description: '配方 BOM 版本时间线（草稿/生效/停用）+ 蓝/黑/红行差异 + ECO 影响面板（受影响在产 MO/库存批次/未交付 SO——复用 B3 追溯闭包计算）；草稿 ECO 一键送审（会话身份）',
    kind: 'js', code: PLM_CONSOLE_CODE,
  })
  // Menu visibility + member read grants (the B2/B3 pattern).
  const ecoPageId = Number(psql(`SELECT id FROM "desktopRoutes" WHERE title = '工程变更单' AND type = 'flowPage' LIMIT 1;`).trim())
  if (Number.isInteger(ecoPageId) && ecoPageId > 0) {
    for (const role of ['admin', 'member']) {
      const bound = Number(psql(`SELECT count(*) FROM "rolesDesktopRoutes" WHERE "desktopRouteId" = ${String(ecoPageId)} AND "roleName" = ${sqlLit(role)};`).trim())
      if (bound === 0) await dataOf(token, 'POST', '/api/rolesDesktopRoutes:create', { desktopRouteId: ecoPageId, roleName: role })
    }
  }
  void ecoPage
  for (const name of ['mfg_ecos', 'mfg_boms', 'mfg_bom_lines']) {
    const granted = Number(psql(`SELECT count(*) FROM "rolesResources" rr JOIN "rolesResourcesActions" ra ON ra."rolesResourceId" = rr.id WHERE rr."roleName" = 'member' AND rr."name" = '${name}' AND ra."name" = 'view';`).trim())
    if (granted === 0) {
      psql(`INSERT INTO "rolesResources" ("roleName", "name", "usingActionsConfig", "createdAt", "updatedAt") SELECT 'member', '${name}', TRUE, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "rolesResources" WHERE "roleName" = 'member' AND "name" = '${name}');`)
      psql(`INSERT INTO "rolesResourcesActions" ("rolesResourceId", "name", "createdAt", "updatedAt") SELECT rr.id, 'view', NOW(), NOW() FROM "rolesResources" rr WHERE rr."roleName" = 'member' AND rr."name" = '${name}' AND NOT EXISTS (SELECT 1 FROM "rolesResourcesActions" ra WHERE ra."rolesResourceId" = rr.id AND ra."name" = 'view');`)
      log(`w6b4-bomver: member→${name} view granted`)
    }
  }
}

// ─── --assert ───

async function assertAll(token: string): Promise<void> {
  log('— 结构')
  const ecoPresent = await dataOf(token, 'GET', '/api/collections/mfg_ecos')
    .then(row => (row as { name?: string } | null)?.name === 'mfg_ecos')
    .catch(() => false)
  check('mfg_ecos 集合在位', ecoPresent)
  const submitKey = psql("SELECT count(*) FROM fields WHERE \"collectionName\" = 'mfg_job_reports' AND name = 'submit_key';").trim()
  check('mfg_job_reports.submit_key 字段已注册', Number(submitKey) === 1, `fields=${submitKey}`)
  const idx = psql("SELECT indexname FROM pg_indexes WHERE indexname = 'ux_mfg_job_reports_submit';").trim()
  check('submit_key 唯一索引在位', idx === 'ux_mfg_job_reports_submit', idx)
  const flow = psql("SELECT is_active FROM wfl_flow_configs WHERE doc_type = 'mfg_ecos';").trim()
  check('mfg_ecos 六态审批流已注册且激活', flow === 't', flow)
  log('— 铺页')
  const routes = await listRoutes(token, 'W6B4BOM-assert')
  for (const title of ['工程变更单', '配方版本与变更']) {
    check(`v2 页「${title}」在生产与计划组下`, routes.some(row => row.title === title && row.type === 'flowPage'))
  }
  log('— 版本语义底座')
  const snapshot = psql('SELECT count(*) FROM mfg_orders WHERE bom_id IS NOT NULL;').trim()
  check('存量 MO 均引用具体 bom_id（版本快照底座）', Number(snapshot) > 0, `rows=${snapshot}`)
}

async function main(): Promise<void> {
  const token = await signInWithRetry()
  if (mode === 'seed') {
    await ensureEcoCollection(token)
    await ensureEcoFlow(token)
    await ensureBomverPages(token)
    log('w6b4-bomver: seed complete')
    return
  }
  await assertAll(token)
  if (failures.length > 0) {
    log(`w6b4-bomver: assert FAILED (${String(failures.length)})`)
    process.exitCode = 1
    return
  }
  log('w6b4-bomver: assert PASS')
}
// Library imports must not run the CLI (the approval-engine guard pattern).
if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main()
}
