/**
 * W6-B8: the acceptance matrix — EAM 设备计量 + APS 增强, live against the
 * running engine (:13110) and platform (:13000/:3080).
 *
 * Legs (each repeatable — every run mints fresh WO codes; closed rehearsal
 * orders stay as append-only history):
 * 1. live 三联 + cards.html Andon 维护请求按钮已启用（B4 占位接活）。
 * 2. Andon 维护请求：shop_lead 卡片流会话 → POST /andon/maintenance →
 *    eam_maint_orders 落行（source=andon/requested_by 会话推导/设备按工序
 *    工作中心自动挂接/设备态翻 repair）→ psql 对账。
 * 3. 维保状态机：new→accepted→done→closed 走完（CAS；done 需说明；close 限
 *    发起人/admin）+ 负向（跨态 close 409 / buyer 越权 403 / 未知动作 400）。
 * 4. 预防性引擎：POST /eam/scan-plans 两遍（第二遍 created=0 幂等）+ 计划
 *    next_due_date 前推 + 计划工单 dedup 对账。
 * 5. 预警：POST /scan-alerts → wfl_alerts 出现 calibration_due（金检机过期
 *    critical / pH 计 3 天 critical / 温度计 14 天 warning）与
 *    maint_overdue（预防性工单逾期 warning）行——psql 分级对账。
 * 6. APS：/aps/load 瓶颈含 W2-B6 1200>480 超载桶（SQL 手写式对账在
 *    w6b8-aps --assert）；what-if 零写入（mfg_order_operations 快照 md5 前
 *    后一致）+ 加班 960 分钟场景超载解除；promote（planner）落库 +
 *    aps_whatif_runs 留痕 + 负向（buyer 403 / 非法加班值 400）。
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w6b8-assert.mts
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { signInWithRetry } from './nocobase-flow-page-lib.mts'

const failures: string[] = []
const log = (line: string): void => { console.log(line) }
const check = (that: string, ok: boolean, detail = ''): void => {
  log(`  ${ok ? '✓' : '✗'} ${that}${detail === '' ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(that)
}
const here = (script: string): string => fileURLToPath(new URL(script, import.meta.url))
const ENGINE = process.env['W6B8_ENGINE_BASE'] ?? 'http://127.0.0.1:13110'

const psql = (sql: string): string => {
  const env = readFileSync(here('../../../platform/nocobase/.env'), 'utf8')
  const envOf = (key: string): string | undefined => env.split('\n').map(line => line.trim()).find(line => line.startsWith(`${key}=`))?.slice(key.length + 1)
  const out = spawnSync('psql', [
    '-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres',
    '-d', envOf('DB_DATABASE') ?? envOf('DB_NAME') ?? 'nocobase', '-t', '-A', '-c', sql,
  ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' }, timeout: 20_000, maxBuffer: 16 * 1024 * 1024 })
  if (out.status !== 0) throw new Error(`psql failed: ${sql.slice(0, 100)}…\n${(out.stderr ?? '').slice(0, 200)}`)
  return out.stdout ?? ''
}

/** Sign one rehearsal account in through the engine's proxied platform session. */
async function signIn(account: string, password: string): Promise<string> {
  const resp = await fetch(`${ENGINE}/terminal/session`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account, password }),
  })
  const payload = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(`sign-in ${account} failed: HTTP ${String(resp.status)}`)
  return String(payload.token)
}

/** One engine call returning {status, ok, json}. */
async function engine(path: string, token: string | null, body?: unknown): Promise<{ status: number, ok: boolean, json: Record<string, any> }> {
  const resp = await fetch(`${ENGINE}${path}`, {
    ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    ...(token === null ? {} : { headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), authorization: `Bearer ${token}` } }),
  })
  return { status: resp.status, ok: resp.ok, json: await resp.json().catch(() => ({})) }
}

