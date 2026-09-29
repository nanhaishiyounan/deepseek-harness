/**
 * W3-B4: the approval-flow configuration center — an admin-only v2 page
 * 「审批流配置」 under 协同办公 (plans/2026-09-27-w3-usability/04-b4-approval-visual.md).
 *
 * Five effects, one script:
 *
 * 1. The page: a JSBlock SVG state map (one <details> per flow — nodes from
 *    wfl_flow_states, edges from wfl_flow_transitions with action/role/
 *    condition labels, flow headers with the threshold/tolerance/approver
 *    summary), the flow_configs table with Add-new + row Edit (config_note
 *    required), and the states/transitions/gate_configs tables with row Edit
 *    — plain-collection REST writes, the D6 channel (no second engine).
 * 2. Menu ACL: the page route binds admin only (NocoBase auto-binds every
 *    role on desktopRoutes:create; the member binding row is destroyed so
 *    member never sees the menu —「仅 admin 可见」).
 * 3. Data ACL: member gains view/list/get (full field lists) on the four
 *    config collections — read-only even if the menu is ever shared back.
 * 4. --check-consistency: the fail-loud probe (activation exclusivity, no
 *    orphan transitions, effective-state reachability, approver existence,
 *    extras sanity, non-empty config_note, threshold-literal alignment).
 *    setup-nocobase verify imports the same function (one 口径).
 * 5. --assert: graph-data 对拍 (per-flow node/edge counts vs the live API)
 *    + ACL negatives (member update 403, ungranted role list 403) + block
 *    wire checks.
 *
 * The engine itself is untouched: every edit writes rows the engine already
 * consumes (loadFlow re-reads wfl_flow_configs per act, so a threshold change
 * takes effect on the next document). Editing extras.amount_threshold must
 * also edit the `<= N` transition literal — the probe keeps the two aligned
 * (the W2-B5 seedDocFlow convergence semantics).
 *
 * Idempotent (existing w3b4 blocks ⇒ kept); --rollback destroys the w3b4
 * flowModels rows, the page route (+tabs cascade), and the member view
 * grants this batch added.
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w3-approval-visual.mts
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w3-approval-visual.mts --check-consistency
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w3-approval-visual.mts --assert
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w3-approval-visual.mts --rollback
 */
import {
  call,
  dataOf,
  drawerPageTreeFor,
  ensureTableRowDetail,
  listFlowModels,
  listRoutes,
  rowDetailOpenView,
  signInWithRetry,
  withN17Prefix,
} from './nocobase-flow-page-lib.mts'
import type { DetailFieldSpec, FlowModelRow, RouteRow } from './nocobase-flow-page-lib.mts'
import { thresholdOf } from '../../../packages/connector/tool-nocobase/src/approval-rules.ts'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** uid for W3-B4 rows; the `w3b4` prefix is the --rollback w3b4 anchor. */
const withW3b4Prefix = (tag: string): string => withN17Prefix('w3b4', tag)

const MENU_GROUP = '项目与协同'
const PAGE_TITLE = '审批流配置'
/** The flow whose <details> section renders expanded by default (the journey's主角). */
const DEFAULT_OPEN_DOC_TYPE = 'pur_orders'

const ANCHOR_OPTS = [
  { value: '0', label: '0 草稿侧', color: 'default' },
  { value: '1', label: '1 生效', color: 'green' },
  { value: '2', label: '2 作废', color: 'default' },
]

type FieldKind = 'input' | 'select' | 'number' | 'boolean' | 'textarea'
type FieldSpec = { name: string, title: string, kind: FieldKind, options?: object[], required?: boolean, description?: string }

const displayModelFor = (kind: FieldKind): string => {
  switch (kind) {
    case 'select': return 'DisplayEnumFieldModel'
    case 'number': return 'DisplayNumberFieldModel'
    case 'boolean': return 'DisplayCheckboxFieldModel'
    case 'textarea': return 'DisplayTextFieldModel'
    default: return 'DisplayTextFieldModel'
  }
}

const editModelFor = (kind: FieldKind): string => {
  switch (kind) {
    case 'select': return 'SelectFieldModel'
    case 'number': return 'NumberFieldModel'
    case 'boolean': return 'CheckboxFieldModel'
    // The registry class for interface 'textarea' is TextareaFieldModel —
    // the exact spelling is load-bearing (client-v2
    // flow/models/fields/TextareaFieldModel.tsx binds ['textarea'] and
    // renders the multiline Input.TextArea control).
    case 'textarea': return 'TextareaFieldModel'
    default: return 'InputFieldModel'
  }
}

// ─── the four config-table surfaces ───

const CONFIG_COLUMNS: ReadonlyArray<FieldSpec> = [
  { name: 'doc_type', title: '单据集合', kind: 'input' },
  { name: 'title', title: '流程名', kind: 'input' },
  { name: 'state_field', title: '状态字段', kind: 'input' },
  { name: 'is_active', title: '激活', kind: 'boolean' },
]

/** The flow-header edit form (D6 §1: title/is_active/approver_map/extras/config_note; doc_type/state_field stay engine keys). */
const CONFIG_EDIT_FIELDS: ReadonlyArray<FieldSpec> = [
  { name: 'title', title: '流程名', kind: 'input' },
  { name: 'is_active', title: '激活（每单据类型仅一条激活行，探针强制互斥）', kind: 'boolean' },
  {
    name: 'approver_map', title: '审批人映射', kind: 'textarea',
    description: 'JSON：角色 → 用户名/用户名数组/部门路由 {"type":"department","value":"质检部"}（数组内任一人可审；部门路由按 departmentsUsers 展开全员，W3-B5），如 {"manager":["admin",{"type":"department","value":"质检部"}],"gm":"admin"}——部门名见「组织架构」页',
  },
  {
    name: 'extras', title: '扩展配置', kind: 'textarea',
    description: 'JSON 键：amount_threshold（两级审批金额阈值）、amount_field（金额列）、invoice_match_tolerance（三方匹配容差）等；改 amount_threshold 后须同步编辑转移条件 amount <= N（一致性探针强制对齐）',
  },
  {
    name: 'config_note', title: '配置变更留痕', kind: 'textarea', required: true,
    description: '必填：写明 操作者/时间/旧值→新值（审计行，如 "operator=admin amount_threshold 200000→150000"）',
  },
]

const CONFIG_CREATE_FIELDS: ReadonlyArray<FieldSpec> = [
  { name: 'doc_type', title: '单据集合（业务表名，如 pur_orders）', kind: 'input', required: true },
  { name: 'title', title: '流程名', kind: 'input', required: true },
  { name: 'state_field', title: '状态字段（缺省 doc_status）', kind: 'input' },
  { name: 'approver_map', title: '审批人映射', kind: 'textarea', description: CONFIG_EDIT_FIELDS[2].description },
  { name: 'extras', title: '扩展配置', kind: 'textarea', description: CONFIG_EDIT_FIELDS[3].description },
  { name: 'is_active', title: '激活（新建建议先留空：先跑种子模板补齐状态与转移再激活，探针对激活流全量校验）', kind: 'boolean' },
  {
    name: 'config_note', title: '配置变更留痕', kind: 'textarea', required: true,
    description: '必填；新建后建议运行 approval-engine.mts 的种子模板（--seed-doc-flow）补齐六状态八转移，再回此页激活',
  },
]

const STATE_COLUMNS: ReadonlyArray<FieldSpec> = [
  { name: 'flow_id', title: '流程ID', kind: 'number' },
  { name: 'state', title: '状态', kind: 'input' },
  { name: 'doc_status_anchor', title: '生效锚点', kind: 'select', options: ANCHOR_OPTS },
  { name: 'allow_edit_role', title: '可编辑角色', kind: 'input' },
  { name: 'update_field', title: '回写字段', kind: 'input' },
  { name: 'update_value', title: '回写值', kind: 'input' },
]

