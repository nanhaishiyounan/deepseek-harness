/**
 * W6-B2: the platform rule engine + the alert center (plans/plan-w6.zh.md §B2).
 *
 * One engine, four first rules, every threshold configured (nothing hardcoded
 * — AGENTS tunables discipline): the alert_rules collection carries each
 * rule's thresholds/routing/actions, the scanner is pure SQL over the four
 * business tables (wms_lots four dates × the regulatory tiers, srm_certificates,
 * so_orders AR aging, qm_nc_dispositions open rows), and every hit lands in
 * wfl_alerts exactly once (dedup_key UNIQUE + ON CONFLICT — the idempotency
 * contract: two consecutive scans never grow the count).
 *
 * The scanner runs from three entry points that share this module verbatim:
 * the engine's hourly serve loop + nightly leg (approval-engine.mts imports
 * scanAlerts), POST /scan-alerts (the manual one-shot), and this CLI. A rule
 * that throws fails alone: the failure lands one wfl_alert_scan_failures audit
 * row and the pass continues with the remaining rules (a whole-pass abort over
 * one bad threshold would blind the other three domains). The notify leg
 * writes notificationInAppMessages rows through the seeded 'alert-center'
 * channel (unread counts need the channel registered — the in-app-message
 * plugin counts only channelName ∈ notificationChannels). A row notifies once
 * per severity level; a notify whose routed username has no users row is NOT
 * stamped (an audit row + warn log records the miss, the next pass retries).
 * A resolved row that re-hits reopens (reopen_count = COALESCE(reopen_count,0)
 * + 1) and notifies again.
 *
 * Handling actions all funnel through {@link actOnAlert} with its explicit
 * (from_state, action, actor_role) transition table: mobile rides the
 * gateway's nocobase.alertAct → POST /alerts/act, the PC alert list carries a
 * wfl_alert_acts intent form whose collection workflow calls the same route
 * (the W1 intent-row pattern), and the CLI --act stays the third entry.
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/w6b2-rules.mts --seed      # collections + channel + four rules + pages + act-intent form/workflow
 *   node --import tsx/esm examples/kb-agent/scripts/w6b2-rules.mts --scan     # one scanner pass (creates/updates/resolves/notifies; per-rule isolation)
 *   node --import tsx/esm examples/kb-agent/scripts/w6b2-rules.mts --act <id> claim|resolve|ack <user> [note]
 *   node --import tsx/esm examples/kb-agent/scripts/w6b2-rules.mts --seed-ar  # one overdue approved SO (marked seed, for the AR rule)
 *   node --import tsx/esm examples/kb-agent/scripts/w6b2-rules.mts --assert   # the acceptance matrix (runs a scan first)
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  call, dataOf, ensureFilterForm, ensureTableRowDetail, listFlowModels, listRoutes, metricChart,
  signInWithRetry, withN17Prefix,
} from './nocobase-flow-page-lib.mts'

const args = process.argv.slice(2)
const mode = args.includes('--seed') ? 'seed'
  : args.includes('--scan') ? 'scan'
    : args.includes('--act') ? 'act'
      : args.includes('--seed-ar') ? 'seed-ar'
        : 'assert'
const failures: string[] = []
const log = (line: string): void => { console.log(line) }
const check = (that: string, ok: boolean, detail = ''): void => {
  log(`  ${ok ? '✓' : '✗'} ${that}${detail === '' ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(that)
}
const here = (script: string): string => fileURLToPath(new URL(script, import.meta.url))

// ─── the psql runner (same credentials path as every w6 script; the PG server
// zone is Asia/Shanghai so CURRENT_DATE inside SQL is the business day — the
// reconciliation SQL below shares it verbatim, one 口径 everywhere) ───

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

/** SQL string literal with single-quote doubling (values reaching SQL text). */
const sqlLit = (value: string): string => `'${value.replaceAll("'", "''")}'`

/** A finite non-negative integer rendered into SQL (thresholds, ids). */
const intLit = (value: unknown, name: string): string => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100_000) {
    throw new Error(`规则参数 ${name} 需为 0~100000 整数（收到 ${String(value)}）`)
  }
  return String(parsed)
}

// ─── the two collections ───

/** alert_rules: the configuration center (title/params/routing per rule_type). */
const ALERT_RULES_FIELDS: ReadonlyArray<Record<string, unknown>> = [
  { name: 'rule_type', type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title: '规则类型', enum: [
    { value: 'expiry', label: '效期预警', color: 'red' },
    { value: 'cert_due', label: '资质预警', color: 'orange' },
    { value: 'ar_overdue', label: '账期预警', color: 'gold' },
    { value: 'quality_abnormal', label: '质量预警', color: 'orange' },
    { value: 'ccp_deviation', label: 'CCP越限', color: 'red' },
    { value: 'inspection_fail', label: '检验拒收', color: 'volcano' },
    { value: 'calibration_due', label: '计量到期', color: 'cyan' },
    { value: 'maint_overdue', label: '维保逾期', color: 'geekblue' },
  ] } },
  { name: 'title', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '规则名称' } },
  { name: 'entity', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '实体集合' } },
  { name: 'params', type: 'json', interface: 'json', uiSchema: { type: 'object', 'x-component': 'Input.JSON', title: '阈值参数' } },
  { name: 'schedule', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '扫描频次' } },
  { name: 'actions', type: 'json', interface: 'json', uiSchema: { type: 'object', 'x-component': 'Input.JSON', title: '触达动作' } },
  { name: 'route_to', type: 'json', interface: 'json', uiSchema: { type: 'object', 'x-component': 'Input.JSON', title: '责任人路由' } },
  { name: 'enabled', type: 'boolean', interface: 'boolean', uiSchema: { type: 'boolean', 'x-component': 'Checkbox', title: '启用' } },
  { name: 'note', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: '备注' } },
]

/** wfl_alerts: the engine-produced alert ledger (the wfl_ prefix rides the mobile-gateway shared surface). */
const WFL_ALERTS_FIELDS: ReadonlyArray<Record<string, unknown>> = [
  { name: 'rule_id', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '规则行' } },
  { name: 'entity_id', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '对象行' } },
  { name: 'dedup_key', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '去重键' } },
  { name: 'rule_type', type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title: '规则类型', enum: [
    { value: 'expiry', label: '效期预警', color: 'red' },
    { value: 'cert_due', label: '资质预警', color: 'orange' },
    { value: 'ar_overdue', label: '账期预警', color: 'gold' },
    { value: 'quality_abnormal', label: '质量预警', color: 'orange' },
    { value: 'ccp_deviation', label: 'CCP越限', color: 'red' },
    { value: 'inspection_fail', label: '检验拒收', color: 'volcano' },
    { value: 'calibration_due', label: '计量到期', color: 'cyan' },
    { value: 'maint_overdue', label: '维保逾期', color: 'geekblue' },
  ] } },
  { name: 'severity', type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title: '级别', enum: [
    { value: 'critical', label: '紧急', color: 'red' },
    { value: 'warning', label: '关注', color: 'gold' },
  ] } },
  { name: 'entity', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '实体集合' } },
  { name: 'entity_code', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '对象编号' } },
  { name: 'title', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '预警内容' } },
  { name: 'detail', type: 'json', interface: 'json', uiSchema: { type: 'object', 'x-component': 'Input.JSON', title: '快照明细' } },
  { name: 'status', type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title: '处理状态', enum: [
    { value: 'open', label: '待处理', color: 'blue' },
    { value: 'acknowledged', label: '已认领', color: 'orange' },
    { value: 'resolved', label: '已关闭', color: 'green' },
  ] } },
  { name: 'owner', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '认领责任人' } },
  { name: 'notify_users', type: 'json', interface: 'json', uiSchema: { type: 'object', 'x-component': 'Input.JSON', title: '路由责任人' } },
  { name: 'reopen_count', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '重开次数' } },
  { name: 'first_seen_at', type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '首次发现', 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } },
  { name: 'last_seen_at', type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '最近确认', 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } },
  { name: 'notified_severity', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '已通知级别' } },
  { name: 'resolved_by', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '关闭人' } },
  { name: 'resolved_at', type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '关闭日期', 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } },
  { name: 'resolve_note', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: '关闭说明' } },
]

/** The in-app channel the notify leg writes through (unread counts filter on channelName ∈ notificationChannels). */
const ALERT_CHANNEL = 'alert-center'

/** wfl_alert_acts: the PC intent rows the alert list's Add-new form writes; the collection workflow forwards each row to POST /alerts/act, and the engine consumes it on success (the W1 intent-row pattern). */
const ALERT_ACTS_FIELDS: ReadonlyArray<Record<string, unknown>> = [
  { name: 'alert_id', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '预警行 id' } },
  { name: 'action', type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title: '动作', enum: [
    { value: 'claim', label: '认领', color: 'blue' },
    { value: 'ack', label: '确认', color: 'orange' },
    { value: 'resolve', label: '关闭', color: 'green' },
  ] } },
  { name: 'user', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '操作人（路由责任人用户名）' } },
  { name: 'note', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: '关闭说明' } },
]

/**
 * Create the collections + the dedup unique index idempotently (existing
 * collections are kept as-is; the index rides psql because the REST channel
 * cannot declare uniqueness). The engine-internal runtime tables — the scan
 * failure audit and the alert_rules change audit — ride plain DDL: they are
 * engine-owned ledgers, not NocoBase-facing pages.
 * @param token - the root API token.
 */
export async function ensureAlertCollections(token: string): Promise<void> {
  for (const spec of [
    { name: 'alert_rules', title: '预警规则', titleField: 'title', fields: ALERT_RULES_FIELDS },
    { name: 'wfl_alerts', title: '预警记录', titleField: 'entity_code', fields: WFL_ALERTS_FIELDS },
    { name: 'wfl_alert_acts', title: '预警处理意图', titleField: 'note', fields: ALERT_ACTS_FIELDS },
  ]) {
    const present = await dataOf(token, 'GET', `/api/collections/${spec.name}`)
      .then(row => (row as { name?: string } | null)?.name === spec.name)
      .catch(() => false)
    if (!present) {
      await dataOf(token, 'POST', '/api/collections:create', { name: spec.name, title: spec.title, titleField: spec.titleField, fields: spec.fields })
      log(`w6b2-rules: collection ${spec.name} created`)
      continue
    }
    // Additive columns (a collection created by an older seed pass keeps its
    // rows; a missing declared field joins through fields:create).
    const names = new Set(((await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: spec.name } }))}&pageSize=200`) as Array<{ name?: string }> | null) ?? []).map(field => field.name))
    for (const field of spec.fields) {
      if (names.has(String(field['name']))) continue
      await dataOf(token, 'POST', '/api/fields:create', { collectionName: spec.name, ...field })
      log(`w6b2-rules: ${spec.name}.${String(field['name'])} added`)
    }
  }
  psql('CREATE UNIQUE INDEX IF NOT EXISTS ux_wfl_alerts_dedup ON wfl_alerts (dedup_key);')
  psql('CREATE UNIQUE INDEX IF NOT EXISTS ux_alert_rules_type ON alert_rules (rule_type);')
  psql(`INSERT INTO "notificationChannels" ("createdAt", "updatedAt", name, title, "notificationType", description)
SELECT now(), now(), ${sqlLit(ALERT_CHANNEL)}, '预警中心', 'in-app-message', 'W6-B2 规则引擎预警通知渠道'
WHERE NOT EXISTS (SELECT 1 FROM "notificationChannels" WHERE name = ${sqlLit(ALERT_CHANNEL)});`)
  ensureRuntimeTables()
}

/**
 * The engine-owned runtime tables (idempotent DDL, one pass per process):
 * wfl_alert_scan_failures keeps one audit row per rule failure (scan stage or
 * notify stage) so a failing rule never disappears silently, and
 * wfl_alert_config_audit receives every alert_rules INSERT/UPDATE/DELETE
 * through a row-level trigger — the threshold/config change trail.
 */
function ensureRuntimeTables(): void {
  psql(`CREATE TABLE IF NOT EXISTS wfl_alert_scan_failures (
  id bigserial PRIMARY KEY,
  logged_at timestamptz NOT NULL DEFAULT now(),
  rule_id integer,
  rule_type text,
  stage text NOT NULL,
  error text NOT NULL
);`)
  psql(`CREATE TABLE IF NOT EXISTS wfl_alert_config_audit (
  id bigserial PRIMARY KEY,
  logged_at timestamptz NOT NULL DEFAULT now(),
  tg_op text NOT NULL,
  rule_id integer,
  row_old jsonb,
  row_new jsonb
);`)
  psql(`CREATE OR REPLACE FUNCTION wfl_alert_rules_audit_fn() RETURNS trigger AS $fn$
