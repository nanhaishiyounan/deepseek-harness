/**
 * The W6-B5 inspection-workbench server leg (the engine's /insp/* handlers
 * import this): the grouped pending queue, the AQL plan lookup that rides the
 * W2 qm_aql_plans seed verbatim (never a re-typed sampling table), the
 * idempotent verdict submit, the four-way NC disposal wrapper, and the
 * nine-element factory-inspection report (GB-published 沪市监食监〔2025〕195号
 * element list) with explicit 「未维护」 placeholders — a missing element is a
 * data-quality signal, never a silently dropped row.
 *
 * Identity: every write route takes the session-derived actor (the engine's
 * recallActor → auth:check); self-reported operators are refused. The
 * quality-department fence (质检部 + admin) is applied by the engine route
 * layer before these functions run.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { LOT_BANDS } from '../../scripts/nocobase-w8-quality.mts'
import { createNc, disposeNc, inspectInspection } from '../../scripts/nocobase-h5-wms.mts'

const psql = (sql: string): string => {
  const env = readFileSync(fileURLToPath(new URL('../../../../platform/nocobase/.env', import.meta.url)), 'utf8')
  const envOf = (key: string): string | undefined => env.split('\n').map(line => line.trim()).find(line => line.startsWith(`${key}=`))?.slice(key.length + 1)
  const run = spawnSync('psql', [
    '-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres',
    '-d', envOf('DB_DATABASE') ?? envOf('DB_NAME') ?? 'nocobase', '-t', '-A', '-c', sql,
  ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' }, timeout: 20_000, maxBuffer: 16 * 1024 * 1024 })
  if (run.status !== 0) throw new Error(`psql failed: ${sql.slice(0, 120)}…\n${(run.stderr ?? '').slice(0, 300)}`)
  return run.stdout ?? ''
}

const sqlLit = (value: string): string => `'${value.replaceAll("'", "''")}'`

/** HTML-escape every dynamic text the report and the SPA render (the labels esc posture). */
export const esc = (text: string): string => text
  .replaceAll('&', '\u0026amp;').replaceAll('<', '\u0026lt;').replaceAll('>', '\u0026gt;').replaceAll('"', '\u0026quot;').replaceAll("'", '\u0026#39;')

/** The AQL rungs the W2 seed carries (kept in one place with inspectInspection's guard). */
export const AQL_RUNGS: ReadonlyArray<string> = ['0.65', '1.0', '1.5', '2.5', '4.0']

// ─── the queue ───

/** One pending inspection card the workbench queue shows. */
export interface InspCard {
  readonly code: string
  readonly insp_type: string
  readonly ref_type: string
  readonly ref_no: string
  readonly product: string
  readonly supplier: string | null
  readonly lot_no: string
  readonly lot_qty: number
  readonly overdue_hours: number | null
  readonly issued_at: string | null
}

/** One judged inspection the已完成 tab lists (the late-sign entry for quality_lead). */
export interface InspDone {
  readonly code: string
  readonly insp_type: string
  readonly product: string
  readonly lot_no: string
  readonly result: string
  readonly inspected_at: string
  readonly report_no: string
}

/** The queue answer: three pending groups + the judged tail + the operator echo. */
export interface InspQueue {
  readonly groups: ReadonlyArray<{ key: string; label: string; cards: ReadonlyArray<InspCard>; overdue: number }>
  readonly counts: Readonly<Record<string, number>>
  readonly done: ReadonlyArray<InspDone>
}

const GROUP_LABELS: Readonly<Record<string, string>> = {
  IQC: '来料检验 IQC', IPQC: '过程检验 IPQC', OQC: '成品出厂 FQC（OQC）',
}

/**
 * The grouped pending queue: status=pending ∧ result=pending, grouped by
 * insp_type (IQC/IPQC/OQC; an unexpected type lands in its own group rather
 * than vanishing). IQC cards carry overdue hours from the receipt's
 * received_at (48h SLA highlight); other types have no anchor date and stay
 * null. Numbers join product/supplier names so the card needs no second call.
 * @returns the three groups with cards and per-group overdue counts.
 */