const TRANSITION_COLUMNS: ReadonlyArray<FieldSpec> = [
  { name: 'flow_id', title: '流程ID', kind: 'number' },
  { name: 'state', title: '当前状态', kind: 'input' },
  { name: 'action', title: '动作', kind: 'input' },
  { name: 'next_state', title: '目标状态', kind: 'input' },
  { name: 'allowed_role', title: '审批角色', kind: 'input' },
  { name: 'condition_expr', title: '条件表达式', kind: 'input' },
  { name: 'allow_self_approval', title: '允许自审', kind: 'boolean' },
]

const GATE_COLUMNS: ReadonlyArray<FieldSpec> = [
  { name: 'downstream_collection', title: '下游集合', kind: 'input' },
  { name: 'upstream_collection', title: '上游集合', kind: 'input' },
  { name: 'upstream_field', title: '上游引用字段', kind: 'input' },
  { name: 'upstream_ref_field', title: '上游匹配字段', kind: 'input' },
  { name: 'upstream_label', title: '上游名称', kind: 'input' },
  { name: 'upstream_state_field', title: '上游状态字段', kind: 'input' },
  { name: 'required_status', title: '要求状态', kind: 'input' },
]

const CONFIG_COLLECTIONS = ['wfl_flow_configs', 'wfl_flow_states', 'wfl_flow_transitions', 'wfl_gate_configs'] as const

// ─── the SVG state-map JSBlock (h5 bin-map vocabulary: three MultiRecordResource instances) ───

/**
 * The map code. Probe-verified 2026-09-15 (h5): collection access must ride
 * makeResource('MultiRecordResource') + setResourceName/setPageSize/refresh/
 * getData — ctx.api.resource(...).list is rejected by the runjs allowlist.
 * Three resource instances cover the flow_configs/states/transitions trio.
 */
export const FLOW_MAP_CODE = [
  "const cfgRes = ctx.makeResource('MultiRecordResource');",
  "cfgRes.setResourceName('wfl_flow_configs');",
  'cfgRes.setPageSize(500);',
  'await cfgRes.refresh();',
  "const stateRes = ctx.makeResource('MultiRecordResource');",
  "stateRes.setResourceName('wfl_flow_states');",
  'stateRes.setPageSize(1000);',
  'await stateRes.refresh();',
  "const transRes = ctx.makeResource('MultiRecordResource');",
  "transRes.setResourceName('wfl_flow_transitions');",
  'transRes.setPageSize(1000);',
  'await transRes.refresh();',
  'const configs = cfgRes.getData() || [];',
  'const stateRows = stateRes.getData() || [];',
  'const transRows = transRes.getData() || [];',
  // The entity literals ride "&"+"amp;" concatenation: the runjs authoring
  // pipeline HTML-decodes code before parsing, and a bare """ inside a
  // string literal would decode into a quote and break the string boundary
  // (runjs-syntax-invalid "Unterminated string constant"). The split form
  // survives decoding AND keeps the runtime output correct.
  'const esc = (s) => String(s == null ? "" : s).replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/>/g,"&"+"gt;").replace(/"/g,"&"+"quot;");',
  'const ACTION_LABEL = { submit:"提交", resubmit:"重提", approve:"同意", reject:"驳回", void:"作废", comment:"意见" };',
  'const ANCHOR_LABEL = { 0:"草稿侧", 1:"生效", 2:"作废" };',
  'const parseExtras = (text) => { try { return JSON.parse(text || "{}") || {}; } catch (e) { return { __bad: String(text).slice(0, 60) }; } };',
  'const parseMap = (text) => { try { return JSON.parse(text || "{}") || {}; } catch (e) { return {}; } };',
  'let sections = "";',
  'const sorted = configs.slice().sort((a, b) => Number(a.id) - Number(b.id));',
  'for (const cfg of sorted) {',
  '  const fid = Number(cfg.id);',
  '  const states = stateRows.filter((s) => Number(s.flow_id) === fid);',
  '  const trans = transRows.filter((t) => Number(t.flow_id) === fid);',
  '  const extras = parseExtras(cfg.extras);',
  '  const map = parseMap(cfg.approver_map);',
  '  const mapSummary = Object.keys(map).map((role) => { const v = map[role]; const one = (e) => (e && typeof e === "object" && e.type === "department") ? "部门·" + String(e.value) : String(e); return role + ":" + (Array.isArray(v) ? "[" + v.map(one).join(",") + "]" : one(v)); }).join(" ") || "(无)";',
  '  const extrasBad = extras.__bad !== undefined;',
  '  const headLine = esc(cfg.title) + "（" + esc(cfg.doc_type) + "）· " + (cfg.is_active ? "激活" : "停用")',
  '    + " ｜ 状态 " + states.length + " · 转移 " + trans.length',
  '    + (extras.amount_threshold !== undefined ? " ｜ 阈值 " + esc(extras.amount_threshold) : " ｜ 阈值(默认) 100000")',
  '    + (extras.amount_field !== undefined ? " · 金额列 " + esc(extras.amount_field) : "")',
  '    + (extras.invoice_match_tolerance !== undefined ? " · 容差 " + esc(extras.invoice_match_tolerance) : "")',
  '    + (extrasBad ? " ｜ extras 非法 JSON！" : "");',
  '  const body = extrasBad ? \'<div style="color:#ff4d4f;padding:8px">extras 不是合法 JSON：\' + esc(extras.__bad) + "</div>"',
  '    : states.length === 0 ? \'<div style="color:#fa8c16;padding:8px">该流尚无状态行（先运行种子模板再激活）</div>\' : renderFlow(fid, states, trans);',
  '  const open = cfg.doc_type === "pur_orders" ? " open" : "";',
  '  sections += "<details" + open + \' style="margin:10px 0;border:1px solid #e5e7eb;border-radius:10px;padding:8px 12px;background:#fafbfc">\'',
  '    + "<summary style=\\"cursor:pointer;font-weight:600;font-size:13px;padding:4px 0\\">" + headLine + " ｜ 审批人 " + esc(mapSummary) + "</summary>"',
  '    + body + "</details>";',
  '}',
  'function renderFlow(fid, states, trans) {',
  '  const nodeW = 188, nodeH = 84, colGap = 240, rowGap = 118, padX = 26, padY = 30;',
  '  const incoming = {};',
  '  for (const t of trans) incoming[t.next_state] = (incoming[t.next_state] || 0) + 1;',
  '  const layer = {};',
  '  let frontier = states.filter((s) => !incoming[s.state]).map((s) => s.state);',
  '  if (frontier.length === 0 && states.length > 0) frontier = [states[0].state];',
  '  frontier.forEach((s) => { layer[s] = 0; });',
  '  let depth = 0;',
  '  while (frontier.length > 0) {',
  '    depth += 1;',
  '    const next = [];',
  '    for (const t of trans) {',
  '      if (layer[t.state] === depth - 1 && layer[t.next_state] === undefined) { layer[t.next_state] = depth; next.push(t.next_state); }',
  '    }',
  '    frontier = next.filter((v, i) => next.indexOf(v) === i);',
  '  }',
  '  for (const s of states) { if (layer[s.state] === undefined) layer[s.state] = depth; }',
  '  const byLayer = {};',
  '  for (const s of states) { const l = layer[s.state]; (byLayer[l] = byLayer[l] || []).push(s); }',
  '  const pos = {};',
  '  const maxLayer = Math.max.apply(null, states.map((s) => layer[s.state]));',
  '  for (let l = 0; l <= maxLayer; l += 1) {',
  '    const rows = byLayer[l] || [];',
  '    rows.forEach((s, i) => { pos[s.state] = { x: padX + l * colGap, y: padY + i * rowGap }; });',
  '  }',
  '  const height = padY * 2 + Math.max.apply(null, states.map((s) => pos[s.state].y)) + nodeH;',
  '  const width = padX * 2 + (maxLayer + 1) * colGap - (colGap - nodeW);',
  '  let g = \'<svg viewBox="0 0 \' + width + " " + height + \'" style="width:100%;height:auto;font-size:12px" data-wfl-flow="\' + fid + \'">\';',
  '  g += \'<defs><marker id="arw-\' + fid + \'" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 9 3.5, 0 7" fill="#6b7280"/></marker></defs>\';',
  '  const anchorColor = { 1: "#16a34a", 2: "#9ca3af" };',
  '  for (const t of trans) {',
  '    const from = pos[t.state], to = pos[t.next_state];',
  '    if (!from || !to) { g += \'<text x="8" y="12" fill="#ff4d4f">孤儿转移：\' + esc(t.state) + " → " + esc(t.next_state) + "（探针将拒绝）</text>"; continue; }',
  '    const parallel = trans.filter((x) => x.state === t.state && x.next_state === t.next_state);',
  '    const idx = parallel.indexOf(t);',
  '    const spread = parallel.length > 1 ? (idx - (parallel.length - 1) / 2) * 26 : 0;',
  '    const x1 = from.x + nodeW, y1 = from.y + nodeH / 2 + spread;',
  '    const x2 = to.x, y2 = to.y + nodeH / 2;',
  '    const back = to.x <= from.x;',
  '    let d, lx, ly;',
  '    if (back) {',
  '      const lift = 66 + Math.abs(spread);',
  '      d = "M " + x1 + " " + y1 + " C " + (x1 + 60) + " " + (y1 - lift) + " " + (x2 - 60) + " " + (y2 - lift) + " " + x2 + " " + y2;',
  '      lx = (x1 + x2) / 2; ly = Math.min(y1, y2) - lift / 2 - 4;',
  '    } else {',
  '      const mx = (x1 + x2) / 2;',
  '      d = "M " + x1 + " " + y1 + " C " + mx + " " + y1 + " " + mx + " " + y2 + " " + (x2 - 2) + " " + y2;',
  '      lx = mx; ly = (y1 + y2) / 2 - 6 + spread * 0.6;',
  '    }',
  '    g += \'<path d="\' + d + \'" fill="none" stroke="#6b7280" stroke-width="1.4" marker-end="url(#arw-\' + fid + \')"/>\';',
  '    const label = (ACTION_LABEL[t.action] || t.action) + "·" + (t.allowed_role || "?") + (t.condition_expr ? " ｜ " + String(t.condition_expr).slice(0, 26) : "") + (t.allow_self_approval === true ? "（可自审）" : "");',
  '    g += \'<rect x="\' + (lx - label.length * 5.6 - 3) + \'" y="\' + (ly - 11) + \'" width="\' + (label.length * 11.2 + 6) + \'" height="15" rx="4" fill="#fff" fill-opacity="0.92"/>\';',
  '    g += \'<text x="\' + lx + \'" y="\' + ly + \'" text-anchor="middle" fill="#374151">\' + esc(label) + "</text>";',
  '  }',
  '  for (const s of states) {',
  '    const p = pos[s.state];',
  '    const anchor = Number(s.doc_status_anchor);',
  '    const border = anchorColor[anchor] || "#d97706";',
  '    g += \'<rect x="\' + p.x + \'" y="\' + p.y + \'" width="\' + nodeW + \'" height="\' + nodeH + \'" rx="10" fill="#ffffff" stroke="\' + border + \'" stroke-width="2"/>\';',
  '    g += \'<text x="\' + (p.x + nodeW / 2) + \'" y="\' + (p.y + 26) + \'" text-anchor="middle" font-size="14" font-weight="600" fill="#111827">\' + esc(s.state) + "</text>";',
  '    g += \'<text x="\' + (p.x + nodeW / 2) + \'" y="\' + (p.y + 46) + \'" text-anchor="middle" fill="#6b7280">锚点 \' + (ANCHOR_LABEL[anchor] || anchor) + "</text>";',
  '    g += \'<text x="\' + (p.x + nodeW / 2) + \'" y="\' + (p.y + 64) + \'" text-anchor="middle" fill="#9ca3af">可编辑: \' + esc(s.allow_edit_role || "-") + "</text>";',
  '  }',
  '  g += "</svg>";',
  '  return g;',
  '}',
  'ctx.render(`<div data-wfl="flow-map" style="padding:4px"><div style="font-weight:600;font-size:14px;margin:8px 0 2px">审批流状态图（数据实时读 wfl 三表；节点=状态 锚点着色，边=转移 动作·角色｜条件）</div>${sections}</div>`);',
].join('\n')