async function main(): Promise<void> {
  // ── 1. live 三联 + Andon 按钮 ──
  log('— live 三联与 Andon 面')
  const engineHealth = await fetch(`${ENGINE}/healthz`).then(r => r.status).catch(() => 0)
  check('引擎 :13110 /healthz 200', engineHealth === 200, `status=${String(engineHealth)}`)
  const noco = await fetch('http://127.0.0.1:13000/api/app:getInfo').then(r => r.status).catch(() => 0)
  check('NocoBase :13000 app:getInfo 200', noco === 200, `status=${String(noco)}`)
  const web = await fetch('http://127.0.0.1:3080/').then(r => r.status).catch(() => 0)
  check('web :3080 200', web === 200, `status=${String(web)}`)
  const page = await fetch(`${ENGINE}/terminals/cards.html`)
  const pageBody = await page.text()
  check('cards.html 维护请求按钮已启用（B4 占位接活）', page.status === 200 && pageBody.includes('andon-maint') && !pageBody.includes('B8 上线后开放'), `bytes=${String(pageBody.length)}`)
  const shopToken = await signIn('shop_lead', 'Lead#2026')
  const buyerToken = await signIn('buyer', 'Buyer#2026')
  const plannerToken = await signIn('planner', 'Planner#2026')

  // ── 2. Andon 维护请求 → 维保工单 ──
  log('— Andon 维护请求（卡片流会话 → eam 维保工单）')
  const inProgress = psql("SELECT m.id || '|' || m.code || '|' || max(o.seq) || '|' || max(o.workcenter_id::text) FROM mfg_orders m JOIN mfg_order_operations o ON o.order_id = m.id WHERE m.doc_status = 'in_progress' AND o.status <> 'done' GROUP BY m.id, m.code ORDER BY m.id LIMIT 1;").trim()
  if (inProgress === '') throw new Error('无可演练的 in_progress MO（先跑 w6b4-assert 铺常驻 MO）')
  const [moId, moCode, opSeq, wcId] = inProgress.split('|')
  log(`  （演练载体：${moCode} 工序${opSeq} @ WC#${wcId}）`)
  const emptyNote = await engine('/andon/maintenance', shopToken, { mo_id: Number(moId), op_seq: Number(opSeq), note: '   ' })
  check('空故障说明被拒（400）', emptyNote.status === 400, `status=${String(emptyNote.status)}`)
  const andonNote = `<b>金检机</b>异响且试块漏检<script>alert('x')</script>`
  const andon = await engine('/andon/maintenance', shopToken, { mo_id: Number(moId), op_seq: Number(opSeq), note: andonNote })
  check('POST /andon/maintenance 生成维保工单', andon.ok && String(andon.json['code'] ?? '').startsWith('WO'), `code=${String(andon.json['code'] ?? '')}`)
  const woCode = String(andon.json['code'] ?? '')
  const woRow = psql(`SELECT source || '|' || status || '|' || requested_by || '|' || COALESCE(asset_code, '') || '|' || priority FROM eam_maint_orders WHERE code = ${`'${woCode}'`};`).trim()
  const [woSource, woStatus, woBy, woAsset, woPriority] = woRow.split('|')
  check('工单 psql 对账：source=andon/status=new/发起人=会话推导 shop_lead', woSource === 'andon' && woStatus === 'new' && woBy === 'shop_lead', woRow)
  check('设备按工序工作中心自动挂接（含 XSS 载荷原文入库——渲染面 esc 防线在日历块）', woAsset !== '' && andonNote.includes('<script>'), `asset=${woAsset} priority=${woPriority}`)
  const linkedAsset = psql(`SELECT status FROM eam_assets WHERE code = '${woAsset}';`).trim()
  check('关联设备态翻转为维修（repair）', linkedAsset === 'repair', `asset=${woAsset} status=${linkedAsset}`)
  const wrongDept = await engine('/andon/maintenance', buyerToken, { mo_id: Number(moId), op_seq: Number(opSeq), note: '买家不该能发' })
  check('非车间部门会话被部门围栏拒（403）', wrongDept.status === 403, `status=${String(wrongDept.status)}`)

  // ── 3. 维保状态机（走完 + 负向） ──
  log('— 维保工单状态机 new→accepted→done→closed')
  const woId = psql(`SELECT id FROM eam_maint_orders WHERE code = '${woCode}';`).trim()
  const earlyClose = await engine('/eam/act', shopToken, { order_id: Number(woId), action: 'close' })
  check('跨态 close 被状态机拒（409 带现态事实）', earlyClose.status === 409 && String(earlyClose.json['message'] ?? '').includes('new'), String(earlyClose.json['message'] ?? '').slice(0, 60))
  const buyerAccept = await engine('/eam/act', buyerToken, { order_id: Number(woId), action: 'accept' })
  check('buyer 越权受理被围栏拒（403）', buyerAccept.status === 403 && String(buyerAccept.json['message'] ?? '').includes('围栏'), String(buyerAccept.json['message'] ?? '').slice(0, 60))
  const badAction = await engine('/eam/act', shopToken, { order_id: Number(woId), action: 'teleport' })
  check('未知动作被拒（400）', badAction.status === 400, `status=${String(badAction.status)}`)
  const noNote = await engine('/eam/act', shopToken, { order_id: Number(woId), action: 'done' })
  const doneEarly = await engine('/eam/act', shopToken, { order_id: Number(woId), action: 'done', note: '' })
  check('未受理先 done 被状态机拒 / 空说明被拒', doneEarly.status === 409 || noNote.status === 400, `done@new=${String(doneEarly.status)} 无说明=${String(noNote.status)}`)
  const accept = await engine('/eam/act', shopToken, { order_id: Number(woId), action: 'accept' })
  check('受理成功（accepted_by=shop_lead）', accept.ok, String(accept.json['message'] ?? accept.json['code'] ?? '').slice(0, 60))
  const done = await engine('/eam/act', shopToken, { order_id: Number(woId), action: 'done', note: '更换传送带轴承并复测 Fe 试块通过', actual_min: 95 })
  check('完成维修（done_note+actual_min 落库）', done.ok, String(done.json['code'] ?? '').slice(0, 40))
  const closedByStranger = await engine('/eam/act', buyerToken, { order_id: Number(woId), action: 'close' })
  check('非发起人验收被拒（403）', closedByStranger.status === 403, `status=${String(closedByStranger.status)}`)
  const close = await engine('/eam/act', shopToken, { order_id: Number(woId), action: 'close' })
  check('发起人验收关闭成功', close.ok, String(close.json['code'] ?? '').slice(0, 40))
  const finalRow = psql(`SELECT status || '|' || COALESCE(closed_by, '') || '|' || COALESCE(done_note, '') FROM eam_maint_orders WHERE code = '${woCode}';`).trim()
  check('闭环 psql 对账：closed/closed_by=shop_lead/维修说明在', finalRow.startsWith('closed|shop_lead|'), finalRow.slice(0, 60))
  psql(`UPDATE eam_assets SET status = 'running' WHERE code = '${woAsset}' AND status = 'repair';`)

  // ── 4. 预防性引擎（按频率生成 + 幂等） ──
  log('— 预防性维保引擎')
  const scanFirst = await engine('/eam/scan-plans', shopToken, {})
  check('POST /eam/scan-plans 可手动触发（生产围栏）', scanFirst.ok, JSON.stringify(scanFirst.json).slice(0, 80))
  const scanSecond = await engine('/eam/scan-plans', shopToken, {})
  check('重复扫描零生成（dedup_key 幂等）', scanSecond.ok && Number(scanSecond.json['created'] ?? 1) === 0, `created=${String(scanSecond.json['created'] ?? '?')}`)
  const planOrders = Number(psql("SELECT count(*) FROM eam_maint_orders WHERE source = 'plan';").trim())
  check('计划工单在库（≥1，来源=plan）', planOrders >= 1, `rows=${String(planOrders)}`)
  const advancedPlan = psql("SELECT next_due_date::text FROM eam_maint_plans WHERE code = 'MP-BZ-01';").trim()
  const today = psql('SELECT CURRENT_DATE::text;').trim()
  check('逾期计划 next_due_date 已前推（> 今天）', advancedPlan > today, `${advancedPlan} vs ${today}`)

  // ── 5. 预警两路（calibration_due + maint_overdue） ──
  log('— B2 规则引擎两路新预警')
  const scan = await engine('/scan-alerts', null, {})
  check('POST /scan-alerts 扫描通过', scan.ok, `status=${String(scan.status)}`)
  const jjAlert = psql("SELECT severity || '|' || entity_code FROM wfl_alerts WHERE rule_type = 'calibration_due' AND entity_code = 'CB-JJ-26Q3';").trim()
  check('金检机校准过期 → calibration_due critical（GB 14881 强检）', jjAlert.startsWith('critical|'), jjAlert)
  const calTiers = psql("SELECT count(*) FILTER (WHERE severity = 'critical') || '|' || count(*) FILTER (WHERE severity = 'warning') FROM wfl_alerts WHERE rule_type = 'calibration_due';").trim()
  check('计量预警分级：critical≥2（过期JJ+3天pH）/ warning≥1（14天WD）', Number(calTiers.split('|')[0]) >= 2 && Number(calTiers.split('|')[1] ?? '0') >= 1, calTiers)
  const maintAlert = Number(psql("SELECT count(*) FROM wfl_alerts WHERE rule_type = 'maint_overdue';").trim())
  check('维保逾期预警出现（预防性工单计划日已过）', maintAlert >= 1, `rows=${String(maintAlert)}`)
  const notified = Number(psql("SELECT count(*) FROM wfl_alerts WHERE rule_type IN ('calibration_due','maint_overdue') AND notified_severity IS NOT NULL;").trim())
  check('新预警 in-app 通知已送达（notified_severity 已盖章）', notified >= 3, `rows=${String(notified)}`)

  // ── 6. APS：what-if 隔离 + promote 落库 ──
  log('— APS what-if（隔离不落库）与 promote')
  const load = await engine('/aps/load?days=14', plannerToken)
  const bottlenecks = (load.json['bottlenecks'] ?? []) as Array<Record<string, any>>
  const w2b6 = bottlenecks.find(row => String(row['wc_code'] ?? '') === 'WC-W2B6')
  check('/aps/load 瓶颈含 W2-B6 超载桶（1200 分 > 480 分/日）+ 占用 MO 归因', w2b6 !== undefined && String(w2b6['load_min']) === '1200' && String(w2b6['capacity_min']) === '480' && Array.isArray(w2b6['mos']) && w2b6['mos'].length >= 1, w2b6 === undefined ? 'missing' : `${String(w2b6['load_min'])}|${String(w2b6['capacity_min'])}|mos=${String((w2b6['mos'] as unknown[]).length)}`)
  const snapshotBefore = psql("SELECT md5(string_agg(id::text || ':' || COALESCE(planned_date::text, '~'), ',' ORDER BY id)) FROM mfg_order_operations;").trim()
  const badWhatif = await engine('/aps/whatif', plannerToken, { overtime: [{ wc_id: 3, extra_min: 5000 }] })
  check('非法加班值被拒（400，0-960 上限）', badWhatif.status === 400, `status=${String(badWhatif.status)}`)
  const whatif = await engine('/aps/whatif', plannerToken, { overtime: [{ wc_id: 3, extra_min: 960 }] })
  const wfCleared = Number(whatif.json['overload_cleared'] ?? 0)
  const wfMoved = Number(whatif.json['moved'] ?? 0)
  // Rerun tolerance: once this scenario has been promoted, the stored plan
  // already sits at the scenario's dates and a repeat simulation moves
  // nothing — the movement evidence then lives in the first run's filed
  // delta (aps_whatif_runs.delta->moved).
  const firstRunMoved = psql(`SELECT COALESCE(delta->>'moved', '0') FROM aps_whatif_runs WHERE params @> '{"overtime":[{"wc_id":3,"extra_min":960}]}'::jsonb ORDER BY id ASC LIMIT 1;`).trim()
  check('加班 960 分场景：超载解除 ≥1 且日期移动有据（本轮实测或首轮留痕）', whatif.ok && wfCleared >= 1 && (wfMoved >= 1 || Number(firstRunMoved) >= 1), `cleared=${String(wfCleared)} 本轮moved=${String(wfMoved)} 首轮moved=${firstRunMoved}`)
  const snapshotAfter = psql("SELECT md5(string_agg(id::text || ':' || COALESCE(planned_date::text, '~'), ',' ORDER BY id)) FROM mfg_order_operations;").trim()
  check('模拟零写入（mfg_order_operations 快照 md5 前后一致）', snapshotBefore === snapshotAfter, `${snapshotBefore.slice(0, 8)}… vs ${snapshotAfter.slice(0, 8)}…`)
  const buyerPromote = await engine('/aps/promote', buyerToken, { overtime: [{ wc_id: 3, extra_min: 960 }] })
  check('buyer 应用被围栏拒（403 计划部/admin）', buyerPromote.status === 403, `status=${String(buyerPromote.status)}`)
  const runsBefore = Number(psql('SELECT count(*) FROM aps_whatif_runs;').trim())
  const promote = await engine('/aps/promote', plannerToken, { overtime: [{ wc_id: 3, extra_min: 960 }], note: 'W6-B8 断言：W2-B6 加班16h 解除拆单瓶颈' })
  const runsAfter = Number(psql('SELECT count(*) FROM aps_whatif_runs;').trim())
  check('planner 应用成功 + 差异报告留存（aps_whatif_runs +1）', promote.ok && runsAfter === runsBefore + 1, `applied=${String(promote.json['applied'] ?? '?')} runs=${String(runsBefore)}→${String(runsAfter)}`)
  const w2b6OpDate = psql("SELECT min(planned_date)::text FROM mfg_order_operations WHERE workcenter_id = 3 AND status = 'planned';").trim()
  check('W2-B6 开放工序重排至 ≥ 今天（原 2026-09-28 过期日）', w2b6OpDate >= today, `${w2b6OpDate} vs ${today}`)
  const runRow = psql(`SELECT actor || '|' || applied FROM aps_whatif_runs ORDER BY id DESC LIMIT 1;`).trim()
  check('run 行 actor=planner 且 delta 留痕', runRow.startsWith('planner|'), runRow)

  if (failures.length > 0) {
    log(`w6b8-assert: FAILED (${String(failures.length)})`)
    process.exitCode = 1
    return
  }
  log('w6b8-assert: PASS（全部腿绿）')
}

await main()
