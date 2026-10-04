/**
 * The W6-B5 inspection-workbench SPA (vanilla, zero npm dependencies — the
 * labels precedent): the grouped pending queue (IQC/IPQC/OQC with overdue
 * highlight), the AQL badge wizard (lot size → plan lookup on the engine →
 * per-item readings with the double-tap 超差防误 confirm → the live verdict
 * badge → the idempotent submit), the four-way disposal card on a rejection,
 * and the nine-element factory-report preview + issue + print. All dynamic
 * text renders through esc() — the engine data never reaches innerHTML raw.
 *
 * Same-origin with the engine (served at /insp); every write carries the
 * signed-in platform session (Authorization: Bearer) so the operator is
 * always session-derived.
 */
interface QueueCard {
  readonly code: string
  readonly insp_type: string
  readonly ref_type: string
  readonly ref_no: string
  readonly product: string
  readonly supplier: string | null
  readonly lot_no: string
  readonly lot_qty: number
  readonly overdue_hours: number | null
}
interface QueueGroup { readonly key: string; readonly label: string; readonly cards: readonly QueueCard[]; readonly overdue: number }
interface DoneCard {
  readonly code: string
  readonly insp_type: string
  readonly product: string
  readonly lot_no: string
  readonly result: string
  readonly inspected_at: string
  readonly report_no: string
}
interface QueueResponse {
  readonly groups: readonly QueueGroup[]
  readonly counts: Record<string, number>
  readonly done: readonly DoneCard[]
  readonly quality_members: readonly string[]
  readonly operator?: string
}
interface PlanResponse {
  readonly lot_qty: number
  readonly lot_band: string
  readonly code: string
  readonly aql: string
  readonly rigor: string
  readonly n: number
  readonly ac: number
  readonly re: number
  readonly full_inspection: boolean
}
interface SubmitResponse {
  readonly duplicate: boolean
  readonly code: string
  readonly result: 'passed' | 'failed' | null
  readonly defects: { critical: number; major: number; minor: number }
  readonly plan: { n: number; ac: number; re: number; aql: string; rigor: string; lot_band: string; code: string } | null
  readonly nc_hint: string | null
  readonly report_hint: string | null
}
interface ReadingDraft {
  parameter: string
  spec_min: string
  spec_max: string
  actual: string
  pass: null | boolean
  defect_class: 'critical' | 'major' | 'minor'
  confirmed: boolean
  armed: boolean
}

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id)
  if (node === null) throw new Error(`#${id} missing`)
  return node as T
}
const esc = (text: unknown): string => String(text ?? '')
  .replaceAll('&', '\u0026amp;').replaceAll('<', '\u0026lt;').replaceAll('>', '\u0026gt;').replaceAll('"', '\u0026quot;').replaceAll("'", '\u0026#39;')

const params = new URLSearchParams(new URL(document.baseURI).search)
const TOKEN_KEY = 'INSP_TOKEN'
if (params.get('token') !== null && params.get('token') !== '') localStorage.setItem(TOKEN_KEY, params.get('token') ?? '')
const token = (): string => localStorage.getItem(TOKEN_KEY) ?? ''
let username = ''
let qualityMembers: readonly string[] = []
let queue: QueueResponse | null = null
let activeGroup = 'IQC'
let showDone = false
let photoDataUrl = ''

const showError = (message: string): void => {
  const box = el<HTMLDivElement>('error')
  box.textContent = message
  box.style.display = 'block'
  window.setTimeout(() => { box.style.display = 'none' }, 12_000)
}
const showOk = (message: string): void => {
  const box = el<HTMLDivElement>('ok')
  box.textContent = message
  box.style.display = 'block'
  window.setTimeout(() => { box.style.display = 'none' }, 8_000)
}