BEGIN
  INSERT INTO wfl_alert_config_audit (tg_op, rule_id, row_old, row_new)
  VALUES (TG_OP, COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END;
$fn$ LANGUAGE plpgsql;`)
  psql(`DROP TRIGGER IF EXISTS trg_alert_rules_audit ON alert_rules;`)
  psql(`CREATE TRIGGER trg_alert_rules_audit AFTER INSERT OR UPDATE OR DELETE ON alert_rules
FOR EACH ROW EXECUTE FUNCTION wfl_alert_rules_audit_fn();`)
}

/** Write one scan-failure audit row (the per-rule isolation leg and the notify-miss leg share it). */
function recordScanFailure(ruleId: number | null, ruleType: string | null, stage: 'scan' | 'notify', error: string): void {
  ensureRuntimeTables()
  psql(`INSERT INTO wfl_alert_scan_failures (rule_id, rule_type, stage, error)
VALUES (${ruleId === null ? 'NULL' : String(ruleId)}, ${ruleType === null ? 'NULL' : sqlLit(ruleType)}, ${sqlLit(stage)}, ${sqlLit(error)});`)
}

// ─── the four first rules (params/routing are the seeded defaults; edits go to alert_rules rows) ───

/** One seeded rule's full configuration. */
interface SeedRule {
  readonly rule_type: string
  readonly title: string
  readonly entity: string
  readonly params: Record<string, unknown>
  readonly actions: readonly string[]
  readonly route_to: { users?: readonly string[]; departments?: readonly string[] }
}

const SEED_RULES: ReadonlyArray<SeedRule> = [
  {
    rule_type: 'expiry', title: '库存效期预警（四日期×监管分档双轨）', entity: 'wms_lots',
    params: { warn_days: 30, critical_days: 7, regulatory: true },
    actions: ['notify_inapp'], route_to: { departments: ['仓储部'] },
  },
  {
    rule_type: 'cert_due', title: '供应商资质效期预警', entity: 'srm_certificates',
    params: { warn_days: 30, critical_days: 7 },
    actions: ['notify_inapp'], route_to: { departments: ['采购部'] },
  },
  {
    rule_type: 'ar_overdue', title: '应收账期预警（到期前提醒+逾期）', entity: 'so_orders',
    params: { warn_days: 7 },
    actions: ['notify_inapp'], route_to: { users: ['finance', 'sales_rep'] },
  },
  {
    rule_type: 'quality_abnormal', title: '不合格处置未闭环预警', entity: 'qm_nc_dispositions',
    params: {}, actions: ['notify_inapp'], route_to: { departments: ['质检部'] },
  },
]

/** One enabled alert_rules row as the scanner consumes it. */
interface ActiveRule {
  readonly id: number
  readonly rule_type: string
  readonly params: Record<string, unknown>
  readonly route_to: { users?: readonly string[]; departments?: readonly string[] }
}

/**
 * Seed the four rules idempotently: one row per rule_type, updated to the
 * seeded shape on every pass (threshold edits made through the page are
 * overwritten by --seed — the page is the live config, --seed the baseline).
 * @param token - the root API token.
 */
export async function seedRules(token: string): Promise<void> {
  await ensureAlertCollections(token)
  for (const rule of SEED_RULES) {
    psql(`INSERT INTO alert_rules (rule_type, title, entity, params, schedule, actions, route_to, enabled, note)
VALUES (${sqlLit(rule.rule_type)}, ${sqlLit(rule.title)}, ${sqlLit(rule.entity)}, ${sqlLit(JSON.stringify(rule.params))}::json, 'hourly', ${sqlLit(JSON.stringify(rule.actions))}::json, ${sqlLit(JSON.stringify(rule.route_to))}::json, TRUE, 'W6-B2 seed')
ON CONFLICT (rule_type) DO UPDATE SET title = EXCLUDED.title, entity = EXCLUDED.entity, params = EXCLUDED.params, schedule = EXCLUDED.schedule, actions = EXCLUDED.actions, route_to = EXCLUDED.route_to;`)
  }
  const ruleCount = psql('SELECT count(*) FROM alert_rules;').trim()
  log(`w6b2-rules: four rules seeded (alert_rules rows=${ruleCount})`)
}

/**
 * Expand one rule's routing to concrete usernames: named users directly,
 * departments through departmentsUsers (every member — the mobile visibility
 * leg filters per user). An empty resolution fails loud (a rule nobody
 * receives is a misconfiguration, not a quiet success).
 * @param rule - the rule whose route_to expands.
 * @returns the deduplicated username list.
 */
function resolveRouteUsers(rule: ActiveRule): string[] {
  const users = new Set<string>()
  for (const name of rule.route_to.users ?? []) users.add(name)
  for (const department of rule.route_to.departments ?? []) {
    const members = psql(`SELECT u.username FROM "departmentsUsers" du JOIN users u ON u.id = du."userId" JOIN departments d ON d.id = du."departmentId" WHERE d.title = ${sqlLit(department)};`)
      .split('\n').map(line => line.trim()).filter(line => line !== '')
    if (members.length === 0) throw new Error(`规则 ${rule.rule_type} 路由部门「${department}」无成员——先补部门成员再扫描`)
    for (const member of members) users.add(member)
  }
  if (users.size === 0) throw new Error(`规则 ${rule.rule_type} 路由解析为空（route_to=${JSON.stringify(rule.route_to)}）`)
  return [...users]
}

/**
 * The hits SELECT for one rule: every business row currently violating it,
 * with the severity tier, the human title, and the detail snapshot. The
 * INSERT-upsert and the auto-resolve NOT EXISTS share this verbatim, so what
 * lands and what clears can never disagree. All date math stays inside SQL on
 * CURRENT_DATE (PG zone Asia/Shanghai — the reconciliation twin reads the
 * same anchor).
 * @param rule - the enabled rule.
 * @param usersJson - the JSON array literal of routed usernames.
 * @returns the SELECT statement body (one row per hit, dedup_key included).
 */
function hitsSelect(rule: ActiveRule, usersJson: string): string {
  const users = `${usersJson}::jsonb`
  if (rule.rule_type === 'expiry') {
    const warn = intLit(rule.params['warn_days'], 'expiry.warn_days')
    const critical = intLit(rule.params['critical_days'], 'expiry.critical_days')
    const regulatory = rule.params['regulatory'] === false ? '999999' : `CASE
        WHEN l.production_date IS NULL OR l.expiry_date - l.production_date >= 365 THEN 45
        WHEN l.expiry_date - l.production_date >= 180 THEN 20
        WHEN l.expiry_date - l.production_date >= 90 THEN 15
        WHEN l.expiry_date - l.production_date >= 30 THEN 10
        ELSE 3 END`
    return `SELECT 'expiry' AS rule_type, ${String(rule.id)} AS rule_id,
  CASE WHEN l.expiry_date < CURRENT_DATE OR l.expiry_date - CURRENT_DATE <= ${critical} THEN 'critical' ELSE 'warning' END AS severity,
  'wms_lots' AS entity, l.id AS entity_id, l.lot_no AS entity_code,
  CASE WHEN l.expiry_date < CURRENT_DATE THEN '批次 ' || l.lot_no || ' 已过期 ' || (CURRENT_DATE - l.expiry_date) || ' 天'
       WHEN l.expiry_date = CURRENT_DATE THEN '批次 ' || l.lot_no || ' 今日到期'
       ELSE '批次 ' || l.lot_no || ' ' || (l.expiry_date - CURRENT_DATE) || ' 天后到期' END AS title,
  jsonb_build_object('days_left', l.expiry_date - CURRENT_DATE, 'expiry_date', l.expiry_date, 'production_date', l.production_date, 'removal_date', l.removal_date, 'alert_date', l.alert_date, 'lot_status', l.status, 'product_id', l.product_id) AS detail,
  'expiry:wms_lots:' || l.id AS dedup_key, ${users} AS notify_users
FROM wms_lots l
WHERE l.expiry_date IS NOT NULL
  AND (l.expiry_date <= CURRENT_DATE + LEAST(${warn}, ${regulatory})
    OR (l.alert_date IS NOT NULL AND l.alert_date <= CURRENT_DATE AND l.expiry_date >= CURRENT_DATE))`
  }
  if (rule.rule_type === 'cert_due') {
    const warn = intLit(rule.params['warn_days'], 'cert_due.warn_days')
    const critical = intLit(rule.params['critical_days'], 'cert_due.critical_days')
    return `SELECT 'cert_due' AS rule_type, ${String(rule.id)} AS rule_id,
  CASE WHEN c.expires_at < CURRENT_DATE OR c.expires_at - CURRENT_DATE <= ${critical} THEN 'critical' ELSE 'warning' END AS severity,
  'srm_certificates' AS entity, c.id AS entity_id, c.cert_no AS entity_code,
  CASE WHEN c.expires_at < CURRENT_DATE THEN '证照 ' || c.cert_no || '（' || COALESCE(c.cert_type, '?') || '）已过期 ' || (CURRENT_DATE - c.expires_at) || ' 天'
       ELSE '证照 ' || c.cert_no || '（' || COALESCE(c.cert_type, '?') || '）' || (c.expires_at - CURRENT_DATE) || ' 天后到期' END AS title,
  jsonb_build_object('days_left', c.expires_at - CURRENT_DATE, 'expires_at', c.expires_at, 'cert_type', c.cert_type, 'supplier_id', c.supplier_id, 'issuer', c.issuer) AS detail,
  'cert_due:srm_certificates:' || c.id AS dedup_key, ${users} AS notify_users
FROM srm_certificates c
WHERE c.expires_at IS NOT NULL AND c.expires_at <= CURRENT_DATE + ${warn}`
  }
  if (rule.rule_type === 'ar_overdue') {
    const warn = intLit(rule.params['warn_days'], 'ar_overdue.warn_days')
    return `WITH bal AS (
  SELECT o.id, o.code, o.need_date, o.amount, o.customer_id,
    o.amount - COALESCE((SELECT SUM(p.amount) FROM crm_payments p WHERE p.so_order_id = o.id AND p.status = 'received'), 0) AS balance
  FROM so_orders o WHERE o.doc_status = 'approved' AND o.need_date IS NOT NULL)
SELECT 'ar_overdue' AS rule_type, ${String(rule.id)} AS rule_id,
  CASE WHEN bal.need_date < CURRENT_DATE THEN 'critical' ELSE 'warning' END AS severity,
  'so_orders' AS entity, bal.id AS entity_id, bal.code AS entity_code,
  CASE WHEN bal.need_date < CURRENT_DATE THEN '订单 ' || bal.code || ' 逾期 ' || (CURRENT_DATE - bal.need_date) || ' 天，余额 ¥' || round(bal.balance::numeric, 2)
       ELSE '订单 ' || bal.code || ' ' || (bal.need_date - CURRENT_DATE) || ' 天后到期，余额 ¥' || round(bal.balance::numeric, 2) END AS title,
  jsonb_build_object('days_left', bal.need_date - CURRENT_DATE, 'days_overdue', CURRENT_DATE - bal.need_date, 'need_date', bal.need_date, 'amount', bal.amount, 'received', round((bal.amount - bal.balance)::numeric, 2), 'balance', round(bal.balance::numeric, 2), 'customer_id', bal.customer_id) AS detail,
  'ar_overdue:so_orders:' || bal.id AS dedup_key, ${users} AS notify_users
FROM bal WHERE bal.balance > 0.005 AND bal.need_date <= CURRENT_DATE + ${warn}`
  }
  if (rule.rule_type === 'quality_abnormal') {
    return `SELECT 'quality_abnormal' AS rule_type, ${String(rule.id)} AS rule_id,
  CASE WHEN COALESCE(i.defect_critical, 0) > 0 THEN 'critical' ELSE 'warning' END AS severity,
  'qm_nc_dispositions' AS entity, d.id AS entity_id, d.code AS entity_code,
  '不合格处置 ' || d.code || ' 待处置（' || COALESCE(NULLIF(d.action, ''), '未定') || '）' AS title,
  jsonb_build_object('action', d.action, 'reason', d.reason, 'ref_no', d.ref_no, 'inspection_id', d.inspection_id, 'defect_critical', i.defect_critical, 'insp_result', i.result, 'inspected_at', i.inspected_at) AS detail,
  'quality_abnormal:qm_nc_dispositions:' || d.id AS dedup_key, ${users} AS notify_users
FROM qm_nc_dispositions d LEFT JOIN qm_inspections i ON i.id = d.inspection_id
WHERE d.status = 'open'`
  }
  // W6-B4: a CCP reading outside its CL is an always-critical alert. The hit
  // honors a quality-side resolution: a deviation whose alert row is already
  // resolved leaves the hit, so the scanner neither reopens it nor rewrites
  // the closer's note (the reopen arm only fires on rows still in the hit).
  // W6-B5: a rejected (failed) inspection verdict is an always-critical
  // quality alert — the rejection and any later concession (特采, the
  // disposal route that re-labels the result) both surface under this rule;
  // the row dedups per inspection and resolves only through the alert
  // center, mirroring the quality_abnormal posture.
  if (rule.rule_type === 'inspection_fail') {
    return `SELECT 'inspection_fail' AS rule_type, ${String(rule.id)} AS rule_id,
  'critical' AS severity, 'qm_inspections' AS entity, i.id AS entity_id, i.code AS entity_code,
  '检验拒收：' || i.code || '（' || COALESCE(i.insp_type,'') || ' ' || COALESCE(i.lot_no,'') || '）d=' || (COALESCE(i.defect_major,0) + COALESCE(i.defect_minor,0)) || ' Ac/Re=' || COALESCE(i.aql_ac,0) || '/' || COALESCE(i.aql_re,0) AS title,
  jsonb_build_object('code', i.code, 'insp_type', i.insp_type, 'lot_no', i.lot_no, 'result', i.result, 'defect_critical', i.defect_critical, 'defect_major', i.defect_major, 'defect_minor', i.defect_minor, 'aql', i.aql_target, 'rigor', i.rigor, 'n', i.aql_n, 'ac', i.aql_ac, 're', i.aql_re, 'inspector', i.inspector, 'inspected_at', i.inspected_at, 'note', i.note) AS detail,
  'inspection_fail:qm_inspections:' || i.id AS dedup_key, ${users} AS notify_users
FROM qm_inspections i
WHERE i.result IN ('failed', 'concession')
  AND NOT EXISTS (SELECT 1 FROM wfl_alerts a WHERE a.dedup_key = 'inspection_fail:qm_inspections:' || i.id AND a.status = 'resolved')`
  }
  if (rule.rule_type === 'ccp_deviation') {
    return `SELECT 'ccp_deviation' AS rule_type, ${String(rule.id)} AS rule_id,
  'critical' AS severity, 'mfg_ccp_records' AS entity, r.id AS entity_id,
  r.mo_code || '#工序' || r.op_seq || '#' || r.point_code AS entity_code,
  'CCP越限：' || r.name || ' 实测 ' || r.measured || ' ' || COALESCE(r.unit, '') || ' 超出 CL [' || COALESCE(r.cl_min::text, '−∞') || ', ' || COALESCE(r.cl_max::text, '+∞') || ']（' || r.mo_code || ' 工序' || r.op_seq || '）' AS title,
  jsonb_build_object('mo_code', r.mo_code, 'op_seq', r.op_seq, 'lot_no', r.lot_no, 'point_code', r.point_code, 'measured', r.measured, 'cl_min', r.cl_min, 'cl_max', r.cl_max, 'unit', r.unit, 'operator', r.operator, 'action_taken', r.action_taken, 'recorded_at', r.recorded_at) AS detail,
  'ccp_deviation:mfg_ccp_records:' || r.id AS dedup_key, ${users} AS notify_users
FROM mfg_ccp_records r
WHERE r.deviation = TRUE
  AND NOT EXISTS (SELECT 1 FROM wfl_alerts a WHERE a.dedup_key = 'ccp_deviation:mfg_ccp_records:' || r.id AND a.status = 'resolved')`
  }
  // W6-B8: a calibration instrument past (or near) its mandatory re-verification
  // date is the food-plant strong-inspection hit (GB 14881 计量器具) — overdue
  // or inside critical_days is critical, inside warn_days is warning. A passed
  // re-calibration writes a fresh next_due_date and the row leaves the scope
  // (auto-resolve).
  if (rule.rule_type === 'calibration_due') {
    const warn = intLit(rule.params['warn_days'], 'calibration_due.warn_days')
    const critical = intLit(rule.params['critical_days'], 'calibration_due.critical_days')
    return `SELECT 'calibration_due' AS rule_type, ${String(rule.id)} AS rule_id,
  CASE WHEN c.next_due_date < CURRENT_DATE OR c.next_due_date - CURRENT_DATE <= ${critical} THEN 'critical' ELSE 'warning' END AS severity,
  'eam_calibrations' AS entity, c.id AS entity_id, c.code AS entity_code,
  CASE WHEN c.next_due_date < CURRENT_DATE THEN '计量器具 ' || c.instrument || '（' || c.code || '）校准已过期 ' || (CURRENT_DATE - c.next_due_date) || ' 天——强检器具停用送检'
       ELSE '计量器具 ' || c.instrument || '（' || c.code || '）' || (c.next_due_date - CURRENT_DATE) || ' 天后到校准期（' || c.next_due_date || '）' END AS title,
  jsonb_build_object('days_left', c.next_due_date - CURRENT_DATE, 'next_due_date', c.next_due_date, 'calibrated_at', c.calibrated_at, 'period_days', c.period_days, 'instrument', c.instrument, 'asset_code', c.asset_code, 'ccp_code', c.ccp_code, 'agency', c.agency, 'result', c.result) AS detail,
  'calibration_due:eam_calibrations:' || c.id AS dedup_key, ${users} AS notify_users
FROM eam_calibrations c
WHERE c.next_due_date IS NOT NULL AND c.next_due_date <= CURRENT_DATE + ${warn}
  AND NOT EXISTS (SELECT 1 FROM wfl_alerts a WHERE a.dedup_key = 'calibration_due:eam_calibrations:' || c.id AND a.status = 'resolved')`
  }
  // W6-B8: a maintenance order whose planned date has passed while the work
  // is still open (new/accepted) — the overdue ladder rides the rule params
  // (critical beyond overdue_days, warning before). done/closed orders leave
  // the scope, so completing the work clears the alert.
  if (rule.rule_type === 'maint_overdue') {
    const critical = intLit(rule.params['overdue_days'], 'maint_overdue.overdue_days')
    return `SELECT 'maint_overdue' AS rule_type, ${String(rule.id)} AS rule_id,
  CASE WHEN CURRENT_DATE - o.planned_date > ${critical} THEN 'critical' ELSE 'warning' END AS severity,
  'eam_maint_orders' AS entity, o.id AS entity_id, o.code AS entity_code,
  '维保工单 ' || o.code || '（' || COALESCE(o.asset_code, o.workcenter_name, '?') || '）已逾期 ' || (CURRENT_DATE - o.planned_date) || ' 天未完成（状态 ' || o.status || '）' AS title,
  jsonb_build_object('days_overdue', CURRENT_DATE - o.planned_date, 'planned_date', o.planned_date, 'status', o.status, 'source', o.source, 'priority', o.priority, 'problem', o.problem, 'requested_by', o.requested_by, 'asset_code', o.asset_code) AS detail,
  'maint_overdue:eam_maint_orders:' || o.id AS dedup_key, ${users} AS notify_users
FROM eam_maint_orders o
WHERE o.planned_date IS NOT NULL AND o.planned_date < CURRENT_DATE
  AND o.status IN ('new', 'accepted')`
  }
  throw new Error(`未知规则类型 ${rule.rule_type}（首批四路之外的 rule_type 需先扩展 hitsSelect）`)
}

/** One rule's scan outcome line (the serve loop's nightly summary reads it). */
export interface RuleScanOutcome { readonly rule: string; readonly created: number; readonly updated: number; readonly resolved: number; readonly notified: number }

/** One rule that threw mid-pass (isolation: the remaining rules still ran; the audit row carries the message). */
export interface RuleScanFailure { readonly rule: string; readonly error: string }

/** One full scanner pass's outcome. */
export interface ScanOutcome { readonly rules: ReadonlyArray<RuleScanOutcome>; readonly notified: number; readonly failures: ReadonlyArray<RuleScanFailure> }

/**
 * The pass-level scan pointers the engine's /healthz reports (stall
 * discoverability): the ISO instant of the last completed pass and how many
 * rules it lost. Module-level by design — every entry point in this process
 * (hourly loop, POST /scan-alerts, nightly leg) funnels through scanAlerts,
 * so one slot tracks them all; restarts reset it to null/0 until the first
 * pass lands.
 */
export const scanState: { lastScanAt: string | null; lastScanFailures: number } = { lastScanAt: null, lastScanFailures: 0 }

/**
 * Read the enabled rules (params/routing live in alert_rules rows — the
 * configuration surface, never code constants).
 * @returns the enabled rules, or an empty list before --seed ever ran.
 */
function activeRules(): ActiveRule[] {
  const rows = psql("SELECT id || '|' || rule_type || '|' || COALESCE(params::text, '{}') || '|' || COALESCE(route_to::text, '{}') FROM alert_rules WHERE enabled = TRUE ORDER BY id;")
    .split('\n').map(line => line.trim()).filter(line => line !== '')
  return rows.map(line => {
    const [idPart, type, paramsRaw, routeRaw] = line.split('|')
    return {
      id: Number(idPart), rule_type: type,
      params: JSON.parse(paramsRaw) as Record<string, unknown>,
      route_to: JSON.parse(routeRaw) as { users?: readonly string[]; departments?: readonly string[] },
    }
  })
}

/**
 * The notify leg: every open alert whose severity moved (or that just
 * reopened) lands one notificationInAppMessages row per routed user through
 * the seeded channel, then the notified level is stamped — one notification
 * per severity per row, so consecutive scans never re-spam. A routed username
 * that matches no users row never silently stamps: the miss lands one
 * wfl_alert_scan_failures audit row plus a warn line, the stamp stays off so
 * the next pass retries, and the pass continues (the other rows still notify).
 * @param ruleTypes - the rules this pass ran (rows of disabled rules are left alone).
 * @returns the notification stamps written.
 */
function notifyPending(ruleTypes: readonly string[]): number {
  if (ruleTypes.length === 0) return 0
  const pending = psql(`SELECT id || '|' || severity FROM wfl_alerts WHERE status = 'open' AND rule_type IN (${ruleTypes.map(type => sqlLit(type)).join(', ')}) AND notified_severity IS DISTINCT FROM severity;`)
    .split('\n').map(line => line.trim()).filter(line => line !== '')
  let written = 0
  for (const row of pending) {
    const [idPart, severity] = row.split('|')
    const id = Number(idPart)
    const meta = psql(`SELECT title || '|' || COALESCE(notify_users::text, '[]') || '|' || rule_type FROM wfl_alerts WHERE id = ${String(id)};`).trim()
    const [title, usersRaw, ruleType] = meta.split('|')
    const usernames = JSON.parse(usersRaw ?? '[]') as string[]
    const users = usernames.map(user => sqlLit(user)).join(', ')
    if (users === '') throw new Error(`预警 #${String(id)} 无路由责任人——通知无法送达（检查规则 route_to）`)
    const expected = Number(psql(`SELECT count(*) FROM users WHERE username IN (${users});`).trim())
    const inserted = Number(psql(`WITH ins AS (INSERT INTO "notificationInAppMessages" (id, "createdAt", "updatedAt", "userId", "channelName", title, content, status, "receiveTimestamp")
SELECT gen_random_uuid(), now(), now(), u.id, ${sqlLit(ALERT_CHANNEL)}, ${sqlLit(title)}, ${sqlLit(`【${severity === 'critical' ? '紧急' : '关注'}】${title}——请到预警中心认领处理`)}, 'unread', (EXTRACT(EPOCH FROM now()) * 1000)::bigint
FROM users u WHERE u.username IN (${users}) RETURNING 1) SELECT count(*) FROM ins;`).trim())
    if (inserted < expected) {
      const missing = psql(`SELECT string_agg(name, ',') FROM unnest(ARRAY[${users}]::text[]) AS name WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.username = name);`).trim()
      const detail = `预警 #${String(id)} 通知未全量送达：预期 ${String(expected)} 行实达 ${String(inserted)} 行，路由中无此用户：${missing}`
      console.error(`w6b2-rules: ${detail}（不落 notified_severity，下一轮重试）`)
      recordScanFailure(null, ruleType ?? null, 'notify', detail)
      continue
    }
    const stamped = psql(`UPDATE wfl_alerts SET notified_severity = ${sqlLit(severity)} WHERE id = ${String(id)} AND notified_severity IS DISTINCT FROM ${sqlLit(severity)};`).trim()
    written += Number((stamped.match(/^UPDATE (\d+)$/u) ?? [])[1] ?? 0)
  }
  return written
}