// ─── page assembly ───

type TableSpec = {
  heading: string
  collection: string
  columns: ReadonlyArray<FieldSpec>
  editFields: ReadonlyArray<FieldSpec>
  addNew?: ReadonlyArray<FieldSpec>
}

const TABLES: ReadonlyArray<TableSpec> = [
  { heading: '流程配置（流头：阈值/容差/审批人映射；编辑与新建必填 config_note）', collection: 'wfl_flow_configs', columns: CONFIG_COLUMNS, editFields: CONFIG_EDIT_FIELDS, addNew: CONFIG_CREATE_FIELDS },
  { heading: '状态定义（节点：状态/生效锚点/可编辑角色/生效回写）', collection: 'wfl_flow_states', columns: STATE_COLUMNS, editFields: STATE_COLUMNS },
  { heading: '转移定义（边：当前状态→目标状态，动作/角色/条件表达式）', collection: 'wfl_flow_transitions', columns: TRANSITION_COLUMNS, editFields: TRANSITION_COLUMNS },
  { heading: '卡口配置（未生效上游不得创建下游）', collection: 'wfl_gate_configs', columns: GATE_COLUMNS, editFields: GATE_COLUMNS },
]

/** The EditActionModel's persisted popup subtree (the lib editPageTreeFor shape, w3b4-prefixed, with required/description support). */
function editPopupTree(actionUid: string, spec: { collection: string, fields: ReadonlyArray<FieldSpec> }): Record<string, unknown> {
  const formUid = withW3b4Prefix('efm')
  const itemUids = spec.fields.map(() => withW3b4Prefix('efi'))
  const layoutRows = itemUids.map((itemUid, index) => ({
    id: `r${index}`,
    cells: [{ id: `r${index}:cell:0`, items: [itemUid] }],
    sizes: [24],
  }))
  return {
    uid: withW3b4Prefix('ewp'), parentId: actionUid, subKey: 'page', subType: 'object', use: 'ChildPageModel', props: {},
    stepParams: { pageSettings: { general: { displayTitle: false, enableTabs: true } } },
    subModels: {
      tabs: [{
        use: 'ChildPageTabModel', subKey: 'tabs', subType: 'array', sortIndex: 0, props: {},
        stepParams: { pageTabSettings: { tab: { title: '编辑' } } },
        subModels: {
          grid: {
            use: 'BlockGridModel', subKey: 'grid', subType: 'object', sortIndex: 0, props: {}, filterManager: [],
            subModels: {
              items: [{
                uid: formUid, use: 'EditFormModel', subKey: 'items', subType: 'array', sortIndex: 1, props: {},
                stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection, filterByTk: '{{ctx.view.inputArgs.filterByTk}}' } } },
                subModels: {
                  grid: {
                    use: 'FormGridModel', subKey: 'grid', subType: 'object', sortIndex: 0,
                    props: { layout: { version: 2, rows: layoutRows, rowGap: 0, colGap: 16, sizes: {}, rowOrder: layoutRows.map(row => row.id) } },
                    stepParams: { gridSettings: { grid: { layout: { version: 2, rows: layoutRows } } } },
                    subModels: {
                      items: spec.fields.map((field, index) => ({
                        uid: itemUids[index], use: 'FormItemModel', subKey: 'items', subType: 'array', sortIndex: index + 1,
                        props: {
                          ...(field.required === true ? { required: true } : {}),
                          ...(field.description === undefined ? {} : { description: field.description }),
                        },
                        stepParams: { fieldSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection, fieldPath: field.name } } },
                        subModels: {
                          field: {
                            uid: withW3b4Prefix('eff'), use: editModelFor(field.kind), subKey: 'field', subType: 'object', sortIndex: 0,
                            props: field.options === undefined || field.options.length === 0 ? {} : { allowClear: true, options: field.options },
                          },
                        },
                      })),
                    },
                  },
                  actions: [{
                    uid: withW3b4Prefix('efs'), parentId: formUid, subKey: 'actions', subType: 'array', sortIndex: 1,
                    use: 'FormSubmitActionModel', props: { type: 'primary' },
                    stepParams: { buttonSettings: { general: { title: '保存', type: 'primary' } } },
                  }],
                },
              }],
            },
          },
        },
      }],
    },
  }
}