export function inspQueue(): InspQueue {
  const rows = psql(`SELECT i.code, COALESCE(i.insp_type,''), COALESCE(i.ref_type,''), COALESCE(i.ref_no,''), COALESCE(p.name,''), COALESCE(s.name,''), COALESCE(i.lot_no,''), COALESCE(i.lot_qty,0), COALESCE(r.received_at::text,''), i.inspected_at
FROM qm_inspections i
LEFT JOIN hub_inv_products p ON p.id = i.product_id
LEFT JOIN srm_suppliers s ON s.id = i.supplier_id
LEFT JOIN wms_receipts r ON r.receipt_no = i.ref_no AND i.insp_type = 'IQC'
WHERE i.status = 'pending' AND i.result = 'pending'
ORDER BY i.id;`)
    .split('\n').map(line => line.trim()).filter(line => line !== '')
  const cards: InspCard[] = rows.map((line) => {
    const parts = line.split('|')
    const code = parts[0] ?? '', inspType = parts[1] ?? '', refType = parts[2] ?? '', refNo = parts[3] ?? ''
    const product = parts[4] ?? '', supplier = parts[5] ?? '', lotNo = parts[6] ?? '', lotQty = parts[7] ?? '0'
    const receivedAt = parts[8] ?? ''
    let overdueHours: number | null = null
    if (String(inspType) === 'IQC' && String(receivedAt) !== '') {
      const hours = psql(`SELECT round(EXTRACT(EPOCH FROM (now() - ${sqlLit(String(receivedAt))}::timestamp)) / 3600)::int;`).trim()
      const parsed = Number(hours)
      if (Number.isFinite(parsed)) overdueHours = parsed
    }
    return {
      code: String(code), insp_type: String(inspType), ref_type: String(refType), ref_no: String(refNo),
      product: String(product), supplier: String(supplier) === '' ? null : String(supplier),
      lot_no: String(lotNo), lot_qty: Number(lotQty), overdue_hours: overdueHours,
      issued_at: String(receivedAt) === '' ? null : String(receivedAt),
    }
  })
  const keys = [...new Set(cards.map(card => card.insp_type))]
  const groups = keys.map(key => ({
    key, label: GROUP_LABELS[key] ?? `其他 ${key}`,
    cards: cards.filter(card => card.insp_type === key),
    overdue: cards.filter(card => card.insp_type === key && (card.overdue_hours ?? 0) > 48).length,
  }))
  const counts: Record<string, number> = {}
  for (const group of groups) counts[group.key] = group.cards.length
  // The judged tail (newest 30): the history FQC's only route to its report
  // used to be the result page — the已完成 tab gives quality_lead the late
  // sign-off entry (failed rows can preview but not issue; the server fence
  // stays authoritative).
  const doneRows = psql(`SELECT i.code, COALESCE(i.insp_type,''), COALESCE(p.name,''), COALESCE(i.lot_no,''), COALESCE(i.result,''), COALESCE(i.inspected_at::text,''), COALESCE(r.report_no,'')
FROM qm_inspections i
LEFT JOIN hub_inv_products p ON p.id = i.product_id
LEFT JOIN qm_factory_reports r ON r.inspection_code = i.code
WHERE i.result IN ('passed','failed','concession')
ORDER BY i.inspected_at DESC NULLS LAST, i.id DESC LIMIT 30;`)
    .split('\n').map(line => line.trim()).filter(line => line !== '')
  const done: InspDone[] = doneRows.map((line) => {
    const parts = line.split('|')
    return {
      code: String(parts[0] ?? ''), insp_type: String(parts[1] ?? ''), product: String(parts[2] ?? ''),
      lot_no: String(parts[3] ?? ''), result: String(parts[4] ?? ''), inspected_at: String(parts[5] ?? ''),
      report_no: String(parts[6] ?? ''),
    }
  })
  return { groups, counts, done }
}

// ─── the AQL plan lookup (rides the W2 seed, band logic shared with inspectInspection) ───

/** The sampling-plan answer the wizard badge renders. */
export interface InspPlan {
  readonly lot_qty: number
  readonly lot_band: string
  readonly code: string
  readonly aql: string
  readonly rigor: 'normal' | 'tightened' | 'reduced'
  readonly n: number
  readonly ac: number
  readonly re: number
  readonly full_inspection: boolean
}