/**
 * Run one full scanner pass: per enabled rule, upsert the hits into
 * wfl_alerts (dedup_key ON CONFLICT — the same object stays one row; severity
 * upgrades rewrite the row; a resolved row that re-hits reopens with
 * reopen_count = COALESCE(reopen_count, 0) + 1), auto-resolve rows whose
 * object left the rule's scope, then notify. Idempotent end to end: a second
 * pass creates and resolves nothing and writes zero notifications. One rule
 * throwing fails alone — the failure lands one audit row and the pass runs
 * the remaining rules (isolation: a bad threshold never blinds the other
 * domains).
 * @returns the per-rule outcome rollup plus the failure list.
 */
export async function scanAlerts(): Promise<ScanOutcome> {
  ensureRuntimeTables()
  const rules = activeRules()
  const outcomes: RuleScanOutcome[] = []
  const failures: RuleScanFailure[] = []
  for (const rule of rules) {
    try {
      const users = resolveRouteUsers(rule)
      const usersJson = `'[${users.map(user => JSON.stringify(user)).join(', ')}]'`
      const hit = hitsSelect(rule, usersJson)
      const counts = psql(`WITH hit AS (${hit}),
up AS (
  INSERT INTO wfl_alerts (rule_type, rule_id, severity, entity, entity_id, entity_code, title, detail, dedup_key, status, notify_users, reopen_count, first_seen_at, last_seen_at)
  SELECT rule_type, rule_id, severity, entity, entity_id, entity_code, title, detail, dedup_key, 'open', notify_users, 0, CURRENT_DATE, CURRENT_DATE FROM hit
  ON CONFLICT (dedup_key) DO UPDATE SET
    last_seen_at = CURRENT_DATE,
    severity = EXCLUDED.severity,
    title = EXCLUDED.title,
    detail = EXCLUDED.detail,
    notify_users = EXCLUDED.notify_users,
    rule_id = EXCLUDED.rule_id,
    status = CASE WHEN wfl_alerts.status = 'resolved' THEN 'open' ELSE wfl_alerts.status END,
    reopen_count = CASE WHEN wfl_alerts.status = 'resolved' THEN COALESCE(wfl_alerts.reopen_count, 0) + 1 ELSE COALESCE(wfl_alerts.reopen_count, 0) END,
    owner = CASE WHEN wfl_alerts.status = 'resolved' THEN NULL ELSE wfl_alerts.owner END,
    notified_severity = CASE WHEN wfl_alerts.status = 'resolved' THEN NULL ELSE wfl_alerts.notified_severity END,
    resolved_at = CASE WHEN wfl_alerts.status = 'resolved' THEN NULL ELSE wfl_alerts.resolved_at END,
    resolved_by = CASE WHEN wfl_alerts.status = 'resolved' THEN NULL ELSE wfl_alerts.resolved_by END
  RETURNING (xmax = 0) AS fresh)
SELECT (SELECT count(*) FROM up WHERE fresh) || '|' || (SELECT count(*) FROM up WHERE NOT fresh);`).trim()
      const [createdRaw, updatedRaw] = counts.split('|')
      const created = Number(createdRaw)
      const updated = Number(updatedRaw)
      const resolvedRow = psql(`UPDATE wfl_alerts SET status = 'resolved', resolved_at = CURRENT_DATE, resolved_by = 'system', resolve_note = '扫描未命中：对象脱离规则范围或阈值收紧'
WHERE rule_id = ${String(rule.id)} AND status = 'open' AND NOT EXISTS (SELECT 1 FROM (${hit}) h WHERE h.dedup_key = wfl_alerts.dedup_key);`).trim()
      const resolved = Number((resolvedRow.match(/^UPDATE (\d+)$/u) ?? [])[1] ?? 0)
      outcomes.push({ rule: rule.rule_type, created, updated, resolved, notified: 0 })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push({ rule: rule.rule_type, error: message })
      console.error(`w6b2-rules: 规则 ${rule.rule_type} 扫描失败（已隔离，其余规则继续）— ${message}`)
      recordScanFailure(rule.id, rule.rule_type, 'scan', message)
    }
  }
  const notified = notifyPending(rules.map(rule => rule.rule_type))
  scanState.lastScanAt = new Date().toISOString()
  scanState.lastScanFailures = failures.length
  log(`w6b2-rules: scan pass — ${outcomes.map(outcome => `${outcome.rule}+${String(outcome.created)}/~${String(outcome.updated)}/-${String(outcome.resolved)}`).join(' ')} notified=${String(notified)}${failures.length > 0 ? ` failed=${String(failures.length)}（${failures.map(failure => failure.rule).join('、')}）` : ''}`)
  return { rules: outcomes, notified, failures }
}