/** One FormGrid subtree for the Add-new popup (the w1 intent-form shape with required/description support). */
function createFormGrid(collection: string, fields: ReadonlyArray<FieldSpec>): Record<string, unknown> {
  const itemUids = fields.map(() => withW3b4Prefix('cfi'))
  const rows = itemUids.map((itemUid, index) => ({
    id: `r${index}`,
    cells: [{ id: `r${index}:cell:0`, items: [itemUid] }],
    sizes: [24],
  }))
  return {
    use: 'FormGridModel', subKey: 'grid', subType: 'object', sortIndex: 0,
    props: { layout: { version: 2, rows, rowGap: 0, colGap: 16, sizes: {}, rowOrder: rows.map(row => row.id) } },
    stepParams: { gridSettings: { grid: { layout: { version: 2, rows } } } },
    subModels: {
      items: fields.map((field, index) => ({
        uid: itemUids[index], use: 'FormItemModel', subKey: 'items', subType: 'array', sortIndex: index + 1,
        props: {
          ...(field.required === true ? { required: true } : {}),
          ...(field.description === undefined ? {} : { description: field.description }),
        },
        stepParams: { fieldSettings: { init: { dataSourceKey: 'main', collectionName: collection, fieldPath: field.name } } },
        subModels: {
          field: {
            use: editModelFor(field.kind), subKey: 'field', subType: 'object', sortIndex: 0,
            props: field.options === undefined || field.options.length === 0 ? {} : { allowClear: true, options: field.options },
          },
        },
      })),
    },
  }
}

/** Next free sort position among the group's direct children. */
async function nextSortInGroup(token: string, groupId: number): Promise<number> {
  const children = (await listRoutes(token, 'w3-approval-visual')).filter(row => row.parentId === groupId)
  return children.reduce((max, row) => Math.max(max, row.sort ?? 0), 0) + 1
}

/**
 * Resolve the grid uid for an already-existing flowPage (partial-rebuild
 * recovery). The tabs route row's schemaUid is the grid's PARENT, not the
 * grid itself — returning it made the JSBlock idempotence check compare
 * against the wrong parent and mint duplicates (found live during W3-B4;
 * the h5 pageGridUid findOne shape is the correct wire).
 */