/**
 * Look the sampling plan up the same way the verdict will: the shared
 * LOT_BANDS band table, then one qm_aql_plans row by (lot_band, aql, rigor).
 * IQC rigor rides the supplier's iqc_level switch state exactly as
 * inspectInspection computes it, so the badge and the persisted verdict can
 * never disagree on n/Ac/Re.
 * @param lotQty - the lot size N the wizard confirmed.
 * @param aql - one of the five W2 rungs.
 * @param inspType - IQC rides the supplier switch; others stay normal.
 * @param supplierId - the IQC supplier row (ignored otherwise).
 * @returns the plan (or full_inspection=true when n ≥ N — GB/T 2828.1 10.3
 * footnote semantics, surfaced for the human, never auto-judged).
 */
export function inspPlan(lotQty: number, aql: string, inspType: string, supplierId: number | null): InspPlan {
  if (!AQL_RUNGS.includes(aql)) throw new Error(`AQL 档仅接受 ${AQL_RUNGS.join('/')}（收到 ${aql}）`)
  const band = LOT_BANDS.find(row => lotQty >= row.min && (row.max === null || lotQty <= row.max))
  if (band === undefined) throw new Error(`批量 ${String(lotQty)} 不在 GB/T 2828.1—2012 表 1 的 15 个批量段内（N<2 无方案）`)
  let rigor: 'normal' | 'tightened' | 'reduced' = 'normal'
  if (inspType === 'IQC' && supplierId !== null) {
    const level = psql(`SELECT COALESCE(iqc_level,'normal') FROM srm_suppliers WHERE id = ${String(supplierId)};`).trim()
    if (level === 'tightened') rigor = 'tightened'
    else if (level === 'relaxed' || level === 'reduced') rigor = 'reduced'
  }
  const row = psql(`SELECT code || '|' || n || '|' || ac || '|' || re FROM qm_aql_plans WHERE lot_band = ${sqlLit(band.label)} AND aql = ${sqlLit(aql)} AND rigor = ${sqlLit(rigor)} LIMIT 1;`).trim()
  if (row === '') {
    throw new Error(`AQL 查表未命中：批量 ${String(lotQty)}（${band.label}）× AQL ${aql} × ${rigor} 不在 qm_aql_plans 种子内——该严格度档位未落（tightened/reduced 仅 1.0/2.5），人工判定或补种子`)
  }
  const parts = row.split('|')
  const code = parts[0] ?? '', n = parts[1] ?? '0', ac = parts[2] ?? '0', re = parts[3] ?? '0'
  return {
    lot_qty: lotQty, lot_band: band.label, code: String(code), aql, rigor,
    n: Number(n), ac: Number(ac), re: Number(re), full_inspection: Number(n) >= lotQty,
  }
}

// ─── the verdict submit (idempotent) ───

/** One reading row the wizard submits (the qm_inspection_readings shape plus the UI-only defect class). */
export interface InspReading {
  readonly parameter: string
  readonly spec_min: number | null
  readonly spec_max: number | null
  readonly criteria: string | null
  readonly actual: number | null
  readonly pass: boolean
  readonly defect_class: 'critical' | 'major' | 'minor'
}

/** The submit answer: the persisted verdict plus what to do next. */
export interface InspSubmitOutcome {
  readonly duplicate: boolean
  readonly code: string
  readonly result: 'passed' | 'failed' | null
  readonly defects: { critical: number; major: number; minor: number }
  readonly plan: { n: number; ac: number; re: number; aql: string; rigor: string; lot_band: string; code: string } | null
  readonly nc_hint: string | null
  readonly report_hint: string | null
}

/**
 * Submit one inspection verdict: readings persist first, then the shared
 * inspectInspection runs the AQL judgment (the same engine the CLI rides).
 * Idempotency: a submit_key CAS-claims the inspection row
 * (UPDATE … WHERE submit_key IS empty RETURNING id); a replay with the same
 * key answers duplicate=true without rewriting, a different key after a
 * claim is refused. Server-side overrides are guarded: a pass=true row whose
 * actual sits outside [spec_min, spec_max] is refused (an out-of-tolerance
 * row can never be recorded合格), and a pass=false row inside bounds needs
 * the wizard's explicit confirm_over flag (a human override, e.g. visual
 * defects with no numeric bound).
 * @param token - the root API token (REST writes + inspectInspection).
 * @param actor - the session-derived username (persisted as inspector).
 * @param code - the inspection code (QI-…).
 * @param aql - the chosen AQL rung.
 * @param readings - the judged rows.
 * @param submitKey - the idempotency key (one per wizard run).
 * @param confirmOver - true when the wizard confirmed at least one
 * in-bounds-but-failed override.
 * @param photoEvidence - optional compressed JPEG dataURL kept on the row.
 * @returns the outcome for the badge/disposition/report next steps.
 */