// ─── the handling actions (the state flow open → acknowledged(认领) → resolved) ───

/**
 * The alert state machine's legal (action, from_state, actor_role) triples —
 * the single table both {@link actOnAlert} layers enforce. `routed` means a
 * notify_users member, `owner` the row's current claimant; admin satisfies
 * every row (it is the engine's own operator), an outsider satisfies none.
 * The claim/ack rows over 'acknowledged' allow one routed user to take over
 * an open claim (the owner re-stamps — the audit chain stays on the row).
 */
const ALERT_ACT_TRANSITIONS: ReadonlyArray<{
  readonly action: 'claim' | 'ack' | 'resolve'
  readonly from: 'open' | 'acknowledged'
  readonly actor: 'routed' | 'owner'
}> = [
  { action: 'claim', from: 'open', actor: 'routed' },
  { action: 'claim', from: 'acknowledged', actor: 'routed' },
  { action: 'ack', from: 'open', actor: 'routed' },
  { action: 'ack', from: 'acknowledged', actor: 'routed' },
  { action: 'resolve', from: 'acknowledged', actor: 'owner' },
]

/** Whether the acting role satisfies one transition row's required actor (admin passes every row, an outsider none). */
const actorSatisfies = (required: 'routed' | 'owner', actual: 'admin' | 'owner' | 'routed' | 'outsider'): boolean =>
  actual === 'admin' ? true : actual === required

/**
 * Act on one alert through the explicit transition table — the single write
 * entrance every channel funnels into (mobile nocobase.alertAct, the PC
 * wfl_alert_acts intent workflow, POST /alerts/act, CLI --act):
 * - the triple assertion: the row's current status and the acting user's
 *   resolved role (admin / owner / routed / outsider) must match one
 *   {@link ALERT_ACT_TRANSITIONS} row for the action, else 0 rows move;
 * - the conditional UPDATE then re-pins status + whitelist server-side (the
 *   authoritative move under concurrency — the pre-check is the assertion
 *   layer, the WHERE clauses the executor, both derived from the table).
 * @param id - the wfl_alerts row id.
 * @param action - 'claim' | 'ack' | 'resolve'.
 * @param user - the acting username.
 * @param note - the optional resolve note.
 * @returns the moved-row count (0 means refused — the caller fails loud with this fact).
 */
export function actOnAlert(id: number, action: 'claim' | 'ack' | 'resolve', user: string, note = ''): number {
  const idLit = intLit(id, 'id')
  const userLit = sqlLit(user)
  // The triple assertion: read the row, resolve the actor's role, check the table.
  const current = psql(`SELECT status || '|' || COALESCE(owner, '') || '|' || COALESCE(notify_users::text, '[]') FROM wfl_alerts WHERE id = ${idLit};`).trim()
  if (current === '') return 0
  const [status, owner, notifyRaw] = current.split('|')
  const role: 'admin' | 'owner' | 'routed' | 'outsider' = user === 'admin' ? 'admin'
    : owner === user ? 'owner'
      : (JSON.parse(notifyRaw) as string[]).includes(user) ? 'routed'
        : 'outsider'
  const legal = ALERT_ACT_TRANSITIONS.some(row => row.action === action && row.from === status && actorSatisfies(row.actor, role))
  if (!legal) return 0
  if (action === 'claim' || action === 'ack') {
    const outcome = psql(`UPDATE wfl_alerts SET owner = ${userLit}, status = 'acknowledged'
WHERE id = ${idLit} AND status IN ('open', 'acknowledged') AND (${userLit} = 'admin' OR notify_users::jsonb ? ${userLit});`).trim()
    return Number((outcome.match(/^UPDATE (\d+)$/u) ?? [])[1] ?? 0)
  }
  const outcome = psql(`UPDATE wfl_alerts SET status = 'resolved', resolved_at = CURRENT_DATE, resolved_by = ${userLit}, resolve_note = ${sqlLit(note)}
WHERE id = ${idLit} AND status = 'acknowledged' AND (${userLit} = 'admin' OR owner = ${userLit});`).trim()
  return Number((outcome.match(/^UPDATE (\d+)$/u) ?? [])[1] ?? 0)
}

// ─── the alert-center pages (NocoBase, zero plugin-source changes) ───

/** The rule_type enum pairs (label + tier color) the pages and columns share. */
const RULE_TYPE_OPTIONS = [
  { value: 'expiry', label: '效期预警', color: 'red' },
  { value: 'cert_due', label: '资质预警', color: 'orange' },
  { value: 'ar_overdue', label: '账期预警', color: 'gold' },
  { value: 'quality_abnormal', label: '质量预警', color: 'orange' },
  { value: 'ccp_deviation', label: 'CCP越限', color: 'red' },
  { value: 'inspection_fail', label: '检验拒收', color: 'volcano' },
  { value: 'calibration_due', label: '计量到期', color: 'cyan' },
  { value: 'maint_overdue', label: '维保逾期', color: 'geekblue' },
] as const

/** The severity/status enum pairs with the red/yellow tier colors. */
const SEVERITY_OPTIONS = [
  { value: 'critical', label: '紧急', color: 'red' },
  { value: 'warning', label: '关注', color: 'gold' },
] as const

const ALERT_STATUS_OPTIONS = [
  { value: 'open', label: '待处理', color: 'blue' },
  { value: 'acknowledged', label: '已认领', color: 'orange' },
  { value: 'resolved', label: '已关闭', color: 'green' },
] as const

type FieldKind = 'input' | 'select' | 'number' | 'date' | 'boolean'
type ColumnSpec = { name: string, title: string, kind: FieldKind, options?: ReadonlyArray<{ value: string | boolean, label: string, color: string }> }