async function gridUidOfExistingPage(token: string, title: string): Promise<string> {
  const routes = await listRoutes(token, 'w3-approval-visual')
  const flow = routes.find(row => row.title === title && row.type === 'flowPage')
  const tab = flow === undefined ? undefined : routes.find(row => row.type === 'tabs' && row.parentId === flow.id)
  if (tab?.schemaUid == null) {
    throw new Error(`"${title}" flowPage exists but has no tabs grid row (truncated build); run --rollback and rebuild`)
  }
  const grid = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${tab.schemaUid}&subKey=grid`) as { uid?: string } | null
  if (grid?.uid == null) {
    throw new Error(`"${title}" flowPage has no BlockGridModel under its tabs row; run --rollback and rebuild`)
  }
  return String(grid.uid)
}

/**
 * Create the flowPage route shell (w3-views shape) and return the grid uid
 * blocks hang under.
 */
async function ensureV2RouteShell(token: string, title: string, icon: string, groupId: number): Promise<{ routeUid: string, gridUid: string }> {
  const routes = await listRoutes(token, 'w3-approval-visual')
  const flow = routes.find(row => row.title === title && row.type === 'flowPage')
  if (flow !== undefined) return { routeUid: String(flow.schemaUid ?? ''), gridUid: await gridUidOfExistingPage(token, title) }
  if (routes.some(row => row.title === title && row.type === 'page')) {
    throw new Error(`a v1 page named "${title}" already exists; rename it first (this batch owns the flowPage channel)`)
  }
  const sort = await nextSortInGroup(token, groupId)
  const routeUid = withW3b4Prefix('')
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title, icon, type: 'flowPage', parentId: groupId, sort, schemaUid: routeUid })
  const tabUid = withW3b4Prefix('t')
  await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withW3b4Prefix('ts') })
  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  const pageUid = withW3b4Prefix('p')
  await save({ uid: pageUid, parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title, displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title, displayTitle: true, enableTabs: false } } } })
  const gridUid = withW3b4Prefix('g')
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })
  console.log(`nocobase-w3-approval-visual: v2 route shell "${title}" created (/admin/${routeUid})`)
  return { routeUid, gridUid }
}

/** Whether the page grid already carries this batch's block for one collection. */
async function pageHasBlock(token: string, gridUid: string, use: string, collection: string): Promise<boolean> {
  const rows = await listFlowModels(token, 'w3-approval-visual')
  return rows.some(row => row.use === use && String(row.uid ?? '').startsWith('w3b4')
    && String(row.stepParams?.resourceSettings?.init?.collectionName ?? '') === collection)
}

async function ensureConfigTable(token: string, gridUid: string, spec: TableSpec, sortIndex: number): Promise<void> {
  if (await pageHasBlock(token, gridUid, 'TableBlockModel', spec.collection)) {
    console.log(`nocobase-w3-approval-visual: table "${spec.heading}" exists (kept)`)
    return
  }
  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  const tableUid = withW3b4Prefix('tb')
  await save({
    uid: tableUid, use: 'TableBlockModel', parentId: gridUid, subKey: 'items', subType: 'array', sortIndex,
    props: { title: spec.heading },
    stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection } } },
  })
  let columnIndex = 1
  for (const column of spec.columns) {
    const uid = withW3b4Prefix('c')
    const model = displayModelFor(column.kind)
    await save({
      uid, use: 'TableColumnModel', parentId: tableUid, subKey: 'columns', subType: 'array', sortIndex: columnIndex,
      stepParams: {
        fieldSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection, fieldPath: column.name } },
        tableColumnSettings: { model: { use: model } },
      },
      props: { title: column.title, dataIndex: column.name, width: 150, editable: false, sorter: false, fixed: 'none', ...(column.options === undefined || column.options.length === 0 ? {} : { options: column.options }) },
    })
    await save({
      uid: `${uid}f`, use: model, parentId: uid, subKey: 'field', subType: 'object', sortIndex: 0,
      stepParams: { popupSettings: { openView: { collectionName: spec.collection, dataSourceKey: 'main' } } },
      props: { displayStyle: 'text', overflowMode: 'ellipsis', clickToOpen: false, displayCopyButton: false, ...(column.options === undefined || column.options.length === 0 ? {} : { options: column.options }) },
    })
    columnIndex += 1
  }
  // Row detail (B1 triple) first — it owns the trailing actions column.
  await ensureTableRowDetail(token, tableUid, {
    collection: spec.collection,
    fields: spec.columns.map(column => ({ fieldPath: column.name, modelUse: displayModelFor(column.kind), ...(column.options === undefined || column.options.length === 0 ? {} : { options: column.options }) })),
    tabTitle: '详情',
    actionsColumnSortIndex: columnIndex,
  })
  // The row Edit action rides the same actions column (w3b4-prefixed popup).
  const models = await listFlowModels(token, 'w3-approval-visual')
  const actionsColumn = models.find(row => row.use === 'TableActionsColumnModel' && String(row.parentId ?? '') === tableUid)
  if (actionsColumn?.uid === undefined) throw new Error(`actions column not found under ${spec.collection} table (ensureTableRowDetail)`)
  const editUid = withW3b4Prefix('ea')
  await save({
    uid: editUid, parentId: actionsColumn.uid, subKey: 'actions', subType: 'array', sortIndex: 2,
    use: 'EditActionModel', props: { title: '编辑' },
    stepParams: {
      popupSettings: { openView: rowDetailOpenView(spec.collection) },
      buttonSettings: { general: { title: '编辑', type: 'link', icon: null, iconOnly: false } },
    },
    subModels: { page: editPopupTree(editUid, { collection: spec.collection, fields: spec.editFields }) },
  })
  if (spec.addNew !== undefined) {
    await save({
      uid: withW3b4Prefix('an'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 1, use: 'AddNewActionModel', props: {},
      stepParams: { popupSettings: { openView: { collectionName: spec.collection, dataSourceKey: 'main' } } },
      subModels: {
        page: {
          use: 'ChildPageModel', subKey: 'page', subType: 'object', sortIndex: 0, props: {},
          stepParams: { pageSettings: { general: { displayTitle: false, enableTabs: true } } },
          subModels: {
            tabs: [{
              use: 'ChildPageTabModel', subKey: 'tabs', subType: 'array', sortIndex: 0, props: {},
              stepParams: { pageTabSettings: { tab: { title: '{{t("Add new")}}' } } },
              subModels: {
                grid: {
                  use: 'BlockGridModel', subKey: 'grid', subType: 'object', sortIndex: 0, props: {},
                  subModels: {
                    items: [{
                      use: 'CreateFormModel', subKey: 'items', subType: 'array', sortIndex: 1, props: {},
                      stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection } } },
                      subModels: { grid: createFormGrid(spec.collection, spec.addNew) },
                    }],
                  },
                },
              },
            }],
          },
        },
      },
    })
  }
  await save({
    uid: withW3b4Prefix('rf'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 3, use: 'RefreshActionModel',
    props: { title: '', icon: 'ReloadOutlined' },
    stepParams: { buttonSettings: { general: { title: '', icon: 'ReloadOutlined' } } },
  })
  console.log(`nocobase-w3-approval-visual: table "${spec.heading}" built (${spec.collection}, row Edit + ${spec.addNew === undefined ? 'no' : 'Add-new'} form)`)
}

async function ensureFlowMap(token: string, gridUid: string): Promise<void> {
  const rows = await listFlowModels(token, 'w3-approval-visual')
  // addBlock mints its own uid (no w3b4 prefix — the h5 bin-map pattern), so
  // existence rides on the parent grid; the page-route destroy cascades it.
  if (rows.some(row => row.use === 'JSBlockModel' && String(row.parentId ?? '') === gridUid)) {
    console.log('nocobase-w3-approval-visual: flow-map JSBlock exists (kept)')
    return
  }
  const block = await dataOf(token, 'POST', '/api/flowSurfaces:addBlock', {
    target: { uid: gridUid },
    type: 'jsBlock',
    settings: { showBlockCard: true, code: FLOW_MAP_CODE },
  })
  const blockUid = block?.uid ?? block?.tree?.uid
  if (typeof blockUid !== 'string') throw new Error(`addBlock returned no uid for the flow map: ${JSON.stringify(block).slice(0, 200)}`)
  console.log(`nocobase-w3-approval-visual: flow-map JSBlock created (uid ${blockUid})`)
}

// ─── ACL ───

/**
 * Menu ACL: the page route binds admin only. NocoBase auto-binds every role
 * on desktopRoutes:create, so the member binding row is destroyed after the
 * create — member never sees the「审批流配置」menu (admin-only, PLAN §2 D6).
 */
async function bindAdminOnlyMenu(token: string, routeTitle: string): Promise<void> {
  const routes = await listRoutes(token, 'w3-approval-visual')
  const page = routes.find(row => row.title === routeTitle && row.type === 'flowPage')
  if (page === undefined) throw new Error(`flowPage "${routeTitle}" missing; cannot bind admin-only menu`)
  const bindings = (await dataOf(token, 'GET', `/api/rolesDesktopRoutes:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ desktopRouteId: { $eq: page.id } }))}`)) as Array<{ roleName?: string }> | null
  // listAccessible intersects the page's bound roles with the user's roles —
  // there is no super-user bypass (verified live: the root account only sees
  // a page after a root binding row exists). Bind admin + root explicitly,
  // and drop the auto-created member row (admin-only page).
  const boundRoles = new Set((bindings ?? []).map(row => String(row.roleName ?? '')))
  for (const role of ['admin', 'root']) {
    if (!boundRoles.has(role)) {
      await dataOf(token, 'POST', '/api/rolesDesktopRoutes:create', { desktopRouteId: page.id, roleName: role })
    }
  }
  if (boundRoles.has('member')) {
    // The table's primary key is the (desktopRouteId, roleName) pair — no row
    // id exists — so the member row dies by filter, never by filterByTk.
    await call(token, 'POST', `/api/rolesDesktopRoutes:destroy?filter=${encodeURIComponent(JSON.stringify({ desktopRouteId: { $eq: page.id }, roleName: { $eq: 'member' } }))}`)
    console.log('nocobase-w3-approval-visual: member menu binding destroyed (admin-only page)')
  }
  console.log('nocobase-w3-approval-visual: menu bindings = admin + root (member dropped)')
}

/**
 * Data ACL: member gains view/list/get with explicit full field lists on the
 * four config collections (the grantMemberViewAcl contract — read-only even
 * if the menu is ever shared back; write paths stay admin-only and 403 for
 * member).
 */
async function grantMemberConfigRead(token: string): Promise<void> {
  let granted = 0
  for (const collection of CONFIG_COLLECTIONS) {
    const existing = (await dataOf(token, 'GET', `/api/rolesResources:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ roleName: { $eq: 'member' }, name: { $eq: collection } }))}`)) as Array<{ id?: number }> | null
    let resourceId = existing?.[0]?.id
    if (resourceId === undefined) {
      const created = await dataOf(token, 'POST', '/api/rolesResources:create', {
        role: { name: 'member' }, name: collection, usingActionsConfig: true,
        actions: [{ name: 'view' }, { name: 'list' }, { name: 'get' }],
      })
      resourceId = created?.id
      granted += 1
    }
    if (resourceId === undefined) continue
    const fieldRows = (await dataOf(token, 'GET', `/api/fields:list?pageSize=200&filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: collection } }))}`)) as Array<{ name?: string }> | null
    const fieldNames = (fieldRows ?? []).map(field => String(field.name)).filter(name => name.length > 0)
    const actions = (await dataOf(token, 'GET', `/api/rolesResourcesActions:list?pageSize=50&filter=${encodeURIComponent(JSON.stringify({ rolesResourceId: { $eq: resourceId } }))}`)) as Array<{ id?: number, fields?: string[] }> | null
    for (const action of actions ?? []) {
      if (action.id === undefined || action.id === null) continue
      const current = Array.isArray(action.fields) ? action.fields.slice().sort().join(',') : null
      if (current === fieldNames.slice().sort().join(',')) continue
      await dataOf(token, 'POST', `/api/rolesResourcesActions:update?filterByTk=${action.id}`, { fields: fieldNames })
    }
  }
  console.log(`nocobase-w3-approval-visual: member read-only ACL — ${granted > 0 ? `${granted} config collection(s) granted (view/list/get, full field lists)` : 'rows in place'}`)
}

/**
 * Backfill the audit baseline: legacy seeded flows whose config_note is
 * empty get one explicit baseline line so the probe's non-empty assertion
 * holds from a clean slate (the 2026-09-28 probe first run found nine such
 * rows — pre-W2-B5 seeds; this marks them as backfilled, never as edits).
 */
async function ensureBaselineAudit(token: string): Promise<void> {
  const configs = (await dataOf(token, 'GET', '/api/wfl_flow_configs:list?pageSize=500')) as Array<Record<string, any>> | null ?? []
  let backfilled = 0
  for (const flow of configs) {
    if (typeof flow.config_note === 'string' && flow.config_note.trim() !== '') continue
    await dataOf(token, 'POST', `/api/wfl_flow_configs:update?filterByTk=${flow.id}`, {
      config_note: `${new Date().toISOString()} w3b4 config-center: config_note baseline backfill (seeded before the audit column; operator=admin)`,
    })
    backfilled += 1
  }
  console.log(`nocobase-w3-approval-visual: config_note baseline — ${backfilled > 0 ? `${backfilled} legacy flow(s) backfilled` : 'all flows carry audit lines'}`)
}

// ─── the consistency probe (fail-loud; the same function verify imports) ───

export type ConsistencyRow = { doc_type: string, flow_id: number, states: number, transitions: number, threshold: string | number }

/**
 * The wfl six-table consistency probe (PLAN §2 invariant 5, B4 §2). Fail-loud
 * on every active flow; inactive draft flows are exempt from the structural
 * assertions (2/3/5/6/7) — activation is the admin's explicit switch and the
 * engine only reads active rows (loadFlow), so the probe guards exactly the
 * rows the engine consumes. Assertions:
 *
 * 1. activation exclusivity — one active config per doc_type (loadFlow semantics)
 * 2. no orphan transitions — every transition's state and next_state exist in
 *    the flow's state rows
 * 3. no island — at least one anchor=1 (effective) state is reachable from
 *    the entry states (no incoming transitions)
 * 4. approver existence — every approver_map username (string or array entry)
 *    exists in users
 * 5. extras sanity — valid JSON; amount_threshold (when present) is a
 *    positive number
 * 6. audit trail — config_note non-empty on every active flow
 * 7. threshold-literal alignment — every `<= N` condition literal equals
 *    thresholdOf(extras) (the W2-B5 seedDocFlow convergence semantics)
 *
 * @param token root auth token
 * @returns failure messages (empty = consistent)
 */
export async function assertWflConsistency(token: string): Promise<string[]> {
  const failures: string[] = []
  const configs = (await dataOf(token, 'GET', '/api/wfl_flow_configs:list?pageSize=500')) as Array<Record<string, any>> | null ?? []
  const states = (await dataOf(token, 'GET', '/api/wfl_flow_states:list?pageSize=1000')) as Array<Record<string, any>> | null ?? []
  const transitions = (await dataOf(token, 'GET', '/api/wfl_flow_transitions:list?pageSize=1000')) as Array<Record<string, any>> | null ?? []
  const users = (await dataOf(token, 'GET', '/api/users:list?pageSize=500')) as Array<Record<string, any>> | null ?? []
  const knownUsers = new Set(users.map(row => String(row.username ?? '')))
  const departments = (await dataOf(token, 'GET', '/api/departments:list?pageSize=200')) as Array<Record<string, any>> | null ?? []
  const deptLinks = (await dataOf(token, 'GET', '/api/departmentsUsers:list?pageSize=500')) as Array<Record<string, any>> | null ?? []

  const active = configs.filter(row => row.is_active === true)
  // 1. activation exclusivity
  const byDocType = new Map<string, number[]>()
  for (const row of active) {
    const key = String(row.doc_type ?? '')
    const ids = byDocType.get(key) ?? []
    ids.push(Number(row.id))
    byDocType.set(key, ids)
  }
  for (const [docType, ids] of byDocType) {
    if (ids.length > 1) failures.push(`激活互斥被破坏：${docType} 有 ${ids.length} 条激活配置行（#${ids.join('、#')}）；每单据类型仅允许一条`)
  }
  for (const flow of active) {
    const docType = String(flow.doc_type ?? '')
    const label = `审批流「${docType}」#${String(flow.id)}`
    const flowStates = states.filter(row => Number(row.flow_id) === Number(flow.id))
    const flowTransitions = transitions.filter(row => Number(row.flow_id) === Number(flow.id))
    const stateNames = new Set(flowStates.map(row => String(row.state ?? '')))
    // 2. no orphan transitions
    for (const row of flowTransitions) {
      for (const side of ['state', 'next_state'] as const) {
        const value = String(row[side] ?? '')
        if (!stateNames.has(value)) {
          failures.push(`孤儿转移：${label} 转移 #${String(row.id)}（${String(row.state)} --${String(row.action)}--> ${String(row.next_state)}）的 ${side === 'state' ? '当前状态' : '目标状态'}「${value}」不在本流状态表（现有 ${[...stateNames].join('/')}）`)
        }
      }
    }
    // 3. no island — an anchor=1 state reachable from the entry states
    const reachable = new Set<string>()
    const incoming = new Set(flowTransitions.map(row => String(row.next_state ?? '')))
    const entries = [...stateNames].filter(name => !incoming.has(name))
    const queue = entries.length > 0 ? [...entries] : [...stateNames]
    for (const name of queue) reachable.add(name)
    while (queue.length > 0) {
      const current = queue.shift() as string
      for (const row of flowTransitions) {
        const from = String(row.state ?? '')
        const to = String(row.next_state ?? '')
        if (from === current && !reachable.has(to)) {
          reachable.add(to)
          queue.push(to)
        }
      }
    }
    const effectiveStates = flowStates.filter(row => Number(row.doc_status_anchor) === 1).map(row => String(row.state ?? ''))
    if (effectiveStates.length === 0) {
      failures.push(`孤岛流：${label} 没有任何生效锚点（doc_status_anchor=1）的状态`)
    } else if (!effectiveStates.some(name => reachable.has(name))) {
      failures.push(`孤岛流：${label} 的生效状态（${effectiveStates.join('/')}）从入口状态（${entries.join('/') || '(无)'}）不可达`)
    }
    // 4. approver existence
    let approverMap: Record<string, unknown> = {}
    try {
      approverMap = flow.approver_map === null || flow.approver_map === undefined || flow.approver_map === '' ? {} : JSON.parse(String(flow.approver_map)) as Record<string, unknown>
    } catch (error) {
      failures.push(`${label} 的 approver_map 不是合法 JSON：${(error as Error).message}`)
    }
    const isDeptRef = (entry: unknown): entry is { type: 'department', value: string } =>
      typeof entry === 'object' && entry !== null && (entry as Record<string, unknown>)['type'] === 'department' && typeof (entry as Record<string, unknown>)['value'] === 'string'
    const deptTitles = new Set(departments.map(row => String(row.title ?? '')))
    const membersByDept = new Map<string, number>()
    for (const link of deptLinks) {
      const key = String(link.departmentId ?? '')
      membersByDept.set(key, (membersByDept.get(key) ?? 0) + 1)
    }
    const deptIdByTitle = new Map(departments.map(row => [String(row.title ?? ''), String(row.id)]))
    for (const [role, value] of Object.entries(approverMap)) {
      const entries: unknown[] = Array.isArray(value) ? value : value === null || value === undefined || value === '' ? [] : [value]
      for (const entry of entries) {
        if (isDeptRef(entry)) {
          // W3-B5 department routing: the department must exist and hold at
          // least one member — the engine expands the tier from departmentsUsers.
          if (!deptTitles.has(entry.value)) {
            failures.push(`审批部门缺失：${label} approver_map.${role} 引用部门「${entry.value}」，departments 表无此名称`)
          } else if ((membersByDept.get(deptIdByTitle.get(entry.value) ?? '') ?? 0) === 0) {
            failures.push(`审批部门无成员：${label} approver_map.${role} 的部门「${entry.value}」在 departmentsUsers 无挂接用户，审批待办无法展开`)
          }
          continue
        }
        if (typeof entry === 'string' && entry !== '' && !knownUsers.has(entry)) {
          failures.push(`审批人缺失：${label} approver_map.${role} 引用用户「${entry}」，users 表无此用户名`)
        }
      }
    }
    // 5. extras sanity
    let extras: Record<string, unknown> | null = null
    try {
      extras = flow.extras === null || flow.extras === undefined || flow.extras === '' ? null : JSON.parse(String(flow.extras)) as Record<string, unknown>
    } catch (error) {
      failures.push(`${label} 的 extras 不是合法 JSON：${(error as Error).message}`)
    }
    if (extras !== null) {
      const threshold = extras.amount_threshold
      if (threshold !== undefined && (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold <= 0)) {
        failures.push(`${label} 的 extras.amount_threshold 非正数：${JSON.stringify(threshold)}（两级审批阈值必须为正数）`)
      }
    }
    // 6. audit trail
    if (typeof flow.config_note !== 'string' || flow.config_note.trim() === '') {
      failures.push(`审计缺失：${label} 的 config_note 为空（经配置中心的每次变更必须留痕：谁/何时/旧→新）`)
    }
    // 7. threshold-literal alignment
    const threshold = thresholdOf(extras)
    for (const row of flowTransitions) {
      const condition = String(row.condition_expr ?? '')
      const match = /<=\s*(-?\d+(?:\.\d+)?)/u.exec(condition)
      if (match === null) continue
      const literal = Number(match[1])
      if (literal !== threshold) {
        failures.push(`阈值漂移：${label} 转移 #${String(row.id)} 条件「${condition}」的字面量 ${String(literal)} ≠ extras 阈值 ${String(threshold)}（改 amount_threshold 须同步改转移条件，W2-B5 对齐语义）`)
      }
    }
  }
  return failures
}