export async function inspSubmit(token: string, actor: string, code: string, aql: string, readings: ReadonlyArray<InspReading>, submitKey: string, confirmOver = false, photoEvidence = ''): Promise<InspSubmitOutcome> {
  if (submitKey.trim() === '') throw new Error('需要 submit_key（幂等键）')
  if (!readings.some(row => row.parameter.trim() !== '')) throw new Error('逐项录入被拒：至少一行检验读数')
  // psql -t -A answers UPDATE…RETURNING with the row then a command tag
  // ("92\nUPDATE 1") — the first line is the claim.
  const claimed = psql(`UPDATE qm_inspections SET submit_key = ${sqlLit(submitKey)} WHERE code = ${sqlLit(code)} AND status = 'pending' AND result = 'pending' AND COALESCE(submit_key,'') = '' RETURNING id;`)
    .split('\n').map(line => line.trim()).filter(line => line !== '')[0] ?? ''
  if (!/^\d+$/.test(claimed)) {
    const state = psql(`SELECT COALESCE(submit_key,'') || '|' || COALESCE(result,'') FROM qm_inspections WHERE code = ${sqlLit(code)};`).trim()
    const parts = state.split('|')
    const existingKey = parts[0] ?? '', result = parts[1] ?? ''
    if (existingKey === submitKey) {
      const known = result === 'passed' ? 'passed' : result === 'failed' ? 'failed' : result === 'concession' ? 'failed' : null
      return {
        duplicate: true, code, result: known,
        defects: { critical: 0, major: 0, minor: 0 }, plan: null, nc_hint: null, report_hint: null,
      }
    }
    throw new Error(`检验单 ${code} 已被处理（result=${String(result)}；判定 single-shot，重判走处置/再提交批流程）`)
  }
  const inspectionRow = psql(`SELECT id || '|' || COALESCE(insp_type,'') FROM qm_inspections WHERE code = ${sqlLit(code)};`).trim()
  const inspectionId = Number((inspectionRow.split('|')[0] ?? '0'))
  for (const row of readings) {
    if (row.parameter.trim() === '') continue
    const hasBounds = row.spec_min !== null || row.spec_max !== null
    const inBounds = (row.spec_min === null || (row.actual !== null && row.actual >= row.spec_min))
      && (row.spec_max === null || (row.actual !== null && row.actual <= row.spec_max))
    if (hasBounds && row.actual !== null && inBounds && row.pass === false && confirmOver !== true) {
      throw new Error(`行「${row.parameter}」实测 ${String(row.actual)} 在标准内却记不合格——需向导内「确认失败」双按钮防误（confirm_over）后再提交`)
    }
    if (hasBounds && row.actual !== null && !inBounds && row.pass === true) {
      throw new Error(`行「${row.parameter}」实测 ${String(row.actual)} 超出标准却被记合格——超差行不可记合格（防呆拒绝）`)
    }
  }
  const defects = { critical: 0, major: 0, minor: 0 }
  const created: number[] = []
  try {
    for (const row of readings) {
      if (row.parameter.trim() === '') continue
      if (row.pass === false) defects[row.defect_class] += 1
      const written = await restCreate(token, '/api/qm_inspection_readings:create', {
        inspection: { id: inspectionId }, parameter: row.parameter,
        spec_min: row.spec_min, spec_max: row.spec_max, criteria: row.criteria, actual: row.actual, pass: row.pass,
      })
      created.push(Number(written.id))
    }
    if (photoEvidence !== '') {
      psql(`UPDATE qm_inspections SET photo_evidence = ${sqlLit(photoEvidence)} WHERE id = ${String(inspectionId)};`)
    }
    const verdict = await inspectInspection(token, code, defects, actor, aql)
    const rules = await import('../../scripts/w6b2-rules.mts')
    await rules.scanAlerts()
    const inspTypeNow = psql(`SELECT COALESCE(insp_type,'') FROM qm_inspections WHERE code = ${sqlLit(code)};`).trim()
    return {
      duplicate: false, code, result: verdict.result, defects,
      plan: {
        n: verdict.n, ac: verdict.ac, re: verdict.re, aql: verdict.aqlUsed,
        rigor: verdict.rigor, lot_band: verdict.band, code: verdict.letter,
      },
      nc_hint: verdict.result === 'failed' ? '拒收——请走四路处置决策（退货/让步特采/返工/报废）' : null,
      // A failed FQC cannot issue a合格证 (the issue fence refuses) — the
      // hint and its result-page entry only surface on a passed/concession
      // verdict, so the rejected lot's next step is the disposal, not the
      // report.
      report_hint: inspTypeNow === 'OQC' && String(verdict.result) !== 'failed' ? '成品检验——可签发出厂检验报告（九要素）' : null,
    }
  } catch (error) {
    for (const rowId of created) psql(`DELETE FROM qm_inspection_readings WHERE id = ${String(rowId)};`)
    psql(`UPDATE qm_inspections SET submit_key = '' WHERE id = ${String(inspectionId)} AND submit_key = ${sqlLit(submitKey)};`)
    throw error
  }
}

