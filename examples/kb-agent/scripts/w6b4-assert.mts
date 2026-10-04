/**
 * W6-B4: the acceptance matrix — 车间卡片流 + CCP 监控 + BOM 版本/ECO.
 *
 * Legs (each idempotent per run via fresh submit_keys / version ladder):
 * 1. live 三联 + cards.html served + session identity (shop_lead → 生产车间).
 * 2. card flow: queue → job-start → job-report (normal CCP) — psql 对账
 *    mfg_job_reports.operator = session-derived shop_lead, op status advance,
 *    CCP record trail (who/when/measured/limits).
 * 3. double-tap replay: same submit_key twice → exactly one row (count=1).
 * 4. CCP deviation: out-of-CL reading → wfl_alerts critical row + in-app
 *    notification to the rule's route + lot frozen + 纠偏单 (qm_nc_dispositions).
 * 5. BOM version/ECO: baseline default → planner /eco/create (impact lists
 *    in-progress MO + undelivered SO) → /eco/submit → qc_inspector approve →
 *    engine applyEco switches the pair → new MO (created on the new default)
 *    references vN+1 while the in-progress MO keeps vN (psql 三查).
 * 6. negatives: XSS-flavored submit_key refused; wrong-department session on
 *    /terminal/cards (qc_inspector) 403; shop_lead on /eco/create 403.
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w6b4-assert.mts
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dataOf, signInWithRetry } from './nocobase-flow-page-lib.mts'

const failures: string[] = []
const log = (line: string): void => { console.log(line) }
const check = (that: string, ok: boolean, detail = ''): void => {
  log(`  ${ok ? '✓' : '✗'} ${that}${detail === '' ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(that)
}
const here = (script: string): string => fileURLToPath(new URL(script, import.meta.url))
const run = Date.now().toString(36)
const ENGINE = process.env['W6B4_ENGINE_BASE'] ?? 'http://127.0.0.1:13110'

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
  // ── 1. live 三联 + 终端页 + 会话身份 ──
  log('— live 三联与终端面')
  const engineHealth = await fetch(`${ENGINE}/healthz`).then(r => r.status).catch(() => 0)
  check('引擎 :13110 /healthz 200', engineHealth === 200, `status=${String(engineHealth)}`)
  const noco = await fetch('http://127.0.0.1:13000/api/app:getInfo').then(r => r.status).catch(() => 0)
  check('NocoBase :13000 app:getInfo 200', noco === 200, `status=${String(noco)}`)
  const web = await fetch('http://127.0.0.1:3080/').then(r => r.status).catch(() => 0)
  check('web :3080 200', web === 200, `status=${String(web)}`)
  const page = await fetch(`${ENGINE}/terminals/cards.html`)
  const pageBody = await page.text()
  check('GET /terminals/cards.html 200 且含签到面板与卡片流', page.status === 200 && pageBody.includes('操作工签到') && pageBody.includes('车间卡片流终端'))
  const badLogin = await engine('/terminal/session', null, { account: 'shop_lead', password: 'wrong-password' })
  check('错误密码被平台会话拒绝（401）', badLogin.status === 401, `status=${String(badLogin.status)}`)
  const shopToken = await signIn('shop_lead', 'Lead#2026')
  check('shop_lead 会话签到成功（B0 真实账号）', shopToken.length > 50, `token ${String(shopToken.length)} chars`)
  const svcToken = await signInWithRetry()

  // ── 2. 卡片流：队列 → 开工 → 报工（正常 CCP） ──
  log('— 车间卡片流（队列→执行→报工）')
  const cards = await engine('/terminal/cards', shopToken)
  check('GET /terminal/cards 会话推导 operator=shop_lead', cards.ok && cards.json['operator'] === 'shop_lead', `operator=${String(cards.json['operator'])}`)
  const dept = String(cards.json['department'] ?? '')
  check('签到面板显示部门围栏（生产车间）', dept === '生产车间', `department=${dept}`)
  // The card-flow legs run on a dedicated, rebuildable in-progress MO
  // (MO-W6B4-FLOW on BOM-0003 v1 — the original version snapshot), so every
  // assert run reports against open operations instead of exhausting a demo MO.
  const flowMoCode = 'MO-W6B4-FLOW'
  const flowMoRow = (await dataOf(svcToken, 'GET', `/api/mfg_orders:list?filter=${encodeURIComponent(JSON.stringify({ code: { $eq: flowMoCode } }))}&pageSize=5`) as Array<Record<string, any>> | null ?? [])[0]
  if (flowMoRow === undefined) {
    const created = await dataOf(svcToken, 'POST', '/api/mfg_orders:create', {
      code: flowMoCode, qty: 6000, need_date: psql('SELECT CURRENT_DATE + 14;').trim(),
      doc_status: 'in_progress', product: { id: 11 }, bom: { id: 3 },
      remark: 'w6b4-assert 卡片流演练常驻 MO（工序重跑可重置）',
    })
    const bomOps = (await dataOf(svcToken, 'GET', '/api/mfg_bom_operations:list?pageSize=100') as Array<Record<string, any>> | null ?? []).filter(row => Number(row['bom_id']) === 3).sort((a, b) => Number(a['seq']) - Number(b['seq']))
    for (const op of bomOps) {
      await dataOf(svcToken, 'POST', '/api/mfg_order_operations:create', {
        order: { id: Number(created?.['id']) }, seq: Number(op['seq']), name: String(op['name'] ?? ''),
        planned_date: psql('SELECT CURRENT_DATE;').trim(), planned_min: Number(op['setup_min'] ?? 0) + Number(op['run_min'] ?? 0),
        status: 'planned', workcenter: { id: Number(op['workcenter_id']) },
      })
    }
    log(`  （常驻演练 MO ${flowMoCode} 已建：${String(bomOps.length)} 工序 planned）`)
  }
  let cards2 = await engine('/terminal/cards', shopToken)
  let moCard = (cards2.json['cards'] as Array<Record<string, any>>).find(card => String(card['mo']?.['code']) === flowMoCode)
  if (moCard === undefined) throw new Error(`${flowMoCode} not in card queue (need in_progress)`)
  const flowRemaining = (): number => (moCard['operations'] as Array<Record<string, any>>).reduce((sum, op) => sum + Number(op['remaining'] ?? 0), 0)
  const flowHasOpen = (): boolean => (moCard['operations'] as Array<Record<string, any>>).some(op => op['status'] !== 'done')
  // Op-level exhaustion guard: the engine's three-number equation closes per
  // operation cycle, so an open op sitting at remaining < 3 breaks the
  // good/pending/scrap construction below (good is floored at 1) even while
  // the MO-level sum still clears 50 — deepen the reset trigger to the op.
  const flowHasStarvedOp = (): boolean => (moCard['operations'] as Array<Record<string, any>>).some(op => op['status'] !== 'done' && Number(op['remaining'] ?? 0) < 3)
  if (flowRemaining() < 50 || !flowHasOpen() || flowHasStarvedOp()) {
    // Deep reset: the rehearsal MO's posted reports are rehearsal data too —
    // remove them (plus their CCP records) and re-plan the operations, so the
    // card-flow legs always run against a full cycle plan.
    const flowId = Number(moCard['mo']['id'])
    psql(`DELETE FROM mfg_ccp_records WHERE mo_id = ${String(flowId)};`)
    psql(`DELETE FROM mfg_job_reports WHERE mo_id = ${String(flowId)};`)
    psql(`UPDATE mfg_order_operations SET status = 'planned' WHERE order_id = ${String(flowId)};`)
    cards2 = await engine('/terminal/cards', shopToken)
    moCard = (cards2.json['cards'] as Array<Record<string, any>>).find(card => String(card['mo']?.['code']) === flowMoCode)!
    log('  （常驻演练 MO 余量耗尽——已深重置：删演练报工/CCP 行+工序 re-plan）')
  }
  const ops = moCard['operations'] as Array<Record<string, any>>
  const openOps = ops.filter(op => op['status'] !== 'done')
  const op1 = openOps[0]!
  const op2 = openOps.find(op => Number(op['seq']) !== Number(op1['seq'])) ?? openOps[0]!
  check('卡片含 SOP 要点数据（setup/run 分钟）', Number(op1['setup_min']) >= 0 && Number(op1['run_min']) >= 0, `op1 setup=${String(op1['setup_min'])} run=${String(op1['run_min'])}`)
  const ccpOfOp1 = op1['ccp'] as Array<Record<string, any>>
  const ccpOfOp2 = op2['ccp'] as Array<Record<string, any>>
  check('工序按配置挂 CCP 监控点（和馅→XT、成型速冻→SD）', ccpOfOp1.length >= 1 && ccpOfOp2.length >= 1, `op1 ccp=${String(ccpOfOp1.length)} op2 ccp=${String(ccpOfOp2.length)}`)
  const ccpPoint = (op: Record<string, any>) => ((op['ccp'] as Array<Record<string, any>>)[0] ?? undefined)
  const xtPoint = ccpPoint(op1)
  const sdPoint = ccpPoint(op2)
  if (xtPoint === undefined || sdPoint === undefined) throw new Error('no CCP point scoped to the open operations (seed mfg_ccp_points first)')
  const inBand = (point: Record<string, any>): number => {
    const min = point['cl_min'] === null ? null : Number(point['cl_min'])
    const max = point['cl_max'] === null ? null : Number(point['cl_max'])
    return min !== null && max !== null ? (min + max) / 2 : min !== null ? min : (max ?? 0) / 2
  }
  const outOfBand = (point: Record<string, any>): number => {
    const min = point['cl_min'] === null ? null : Number(point['cl_min'])
    const max = point['cl_max'] === null ? null : Number(point['cl_max'])
    return min !== null ? min - 10 : (max ?? 0) + 10
  }
  const start2 = await engine('/job-start', shopToken, { mo_id: Number(moCard['mo']['id']), op_seq: Number(op2['seq']) })
  check('POST /job-start planned→started（或已 started 幂等）', start2.ok && ['started'].includes(String(start2.json['op_status'])), `op_status=${String(start2.json['op_status'])}`)
  const remaining1 = Number(op1['remaining'])
  const good1 = Math.max(1, Math.floor(remaining1 / 3))
  const pending1 = remaining1 - good1 - 1
  const key1 = `w6b4:${run}:op1:normal`
  const report1 = await engine('/job-report', shopToken, {
    mo_id: Number(moCard['mo']['id']), op_seq: Number(op1['seq']),
    qty_good: good1, qty_pending: pending1, qty_scrap: 1,
    ccp: [{ point_id: Number(xtPoint['point_id']), value: inBand(xtPoint) }],
    submit_key: key1,
  })
  check('正常 CCP 报工受理（服务端发号 JR-）', report1.ok && String(report1.json['code']).startsWith('JR-'), `code=${String(report1.json['code'])}`)
  check('报工后工序状态推进（started，余量续报）', String(report1.json['op_status']) === 'started', `op_status=${String(report1.json['op_status'])}`)
  const jrRow = psql(`SELECT operator || '|' || qty_good || '|' || status FROM mfg_job_reports WHERE submit_key = '${key1}';`).trim()
  check('mfg_job_reports 落行：operator=会话推导 shop_lead（非自报）', jrRow.startsWith('shop_lead|'), jrRow)
  const ccpRow = psql(`SELECT operator || '|' || measured || '|' || deviation FROM mfg_ccp_records WHERE submit_key = '${key1}';`).trim()
  check('CCP 正常值留痕（谁/实测/限值/未越限）', /^shop_lead\|[-\d.]+\|false$/.test(ccpRow), ccpRow)
  const ccpSnapshot = psql(`SELECT COALESCE(cl_min::text, '−∞') || '..' || COALESCE(cl_max::text, '+∞') FROM mfg_ccp_records WHERE submit_key = '${key1}';`).trim()
  check(`CCP 记录含限值快照（CL ${ccpSnapshot}）`, ccpSnapshot.includes('..'), ccpSnapshot)

  // ── 3. 双击/重放幂等 ──
  log('— 报工双击/重复幂等')
  const replay = await engine('/job-report', shopToken, {
    mo_id: Number(moCard['mo']['id']), op_seq: Number(op1['seq']),
    qty_good: good1, qty_pending: pending1, qty_scrap: 1,
    ccp: [{ point_id: Number(xtPoint['point_id']), value: inBand(xtPoint) }],
    submit_key: key1,
  })
  check('同一 submit_key 重放返回 duplicate=true 且同 code', replay.ok && replay.json['duplicate'] === true && replay.json['code'] === report1.json['code'], `duplicate=${String(replay.json['duplicate'])} code=${String(replay.json['code'])}`)
  const jrCount = psql(`SELECT count(*) FROM mfg_job_reports WHERE submit_key = '${key1}';`).trim()
  check('psql 对账：该 submit_key 报工行 count=1', jrCount === '1', `count=${jrCount}`)
  const ccpCount = psql(`SELECT count(*) FROM mfg_ccp_records WHERE submit_key = '${key1}';`).trim()
  check('psql 对账：CCP 记录同样 count=1', ccpCount === '1', `count=${ccpCount}`)

  // ── 4. CCP 越限 → B2 预警 + 批次冻结 + 纠偏单 ──
  log('— CCP 越限链（预警/冻结/纠偏单）')
  // The normal leg moved the operation's remaining (pending carried) — refetch
  // the queue so the deviation equation targets the live cycle plan.
  const cardsDev = await engine('/terminal/cards', shopToken)
  const moDev = (cardsDev.json['cards'] as Array<Record<string, any>>).find(card => String(card['mo']?.['code']) === flowMoCode)
  if (moDev === undefined) throw new Error(`${flowMoCode} vanished from the queue`)
  const openDev = (moDev['operations'] as Array<Record<string, any>>).filter(op => op['status'] !== 'done' && (op['ccp'] as Array<unknown>).length > 0)
  const devOp = openDev[0] ?? moCard['operations'].filter((op: Record<string, any>) => (op['ccp'] as Array<unknown>).length > 0).pop() as Record<string, any>
  const sdPoint2 = (devOp['ccp'] as Array<Record<string, any>>)[0]!
  const lotNo = 'FRZ-260414-01'
  const lotBefore = psql(`SELECT status FROM wms_lots WHERE lot_no = '${lotNo}';`).trim()
  const key2 = `w6b4:${run}:op2:deviation`
  const remaining2 = Number(devOp['remaining'])
  const good2 = Math.max(1, Math.floor(remaining2 / 4))
  const report2 = await engine('/job-report', shopToken, {
    mo_id: Number(moCard['mo']['id']), op_seq: Number(devOp['seq']),
    qty_good: good2, qty_pending: remaining2 - good2 - 2, qty_scrap: 2,
    lot_no: lotNo,
    ccp: [{ point_id: Number(sdPoint2['point_id']), value: outOfBand(sdPoint2), action_taken: '停机调温，本时段产品隔离复测中心温度（w6b4-assert 演练）' }],
    submit_key: key2,
  })
  check('越限报工仍受理（记录留痕优先，处置联动随行）', report2.ok, `code=${String(report2.json['code'])}`)
  const ccp2 = report2.json['ccp'] ?? {}
  check('响应声明 critical 预警路由 + 冻结 + 纠偏单', ccp2['lot_frozen'] === true && typeof ccp2['nc_code'] === 'string' && ccp2['alert_rule'] === 'ccp_deviation(critical)', JSON.stringify(ccp2).slice(0, 160))
  const alertRow = psql(`SELECT severity || '|' || status FROM wfl_alerts WHERE dedup_key = (SELECT 'ccp_deviation:mfg_ccp_records:' || id FROM mfg_ccp_records WHERE submit_key = '${key2}' LIMIT 1);`).trim()
  check('wfl_alerts 落行：rule_type=ccp_deviation severity=critical status=open', alertRow === 'critical|open', alertRow)
  const notified = psql(`SELECT count(*) FROM "notificationInAppMessages" m JOIN users u ON u.id = m."userId" WHERE m.content LIKE '%CCP越限%${String(sdPoint2['name'])}%' AND u.username IN ('qc_inspector', 'quality_lead', 'planner');`).trim()
  check('in-app 通知送达规则路由（质检部+planner ≥3 行）', Number(notified) >= 3, `rows=${notified}`)
  const lotAfter = psql(`SELECT status FROM wms_lots WHERE lot_no = '${lotNo}';`).trim()
  check(`批次冻结联动（${lotNo}: ${lotBefore}→frozen）`, lotAfter === 'frozen', lotAfter)
  const ncRow = psql(`SELECT code || '|' || status FROM qm_nc_dispositions WHERE ref_no = '${flowMoCode}#op${String(Number(devOp['seq']))}' ORDER BY id DESC LIMIT 1;`).trim()
  check('纠偏单生成（qm_nc_dispositions draft/open）', ncRow.endsWith('|open'), ncRow)
  // 演练数据可识别可清理：本腿冻结的批次恢复 qualified（预警/记录/纠偏单留作台账证据）。
  psql(`UPDATE wms_lots SET status = 'qualified' WHERE lot_no = '${lotNo}' AND status = 'frozen';`)
  log(`  （演练清理：${lotNo} 已恢复 qualified；预警/CCP 记录/纠偏单留台账）`)

  // ── 5. BOM 版本 / ECO ──
  log('— BOM 版本化 + ECO（版本快照）')
  const plannerToken = await signIn('planner', 'Planner#2026')
  const baseDefault = psql("SELECT id || '|' || code || '|' || version FROM mfg_boms WHERE product_id = 11 AND bom_status = 'active' AND is_default = TRUE;").trim()
  const [baseId, baseCode, baseVersion] = baseDefault.split('|')
  check('基线：product11 生效默认版本在位', baseDefault !== '', `${baseCode} v${baseVersion}`)
  // The in-production MO the impact panel must list: one approved 演练 MO
  // riding the CURRENT default (the engine's impact scope = approved/
  // released/in_progress), deleted again in this leg's cleanup.
  const impMoCode = `MO-W6B4-IMP-${run.toUpperCase()}`
  const impMo = await dataOf(svcToken, 'POST', '/api/mfg_orders:create', {
    code: impMoCode, qty: 300, need_date: psql('SELECT CURRENT_DATE + 10;').trim(),
    doc_status: 'approved', product: { id: 11 }, bom: { id: Number(baseId) },
    remark: `w6b4-assert ${run} 影响分析演练 MO（可识别可清理）`,
  })
  const baseLinePids = new Set(psql(`SELECT string_agg(DISTINCT product_id::text, ',') FROM mfg_bom_lines WHERE bom_id = ${baseId};`).trim().split(',').filter(v => v !== ''))
  const allPids = psql('SELECT string_agg(id::text, chr(44)) FROM hub_inv_products;').trim().split(',').filter(v => v !== '').map(Number).sort((a, b) => a - b)
  const addPid = allPids.find(pid => !baseLinePids.has(String(pid)))
  if (addPid === undefined) throw new Error('no candidate add-product left for the ECO demo line')
  const ecoTitle = `荠菜猪肉水饺配方调整（w6b4-assert ${run}）`
  const ecoResp = await engine('/eco/create', plannerToken, {
    product_id: 11, title: ecoTitle, reason: 'assert 演练：下调荠菜用量并新增调味原料（演练单，可识别）',
    line_changes: [{ action: 'update', product_id: 36, qty_per_unit: 0.07 }, { action: 'add', product_id: addPid, qty_per_unit: 0.01, uom: '克' }],
  })
  check('planner /eco/create 受理（服务端发号 ECO-）', ecoResp.ok && String(ecoResp.json['eco_code']).startsWith('ECO-'), `eco=${String(ecoResp.json['eco_code'])}`)
  const impact = ecoResp.json['impact'] ?? {}
  const impactMos = (impact['in_progress_mos'] as Array<Record<string, any>> ?? []).map(row => String(row['code']))
  const impactSos = (impact['undelivered_sos'] as Array<Record<string, any>> ?? []).map(row => String(row['code']))
  check(`影响分析列出受影响在产 MO（${impMoCode} 在列）`, impactMos.includes(impMoCode), impactMos.join('、'))
  check('影响分析列出受影响未交付 SO（SO-2026-0002/0092 在列）', impactSos.includes('SO-2026-0002') && impactSos.includes('SO-2026-0092'), impactSos.join('、'))
  const ecoCode = String(ecoResp.json['eco_code'])
  const submitResp = await engine('/eco/submit', plannerToken, { eco_code: ecoCode })
  check('planner /eco/submit 送审（draft→pending）', submitResp.ok && String(submitResp.json['doc_status']) === 'pending', `doc_status=${String(submitResp.json['doc_status'])}`)
  const qcToken = await signIn('qc_inspector', 'Qc#2026')
  const ecoId = Number(ecoResp.json['eco_id'])
  const actResp = await engine('/act', null, { doc_type: 'mfg_ecos', doc_id: ecoId, action: 'approve', approver: 'qc_inspector', comment: `w6b4-assert ${run} 同意` })
  const effects = actResp.json['effects'] ?? {}
  check('qc_inspector 审批通过且 effectiveEffects 触发版本切换', actResp.ok && effects['eco']?.['switched'] === true, JSON.stringify(effects).slice(0, 140))
  const toBomId = psql(`SELECT to_bom_id FROM mfg_ecos WHERE code = '${ecoCode}';`).trim()
  const pair = psql(`SELECT bom_status || '|' || is_default FROM mfg_boms WHERE id IN (${baseId}, ${toBomId}) ORDER BY id;`).split('\n').map(line => line.trim()).filter(line => line !== '')
  check('psql 三查①旧版 retired/非默认 ②新版 active/默认', pair.length === 2 && pair[0] === 'retired|false' && pair[1] === 'active|true', pair.join(' ; '))
  const ecoRow = psql(`SELECT doc_status || '|' || approved_by || '|' || effective_at FROM mfg_ecos WHERE code = '${ecoCode}';`).trim()
  // The stamp anchors on the engine's UTC today; between 00:00-08:00 Asia/Shanghai
  // that legitimately differs from PG's CURRENT_DATE — accept either anchor.
  const ecoToday = psql('SELECT CURRENT_DATE;').trim()
  const ecoUtcToday = new Date().toISOString().slice(0, 10)
  check('ECO 行：approved + qc_inspector + effective_at 盖章', ecoRow === `approved|qc_inspector|${ecoToday}` || ecoRow === `approved|qc_inspector|${ecoUtcToday}`, ecoRow)
  const newDefault = psql("SELECT id FROM mfg_boms WHERE product_id = 11 AND bom_status = 'active' AND is_default = TRUE;").trim()
  check('psql 三查③新 MO 将引用新默认版本', newDefault === toBomId, `default ${baseId}→${newDefault}`)
  const newMoCode = `MO-W6B4-${run.toUpperCase()}`
  const moCreate = await dataOf(svcToken, 'POST', '/api/mfg_orders:create', {
    code: newMoCode, qty: 100, need_date: psql('SELECT CURRENT_DATE + 7;').trim(),
    doc_status: 'draft', product: { id: 11 }, bom: { id: Number(newDefault) },
    remark: `w6b4-assert ${run} 新版本引用演练（可识别可清理）`,
  })
  check('新 MO 创建引用新默认 BOM', Number(moCreate?.['bom_id']) === Number(newDefault), `bom_id=${String(moCreate?.['bom_id'])} default=${newDefault}`)
  const inprog = psql(`SELECT bom_id FROM mfg_orders WHERE code = '${impMoCode}';`).trim()
  check(`在产 ${impMoCode} 仍引用旧版本（版本快照）`, inprog === baseId, `bom_id=${inprog} (base=${baseId})`)
  const legacy = psql('SELECT bom_id FROM mfg_orders WHERE id = 2;').trim()
  check('历史在产 MO-2026-0002 的 bom_id 原样未动（快照不被切换触碰）', legacy === '3', `bom_id=${legacy}`)
  const diffCheck = psql(`SELECT count(*) FROM mfg_bom_lines l JOIN mfg_boms b ON b.id = l.bom_id WHERE b.id = ${newDefault} AND l.product_id = ${String(addPid)};`).trim()
  check('新版本行变更落库（新增行存在——diff 蓝行的 psql 对账）', diffCheck === '1', `rows=${diffCheck}`)
  const updCheck = psql(`SELECT qty_per_unit FROM mfg_bom_lines l JOIN mfg_boms b ON b.id = l.bom_id WHERE b.id = ${newDefault} AND l.product_id = 36;`).trim()
  check('新版本用量变更落库（→0.07）', updCheck === '0.07', updCheck)
  // 演练清理：演练 MO 删除（可识别可清理），ECO 与版本切换留作台账证据。
  // W6-B10 re-runnability: each published demo ECO permanently widened the
  // base line and exhausted later runs' add-candidates (run 26 ran out);
  // after the switch checks read, revert the default to the pre-ECO version
  // and withdraw the demo ECO so every run starts from the same baseline.
  psql(`UPDATE mfg_boms SET is_default = TRUE, bom_status = 'active' WHERE id = ${baseId};`)
  psql(`UPDATE mfg_boms SET is_default = FALSE, bom_status = 'retired' WHERE id = ${toBomId};`)
  psql(`DELETE FROM mfg_ecos WHERE id = ${String(ecoId)};`)
  log(`  （演练撤收：默认版本回滚 ${toBomId}→${baseId}，演练 ECO ${ecoCode} 删除——候选不再耗尽）`)
  await dataOf(svcToken, 'POST', `/api/mfg_orders:destroy?filterByTk=${String(moCreate?.['id'])}`, {})
  await dataOf(svcToken, 'POST', `/api/mfg_orders:destroy?filterByTk=${String(impMo?.['id'])}`, {})
  log('  （演练清理：两张演练 MO 已删除；ECO/版本切换/JR/CCP 台账保留）')

  // ── 6. 负向（XSS / 越权） ──
  log('— 负向用例（XSS/越权）')
  const xssKey = `w6b4:<script>alert(1)</script>`
  const xss = await engine('/job-report', shopToken, { mo_id: 2, op_seq: 1, qty_good: 0, qty_pending: 0, qty_scrap: 0, submit_key: xssKey })
  check('XSS 味 submit_key 被字符集门禁拒绝（400，未达 SQL）', xss.status === 400 && String(xss.json['error'] ?? '').includes('submit_key'), `status=${String(xss.status)}`)
  const noKey = await engine('/job-report', shopToken, { mo_id: 2, op_seq: 1, qty_good: 0, qty_pending: 0, qty_scrap: 0 })
  check('缺 submit_key 拒绝（幂等键必填）', noKey.status === 400, `status=${String(noKey.status)}`)
  const qcOnCards = await engine('/terminal/cards', qcToken)
  check('质检会话进车间卡片流被部门围栏拒绝（403）', qcOnCards.status === 403, `status=${String(qcOnCards.status)}`)
  const shopOnEco = await engine('/eco/create', shopToken, { product_id: 11, title: '越权尝试', reason: 'shop_lead 不应能发起 ECO', line_changes: [] })
  check('shop_lead 发起 ECO 被治理面围栏拒绝（403）', shopOnEco.status === 403, `status=${String(shopOnEco.status)}`)
  const anonymous = await engine('/terminal/cards', null)
  check('无会话访问执行面被拒（401，身份不可缺省）', anonymous.status === 401, `status=${String(anonymous.status)}`)

  if (failures.length > 0) {
    log(`w6b4-assert: FAILED (${String(failures.length)})`)
    process.exitCode = 1
    return
  }
  log('w6b4-assert: ALL PASS')
}

await main()