/** The alerts table columns (the red/yellow tier rides the enum colors). */
const ALERT_COLUMNS: ReadonlyArray<ColumnSpec> = [
  { name: 'severity', title: '级别', kind: 'select', options: SEVERITY_OPTIONS },
  { name: 'rule_type', title: '规则', kind: 'select', options: RULE_TYPE_OPTIONS },
  { name: 'entity_code', title: '对象编号', kind: 'input' },
  { name: 'title', title: '预警内容', kind: 'input' },
  { name: 'status', title: '处理状态', kind: 'select', options: ALERT_STATUS_OPTIONS },
  { name: 'owner', title: '认领责任人', kind: 'input' },
  { name: 'first_seen_at', title: '首次发现', kind: 'date' },
  { name: 'last_seen_at', title: '最近确认', kind: 'date' },
]

/** The 是/否 chips a boolean column renders as (values stay native booleans — the enum model matches with ==, so 'true' strings would miss and fall back to English text). */
const BOOLEAN_OPTIONS: ReadonlyArray<{ value: boolean, label: string, color: string }> = [
  { value: true, label: '是', color: 'green' },
  { value: false, label: '否', color: 'default' },
]

/** The rules table columns (the live configuration surface). */
const RULE_COLUMNS: ReadonlyArray<ColumnSpec> = [
  { name: 'rule_type', title: '规则类型', kind: 'select', options: RULE_TYPE_OPTIONS },
  { name: 'title', title: '规则名称', kind: 'input' },
  { name: 'entity', title: '实体集合', kind: 'input' },
  { name: 'params', title: '阈值参数', kind: 'input' },
  { name: 'route_to', title: '责任人路由', kind: 'input' },
  { name: 'enabled', title: '启用', kind: 'boolean', options: BOOLEAN_OPTIONS },
]

const displayModelFor = (kind: FieldKind): string => {
  switch (kind) {
    case 'select': return 'DisplayEnumFieldModel'
    case 'boolean': return 'DisplayEnumFieldModel'
    case 'date': return 'DisplayDateTimeFieldModel'
    default: return 'DisplayTextFieldModel'
  }
}

/**
 * Lay the alert-center menu group and its two v2 pages idempotently: the
 * unified alerts list (four open-count stat cards + the tier-colored table +
 * the rule_type/severity/status filter form) and the rules configuration
 * page. Existing pages are kept (the spine checks its own blocks).
 * @param token - the root API token.
 */
export async function ensureAlertPages(token: string): Promise<void> {
  const routes = await listRoutes(token, 'W6B2')
  let groupId = routes.find(row => row.title === '预警中心' && row.type === 'group')?.id
  if (groupId === undefined) {
    groupId = Number((await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '预警中心', icon: 'AlertOutlined', type: 'group' }) as { id?: unknown }).id ?? 0)
    log('w6b2-rules: menu group 预警中心 created')
  }
  // Page 1: the unified alert list.
  const alertsTitle = '预警列表'
  if (!routes.some(row => row.title === alertsTitle && row.type === 'flowPage')) {
    const routeUid = withN17Prefix('w6b2', '')
    const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: alertsTitle, icon: 'AlertOutlined', type: 'flowPage', parentId: groupId, sort: 1, schemaUid: routeUid }) as { id?: unknown }
    const tabUid = withN17Prefix('w6b2', 't')
    await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('w6b2', 'ts') })
    const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
    await save({ uid: routeUid, schema: { use: 'RouteModel' } })
    await save({ uid: tabUid, schema: { use: 'RouteModel' } })
    await save({ uid: withN17Prefix('w6b2', 'p'), parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title: alertsTitle, displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title: alertsTitle, displayTitle: true, enableTabs: false, description: '四路规则的统一预警面：效期/资质/账期/质量。红色=紧急（过期/逾期/致命缺陷），黄色=关注（临期/到期前提醒）——认领后处理，关闭需认领人' } } } })
    const gridUid = withN17Prefix('w6b2', 'g')
    await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })
    const tableUid = withN17Prefix('w6b2', 'tb')
    await save({
      uid: tableUid, use: 'TableBlockModel', parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: 10,
      props: { title: '预警记录（当前生效行，认领/关闭走引擎 POST /alerts/act 或管理员行编辑）' },
      stepParams: {
        resourceSettings: { init: { dataSourceKey: 'main', collectionName: 'wfl_alerts' } },
        tableSettings: { defaultSorting: { sort: [{ field: 'id', direction: 'desc' }] } },
      },
    })
    let sortIndex = 1
    for (const column of ALERT_COLUMNS) {
      const uid = withN17Prefix('w6b2', 'c')
      const model = displayModelFor(column.kind)
      await save({
        uid, use: 'TableColumnModel', parentId: tableUid, subKey: 'columns', subType: 'array', sortIndex,
        stepParams: {
          fieldSettings: { init: { dataSourceKey: 'main', collectionName: 'wfl_alerts', fieldPath: column.name } },
          tableColumnSettings: { model: { use: model } },
        },
        props: { title: column.title, dataIndex: column.name, width: 150, editable: false, sorter: false, fixed: 'none', ...(column.options === undefined ? {} : { options: [...column.options] }) },
      })
      await save({
        uid: `${uid}f`, use: model, parentId: uid, subKey: 'field', subType: 'object', sortIndex: 0,
        stepParams: { popupSettings: { openView: { collectionName: 'wfl_alerts', dataSourceKey: 'main' } } },
        props: { displayStyle: 'text', overflowMode: 'ellipsis', clickToOpen: false, displayCopyButton: false, ...(column.options === undefined ? {} : { options: [...column.options] }) },
      })
      sortIndex += 1
    }
    await save({ uid: withN17Prefix('w6b2', 'rf'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'RefreshActionModel', props: { title: '', icon: 'ReloadOutlined' }, stepParams: { buttonSettings: { general: { title: '', icon: 'ReloadOutlined' } } } })
    await ensureTableRowDetail(token, tableUid, {
      collection: 'wfl_alerts',
      fields: ALERT_COLUMNS.map(column => ({ fieldPath: column.name, modelUse: displayModelFor(column.kind), ...(column.options === undefined ? {} : { options: [...column.options] }) })),
      tabTitle: '预警详情',
      actionsColumnSortIndex: ALERT_COLUMNS.length + 1,
    })
    await ensureFilterForm(token, { gridUid, tableUid, collection: 'wfl_alerts', fields: [
      { fieldPath: 'rule_type' }, { fieldPath: 'severity' }, { fieldPath: 'status' },
    ] })
    // The four open-count stat cards above the table (one per rule tier).
    for (const rule of RULE_TYPE_OPTIONS) {
      await metricChart(token, {
        gridUid, title: `${rule.label}待处理`, collection: 'wfl_alerts',
        measure: { field: 'id', aggregation: 'count', alias: 'open_count' },
        filter: { rule_type: { $eq: rule.value }, status: { $eq: 'open' } },
        footnote: `${rule.label}规则当前待处理预警数`, sortIndex: 1 + RULE_TYPE_OPTIONS.indexOf(rule),
      })
    }
    log(`w6b2-rules: v2 page ${alertsTitle} created (/admin/${routeUid})`)
  }
  // Page 2: the rules configuration list.
  const rulesTitle = '预警规则'
  if (!routes.some(row => row.title === rulesTitle && row.type === 'flowPage')) {
    const routeUid = withN17Prefix('w6b2', 'r')
    const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: rulesTitle, icon: 'SettingOutlined', type: 'flowPage', parentId: groupId, sort: 2, schemaUid: routeUid }) as { id?: unknown }
    const tabUid = withN17Prefix('w6b2', 'rt')
    await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('w6b2', 'rts') })
    const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
    await save({ uid: routeUid, schema: { use: 'RouteModel' } })
    await save({ uid: tabUid, schema: { use: 'RouteModel' } })
    await save({ uid: withN17Prefix('w6b2', 'rp'), parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title: rulesTitle, displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title: rulesTitle, displayTitle: true, enableTabs: false, description: '规则配置中心：阈值参数（warn_days/critical_days/regulatory）、责任人路由、启停——修改后下一次扫描生效' } } } })
    const gridUid = withN17Prefix('w6b2', 'rg')
    await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })
    const tableUid = withN17Prefix('w6b2', 'rb')
    await save({
      uid: tableUid, use: 'TableBlockModel', parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: 1,
      props: { title: '规则清单（阈值/路由/启停可编辑，管理员）' },
      stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: 'alert_rules' } } },
    })
    let sortIndex = 1
    for (const column of RULE_COLUMNS) {
      const uid = withN17Prefix('w6b2', 'rc')
      const model = displayModelFor(column.kind)
      await save({
        uid, use: 'TableColumnModel', parentId: tableUid, subKey: 'columns', subType: 'array', sortIndex,
        stepParams: {
          fieldSettings: { init: { dataSourceKey: 'main', collectionName: 'alert_rules', fieldPath: column.name } },
          tableColumnSettings: { model: { use: model } },
        },
        props: { title: column.title, dataIndex: column.name, width: 150, editable: false, sorter: false, fixed: 'none', ...(column.options === undefined ? {} : { options: [...column.options] }) },
      })
      await save({
        uid: `${uid}f`, use: model, parentId: uid, subKey: 'field', subType: 'object', sortIndex: 0,
        stepParams: { popupSettings: { openView: { collectionName: 'alert_rules', dataSourceKey: 'main' } } },
        props: { displayStyle: 'text', overflowMode: 'ellipsis', clickToOpen: false, displayCopyButton: false, ...(column.options === undefined ? {} : { options: [...column.options] }) },
      })
      sortIndex += 1
    }
    await save({ uid: withN17Prefix('w6b2', 'rrf'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'RefreshActionModel', props: { title: '', icon: 'ReloadOutlined' }, stepParams: { buttonSettings: { general: { title: '', icon: 'ReloadOutlined' } } } })
    await ensureTableRowDetail(token, tableUid, {
      collection: 'alert_rules',
      fields: RULE_COLUMNS.map(column => ({ fieldPath: column.name, modelUse: displayModelFor(column.kind), ...(column.options === undefined ? {} : { options: [...column.options] }) })),
      tabTitle: '规则详情',
      actionsColumnSortIndex: RULE_COLUMNS.length + 1,
    })
    log(`w6b2-rules: v2 page ${rulesTitle} created (/admin/${routeUid})`)
  }
  // The member role reads both collections (view only — the BP-13 grant
  // pattern) and files alert-act intents (the PC claim path — the workflow
  // forwards each intent row to the engine, so members never write wfl_alerts
  // directly).
  for (const name of ['alert_rules', 'wfl_alerts']) {
    const granted = psql(`SELECT count(*) FROM "rolesResources" rr JOIN "rolesResourcesActions" ra ON ra."rolesResourceId" = rr.id WHERE rr."roleName" = 'member' AND rr."name" = '${name}' AND ra."name" = 'view';`).trim()
    if (granted === '0') {
      psql(`INSERT INTO "rolesResources" ("roleName", "name", "usingActionsConfig", "createdAt", "updatedAt") SELECT 'member', '${name}', TRUE, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "rolesResources" WHERE "roleName" = 'member' AND "name" = '${name}');`)
      psql(`INSERT INTO "rolesResourcesActions" ("rolesResourceId", "name", "createdAt", "updatedAt") SELECT rr.id, 'view', NOW(), NOW() FROM "rolesResources" rr WHERE rr."roleName" = 'member' AND rr."name" = '${name}' AND NOT EXISTS (SELECT 1 FROM "rolesResourcesActions" ra WHERE ra."rolesResourceId" = rr.id AND ra."name" = 'view');`)
      log(`w6b2-rules: member→${name} view granted`)
    }
  }
  for (const action of ['view', 'create']) {
    const granted = psql(`SELECT count(*) FROM "rolesResources" rr JOIN "rolesResourcesActions" ra ON ra."rolesResourceId" = rr.id WHERE rr."roleName" = 'member' AND rr."name" = 'wfl_alert_acts' AND ra."name" = '${action}';`).trim()
    if (granted === '0') {
      psql(`INSERT INTO "rolesResources" ("roleName", "name", "usingActionsConfig", "createdAt", "updatedAt") SELECT 'member', 'wfl_alert_acts', TRUE, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "rolesResources" WHERE "roleName" = 'member' AND "name" = 'wfl_alert_acts');`)
      psql(`INSERT INTO "rolesResourcesActions" ("rolesResourceId", "name", "createdAt", "updatedAt") SELECT rr.id, '${action}', NOW(), NOW() FROM "rolesResources" rr WHERE rr."roleName" = 'member' AND rr."name" = 'wfl_alert_acts' AND NOT EXISTS (SELECT 1 FROM "rolesResourcesActions" ra WHERE ra."rolesResourceId" = rr.id AND ra."name" = '${action}');`)
      log(`w6b2-rules: member→wfl_alert_acts ${action} granted`)
    }
  }
  await ensureAlertActIntentForm(token)
  await ensureAlertWorkflow(token)
  await patchRuleTypeSurface(token)
  await patchRulesEnabledColumn(token)
}