// ─── the four-way disposal (wraps the W2 engine verbs) ───

/**
 * Run the NC decision the wizard's disposal card picked: createNc (four-way
 * gate) + disposeNc (approval-engine walk with the four stock consequences —
 * return→RETURN_VENDOR, concession→result re-labeled concession + lot flag,
 * rework→rework MO draft, scrap→SCRAP leg), then one alert-scan pass so the
 * quality route lands its rows. Concession requires approver + deviation
 * note (让步必审批留痕 — the W2 rule).
 * @param token - the root API token.
 * @param actor - the session-derived username.
 * @param code - the failed inspection code.
 * @param action - return | concession | rework | scrap.
 * @param reason - the free-text rationale.
 * @param deviationNote - required for concession.
 * @param approver - required for concession.
 * @returns the NC code and the engine's consequence trace.
 */
export async function inspDispose(token: string, actor: string, code: string, action: string, reason: string, deviationNote = '', approver = ''): Promise<{ nc_code: string }> {
  if (action === 'concession' && (deviationNote.trim() === '' || approver.trim() === '')) {
    throw new Error('让步接收（特采）必填：让步理由 + 审批人（让步必审批留痕）')
  }
  const fullReason = reason.trim() === '' ? `W6-B5 检验工作台处置（${actor}）` : `${reason.trim()}（W6-B5 ${actor}）`
  const ncCode = await createNc(token, code, action, fullReason)
  await disposeNc(token, ncCode, { approver, deviationNote })
  const rules = await import('../../scripts/w6b2-rules.mts')
  await rules.scanAlerts()
  return { nc_code: ncCode }
}

// ─── the nine-element factory report ───

/** One element's render answer: the value or the explicit 「未维护」 placeholder. */
interface Element { readonly label: string; readonly value: string; readonly maintained: boolean }

/** One detail-table row in the report (the readings snapshot). */
interface ReportItem { readonly parameter: string; readonly spec: string; readonly actual: string; readonly judged: string }

/** One report's assembled payload (also what the issue row persists). */
export interface FactoryReport {
  readonly code: string
  readonly insp_type: string
  readonly elements: ReadonlyArray<Element>
  readonly items: ReadonlyArray<ReportItem>
  readonly conclusion: string
  readonly report_no: string | null
  readonly issued_at: string | null
}

const RESULT_LABELS: Readonly<Record<string, string>> = {
  passed: '合格（接收）', failed: '不合格（拒收）', concession: '让步接收（特采）', pending: '未判定（不可签发）',
}

/**
 * Assemble one inspection's nine-element report from the inspection row +
 * readings + product + lot (+ an issued qm_factory_reports row when present).
 * Every element renders even when its source column is empty — the value
 * becomes 「未维护」 and maintained=false (the B3 supplier-placeholder
 * posture: no silent drops). The report is offered for every insp_type; the
 * title line names 来料/过程/出厂 accordingly.
 * @param code - the inspection code.
 * @returns the assembled report.
 */