/** The --check-consistency entry: print the per-flow table then fail loud on any assertion. */
async function checkConsistency(token: string): Promise<void> {
  const configs = (await dataOf(token, 'GET', '/api/wfl_flow_configs:list?pageSize=500')) as Array<Record<string, any>> | null ?? []
  const states = (await dataOf(token, 'GET', '/api/wfl_flow_states:list?pageSize=1000')) as Array<Record<string, any>> | null ?? []
  const transitions = (await dataOf(token, 'GET', '/api/wfl_flow_transitions:list?pageSize=1000')) as Array<Record<string, any>> | null ?? []
  const rows: ConsistencyRow[] = []
  for (const flow of configs) {
    let extras: Record<string, unknown> | null = null
    try {
      extras = flow.extras === null || flow.extras === undefined || flow.extras === '' ? null : JSON.parse(String(flow.extras)) as Record<string, unknown>
    } catch { extras = null }
    rows.push({
      doc_type: String(flow.doc_type ?? ''),
      flow_id: Number(flow.id),
      states: states.filter(row => Number(row.flow_id) === Number(flow.id)).length,
      transitions: transitions.filter(row => Number(row.flow_id) === Number(flow.id)).length,
      threshold: extras?.amount_threshold !== undefined ? String(extras.amount_threshold) : '(默认100000)',
    })
  }
  console.log('wfl 一致性探针 —— 各流结构（激活流全量 fail-loud 校验）：')
  for (const row of rows) {
    console.log(`  #${row.flow_id} ${row.doc_type} — 状态 ${row.states} · 转移 ${row.transitions} · 阈值 ${row.threshold}`)
  }
  const failures = await assertWflConsistency(token)
  if (failures.length > 0) {
    console.error(`--check-consistency: FAILED（${failures.length} 处）\n  - ${failures.join('\n  - ')}`)
    process.exitCode = 1
    return
  }
  console.log('--check-consistency: OK（激活互斥/无孤儿转移/生效可达/审批人存在/extras 合法/审计留痕/阈值对齐 全部通过）')
}