/**
 * Bring an existing 预警列表 page up to the six-rule enum (W6-B4/B5 added
 * ccp_deviation and inspection_fail after the page was laid; the fresh-page
 * branch above already writes all six). Three idempotent touch points: the
 * fields-table enum metadata both collections' selects read, the live
 * rule_type table column + its display field chip options, and the two
 * missing per-rule open-count stat cards (appended after the existing four —
 * visual ordering stays B2's concern).
 * @param token - the root API token.
 */
async function patchRuleTypeSurface(token: string): Promise<void> {
  const options = RULE_TYPE_OPTIONS.map(rule => ({ value: rule.value, label: rule.label, color: rule.color }))
  const optionsJson = JSON.stringify(options)
  // fields.options is a json column — round-trip through jsonb for jsonb_set.
  const updated = psql(`UPDATE fields SET options = jsonb_set(COALESCE(options::jsonb, '{}'::jsonb), '{uiSchema,enum}', ${sqlLit(optionsJson)}::jsonb)::json
  WHERE name = 'rule_type' AND "collectionName" IN ('alert_rules', 'wfl_alerts') AND COALESCE(options->'uiSchema'->'enum', '[]'::json)::text <> ${sqlLit(optionsJson)};`).trim()
  const models = await listFlowModels(token, 'W6B2-patch')
  const alertTables = models.filter(model => model?.use === 'TableBlockModel' && String(model?.stepParams?.resourceSettings?.init?.collectionName ?? '') === 'wfl_alerts')
  let patchedColumns = 0
  for (const table of alertTables) {
    for (const column of models.filter(model => model?.use === 'TableColumnModel' && model?.parentId === table.uid && String(model?.props?.dataIndex ?? '') === 'rule_type')) {
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: column.uid, use: column.use, parentId: column.parentId, subKey: column.subKey, subType: column.subType,
        sortIndex: column.sortIndex ?? 0, props: { ...(column.props ?? {}), options },
      })
      for (const field of models.filter(model => model?.parentId === column.uid && model?.subKey === 'field')) {
        await dataOf(token, 'POST', '/api/flowModels:save', {
          uid: field.uid, use: field.use, parentId: field.parentId, subKey: field.subKey, subType: field.subType,
          sortIndex: field.sortIndex ?? 0, props: { ...(field.props ?? {}), options },
        })
      }
      patchedColumns += 1
    }
  }
  let addedCards = 0
  for (const gridUid of [...new Set(alertTables.map(table => String(table.parentId ?? '')))].filter(uid => uid !== '')) {
    const titles = new Set(models.filter(model => String(model?.parentId ?? '') === gridUid).map(model => String(model?.props?.title ?? '')))
    let sortIndex = Math.max(0, ...models.filter(model => String(model?.parentId ?? '') === gridUid).map(model => Number(model?.sortIndex ?? 0)))
    for (const rule of RULE_TYPE_OPTIONS) {
      const title = `${rule.label}待处理`
      if (titles.has(title)) continue
      await metricChart(token, {
        gridUid, title, collection: 'wfl_alerts',
        measure: { field: 'id', aggregation: 'count', alias: 'open_count' },
        filter: { rule_type: { $eq: rule.value }, status: { $eq: 'open' } },
        footnote: `${rule.label}规则当前待处理预警数`, sortIndex: sortIndex + 1,
      })
      sortIndex += 1
      addedCards += 1
    }
  }
  if (updated !== 'UPDATE 0' || patchedColumns > 0 || addedCards > 0) {
    log(`w6b2-rules: rule_type 枚举面升级（fields=${updated.replace(/^UPDATE /u, '')} 列=${String(patchedColumns)} 统计卡新增=${String(addedCards)}——六路：${RULE_TYPE_OPTIONS.map(rule => rule.value).join('/')}）`)
  }
}

/**
 * Render the rules page's `enabled` boolean as the 是/否 enum chip instead of
 * the blank text cell (the R6 UX fix; DisplayTextFieldModel renders booleans
 * empty). The fresh-page branch above already writes the enum model — this leg
 * lifts pages laid before it: the fields metadata enum, the live table column
 * (its display model rides tableColumnSettings), and every alert_rules
 * `enabled` display field (the column's child and the row-detail tab's child).
 * Idempotent: rows already carrying the enum model and options stay put.
 * @param token - the root API token.
 */
async function patchRulesEnabledColumn(token: string): Promise<void> {
  const options = BOOLEAN_OPTIONS.map(option => ({ value: option.value, label: option.label, color: option.color }))
  const optionsJson = JSON.stringify(options)
  psql(`UPDATE fields SET options = jsonb_set(COALESCE(options::jsonb, '{}'::jsonb), '{uiSchema,enum}', ${sqlLit(optionsJson)}::jsonb)::json
  WHERE name = 'enabled' AND "collectionName" = 'alert_rules' AND COALESCE(options->'uiSchema'->'enum', '[]'::json)::text <> ${sqlLit(optionsJson)};`)
  const models = await listFlowModels(token, 'W6B2-patch-enabled')
  let patched = 0
  const enabledColumnUids = new Set(models.filter(model => model?.use === 'TableColumnModel'
    && String(model?.stepParams?.fieldSettings?.init?.collectionName ?? '') === 'alert_rules'
    && String(model?.props?.dataIndex ?? '') === 'enabled').map(model => String(model.uid)))
  for (const column of models.filter(model => model?.use === 'TableColumnModel'
    && String(model?.stepParams?.fieldSettings?.init?.collectionName ?? '') === 'alert_rules'
    && String(model?.props?.dataIndex ?? '') === 'enabled'
    && String(model?.stepParams?.tableColumnSettings?.model?.use ?? '') !== 'DisplayEnumFieldModel')) {
    await dataOf(token, 'POST', '/api/flowModels:save', {
      uid: column.uid, use: column.use, parentId: column.parentId, subKey: column.subKey, subType: column.subType,
      sortIndex: column.sortIndex ?? 0,
      stepParams: {
        ...(column.stepParams ?? {}),
        tableColumnSettings: { model: { use: 'DisplayEnumFieldModel' } },
      },
      props: { ...(column.props ?? {}), options },
    })
    patched += 1
  }
  // the columns' child display fields carry no fieldSettings (only
  // popupSettings) — reach them through the parent-column link instead.
  for (const child of models.filter(model => model?.use === 'DisplayTextFieldModel'
    && model?.subKey === 'field' && enabledColumnUids.has(String(model.parentId ?? '')))) {
    await dataOf(token, 'POST', '/api/flowModels:save', {
      uid: child.uid, use: 'DisplayEnumFieldModel', parentId: child.parentId, subKey: child.subKey, subType: child.subType,
      sortIndex: child.sortIndex ?? 0,
      stepParams: child.stepParams ?? {},
      props: { ...(child.props ?? {}), options },
    })
    patched += 1
  }
  for (const field of models.filter(model => model?.use === 'DisplayTextFieldModel'
    && String(model?.stepParams?.fieldSettings?.init?.collectionName ?? '') === 'alert_rules'
    && String(model?.stepParams?.fieldSettings?.init?.fieldPath ?? '') === 'enabled')) {
    await dataOf(token, 'POST', '/api/flowModels:save', {
      uid: field.uid, use: 'DisplayEnumFieldModel', parentId: field.parentId, subKey: field.subKey, subType: field.subType,
      sortIndex: field.sortIndex ?? 0,
      stepParams: field.stepParams ?? {},
      props: { ...(field.props ?? {}), options },
    })
    patched += 1
  }
  if (patched > 0) {
    log(`w6b2-rules: enabled列改是/否枚举渲染（列+字段模型=${String(patched)}——布尔 Tag 映射）`)
  }
}

// ─── the PC claim path: the wfl_alert_acts intent form + the callback workflow ───

/** The alert list's Add-new intent form fields (the workflow forwards each row to POST /alerts/act). */
const ACT_INTENT_FIELDS: ReadonlyArray<{ name: string, title: string, kind: 'input' | 'select' | 'number', options?: ReadonlyArray<{ value: string, label: string, color: string }>, required?: boolean }> = [
  { name: 'alert_id', title: '预警行 id（列表第一列对应行的 id，行详情可查）', kind: 'number', required: true },
  { name: 'action', title: '动作', kind: 'select', options: [
    { value: 'claim', label: '认领', color: 'blue' },
    { value: 'ack', label: '确认', color: 'orange' },
    { value: 'resolve', label: '关闭', color: 'green' },
  ], required: true },
  { name: 'user', title: '操作人（路由责任人用户名）', kind: 'input', required: true },
  { name: 'note', title: '关闭说明', kind: 'input' },
]

/** The w6b2 intent-form field edit models (InputNumber for number kinds). */
const actIntentEditModelFor = (kind: 'input' | 'select' | 'number'): string => {
  switch (kind) {
    case 'select': return 'SelectFieldModel'
    case 'number': return 'NumberFieldModel'
    default: return 'InputFieldModel'
  }
}

/**
 * Attach the claim/close intent form to the alert list's existing table,
 * additively and idempotently (the page itself may predate this leg): an
 * AddNew action on the wfl_alerts table whose popup CreateForm writes one
 * wfl_alert_acts row — the W1 cross-collection intent pattern (a todos-table
 * Add-new writing wfl_approval_records). The collection workflow created by
 * {@link ensureAlertWorkflow} forwards the row to POST /alerts/act; the
 * engine consumes it on success, so wfl_alert_acts only ever holds live
 * intents.
 * @param token - the root API token.
 */