export function inspReport(code: string): FactoryReport {
  const row = psql(`SELECT i.code || '|' || COALESCE(i.insp_type,'') || '|' || COALESCE(i.lot_qty,0) || '|' || COALESCE(i.lot_no,'') || '|' || COALESCE(i.result,'pending') || '|' || COALESCE(i.inspector,'') || '|' || COALESCE(p.name,'') || '|' || COALESCE(p.shelf_life_days::text,'') || '|' || COALESCE(l.production_date::text,'') || '|' || COALESCE(l.expiry_date::text,'') || '|' || COALESCE(s.name,'')
FROM qm_inspections i
LEFT JOIN hub_inv_products p ON p.id = i.product_id
LEFT JOIN wms_lots l ON l.lot_no = i.lot_no
LEFT JOIN srm_suppliers s ON s.id = i.supplier_id
WHERE i.code = ${sqlLit(code)};`).trim()
  if (row === '') throw new Error(`检验单 ${code} 不存在`)
  const parts = row.split('|')
  const inspType = parts[1] ?? '', lotQty = parts[2] ?? '0', lotNo = parts[3] ?? '', result = parts[4] ?? 'pending'
  const inspector = parts[5] ?? '', productName = parts[6] ?? '', shelfLifeDays = parts[7] ?? ''
  const productionDate = parts[8] ?? '', expiryDate = parts[9] ?? ''
  const itemRows = psql(`SELECT COALESCE(parameter,'') || '|' || COALESCE(spec_min::text,'') || '|' || COALESCE(spec_max::text,'') || '|' || COALESCE(actual::text,'') || '|' || COALESCE(pass::text,'')
FROM qm_inspection_readings WHERE inspection_id = (SELECT id FROM qm_inspections WHERE code = ${sqlLit(code)}) ORDER BY id;`)
    .split('\n').map(line => line.trim()).filter(line => line !== '')
  const items: ReportItem[] = itemRows.map((line) => {
    const cols = line.split('|')
    const parameter = cols[0] ?? '', specMin = cols[1] ?? '', specMax = cols[2] ?? '', actual = cols[3] ?? '', pass = cols[4] ?? ''
    const spec = specMin === '' && specMax === '' ? '—' : `[${specMin === '' ? '−∞' : specMin}, ${specMax === '' ? '+∞' : specMax}]`
    // psql renders boolean::text as 'true'/'false' — the judged column reads
    // exactly those, so a judged reading never falls back to '—'.
    return {
      parameter: String(parameter), spec,
      actual: String(actual) === '' ? '—' : String(actual),
      judged: String(pass) === 'true' ? '合格' : String(pass) === 'false' ? '不合格' : '—',
    }
  })
  const issued = psql(`SELECT report_no || '|' || COALESCE(issued_at::text,'') || '|' || COALESCE(reviewer,'') FROM qm_factory_reports WHERE inspection_code = ${sqlLit(code)} LIMIT 1;`).trim()
  const issuedParts = issued === '' ? ['', '', ''] : issued.split('|')
  const reportNo = issuedParts[0] ?? '', issuedAt = issuedParts[1] ?? ''
  // The reviewer renders from the archived report row (keyed by
  // inspection_code), not a positional elements slot — a pre-issue preview
  // honestly shows 未维护, the issued report shows the signing reviewer.
  const reviewer = issuedParts[2] ?? ''
  const element = (label: string, value: string): Element => ({ label, value: value === '' ? '未维护' : value, maintained: value !== '' })
  const shelfText = String(shelfLifeDays) === '' ? '' : `${String(shelfLifeDays)} 天${String(expiryDate) === '' ? '' : `（到期 ${String(expiryDate)}）`}`
  const lotText = [String(productionDate), String(lotNo)].filter(part => part !== '').join(' · ')
  const elements: Element[] = [
    element('产品名称', String(productName)),
    element('规格', ''), // hub_inv_products carries no spec column — the explicit placeholder is the honest render.
    element('数量', Number(lotQty) > 0 ? String(lotQty) : ''),
    element('生产日期/生产批号', lotText),
    element('保质期', shelfText),
    element('检验依据（执行标准号）', ''),
    element('检验结论', RESULT_LABELS[String(result)] ?? String(result)),
    element('报告人', String(inspector)),
    element('审核人（复核放行）', reviewer),
  ]
  return {
    code, insp_type: String(inspType), elements, items,
    conclusion: RESULT_LABELS[String(result)] ?? String(result),
    report_no: reportNo === '' ? null : reportNo, issued_at: issuedAt === '' ? null : issuedAt,
  }
}