const api = async <T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> => {
  const response = await fetch(path, {
    method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), authorization: `Bearer ${token()}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({ ok: false, error: `HTTP ${String(response.status)}` })) as { ok?: boolean; error?: string } & T
  if (response.status === 401) {
    renderLogin()
    throw new Error(payload.error ?? '未签到或会话过期——请先签到')
  }
  if (!response.ok || payload.ok === false) throw new Error(payload.error ?? `HTTP ${String(response.status)}`)
  return payload
}

// ─── identity ───

const renderLogin = (): void => {
  for (const id of ['queue-view', 'wizard-view', 'result-view', 'report-view']) el(id).classList.add('hidden')
  el('login-view').classList.remove('hidden')
  el<HTMLButtonElement>('auth-btn').textContent = ''
}

const renderIdentity = (): void => {
  const who = el('who')
  const btn = el<HTMLButtonElement>('auth-btn')
  if (username === '') { who.textContent = ''; btn.textContent = '签到'; return }
  who.textContent = `质检员：${username}`
  btn.textContent = '退出'
}

el('auth-btn').addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY)
  username = ''
  renderIdentity()
  renderLogin()
})

el('login-btn').addEventListener('click', async () => {
  const account = (el<HTMLInputElement>('login-account').value ?? '').trim()
  const password = el<HTMLInputElement>('login-password').value ?? ''
  if (account === '' || password === '') { showError('签到需要账号与密码'); return }
  try {
    const response = await fetch('/terminal/session', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account, password }),
    })
    const payload = await response.json().catch(() => ({ ok: false, error: `HTTP ${String(response.status)}` })) as { ok?: boolean; token?: string; username?: string; error?: string }
    if (!response.ok || payload.ok !== true) throw new Error(payload.error ?? '签到失败')
    localStorage.setItem(TOKEN_KEY, payload.token ?? '')
    username = payload.username ?? account
    renderIdentity()
    await loadQueue()
  } catch (error) { showError((error as Error).message) }
})

// ─── the grouped queue ───

const loadQueue = async (): Promise<void> => {
  queue = await api<QueueResponse>('/insp/queue.json', 'GET')
  qualityMembers = queue.quality_members
  if (queue.operator !== undefined && queue.operator !== '') username = queue.operator
  renderIdentity()
  el('login-view').classList.add('hidden')
  for (const id of ['wizard-view', 'result-view', 'report-view']) el(id).classList.add('hidden')
  el('queue-view').classList.remove('hidden')
  renderQueue()
}

const renderQueue = (): void => {
  if (queue === null) return
  const tabs = el('queue-tabs')
  tabs.innerHTML = ''
  for (const group of queue.groups) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.innerHTML = `<span>${esc(group.label)} <b class="count">${String(group.cards.length)}</b></span>${group.overdue > 0 ? `<span class="over">逾期 ${String(group.overdue)}</span>` : ''}`
    if (!showDone && group.key === activeGroup) btn.classList.add('active')
    btn.addEventListener('click', () => { activeGroup = group.key; showDone = false; renderQueue() })
    tabs.append(btn)
  }
  // The已完成 tab: history FQC's late sign-off entry (quality_lead reaches a
  // judged inspection's report without re-running the result page).
  const doneBtn = document.createElement('button')
  doneBtn.type = 'button'
  doneBtn.innerHTML = `<span>已完成 <b class="count">${String(queue.done.length)}</b></span>`
  if (showDone) doneBtn.classList.add('active')
  doneBtn.addEventListener('click', () => { showDone = true; renderQueue() })
  tabs.append(doneBtn)
  const box = el('queue-cards')
  box.innerHTML = ''
  if (showDone) {
    if (queue.done.length === 0) { box.innerHTML = '<div class="card hint">没有已判定的检验单</div>'; return }
    for (const card of queue.done) {
      const node = document.createElement('div')
      node.className = 'qcard'
      const verdict = card.result === 'passed' ? '<span class="badge-type">合格</span>' : card.result === 'concession' ? '<span class="badge-type">让步</span>' : '<span class="badge-over">拒收</span>'
      node.innerHTML = `
        ${verdict}
        <span class="badge-type">${esc(card.insp_type)}</span>
        <span class="code">${esc(card.code)}</span>
        <span class="meta">${esc(card.product)} · 批 ${esc(card.lot_no)} · 判定于 ${esc(card.inspected_at === '' ? '—' : card.inspected_at)}</span>
        ${card.report_no === '' ? '' : `<span class="qty">报告 ${esc(card.report_no)}</span>`}
        <button class="go" type="button">${card.result === 'failed' ? '查看报告（不可签发）' : '查看 / 签发报告'}</button>`
      node.querySelector('button')?.addEventListener('click', () => { void openReport(card.code) })
      box.append(node)
    }
    return
  }
  const group = queue.groups.find(row => row.key === activeGroup) ?? queue.groups[0]
  if (group === undefined) { box.innerHTML = '<div class="card hint">队列为空——没有待检单</div>'; return }
  if (group.cards.length === 0) { box.innerHTML = '<div class="card hint">本组没有待检单</div>'; return }
  for (const card of group.cards) {
    const node = document.createElement('div')
    node.className = 'qcard'
    const overdue = (card.overdue_hours ?? 0) > 48 ? `<span class="badge-over">逾期 ${String(Math.floor((card.overdue_hours ?? 0) / 24))} 天（${String(card.overdue_hours)}h）</span>` : ''
    node.innerHTML = `
      <span class="badge-type">${esc(card.insp_type)}</span>
      <span class="code">${esc(card.code)}</span>
      <span class="meta">${esc(card.product)}${card.supplier === null ? '' : ` · 供 ${esc(card.supplier)}`} · 批 ${esc(card.lot_no)}${card.ref_no === '' ? '' : ` · 源 ${esc(card.ref_no)}`}</span>
      ${overdue}
      <span class="qty">N=${String(card.lot_qty)}</span>
      <button class="go" type="button">开始检验</button>`
    node.querySelector('button')?.addEventListener('click', () => { void openWizard(card) })
    box.append(node)
  }
}

// ─── the wizard ───

const wizard = {
  card: null as QueueCard | null,
  lotQty: 0, aql: '2.5', plan: null as PlanResponse | null,
  readings: [] as ReadingDraft[],
  submitKey: '', submitting: false,
}

const openWizard = async (card: QueueCard): Promise<void> => {
  // Every wizard run starts from a clean disposal state — the module-level
  // globals used to survive the previous inspection's wizard, leaking its
  // disposal reason/approver into the next single-order wizard.
  disposalAction = ''
  disposalReason = ''
  disposalNote = ''
  disposalApprover = ''
  wizard.card = card
  wizard.lotQty = card.lot_qty
  wizard.aql = '2.5'
  wizard.plan = null
  wizard.readings = [emptyReading('感官——色泽'), emptyReading('净含量（g）', 0, null), emptyReading('菌落总数 CFU/g', 0, 100_000)]
  wizard.submitKey = `W6B5-${card.code}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  wizard.submitting = false
  photoDataUrl = ''
  el('queue-view').classList.add('hidden')
  el('result-view').classList.add('hidden')
  el('report-view').classList.add('hidden')
  el('wizard-view').classList.remove('hidden')
  renderWizard()
}

const emptyReading = (parameter = '', specMin: number | null = null, specMax: number | null = null): ReadingDraft => ({
  parameter, spec_min: specMin === null ? '' : String(specMin), spec_max: specMax === null ? '' : String(specMax),
  actual: '', pass: null, defect_class: 'major', confirmed: false, armed: false,
})

const renderWizard = (): void => {
  const card = wizard.card
  if (card === null) return
  const view = el('wizard-view')
  const plan = wizard.plan
  const defects = localDefects()
  const d = defects.major + defects.minor
  const verdict = plan === null ? 'pending'
    : defects.critical > 0 || d >= plan.re ? 'fail'
      : d <= plan.ac ? 'pass' : 'pending'
  const verdictLabel = verdict === 'pass' ? `接收（d=${String(d)} ≤ Ac=${String(plan?.ac)}）`
    : verdict === 'fail' ? `拒收（${defects.critical > 0 ? `严重 ${String(defects.critical)}（0收1拒）` : `d=${String(d)} ≥ Re=${String(plan?.re)}`}）`
      : '抽样方案未就绪'
  view.innerHTML = `
  <div class="card">
    <div class="kv">
      <b>检验单</b><span>${esc(card.code)}（${esc(card.insp_type)} · 源 ${esc(card.ref_type)} ${esc(card.ref_no)}）</span>
      <b>产品/批次</b><span>${esc(card.product)} · ${esc(card.lot_no)}${card.supplier === null ? '' : ` · 供 ${esc(card.supplier)}`}</span>
    </div>
  </div>
  <div class="card">
    <div class="step-title">① AQL 抽样方案（GB/T 2828.1—2012 · 一般检验水平 II · 严格度由供应商 IQC 转移规则决定）</div>
    <div class="field"><label>批量 N</label><input id="w-lot-qty" type="number" min="2" value="${String(wizard.lotQty)}" /></div>
    <div class="aqlpills" id="w-aql">${['0.65', '1.0', '1.5', '2.5', '4.0'].map(rung => `<button type="button" data-aql="${rung}" class="${rung === wizard.aql ? 'active' : ''}">${rung}</button>`).join('')}</div>
    <div class="actions">
      <button id="w-plan-btn" class="primary" type="button">查询抽样方案（15 段表）</button>
      <button class="ghost" type="button" id="w-back">← 返回队列</button>
    </div>
    <div id="w-plan" style="margin-top:12px">${plan === null ? '<span class="hint">未查询——向导先取方案，再录实测</span>' : planHtml(plan)}</div>
  </div>
  <div class="card">
    <div class="step-title">② 逐项录入实测（标准范围内自动判合格；超差行须「确认失败」双按钮防误；范围内改判不合格须二次确认）</div>
    <table class="readings"><thead><tr><th>检验项目</th><th>下限</th><th>上限</th><th>实测</th><th>判定</th><th>缺陷分类</th><th></th></tr></thead>
    <tbody id="w-rows"></tbody></table>
    <div class="actions"><button class="ghost" type="button" id="w-add-row">＋ 加一行</button></div>
    <div class="field" style="margin-top:10px"><label>现场照片留证</label><input id="w-photo" type="file" accept="image/*" capture="environment" style="min-height:44px" /><span class="photo" id="w-photo-box"></span></div>
  </div>
  <div class="card">
    <div class="step-title">③ 实时判定（服务端以同一 15 段引擎权威判定——本地为预演徽章）</div>
    <span class="verdict ${verdict}">${esc(verdictLabel)}</span>
    <span class="hint" style="margin-left:10px">严重 ${String(defects.critical)} · 主要 ${String(defects.major)} · 次要 ${String(defects.minor)}</span>
    <div id="w-disposal" class="disposal" style="margin-top:12px"></div>
    <div class="actions"><button id="w-submit" class="primary" type="button" ${wizard.submitting || plan === null ? 'disabled' : ''}>提交判定（落库 · 幂等）</button></div>
    <div class="hint" style="margin-top:6px">submit_key=${esc(wizard.submitKey)}（双击重放不会二次落库）</div>
  </div>`

  el('w-back').addEventListener('click', () => { void loadQueue() })
  el('w-lot-qty').addEventListener('change', () => { wizard.lotQty = Number((el<HTMLInputElement>('w-lot-qty').value || '0')) })
  for (const btn of Array.from(view.querySelectorAll('#w-aql button'))) {
    btn.addEventListener('click', () => {
      wizard.aql = String((btn as HTMLElement).dataset.aql ?? '2.5')
      wizard.plan = null
      renderWizard()
    })
  }
  el('w-plan-btn').addEventListener('click', async () => {
    try {
      const card2 = wizard.card
      if (card2 === null) return
      const search = new URLSearchParams({ lot_qty: String(wizard.lotQty), aql: wizard.aql, insp_type: card2.insp_type })
      if (card2.supplier !== null) search.set('supplier_name', card2.supplier)
      const payload = await api<{ plan: PlanResponse }>(`/insp/plan.json?${search.toString()}`, 'GET')
      wizard.plan = payload.plan
      renderWizard()
    } catch (error) { showError((error as Error).message) }
  })
  el('w-add-row').addEventListener('click', () => { wizard.readings.push(emptyReading()); renderWizard() })
  el('w-photo').addEventListener('change', compressPhoto)
  renderRows()
  renderDisposal(verdict)
  el('w-submit').addEventListener('click', submitVerdict)
}

const planHtml = (plan: PlanResponse): string => `
  <div class="planbox">
    <div class="pill"><span>批量段</span><b>${esc(plan.lot_band)}</b></div>
    <div class="pill"><span>样本量字码</span><b>${esc(plan.code)}</b></div>
    <div class="pill"><span>样本量 n</span><b>${String(plan.n)}</b></div>
    <div class="pill"><span>接收数 Ac</span><b>${String(plan.ac)}</b></div>
    <div class="pill"><span>拒收数 Re</span><b>${String(plan.re)}</b></div>
    <div class="pill"><span>严格度</span><b>${esc(plan.rigor)}</b></div>
  </div>
  ${plan.full_inspection ? '<div class="error" style="display:block">n ≥ N——GB/T 2828.1—2012 表 2 脚注转全检（100% 检验），不走抽样判定；请人工全检后凭结果处置</div>' : ''}`

const renderRows = (): void => {
  const body = el('w-rows')
  body.innerHTML = ''
  wizard.readings.forEach((row, index) => {
    const tr = document.createElement('tr')
    tr.className = row.pass === true ? 'rowok' : row.pass === false ? 'rowfail' : ''
    const needsConfirm = row.pass === false && !row.confirmed
    tr.innerHTML = `
      <td><input data-i="${String(index)}" data-f="parameter" value="${esc(row.parameter)}" placeholder="项目名" /></td>
      <td><input data-i="${String(index)}" data-f="spec_min" value="${esc(row.spec_min)}" style="width:80px" /></td>
      <td><input data-i="${String(index)}" data-f="spec_max" value="${esc(row.spec_max)}" style="width:80px" /></td>
      <td><input data-i="${String(index)}" data-f="actual" value="${esc(row.actual)}" style="width:90px" /></td>
      <td><select data-i="${String(index)}" data-f="pass">
        <option value="">自动</option>
        <option value="true" ${row.pass === true ? 'selected' : ''}>合格</option>
        <option value="false" ${row.pass === false ? 'selected' : ''}>不合格</option>
      </select></td>
      <td><select data-i="${String(index)}" data-f="defect_class" ${row.pass === false ? '' : 'disabled'}>
        <option value="critical" ${row.defect_class === 'critical' ? 'selected' : ''}>严重</option>
        <option value="major" ${row.defect_class === 'major' ? 'selected' : ''}>主要</option>
        <option value="minor" ${row.defect_class === 'minor' ? 'selected' : ''}>次要</option>
      </select></td>
      <td>${row.pass === false && needsConfirm
        ? `<button type="button" class="confirm-fail ${row.armed ? 'armed' : ''}" data-i="${String(index)}" data-armed="${row.armed ? '1' : ''}">${row.armed ? '再点确认失败' : '确认失败'}</button>`
        : row.pass === false ? '<span class="hint">已确认 ✓</span>' : ''}</td>`
    body.append(tr)
  })
  for (const input of Array.from(body.querySelectorAll('input, select'))) {
    input.addEventListener('change', () => {
      const index = Number((input as HTMLElement).dataset.i)
      const field = String((input as HTMLElement).dataset.f)
      const value = (input as HTMLInputElement).value
      const row = wizard.readings[index]
      if (row === undefined) return
      if (field === 'pass') {
        row.pass = value === '' ? null : value === 'true'
        row.confirmed = false; row.armed = false
      } else if (field === 'defect_class') {
        row.defect_class = value === 'critical' || value === 'minor' ? value : 'major'
      } else {
        (row as unknown as Record<string, string>)[field] = value
        if (row.pass === false) { row.confirmed = false; row.armed = false }
      }
      renderWizard()
    })
  }
  for (const btn of Array.from(body.querySelectorAll('button.confirm-fail'))) {
    btn.addEventListener('click', () => {
      const index = Number((btn as HTMLElement).dataset.i)
      const row = wizard.readings[index]
      if (row === undefined) return
      // The double-tap 超差防误: first tap arms (再点确认失败, 3s revert), the
      // second lands — both the out-of-tolerance auto-fail and the in-bounds
      // human override ride the same two-step guard.
      if (row.armed) {
        row.confirmed = true
        row.armed = false
      } else {
        row.armed = true
        window.setTimeout(() => {
          if (!row.confirmed) { row.armed = false; renderWizard() }
        }, 3_000)
      }
      renderWizard()
    })
  }
}

const localDefects = (): { critical: number; major: number; minor: number } => {
  const defects = { critical: 0, major: 0, minor: 0 }
  for (const row of wizard.readings) {
    const bounds = row.spec_min !== '' || row.spec_max !== ''
    const actual = row.actual === '' ? null : Number(row.actual)
    const pass = row.pass ?? (bounds && actual !== null
      && (row.spec_min === '' || actual >= Number(row.spec_min))
      && (row.spec_max === '' || actual <= Number(row.spec_max)))
    if (pass === false) defects[row.defect_class] += 1
  }
  return defects
}

const compressPhoto = async (): Promise<void> => {
  const input = el<HTMLInputElement>('w-photo')
  const file = input.files?.[0]
  if (file === undefined) { photoDataUrl = ''; return }
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  photoDataUrl = canvas.toDataURL('image/jpeg', 0.7)
  el('w-photo-box').innerHTML = `<img alt="留证缩略图" src="${photoDataUrl}" />`
}

// ─── step 3: disposal card + submit ───

let disposalAction = ''
let disposalReason = ''
let disposalNote = ''
let disposalApprover = ''

const renderDisposal = (verdict: string): void => {
  const box = el('w-disposal')
  if (verdict !== 'fail') { box.innerHTML = ''; disposalAction = ''; disposalNote = ''; return }
  box.innerHTML = `
    <div class="step-title">拒收——四路处置决策（处置单走审批引擎；让步=特采须理由+审批人）</div>
    <div class="aqlpills">
      ${[['return', '退货（供应商）'], ['concession', '让步特采'], ['rework', '返工（复检闭环）'], ['scrap', '报废（财务）']]
        .map(([value, label]) => `<button type="button" data-act="${value}" class="${disposalAction === value ? 'active' : ''}">${label}</button>`).join('')}
    </div>
    <div class="field"><label>处置理由</label><input id="w-disp-reason" value="${esc(disposalReason)}" placeholder="必填（落处置单 reason）" style="flex:1;min-width:260px" /></div>
    ${disposalAction === 'concession'
      ? `<div class="field"><label>让步理由</label><input id="w-disp-note" value="${esc(disposalNote)}" placeholder="特采必填（deviation_note 审批留痕）" style="flex:1;min-width:260px" /></div>
         <div class="field"><label>审批人</label><select id="w-disp-approver">${qualityMembers.map(member => `<option value="${esc(member)}" ${member === disposalApprover ? 'selected' : ''}>${esc(member)}</option>`).join('')}</select></div>`
      : ''}`
  for (const btn of Array.from(box.querySelectorAll('button[data-act]'))) {
    btn.addEventListener('click', () => {
      disposalAction = String((btn as HTMLElement).dataset.act ?? '')
      disposalReason = (document.getElementById('w-disp-reason') as HTMLInputElement | null)?.value ?? disposalReason
      renderDisposal('fail')
    })
  }
  const reason = document.getElementById('w-disp-reason') as HTMLInputElement | null
  reason?.addEventListener('change', () => { disposalReason = reason.value })
  const note = document.getElementById('w-disp-note') as HTMLInputElement | null
  note?.addEventListener('change', () => { if (note !== null) disposalNote = note.value })
  const approver = document.getElementById('w-disp-approver') as HTMLSelectElement | null
  approver?.addEventListener('change', () => { if (approver !== null) disposalApprover = approver.value })
}

const submitVerdict = async (): Promise<void> => {
  const card = wizard.card
  if (card === null || wizard.plan === null) return
  if (wizard.submitting) return
  const readings = wizard.readings
    .map((row) => {
      const bounds = row.spec_min !== '' || row.spec_max !== ''
      const actual = row.actual === '' ? null : Number(row.actual)
      const autoPass = bounds && actual !== null
        && (row.spec_min === '' || actual >= Number(row.spec_min))
        && (row.spec_max === '' || actual <= Number(row.spec_max))
      const pass = row.pass ?? autoPass
      const needsConfirm = row.pass === false && !row.confirmed
      return { row, pass, needsConfirm, bounds, actual }
    })
  if (readings.length === 0 || !readings.some(item => item.row.parameter.trim() !== '')) { showError('至少一行检验读数（项目名非空）'); return }
  for (const item of readings) {
    if (item.row.parameter.trim() === '') continue
    if (item.pass !== false && item.pass !== true) { showError(`行「${item.row.parameter}」未判定（填实测自动判或手选）`); return }
    if (item.pass === false && item.needsConfirm) { showError(`行「${item.row.parameter}」的失败未确认（超差/改判行须「确认失败」双按钮）`); return }
  }
  const confirmOver = readings.some(item => item.pass === false && item.bounds && item.actual !== null
    && (item.row.spec_min === '' || (item.actual ?? 0) >= Number(item.row.spec_min))
    && (item.row.spec_max === '' || (item.actual ?? 0) <= Number(item.row.spec_max)))
  wizard.submitting = true
  renderWizard()
  try {
    const outcome = await api<SubmitResponse>('/insp/submit', 'POST', {
      code: card.code, aql: wizard.aql, submit_key: wizard.submitKey, confirm_over: confirmOver,
      photo_evidence: photoDataUrl,
      readings: readings.filter(item => item.row.parameter.trim() !== '').map(item => ({
        parameter: item.row.parameter,
        spec_min: item.row.spec_min === '' ? null : Number(item.row.spec_min),
        spec_max: item.row.spec_max === '' ? null : Number(item.row.spec_max),
        criteria: null, actual: item.actual, pass: item.pass === true,
        defect_class: item.row.defect_class,
      })),
    })
    await runDisposal(outcome)
  } catch (error) {
    showError((error as Error).message)
    wizard.submitting = false
    renderWizard()
  }
}

const runDisposal = async (outcome: SubmitResponse): Promise<void> => {
  let nc: { nc_code: string } | null = null
  if (outcome.result === 'failed' && outcome.duplicate === false && disposalAction !== '') {
    if (disposalReason.trim() === '') { showError('拒收+处置：处置理由必填（本次仅落判定，处置去处置看板）') }
    else {
      try {
        nc = await api<{ nc_code: string }>('/insp/dispose', 'POST', {
          code: outcome.code, action: disposalAction, reason: disposalReason,
          deviation_note: disposalNote, approver: disposalApprover,
        })
      } catch (error) { showError(`处置失败（判定已落库）：${(error as Error).message}`) }
    }
  }
  renderResult(outcome, nc)
}

const renderResult = (outcome: SubmitResponse, nc: { nc_code: string } | null): void => {
  el('wizard-view').classList.add('hidden')
  const view = el('result-view')
  view.classList.remove('hidden')
  const plan = outcome.plan
  view.innerHTML = `
  <div class="card">
    <span class="verdict ${outcome.result === 'passed' ? 'pass' : 'fail'}">${outcome.result === 'passed' ? '接收（合格）' : '拒收（不合格）'}</span>
    ${outcome.duplicate ? '<div class="hint" style="margin-top:8px">幂等命中——本 submit_key 已处理过，未重复落库</div>' : ''}
    <div class="kv" style="margin-top:10px">
      <b>检验单</b><span>${esc(outcome.code)}</span>
      <b>抽样方案</b><span>${plan === null ? '—' : `${esc(plan.aql)}（${esc(plan.rigor)}）· ${esc(plan.lot_band)}/${esc(plan.code)} → n=${String(plan.n)} Ac=${String(plan.ac)} Re=${String(plan.re)}`}</span>
      <b>缺陷计数</b><span>严重 ${String(outcome.defects.critical)} · 主要 ${String(outcome.defects.major)} · 次要 ${String(outcome.defects.minor)}</span>
      ${nc === null ? '' : `<b>处置单</b><span>${esc(nc.nc_code)}（四路已走审批引擎）</span>`}
      ${outcome.report_hint === null ? '' : `<b>下一步</b><span>${esc(outcome.report_hint)}</span>`}
    </div>
    <div class="actions">
      <button class="primary" type="button" id="r-back">← 返回队列</button>
      ${outcome.result === 'failed' ? '' : '<button class="ghost" type="button" id="r-report">出具九要素报告</button>'}
    </div>
  </div>`
  el('r-back').addEventListener('click', () => { void loadQueue() })
  if (outcome.result !== 'failed') el('r-report').addEventListener('click', () => { void openReport(outcome.code) })
}

// ─── the nine-element report view ───

const openReport = async (code: string): Promise<void> => {
  el('result-view').classList.add('hidden')
  el('queue-view').classList.add('hidden')
  const view = el('report-view')
  view.classList.remove('hidden')
  view.innerHTML = `
  <div class="card">
    <div class="step-title">出厂检验报告（九要素 · 沪市监食监〔2025〕195 号）——自动装配，缺项显式「未维护」</div>
    <div class="actions">
      <select id="rp-reviewer">${qualityMembers.map(member => `<option value="${esc(member)}">${esc(member)}</option>`).join('')}</select>
      <button class="primary" type="button" id="rp-issue">签发留档（检验合格证号）</button>
      <button class="ghost" type="button" id="rp-print">打印页 / PDF</button>
      <button class="ghost" type="button" id="rp-back">← 返回</button>
    </div>
  </div>
  <div class="report-view"><iframe id="rp-frame" title="报告预览"></iframe></div>`
  await refreshReportFrame(code)
  el('rp-back').addEventListener('click', () => { void loadQueue() })
  el('rp-print').addEventListener('click', () => { window.open(`/insp/report?code=${encodeURIComponent(code)}&token=${encodeURIComponent(token())}`, '_blank') })
  el('rp-issue').addEventListener('click', async () => {
    const reviewer = (el<HTMLSelectElement>('rp-reviewer').value ?? '').trim()
    try {
      const issued = await api<{ report_no: string; duplicate: boolean }>('/insp/report/issue', 'POST', { code, reviewer })
      showOk(issued.duplicate ? `已签发过：${issued.report_no}（不重复签发）` : `已签发：检验合格证号 ${issued.report_no}`)
      await refreshReportFrame(code)
    } catch (error) { showError((error as Error).message) }
  })
}

const refreshReportFrame = async (code: string): Promise<void> => {
  const frame = el<HTMLIFrameElement>('rp-frame')
  const response = await fetch(`/insp/report?code=${encodeURIComponent(code)}`, { headers: { authorization: `Bearer ${token()}` } })
  const html = await response.text()
  frame.srcdoc = html
}

// ─── boot ───

renderIdentity()
if (token() === '') renderLogin()
else void loadQueue().catch((error: Error) => { showError(error.message); renderLogin() })