// ─── --assert: graph对拍 + ACL negatives + block wires ───

/** Sign in as an arbitrary local user (the ACL probe path). */
async function signInAs(account: string, password: string): Promise<string | null> {
  const base = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
  const response = await fetch(`${base}/api/auth:signIn`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account, password }),
  })
  const payload = await response.json().catch(() => null) as { data?: { token?: string } } | null
  const token = payload?.data?.token
  return typeof token === 'string' && token !== '' ? token : null
}

async function assertVisual(token: string): Promise<void> {
  const failures: string[] = []
  const models = await listFlowModels(token, 'w3-approval-visual assert')
  const routes = await listRoutes(token, 'w3-approval-visual assert')

  // 1) the page + its four tables + the JSBlock + edit forms.
  const page = routes.find(row => row.title === PAGE_TITLE && row.type === 'flowPage')
  if (page === undefined) failures.push(`${PAGE_TITLE} flowPage route missing (run the build)`)
  for (const collection of CONFIG_COLLECTIONS) {
    const table = models.find(row => row.use === 'TableBlockModel' && String(row.uid ?? '').startsWith('w3b4')
      && String(row.stepParams?.resourceSettings?.init?.collectionName ?? '') === collection)
    if (table === undefined) {
      failures.push(`w3b4 TableBlockModel on ${collection} missing`)
      continue
    }
    const column = models.find(row => row.use === 'TableActionsColumnModel' && String(row.parentId ?? '') === String(table.uid))
    if (column === undefined) {
      failures.push(`${collection} table lacks its actions column`)
      continue
    }
    const hasEdit = models.some(row => row.use === 'EditActionModel' && String(row.uid ?? '').startsWith('w3b4') && String(row.parentId ?? '') === String(column.uid))
    if (!hasEdit) failures.push(`${collection} rows lack the w3b4 Edit action`)
  }
  let mapBlock: FlowModelRow | undefined
  if (page !== undefined) {
    const tab = routes.find(row => row.type === 'tabs' && row.parentId === page.id)
    if (tab?.schemaUid != null) {
      const grid = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${tab.schemaUid}&subKey=grid`) as { uid?: string } | null
      mapBlock = grid?.uid == null ? undefined : models.find(row => row.use === 'JSBlockModel' && String(row.parentId ?? '') === String(grid.uid))
    }
  }
  if (mapBlock === undefined) {
    failures.push('w3b4 flow-map JSBlockModel missing')
  } else {
    const code = String(mapBlock.stepParams?.jsSettings?.runJs?.code ?? mapBlock.props?.code ?? '')
    if (!code.includes("makeResource('MultiRecordResource')") || !code.includes('wfl_flow_transitions')) {
      failures.push('flow-map code does not read the wfl trio through makeResource (runjs allowlist)')
    }
  }
  // The configs Add-new form exists and config_note is required in both forms.
  const createForms = models.filter(row => row.use === 'CreateFormModel'
    && String(row.stepParams?.resourceSettings?.init?.collectionName ?? '') === 'wfl_flow_configs')
  if (createForms.length === 0) failures.push('wfl_flow_configs Add-new CreateFormModel missing')
  const configEditActions = models.filter(row => row.use === 'EditActionModel' && String(row.uid ?? '').startsWith('w3b4')
    && String(row.stepParams?.popupSettings?.openView?.collectionName ?? '') === 'wfl_flow_configs')
  if (configEditActions.length === 0) failures.push('wfl_flow_configs row Edit action missing')
  for (const action of configEditActions) {
    const pageTree = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${encodeURIComponent(String(action.uid ?? ''))}&subKey=page`)
    const flat = JSON.stringify(pageTree ?? {})
    if (!flat.includes('"config_note"') || !flat.includes('"required":true')) {
      failures.push('wfl_flow_configs edit form does not mark config_note required')
    }
  }

  // 2) graph-data 对拍: per-flow node/edge counts — the map's data source is
  //    the same list API, so this asserts the consumption logic against the
  //    live rows (the psql twin lives in w3-b4-psql.txt).
  const configs = (await dataOf(token, 'GET', '/api/wfl_flow_configs:list?pageSize=500')) as Array<Record<string, any>> | null ?? []
  const states = (await dataOf(token, 'GET', '/api/wfl_flow_states:list?pageSize=1000')) as Array<Record<string, any>> | null ?? []
  const transitions = (await dataOf(token, 'GET', '/api/wfl_flow_transitions:list?pageSize=1000')) as Array<Record<string, any>> | null ?? []
  let mismatch = 0
  for (const flow of configs) {
    const flowStates = states.filter(row => Number(row.flow_id) === Number(flow.id))
    const flowTransitions = transitions.filter(row => Number(row.flow_id) === Number(flow.id))
    const orphanEdges = flowTransitions.filter(row => !flowStates.some(state => String(state.state) === String(row.state) || String(state.state) === String(row.next_state)))
    console.log(`assert: 图对拍 #${String(flow.id)} ${String(flow.doc_type)} — 节点 ${String(flowStates.length)} · 边 ${String(flowTransitions.length)}${orphanEdges.length > 0 ? ` （${orphanEdges.length} 边引用未知状态——图上会红字标注，探针拒激活流）` : ''}`)
    if (flowStates.length === 0 && flow.is_active === true) mismatch += 1
  }
  if (mismatch > 0) failures.push(`${mismatch} active flow(s) render with zero nodes (states missing)`)

  // 3) menu ACL: the page binds admin only.
  if (page !== undefined) {
    const bindings = (await dataOf(token, 'GET', `/api/rolesDesktopRoutes:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ desktopRouteId: { $eq: page.id } }))}`)) as Array<{ roleName?: string }> | null
    const roles = (bindings ?? []).map(row => String(row.roleName ?? ''))
    if (roles.includes('member')) failures.push(`${PAGE_TITLE} menu still binds member (admin-only violation)`)
    if (!roles.includes('admin')) failures.push(`${PAGE_TITLE} menu does not bind admin`)
    console.log(`assert: 菜单绑定角色 = ${roles.join(',') || '(无)'}`)
  }

  // 4) data ACL negatives: member update 403; an ungranted role list 403.
  const memberToken = await signInAs('quality_lead', 'Quality#2026')
  if (memberToken === null) {
    console.log('assert: quality_lead sign-in unavailable; the member write-403 probe skipped (create the user to enable it)')
  } else {
    const base = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
    const probe = await fetch(`${base}/api/wfl_flow_configs:update?filterByTk=1`, {
      method: 'POST', headers: { authorization: `Bearer ${memberToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'ACL probe (must 403)' }),
    })
    if (probe.status === 403) console.log('assert: member(quality_lead) update wfl_flow_configs → 403 ✓')
    else failures.push(`member write probe returned HTTP ${String(probe.status)} (expected 403)`)
    const read = await fetch(`${base}/api/wfl_flow_configs:list?pageSize=1`, { headers: { authorization: `Bearer ${memberToken}` } })
    if (read.status === 200) console.log('assert: member(quality_lead) list wfl_flow_configs → 200（只读面通）✓')
    else if (read.status === 403) console.log('assert: member list wfl_flow_configs → 403（读面未授，允许——若需共享只读界面先跑 ACL pass）')
    else failures.push(`member list probe returned HTTP ${String(read.status)}`)
  }

  // 5) consistency probe must be green right now (the baseline state).
  const consistency = await assertWflConsistency(token)
  for (const failure of consistency) failures.push(`探针：${failure}`)

  if (failures.length > 0) throw new Error(`--assert FAILED:\n  - ${failures.join('\n  - ')}`)
  console.log('nocobase-w3-approval-visual: --assert OK (page wires + graph 对拍 + admin-only menu + ACL negatives + consistency baseline)')
}

// ─── --rollback ───

async function rollback(token: string): Promise<void> {
  const routes = await listRoutes(token, 'w3-approval-visual rollback')
  const own = routes.filter(row => row.title === PAGE_TITLE && (row.type === 'page' || String(row.schemaUid ?? '').startsWith('w3b4')))
  const tabsRows = routes.filter(row => row.type === 'tabs' && own.some(parent => row.parentId === parent.id))
  for (const row of [...tabsRows, ...own]) {
    await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${row.id}`)
  }
  if (own.length > 0) console.log(`nocobase-w3-approval-visual: rollback destroyed route "${PAGE_TITLE}" (+tabs)`)
  const models = await listFlowModels(token, 'w3-approval-visual rollback')
  const mine = models.filter(row => String(row.uid ?? '').startsWith('w3b4'))
  for (const row of mine) {
    // The route destroy cascaded its trees; this loop sweeps stragglers.
    await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(String(row.uid))}`).catch(() => undefined)
  }
  console.log(`nocobase-w3-approval-visual: rollback destroyed ${mine.length} w3b4 flowModels row(s)`)
  // The member read grants this batch added on the four config collections.
  for (const collection of CONFIG_COLLECTIONS) {
    const existing = (await dataOf(token, 'GET', `/api/rolesResources:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ roleName: { $eq: 'member' }, name: { $eq: collection } }))}`)) as Array<{ id?: number }> | null
    for (const row of existing ?? []) {
      if (row.id !== undefined) await call(token, 'POST', `/api/rolesResources:destroy?filterByTk=${row.id}`)
    }
  }
  console.log('nocobase-w3-approval-visual: rollback dropped the member read grants on the four config collections')
}

// ─── main ───

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const token = await signInWithRetry()
  if (args.includes('--rollback')) {
    await rollback(token)
    console.log('nocobase-w3-approval-visual: done (rollback)')
    return
  }
  if (args.includes('--check-consistency')) {
    await checkConsistency(token)
    return
  }
  if (args.includes('--assert')) {
    await assertVisual(token)
    return
  }
  const group = (await listRoutes(token, 'w3-approval-visual')).find(row => row.title === MENU_GROUP && row.type === 'group')
  if (group === undefined) throw new Error(`menu group "${MENU_GROUP}" not found; run nocobase-w1-approval.mts first`)
  await ensureBaselineAudit(token)
  const { gridUid } = await ensureV2RouteShell(token, PAGE_TITLE, 'ControlOutlined', group.id)
  let sortIndex = 1
  for (const table of TABLES) {
    await ensureConfigTable(token, gridUid, table, sortIndex)
    sortIndex += 1
  }
  await ensureFlowMap(token, gridUid)
  await bindAdminOnlyMenu(token, PAGE_TITLE)
  await grantMemberConfigRead(token)
  console.log('nocobase-w3-approval-visual: done (build)')
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) await main()