/**
 * Render the standalone report page (the /insp/report handler answers this
 * HTML; the print button + @media print sheet make it the PDF/print face).
 * @param code - the inspection code.
 * @returns the full HTML document.
 */
/** Read one element's rendered value by label (signature lines stay stable when the element list reorders). */
const elementValue = (report: FactoryReport, label: string): string => report.elements.find(item => item.label === label)?.value ?? '未维护'

export function inspReportHtml(code: string): string {
  const report = inspReport(code)
  const title = String(report.insp_type) === 'OQC' ? '出厂检验报告' : String(report.insp_type) === 'IQC' ? '来料检验报告' : '过程检验报告'
  const rows = report.elements.map(itemElement => `<tr class="${itemElement.maintained ? '' : 'missing'}"><th>${esc(itemElement.label)}</th><td>${esc(itemElement.value)}</td></tr>`).join('')
  const itemRows = report.items.length === 0
    ? '<tr><td colspan="4" class="missing">未维护（本单无逐项读数——免读数判定或数据缺失）</td></tr>'
    : report.items.map(item => `<tr><td>${esc(item.parameter)}</td><td>${esc(item.spec)}</td><td>${esc(item.actual)}</td><td>${esc(item.judged)}</td></tr>`).join('')
  const numberLine = report.report_no === null
    ? '<span class="draft">报告编号（检验合格证号）：未签发（预览）</span>'
    : `报告编号（检验合格证号）：${esc(report.report_no)}`
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} ${esc(code)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: system-ui, sans-serif; margin: 0; background: #FAFAF9; color: #1F2630; }
  .page { max-width: 760px; margin: 0 auto; background: #fff; padding: 34px 44px 46px; }
  h1 { font-size: 22px; text-align: center; letter-spacing: 6px; margin: 4px 0 2px; }
  .sub { text-align: center; color: #55606E; font-size: 13px; margin-bottom: 18px; }
  .no { text-align: center; font-size: 14px; margin-bottom: 20px; }
  .draft { color: #E76500; background: #FFF8D6; padding: 2px 10px; border-radius: 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  th, td { border: 1px solid #D8D8D5; padding: 8px 10px; font-size: 13.5px; text-align: left; }
  thead th { background: #E8F0F9; }
  td.missing, .missing { color: #E76500; background: #FFF8D6; }
  .signature { display: flex; gap: 40px; justify-content: flex-end; margin-top: 26px; font-size: 14px; }
  .footnote { margin-top: 26px; color: #8A94A0; font-size: 12px; border-top: 1px dashed #D8D8D5; padding-top: 10px; }
  .bar { text-align: center; padding: 14px 0 0; }
  .bar button { padding: 10px 30px; font-size: 15px; border: none; border-radius: 999px; background: #1E4E8C; color: #fff; cursor: pointer; }
  @media print {
    body { background: #fff; }
    .bar { display: none !important; }
    .page { padding: 0; }
  }
</style></head><body><div class="page">
<h1>${esc(title)}</h1>
<div class="sub">检验单 ${esc(code)} · 自动装配自 检验/批次/追溯 台账（缺项显式标注，不静默缺项）</div>
<div class="no">${numberLine}</div>
<table><thead><tr><th style="width:34%">要素（九要素 · 沪市监食监〔2025〕195 号）</th><th>内容</th></tr></thead><tbody>${rows}</tbody></table>
<table><thead><tr><th>检验项目</th><th>标准值</th><th>实测值</th><th>单项判定</th></tr></thead><tbody>${itemRows}</tbody></table>
<div class="signature"><span>报告人：${esc(elementValue(report, '报告人'))}</span><span>审核人：${esc(elementValue(report, '审核人（复核放行）'))}</span><span>签发日期：${esc(report.issued_at ?? '未签发')}</span></div>
<div class="footnote">检验合格证号即本报告编号（《食品安全法》第 51 条出厂检验记录制度）；记录保存 ≥ 保质期满后 6 个月。本页由检验工作台（W6-B5）装配。</div>
<div class="bar"><button onclick="window.print()">打印 / 导出 PDF</button></div>
</div></body></html>`
}

/**
 * Issue (persist) one report: only a 质检部 reviewer may sign, only a judged
 * (passed/concession) inspection issues, and one inspection issues exactly
 * once (report_no unique index + the existing-row return). The nine elements
 * + items snapshot onto the row so the archive outlives later edits.
 * @param token - the root API token (unused — psql writes the row directly).
 * @param code - the inspection code.
 * @param reviewer - the signing reviewer username (must sit in 质检部).
 * @param qualityMembers - the engine-resolved 质检部 usernames.
 * @returns the report number (existing or newly minted).
 */
export function inspReportIssue(
  token: string, code: string, reviewer: string, qualityMembers: ReadonlyArray<string>,
): { report_no: string; duplicate: boolean } {
  void token
  if (!qualityMembers.includes(reviewer)) {
    throw new Error(`审核人 ${reviewer} 不在质检部（成员：${qualityMembers.join('/')}）——出厂检验报告须质检部复核放行`)
  }
  const existing = psql(`SELECT report_no FROM qm_factory_reports WHERE inspection_code = ${sqlLit(code)} LIMIT 1;`).trim()
  if (existing !== '') return { report_no: existing, duplicate: true }
  const state = psql(`SELECT COALESCE(result,'') || '|' || COALESCE(inspector,'') FROM qm_inspections WHERE code = ${sqlLit(code)};`).trim()
  const stateParts = state.split('|')
  const result = stateParts[0] ?? '', inspector = stateParts[1] ?? ''
  if (String(result) !== 'passed' && String(result) !== 'concession') {
    throw new Error(`检验单 ${code} result=${String(result)}——仅合格/让步接收可签发合格证（不合格不出厂）`)
  }
  const report = inspReport(code)
  const year = new Date().getFullYear()
  const prefix = `QR-${year}-`
  const maxRaw = psql(`SELECT COALESCE(max(NULLIF(split_part(report_no, '-', 3), '')::int), 0) FROM qm_factory_reports WHERE report_no LIKE ${sqlLit(`${prefix}%`)};`).trim()
  const reportNo = `${prefix}${String(Number(maxRaw || '0') + 1).padStart(4, '0')}`
  const productNameValue = report.elements[0]?.maintained === true ? report.elements[0].value : ''
  const qtyValue = report.elements[2]?.maintained === true ? report.elements[2].value : ''
  const lotValue = report.elements[3]?.maintained === true ? report.elements[3].value : ''
  psql(`INSERT INTO qm_factory_reports (report_no, inspection_id, inspection_code, insp_type, product_name, qty, lot_no, basis, items, conclusion, reporter, reviewer, issued_at)
VALUES (${sqlLit(reportNo)}, (SELECT id FROM qm_inspections WHERE code = ${sqlLit(code)}), ${sqlLit(code)}, ${sqlLit(String(report.insp_type))}, ${sqlLit(productNameValue)}, ${String(Number(qtyValue || '0') || 0)}, ${sqlLit(lotValue)}, '', ${sqlLit(JSON.stringify(report.items))}, ${sqlLit(report.conclusion)}, ${sqlLit(String(inspector))}, ${sqlLit(reviewer)}, CURRENT_DATE)
ON CONFLICT (report_no) DO NOTHING;`)
  // The issue-time backfill: even a row that pre-dates the reviewer insert
  // (or lost it) ends with the acting reviewer recorded, so the render and
  // the archive agree on who signed.
  psql(`UPDATE qm_factory_reports SET reviewer = ${sqlLit(reviewer)} WHERE inspection_code = ${sqlLit(code)} AND COALESCE(reviewer, '') = '';`)
  return { report_no: reportNo, duplicate: false }
}

// ─── small REST helper (the flow-page-lib dataOf posture without its retries) ───

async function restCreate(token: string, path: string, body: Record<string, unknown>): Promise<{ id?: unknown }> {
  const env = readFileSync(fileURLToPath(new URL('../../../../platform/nocobase/.env', import.meta.url)), 'utf8')
  const envOf = (key: string): string | undefined => env.split('\n').map(line => line.trim()).find(line => line.startsWith(`${key}=`))?.slice(key.length + 1)
  const base = envOf('API_BASE') ?? 'http://127.0.0.1:13000'
  const response = await fetch(`${base}${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({})) as { data?: { id?: unknown }; errors?: Array<{ message?: string }> }
  if (!response.ok) throw new Error(`REST ${path} → HTTP ${String(response.status)}：${payload.errors?.[0]?.message ?? ''}`)
  return payload.data ?? {}
}