async function ensureAlertActIntentForm(token: string): Promise<void> {
  const models = await listFlowModels(token, 'W6B2-actform')
  if (models.some(model => model?.use === 'CreateFormModel' && String(model?.stepParams?.resourceSettings?.init?.collectionName ?? '') === 'wfl_alert_acts')) {
    log('w6b2-rules: 认领意图表单已在（kept）')
    return
  }
  const table = models.find(model => model?.use === 'TableBlockModel' && String(model?.stepParams?.resourceSettings?.init?.collectionName ?? '') === 'wfl_alerts')
  if (table === undefined) throw new Error('wfl_alerts 表格块不在——先跑 --seed 铺两页后再补认领入口')
  const tableUid = String(table.uid)
  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  const itemUids = ACT_INTENT_FIELDS.map(() => withN17Prefix('w6b2a', 'i'))
  const rows = itemUids.map((itemUid, index) => ({ id: `r${String(index)}`, cells: [{ id: `r${String(index)}:cell:0`, items: [itemUid] }], sizes: [24] }))
  await save({
    uid: withN17Prefix('w6b2a', 'an'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 1, use: 'AddNewActionModel', props: { title: '认领 / 关闭预警' },
    stepParams: { popupSettings: { openView: { collectionName: 'wfl_alert_acts', dataSourceKey: 'main' } } },
    subModels: {
      page: {
        use: 'ChildPageModel', subKey: 'page', subType: 'object', sortIndex: 0, props: {},
        stepParams: { pageSettings: { general: { displayTitle: false, enableTabs: true } } },
        subModels: {
          tabs: [{
            use: 'ChildPageTabModel', subKey: 'tabs', subType: 'array', sortIndex: 0, props: {},
            stepParams: { pageTabSettings: { tab: { title: '认领/关闭（引擎白名单校验）' } } },
            subModels: {
              grid: {
                use: 'BlockGridModel', subKey: 'grid', subType: 'object', sortIndex: 0, props: {},
                subModels: {
                  items: [{
                    use: 'CreateFormModel', subKey: 'items', subType: 'array', sortIndex: 1, props: {},
                    stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: 'wfl_alert_acts' } } },
                    subModels: {
                      grid: {
                        use: 'FormGridModel', subKey: 'grid', subType: 'object', sortIndex: 0,
                        props: { layout: { version: 2, rows, rowGap: 0, colGap: 16, sizes: {}, rowOrder: rows.map(row => row.id) } },
                        stepParams: { gridSettings: { grid: { layout: { version: 2, rows } } } },
                        subModels: {
                          items: ACT_INTENT_FIELDS.map((field, index) => ({
                            uid: itemUids[index], use: 'FormItemModel', subKey: 'items', subType: 'array', sortIndex: index + 1,
                            props: field.required === true ? { required: true } : {},
                            stepParams: { fieldSettings: { init: { dataSourceKey: 'main', collectionName: 'wfl_alert_acts', fieldPath: field.name } } },
                            subModels: {
                              field: {
                                use: actIntentEditModelFor(field.kind), subKey: 'field', subType: 'object', sortIndex: 0,
                                props: field.options === undefined ? {} : { allowClear: true, options: [...field.options] },
                              },
                            },
                          })),
                        },
                      },
                    },
                  }],
                },
              },
            },
          }],
        },
      },
    },
  })
  // The form's submit action (the ensureIntentDefaults pattern: submit-<form uid>).
  const after = await listFlowModels(token, 'W6B2-actform-submit')
  const forms = after.filter(model => model?.use === 'CreateFormModel' && String(model?.stepParams?.resourceSettings?.init?.collectionName ?? '') === 'wfl_alert_acts' && model.parentId == null)
  for (const form of forms) {
    if (after.some(model => model.uid === `submit-${String(form.uid)}`)) continue
    await save({ uid: `submit-${String(form.uid)}`, parentId: form.uid, subKey: 'actions', subType: 'array', sortIndex: 1, use: 'FormSubmitActionModel', props: {}, stepParams: {} })
  }
  log('w6b2-rules: 认领意图表单已挂到预警列表（AddNew → wfl_alert_acts → workflow → POST /alerts/act）')
}

/** The callback workflow's title (leg ⑨ asserts it exists and is enabled). */
const ALERT_WORKFLOW_TITLE = 'W6B2-预警处理回调'

/**
 * Create the wfl_alert_acts → engine callback workflow idempotently (the W1
 * pattern): collection trigger on wfl_alert_acts:create, one request node
 * POSTing the intent row to /alerts/act with intent_record_id — the engine
 * consumes the row on success, so the table never accumulates spent intents.
 * No condition node is needed: every row of this collection is a page intent
 * (the engine alone never writes here).
 * @param token - the root API token.
 */
async function ensureAlertWorkflow(token: string): Promise<void> {
  const found = await dataOf(token, 'GET', `/api/workflows:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: ALERT_WORKFLOW_TITLE } }))}&pageSize=5`) as Array<{ id: number }> | null
  if ((found ?? []).length > 0) {
    log(`w6b2-rules: workflow "${ALERT_WORKFLOW_TITLE}" exists (kept)`)
    return
  }
  const engine = process.env['W6_ALERT_ENGINE_URL'] ?? 'http://127.0.0.1:13110'
  const workflow = await dataOf(token, 'POST', '/api/workflows:create', {
    title: ALERT_WORKFLOW_TITLE, enabled: true, type: 'collection',
    config: { collection: 'wfl_alert_acts', mode: 1 },
  }) as { id: number }
  // The create-then-toggle pair mounts the db hook (the W1 trap).
  await call(token, 'POST', `/api/workflows:toggle?filterByTk=${workflow.id}`)
  await call(token, 'POST', `/api/workflows:toggle?filterByTk=${workflow.id}`)
  await dataOf(token, 'POST', '/api/flow_nodes:create', {
    workflow: workflow.id, title: '回调预警引擎', type: 'request',
    config: {
      url: `${engine}/alerts/act`, method: 'POST', contentType: 'application/json',
      data: {
        id: '{{$context.data.alert_id}}', action: '{{$context.data.action}}',
        user: '{{$context.data.user}}', note: '{{$context.data.note}}',
        intent_record_id: '{{$context.data.id}}',
      },
      timeout: 30000,
    },
  })
  log(`w6b2-rules: workflow "${ALERT_WORKFLOW_TITLE}" created (wfl_alert_acts:create → request ${engine}/alerts/act)`)
}

// ─── the AR seed (one overdue approved SO, marked seed) ───

/**
 * Seed one genuinely overdue approved sales order (the live table carries no
 * past-date approved order — the four-way evidence needs the critical tier).
 * The row is real in PG, marked seed in its note.
 */
function seedArProbe(): void {
  psql(`INSERT INTO so_orders (code, need_date, amount, doc_status, note)
SELECT 'SO-W6B2-SEED', CURRENT_DATE - 30, 18800, 'approved', 'W6-B2 账期预警种子（seed）：逾期 30 天未回款'
WHERE NOT EXISTS (SELECT 1 FROM so_orders WHERE code = 'SO-W6B2-SEED');`)
  const row = psql(`SELECT id || '|' || code FROM so_orders WHERE code = 'SO-W6B2-SEED';`).trim()
  log(`w6b2-rules: AR seed ready — ${row === '' ? 'FAILED' : row}`)
}

// ─── the acceptance matrix (--assert; a fresh environment runs --seed --seed-ar --scan first) ───

/**
 * The assertion legs (the B2→R2 slice of the final-gate matrix):
 * schema columns exist as declared (the information_schema discipline — a
 * typo'd column name fails here, not in a silent empty read), four rules
 * seeded and enabled, both tiers live per rule, the idempotency contract
 * (two consecutive scans, count unchanged), the expiry reconciliation
 * (scanner rows == the hand-written four-date × tier SQL), threshold
 * configurability (a widened window adds rows, restoring auto-resolves them),
 * the notification landing (channel row + routed user ids), routing coverage
 * (notify_users carries the routed accounts), the transition-table refusals
 * (unrouted claim, unclaimed resolve, non-owner resolve, claim on resolved)
 * plus the reopen round (reopen_count=1, re-notify, second close), both pages
 * present with their blocks plus the claim-intent form and callback workflow,
 * and the per-rule failure isolation (one bad rule fails alone, audited).
 * @param token - the root API token.
 */
async function assertLegs(token: string): Promise<void> {
  log('— ① 两表列齐全（information_schema 对照，date-only 串列）')
  for (const [table, columns] of [
    ['alert_rules', ['rule_type', 'title', 'entity', 'params', 'schedule', 'actions', 'route_to', 'enabled', 'note']],
    ['wfl_alerts', ['rule_type', 'rule_id', 'severity', 'entity', 'entity_id', 'entity_code', 'title', 'detail', 'dedup_key', 'status', 'owner', 'notify_users', 'reopen_count', 'first_seen_at', 'last_seen_at', 'notified_severity', 'resolved_by', 'resolve_note']],
  ] as const) {
    const present = new Set(psql(`SELECT column_name FROM information_schema.columns WHERE table_name = '${table}';`).split('\n').map(line => line.trim()).filter(line => line !== ''))
    const missing = columns.filter(column => !present.has(column))
    check(`${table} 列齐全`, missing.length === 0, missing.length === 0 ? '' : `缺 ${missing.join('、')}`)
  }
  const uniqueIndex = psql("SELECT count(*) FROM pg_indexes WHERE indexname = 'ux_wfl_alerts_dedup';").trim()
  check('dedup 唯一索引在库', uniqueIndex === '1', `ux_wfl_alerts_dedup=${uniqueIndex}`)
  const channel = psql(`SELECT count(*) FROM "notificationChannels" WHERE name = '${ALERT_CHANNEL}';`).trim()
  check(`通知渠道 ${ALERT_CHANNEL} 已注册`, channel === '1', `channels=${channel}`)

  log('— ② 四路规则 seeded 且启用')
  const rules = psql("SELECT rule_type FROM alert_rules WHERE enabled = TRUE ORDER BY id;").split('\n').map(line => line.trim()).filter(line => line !== '')
  check('八路规则各一行启用（B2 四路 + B4 ccp_deviation + B5 inspection_fail + B8 calibration_due/maint_overdue）', rules.length === 8 && ['expiry', 'cert_due', 'ar_overdue', 'quality_abnormal', 'ccp_deviation', 'inspection_fail', 'calibration_due', 'maint_overdue'].every(type => rules.includes(type)), rules.join(','))

  log('— ③ 首扫产出（每路 ≥1 行、级别分层在库）')
  await scanAlerts()
  for (const type of ['expiry', 'cert_due', 'ar_overdue', 'quality_abnormal']) {
    const rows = psql(`SELECT count(*) FROM wfl_alerts WHERE rule_type = '${type}' AND status <> 'resolved';`).trim()
    check(`${type} 有生效预警行`, Number(rows) >= 1, `rows=${rows}`)
  }
  const tiers = psql("SELECT count(DISTINCT severity) FROM wfl_alerts WHERE status <> 'resolved';").trim()
  check('红黄两层都有数据', tiers === '2', `distinct severity=${tiers}`)

  log('— ④ 幂等契约（连续两轮扫描 count 不增）')
  const before = psql("SELECT count(*) FROM wfl_alerts;").trim()
  await scanAlerts()
  await scanAlerts()
  const after = psql("SELECT count(*) FROM wfl_alerts;").trim()
  check('两轮扫描总行数不变', before === after, `before=${before} after=${after}`)

  log('— ⑤ 效期对账（引擎行数 = 手写四日期×双轨阈值 SQL，差异=0）')
  const engineExpiry = psql("SELECT count(*) FROM wfl_alerts WHERE rule_type = 'expiry' AND last_seen_at = CURRENT_DATE;").trim()
  const reconExpiry = psql(`WITH rule AS (SELECT params FROM alert_rules WHERE rule_type = 'expiry')
SELECT count(*) FROM wms_lots l, rule r
WHERE l.expiry_date IS NOT NULL
  AND (l.expiry_date <= CURRENT_DATE + LEAST((r.params->>'warn_days')::int,
        CASE WHEN (r.params->>'regulatory')::boolean IS NOT FALSE THEN
          CASE WHEN l.production_date IS NULL OR l.expiry_date - l.production_date >= 365 THEN 45
               WHEN l.expiry_date - l.production_date >= 180 THEN 20
               WHEN l.expiry_date - l.production_date >= 90 THEN 15
               WHEN l.expiry_date - l.production_date >= 30 THEN 10
               ELSE 3 END
        ELSE 999999 END)
    OR (l.alert_date IS NOT NULL AND l.alert_date <= CURRENT_DATE AND l.expiry_date >= CURRENT_DATE));`).trim()
  check('效期引擎=手写对账', engineExpiry === reconExpiry, `engine=${engineExpiry} recon=${reconExpiry}`)

  log('— ⑥ 阈值可配（放大窗口→分层变化；恢复→系统自动关闭）')
  const certId = psql("SELECT id FROM alert_rules WHERE rule_type = 'cert_due';").trim()
  const originalParams = psql("SELECT params::text FROM alert_rules WHERE rule_type = 'cert_due';").trim()
  const certBaseline = psql("SELECT count(*) FROM wfl_alerts WHERE rule_type = 'cert_due' AND status <> 'resolved';").trim()
  psql(`UPDATE alert_rules SET params = '{"warn_days": 400, "critical_days": 7}'::json WHERE id = ${certId};`)
  await scanAlerts()
  const certWidened = psql("SELECT count(*) FROM wfl_alerts WHERE rule_type = 'cert_due' AND status <> 'resolved';").trim()
  check('放大 warn_days 30→400 后新增预警行', Number(certWidened) > Number(certBaseline), `baseline=${certBaseline} widened=${certWidened}`)
  psql(`UPDATE alert_rules SET params = ${sqlLit(originalParams)}::json WHERE id = ${certId};`)
  await scanAlerts()
  const certRestored = psql("SELECT count(*) FROM wfl_alerts WHERE rule_type = 'cert_due' AND status <> 'resolved';").trim()
  check('恢复阈值后未命中行被系统自动关闭', certRestored === certBaseline, `restored=${certRestored} baseline=${certBaseline}`)
  const configRestored = psql(`SELECT (params::text = ${sqlLit(originalParams)}) FROM alert_rules WHERE rule_type = 'cert_due';`).trim()
  check('规则参数已复原', configRestored === 't', configRestored)

  log('— ⑦ 通知送达 + 责任人路由')
  const notified = psql(`SELECT count(*) FROM "notificationInAppMessages" WHERE "channelName" = '${ALERT_CHANNEL}';`).trim()
  check('in-app 通知已产生', Number(notified) >= 4, `messages=${notified}`)
  const keeperId = psql("SELECT id FROM users WHERE username = 'keeper';").trim()
  const keeperNotified = psql(`SELECT count(*) FROM "notificationInAppMessages" WHERE "channelName" = '${ALERT_CHANNEL}' AND "userId" = ${keeperId};`).trim()
  check('仓储部 keeper 收到效期预警通知', Number(keeperNotified) >= 1, `keeper messages=${keeperNotified}`)
  const routedExpiry = psql(`SELECT COALESCE(notify_users::text, '[]') FROM wfl_alerts WHERE rule_type = 'expiry' AND status <> 'resolved' LIMIT 1;`).trim()
  check('效期路由到仓储部（notify_users 含 keeper）', routedExpiry.includes('keeper'), routedExpiry.slice(0, 80))
  const routedAr = psql(`SELECT COALESCE(notify_users::text, '[]') FROM wfl_alerts WHERE rule_type = 'ar_overdue' AND status <> 'resolved' LIMIT 1;`).trim()
  check('账期路由 finance/sales_rep', routedAr.includes('finance') && routedAr.includes('sales_rep'), routedAr.slice(0, 80))

  log('— ⑧ 处理动作状态流 + 三元转换断言（越权/越态拒绝 + 重开二轮）')
  const probe = psql("SELECT id FROM wfl_alerts WHERE rule_type = 'ar_overdue' AND status = 'open' LIMIT 1;").trim()
  if (probe !== '') {
    const id = Number(probe)
    const outsider = actOnAlert(id, 'claim', 'keeper')
    check('非路由用户（keeper 认领账期预警）被拒', outsider === 0, `moved=${String(outsider)}`)
    const earlyResolve = actOnAlert(id, 'resolve', 'finance')
    check('未认领直接关闭被拒（open×resolve 无三元）', earlyResolve === 0, `moved=${String(earlyResolve)}`)
    const claimed = actOnAlert(id, 'claim', 'finance')
    check('finance 认领账期预警成功', claimed === 1, `moved=${String(claimed)}`)
    const ownerRow = psql(`SELECT owner || '|' || status FROM wfl_alerts WHERE id = ${String(id)};`).trim()
    check('认领落库 owner=finance status=acknowledged', ownerRow === 'finance|acknowledged', ownerRow)
    const routedNotOwner = actOnAlert(id, 'resolve', 'sales_rep')
    check('路由到但非认领人关闭被拒（acknowledged×resolve×routed 无三元）', routedNotOwner === 0, `moved=${String(routedNotOwner)}`)
    // The reopen baseline (previous assert runs may have reopened this row
    // already — the increment, not the absolute, is the repeatable claim).
    const reopenBaseline = Number(psql(`SELECT COALESCE(reopen_count, 0) FROM wfl_alerts WHERE id = ${String(id)};`).trim())
    const resolved = actOnAlert(id, 'resolve', 'finance', 'W6-R2 断言腿：已回款关闭')
    check('认领人关闭成功', resolved === 1, `moved=${String(resolved)}`)
    const resolvedRow = psql(`SELECT status || '|' || resolved_by FROM wfl_alerts WHERE id = ${String(id)};`).trim()
    check('关闭留痕 resolved_by=finance', resolvedRow.startsWith('resolved|finance'), resolvedRow)
    // The reopen round: the probe object still violates the rule, so the next
    // pass must reopen it with reopen_count = 1 (the W6-R2 INSERT column fix —
    // not a bare status flip, never NULL), re-notify, then close again.
    const claimOnResolved = actOnAlert(id, 'claim', 'finance')
    check('已关闭行再认领被拒（resolved×claim 无三元）', claimOnResolved === 0, `moved=${String(claimOnResolved)}`)
    const financeId = psql("SELECT id FROM users WHERE username = 'finance';").trim()
    const notifiedBeforeReopen = psql(`SELECT count(*) FROM "notificationInAppMessages" WHERE "channelName" = '${ALERT_CHANNEL}' AND "userId" = ${financeId};`).trim()
    await scanAlerts()
    // The same pass's notify leg re-notifies and re-stamps notified_severity,
    // so the assertion pins status + the reopen increment (baseline + 1, the
    // column is never NULL) rather than an absolute count.
    const reopened = psql(`SELECT status || '|' || COALESCE(reopen_count::text, 'NULL') FROM wfl_alerts WHERE id = ${String(id)};`).trim()
    check('重扫重开 reopen_count=基线+1（非 NULL、非仅状态翻转）', reopened === `open|${String(reopenBaseline + 1)}`, `${reopened}（基线 ${String(reopenBaseline)}）`)
    const reNotified = psql(`SELECT count(*) FROM "notificationInAppMessages" WHERE "channelName" = '${ALERT_CHANNEL}' AND "userId" = ${financeId};`).trim()
    check('重开后重新通知 finance', Number(reNotified) > Number(notifiedBeforeReopen), `${notifiedBeforeReopen}→${reNotified}`)
    const reclaime2 = actOnAlert(id, 'claim', 'finance')
    const reclosed = actOnAlert(id, 'resolve', 'finance', 'W6-R2 断言腿：二轮关闭')
    check('二轮 认领→关闭 成功', reclaime2 === 1 && reclosed === 1, `claim=${String(reclaime2)} resolve=${String(reclosed)}`)
    // The probe stays closed (real ledger row, real state flow — not deleted).
  } else {
    check('账期预警探针行存在', false, '无 open 的 ar_overdue 行')
  }

  log('— ⑨ 预警中心两页在库（组+两 flowPage+表格块+认领意图表单+回调 workflow）')
  const routes = await listRoutes(token, 'W6B2-assert')
  check('菜单组「预警中心」', routes.some(row => row.title === '预警中心' && row.type === 'group'))
  check('页「预警列表」', routes.some(row => row.title === '预警列表' && row.type === 'flowPage'))
  check('页「预警规则」', routes.some(row => row.title === '预警规则' && row.type === 'flowPage'))
  const models = await listFlowModels(token, 'W6B2-assert')
  const alertTables = models.filter(model => model?.use === 'TableBlockModel' && String(model?.stepParams?.resourceSettings?.init?.collectionName ?? '') === 'wfl_alerts')
  check('wfl_alerts 表格块在库', alertTables.length >= 1, `${String(alertTables.length)} 块`)
  const ruleTables = models.filter(model => model?.use === 'TableBlockModel' && String(model?.stepParams?.resourceSettings?.init?.collectionName ?? '') === 'alert_rules')
  check('alert_rules 表格块在库', ruleTables.length >= 1, `${String(ruleTables.length)} 块`)
  const actForms = models.filter(model => model?.use === 'CreateFormModel' && String(model?.stepParams?.resourceSettings?.init?.collectionName ?? '') === 'wfl_alert_acts')
  check('wfl_alert_acts 认领意图表单在库', actForms.length >= 1, `${String(actForms.length)} 块`)
  const workflow = await dataOf(token, 'GET', `/api/workflows:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: ALERT_WORKFLOW_TITLE } }))}&pageSize=5`) as Array<{ enabled?: boolean }> | null
  check('认领回调 workflow 在库且启用', (workflow ?? []).some(row => row.enabled === true), `${String(workflow?.length ?? 0)} 条`)

  log('— ⑩ 单规则失败隔离（一条坏规则不中止全轮）')
  const arId = psql("SELECT id FROM alert_rules WHERE rule_type = 'ar_overdue';").trim()
  const arParams = psql("SELECT params::text FROM alert_rules WHERE rule_type = 'ar_overdue';").trim()
  const expirySeen = psql("SELECT count(*) FROM wfl_alerts WHERE rule_type = 'expiry' AND last_seen_at = CURRENT_DATE;").trim()
  psql(`UPDATE alert_rules SET params = '{"warn_days": "oops"}'::json WHERE id = ${arId};`)
  const isolated = await scanAlerts()
  check('坏规则（warn_days 非整数）被隔离为 1 条失败', isolated.failures.length === 1 && isolated.failures[0]?.rule === 'ar_overdue', isolated.failures.map(failure => `${failure.rule}:${failure.error.slice(0, 40)}`).join(' ') || 'none')
  check('其余三路仍落库（expiry last_seen_at=CURRENT_DATE）', psql("SELECT count(*) FROM wfl_alerts WHERE rule_type = 'expiry' AND last_seen_at = CURRENT_DATE;").trim() === expirySeen, `expiry=${expirySeen}`)
  const failureAudit = psql("SELECT count(*) FROM wfl_alert_scan_failures WHERE rule_type = 'ar_overdue' AND stage = 'scan' AND error LIKE '%warn_days%';").trim()
  check('失败已记 wfl_alert_scan_failures 审计行', Number(failureAudit) >= 1, `audit rows=${failureAudit}`)
  psql(`UPDATE alert_rules SET params = ${sqlLit(arParams)}::json WHERE id = ${arId};`)
  const recovered = await scanAlerts()
  check('参数复原后失败归零', recovered.failures.length === 0, recovered.failures.map(failure => failure.rule).join(',') || 'none')
}

// ─── CLI dispatch (guarded: approval-engine.mts imports this module for scanAlerts/actOnAlert) ───

async function main(): Promise<void> {
  const token = await signInWithRetry()
  if (mode === 'seed') {
    await seedRules(token)
    await ensureAlertPages(token)
    log('w6b2-rules: seed 完成（集合+渠道+四路规则+两页+认领入口）')
    return
  }
  if (mode === 'scan') {
    await scanAlerts()
    return
  }
  if (mode === 'seed-ar') {
    seedArProbe()
    return
  }
  if (mode === 'act') {
    const id = Number(args[args.indexOf('--act') + 1] ?? '0')
    const action = String(args[args.indexOf('--act') + 2] ?? '')
    const user = String(args[args.indexOf('--act') + 3] ?? '')
    if (!Number.isInteger(id) || id <= 0 || !['claim', 'ack', 'resolve'].includes(action) || user === '') {
      throw new Error('用法：--act <id> claim|ack|resolve <user> [note]')
    }
    const moved = actOnAlert(id, action as 'claim' | 'ack' | 'resolve', user, args.slice(args.indexOf('--act') + 4).join(' '))
    if (moved === 0) throw new Error(`动作未生效（id=${String(id)} action=${action} user=${user}）——白名单拒绝或状态不匹配`)
    log(`w6b2-rules: act ok (id=${String(id)} ${action} by ${user})`)
    return
  }
  // --assert: the acceptance matrix.
  log('w6b2-rules: assert（验收断言矩阵——首次环境先 --seed --seed-ar）')
  const seeded = psql('SELECT count(*) FROM alert_rules;').trim()
  if (seeded === '0') {
    throw new Error('alert_rules 为空——先跑 --seed --seed-ar 再 --assert')
  }
  await assertLegs(token)
  if (failures.length > 0) {
    throw new Error(`w6b2-rules assert 失败 ${String(failures.length)} 项：\n  - ${failures.join('\n  - ')}`)
  }
  console.log('w6b2-rules: assert 全部断言通过')
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main()
}
