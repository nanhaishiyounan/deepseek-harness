/**
 * The W6-B6 CRM-workbench SPA (vanilla, zero npm dependencies — the
 * insp/labels posture): the deal-pipeline Kanban (drag a card between stage
 * columns → /crm/move writes stage+probability+status back with an audit
 * row; column headers carry the amount sum and the probability-weighted
 * value), the customer-360 aggregate (profile + counts + AR balance on the
 * ar_overdue口径 + the报价→订单→发货→收款 timeline — panels and cards, not a
 * table dump), and the quote→sales-order conversion dialog (server-minted SO
 * code, optional product lines, one quote converts exactly once). All
 * dynamic text renders through esc() — engine data never reaches innerHTML
 * raw.
 *
 * Same-origin with the engine (served at /crm); every write carries the
 * signed-in platform session (Authorization: Bearer) so the actor is always
 * session-derived.
 */
interface PipeCard {
  readonly id: number
  readonly name: string
  readonly stage: string
  readonly status: string
  readonly amount: number
  readonly owner: string
  readonly customer: string
  readonly expected_close_date: string
  readonly closed_date: string
  readonly dwell_days: number | null
}
interface PipeColumn {
  readonly key: string
  readonly label: string
  readonly count: number
  readonly amount_sum: number
  readonly weighted: number
}
interface PipeBoard {
  readonly cards: readonly PipeCard[]
  readonly columns: readonly PipeColumn[]
  readonly weighted_total: number
  readonly open_amount: number
  readonly won_count: number
  readonly probability_legend: ReadonlyArray<{ key: string; probability: number }>
}
interface TimelineNode { readonly date: string; readonly kind: 'quote' | 'order' | 'ship' | 'payment'; readonly label: string; readonly detail: string }
interface Customer360 {
  readonly customer: {
    id: number
    name: string
    type: string
    industry: string
    country: string
    level: string
    status: string
    company_name: string
  }
  readonly counts: { deals_open: number; deals_amount: number; orders: number; quotes: number; payments_received: number }
  readonly ar_balance: number
  readonly received_total: number
  readonly orders: ReadonlyArray<{
    id: number
    code: string
    amount: number
    doc_status: string
    shipping_status: string
    need_date: string
    shipped_at: string
  }>
  readonly quotes: ReadonlyArray<{
    id: number
    quote_number: string
    total: number
    status: string
    issue_date: string
    valid_until: string
    converted_so_code: string
    deal: string
  }>
  readonly deals: ReadonlyArray<{ id: number; name: string; stage: string; amount: number; owner: string; expected_close_date: string }>
  readonly timeline: ReadonlyArray<TimelineNode>
}
interface CustomerPick {
  readonly id: number
  readonly name: string
  readonly level: string
  readonly status: string
  readonly open_deals: number
}
interface QuoteRow {
  readonly id: number
  readonly quote_number: string
  readonly total: number
  readonly status: string
  readonly issue_date: string
  readonly valid_until: string
  readonly customer: string
  readonly deal: string
  readonly converted_so_code: string
  readonly convertible: boolean
}
interface ProductOption { readonly id: number; readonly name: string; readonly base_price: number }
interface ConvertOutcome {
  readonly refused: boolean
  readonly duplicate: boolean
  readonly so_id?: number
  readonly so_code?: string
  readonly amount?: number
  readonly lines?: number
  readonly existing_so_code?: string
  readonly submitted_to?: string
  readonly submit_note?: string
}

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id)
  if (node === null) throw new Error(`#${id} missing`)
  return node as T
}
const esc = (text: unknown): string => String(text ?? '')
  .replaceAll('&', '\u0026amp;').replaceAll('<', '\u0026lt;').replaceAll('>', '\u0026gt;').replaceAll('"', '\u0026quot;').replaceAll("'", '\u0026#39;')
const money = (value: number): string => `¥${String(Math.round(value * 100) / 100)}`

const params = new URLSearchParams(new URL(document.baseURI).search)
const TOKEN_KEY = 'CRM_TOKEN'
if (params.get('token') !== null && params.get('token') !== '') localStorage.setItem(TOKEN_KEY, params.get('token') ?? '')
const token = (): string => localStorage.getItem(TOKEN_KEY) ?? ''
let username = ''
let board: PipeBoard | null = null
let customers: readonly CustomerPick[] = []
let quotes: readonly QuoteRow[] = []
let products: readonly ProductOption[] = []

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
  for (const id of ['pipe-view', 'cust-view', 'quote-view']) el(id).classList.remove('on')
  el('login-view').classList.add('on')
  el<HTMLButtonElement>('auth-btn').textContent = '签到'
}

const renderIdentity = (): void => {
  const who = el('who')
  const btn = el<HTMLButtonElement>('auth-btn')
  if (username === '') { who.textContent = ''; btn.textContent = '签到'; return }
  who.textContent = `销售工作台：${username}`
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
    await enterAll()
  } catch (error) { showError((error as Error).message) }
})

// ─── view switching ───

for (const btn of Array.from(el('nav').querySelectorAll('button'))) {
  btn.addEventListener('click', () => {
    for (const other of Array.from(el('nav').querySelectorAll('button'))) other.classList.toggle('active', other === btn)
    const target = String((btn as HTMLElement).dataset.view ?? '')
    for (const id of ['pipe-view', 'cust-view', 'quote-view']) el(id).classList.toggle('on', id === target)
  })
}

const enterAll = async (): Promise<void> => {
  el('login-view').classList.remove('on')
  el('pipe-view').classList.add('on')
  await loadPipe()
  await Promise.all([loadCustomers(), loadQuotes(), loadProducts()])
}

// ─── the pipeline board ───

const loadPipe = async (): Promise<void> => {
  const payload = await api<{ operator?: string } & PipeBoard>('/crm/pipe.json', 'GET')
  board = payload
  if (payload.operator !== undefined && payload.operator !== '') username = payload.operator
  renderIdentity()
  renderBoard()
}

const renderBoard = (): void => {
  if (board === null) return
  el('pipe-stats').innerHTML = `
    <div class="stat"><span>在途商机（询价/报价/谈判）</span><b>${String(board.cards.filter(card => ['inquiry', 'quote', 'negotiation'].includes(card.stage)).length)}</b></div>
    <div class="stat"><span>在途总金额</span><b>${esc(money(board.open_amount))}</b></div>
    <div class="stat hl"><span>加权管道 Σ(金额×概率)</span><b>${esc(money(board.weighted_total))}</b></div>
    <div class="stat"><span>累计赢单</span><b>${String(board.won_count)}</b></div>`
  const prob = new Map(board.probability_legend.map(stage => [stage.key, stage.probability]))
  const host = el('board')
  host.innerHTML = ''
  for (const column of board.columns) {
    const col = document.createElement('section')
    col.className = 'col'
    col.dataset.stage = column.key
    col.innerHTML = `
      <h3><span>${esc(column.label)} <span class="n">${String(column.count)}</span></span><span class="hint">${String(prob.get(column.key) ?? 0)}%</span></h3>
      <div class="sum">Σ金额 ${esc(money(column.amount_sum))} · 加权 ${esc(money(column.weighted))}</div>`
    for (const card of board.cards.filter(row => row.stage === column.key)) {
      const node = document.createElement('article')
      node.className = 'kcard'
      node.draggable = true
      node.dataset.dealId = String(card.id)
      const dwell = card.dwell_days === null ? '' : `<span class="dwell ${card.dwell_days >= 14 ? 'old' : ''}">滞留 ${String(card.dwell_days)} 天</span>`
      node.innerHTML = `
        <div class="name">${esc(card.name)}</div>
        <div class="cust">${esc(card.customer)}</div>
        <div class="amount">${esc(money(card.amount))}</div>
        <div class="meta"><span>负责人 ${esc(card.owner)}</span><span>预计成交 ${esc(card.expected_close_date === '' ? '—' : card.expected_close_date)}</span>${dwell}</div>`
      node.addEventListener('dragstart', (event) => {
        const drag = event as DragEvent
        drag.dataTransfer?.setData('text/deal-id', String(card.id))
        drag.dataTransfer?.setData('text/plain', String(card.id))
        node.classList.add('dragging')
      })
      node.addEventListener('dragend', () => { node.classList.remove('dragging') })
      col.append(node)
    }
    col.addEventListener('dragover', (event) => { event.preventDefault(); col.classList.add('over') })
    col.addEventListener('dragleave', () => { col.classList.remove('over') })
    col.addEventListener('drop', (event) => {
      event.preventDefault()
      col.classList.remove('over')
      const drag = event as DragEvent
      const dealId = Number(drag.dataTransfer?.getData('text/deal-id') ?? drag.dataTransfer?.getData('text/plain') ?? '0')
      if (!Number.isInteger(dealId) || dealId <= 0) return
      void moveDeal(dealId, column.key)
    })
    host.append(col)
  }
}

const moveDeal = async (dealId: number, toStage: string): Promise<void> => {
  try {
    const outcome = await api<{ from_stage: string; to_stage: string; probability: number }>('/crm/move', 'POST', { deal_id: dealId, to_stage: toStage })
    showOk(`商机 ${String(dealId)} 已迁移 ${outcome.from_stage} → ${outcome.to_stage}（概率回写 ${String(outcome.probability)}%，审计已落 crm_stage_audit）`)
    await loadPipe()
  } catch (error) { showError((error as Error).message) }
}

// ─── customer 360 ───

const loadCustomers = async (): Promise<void> => {
  const payload = await api<{ customers: readonly CustomerPick[] }>('/crm/customers.json', 'GET')
  customers = payload.customers
  const picker = el<HTMLSelectElement>('cust-picker')
  picker.innerHTML = customers.map(row =>
    `<option value="${String(row.id)}">${esc(row.name)}（${esc(row.level)} 级 · 在途 ${String(row.open_deals)}）</option>`).join('')
}

el('cust-load').addEventListener('click', () => { void loadCustomer(Number((el<HTMLSelectElement>('cust-picker').value || '0'))) })
el('cust-picker').addEventListener('change', () => { void loadCustomer(Number((el<HTMLSelectElement>('cust-picker').value || '0'))) })

const loadCustomer = async (customerId: number): Promise<void> => {
  if (!Number.isInteger(customerId) || customerId <= 0) return
  try {
    const payload = await api<Customer360>(`/crm/customer.json?id=${String(customerId)}`, 'GET')
    renderCustomer(payload)
  } catch (error) { showError((error as Error).message) }
}

const statusChip = (status: string): string => {
  const known: Readonly<Record<string, string>> = {
    approved: 'green', shipped: 'green', converted: 'blue', accepted: 'green', received: 'green', fulfilled: 'green',
    pending_level1: 'orange', pending_level2: 'orange', pending_approval: 'orange', sent: 'blue', draft: '', pending: 'orange',
    rejected: 'red', void: 'red', cancelled: 'red', lost: 'red',
  }
  return `<span class="chip ${known[status] ?? ''}">${esc(status)}</span>`
}

const renderCustomer = (data: Customer360): void => {
  const c = data.customer
  const dealsHtml = data.deals.length === 0
    ? '<div class="hint">无在途商机</div>'
    : data.deals.map(deal => `<div class="row"><span>${esc(deal.name)} ${statusChip(deal.stage === 'won' || deal.stage === 'lost' ? deal.stage : '')}</span><span class="r">${esc(money(deal.amount))} · ${esc(deal.stage)} · ${esc(deal.owner)} · 预计 ${esc(deal.expected_close_date === '' ? '—' : deal.expected_close_date)}</span></div>`).join('')
  const ordersHtml = data.orders.length === 0
    ? '<div class="hint">无订单</div>'
    : data.orders.map(order => `<div class="row"><span>${esc(order.code)} ${statusChip(order.doc_status)}${order.shipped_at === '' ? '' : statusChip('shipped')}</span><span class="r">${esc(money(order.amount))} · 交期 ${esc(order.need_date === '' ? '—' : order.need_date)}</span></div>`).join('')
  const quotesHtml = data.quotes.length === 0
    ? '<div class="hint">无报价</div>'
    : data.quotes.map(quote => `<div class="row"><span>${esc(quote.quote_number)} ${statusChip(quote.status)}</span><span class="r">${esc(money(quote.total))}${quote.converted_so_code === '' ? '' : ` → 已转 ${esc(quote.converted_so_code)}`}</span></div>`).join('')
  const timelineHtml = data.timeline.length === 0
    ? '<li><span class="hint">暂无可追溯节点（报价/订单/发货/收款均需真实日期列）</span></li>'
    : data.timeline.map(node => `<li class="k-${esc(node.kind)}"><div class="d">${esc(node.date)} · ${esc(node.label)}</div><div class="x">${esc(node.detail)}</div></li>`).join('')
  el('cust-detail').innerHTML = `
  <div class="statrow">
    <div class="stat"><span>在途商机</span><b>${String(data.counts.deals_open)} · ${esc(money(data.counts.deals_amount))}</b></div>
    <div class="stat"><span>订单数（全部状态）</span><b>${String(data.counts.orders)}</b></div>
    <div class="stat hl"><span>应收余额（ar_overdue 口径）</span><b>${esc(money(data.ar_balance))}</b></div>
    <div class="stat"><span>已回款合计</span><b>${esc(money(data.received_total))}</b></div>
    <div class="stat"><span>报价（现行版）</span><b>${String(data.counts.quotes)}</b></div>
  </div>
  <div class="grid2">
    <div>
      <div class="card">
        <h4>基本信息</h4>
        <div class="kv">
          <b>客户名称</b><span>${esc(c.name)}</span>
          <b>类型 / 行业 / 地区</b><span>${esc(c.type)} / ${esc(c.industry)} / ${esc(c.country)}</span>
          <b>等级 / 状态</b><span><span class="chip blue">${esc(c.level)} 级</span><span class="chip ${c.status === 'active' ? 'green' : ''}">${esc(c.status)}</span></span>
        </div>
      </div>
      <div class="card">
        <h4>在途商机</h4>
        ${dealsHtml}
      </div>
      <div class="card">
        <h4>历史订单（so_orders）</h4>
        ${ordersHtml}
      </div>
      <div class="card">
        <h4>报价历史</h4>
        ${quotesHtml}
      </div>
    </div>
    <div class="card">
      <h4>交往时间线（报价 → 订单 → 发货 → 收款）</h4>
      <ul class="tl">
        ${timelineHtml}
      </ul>
    </div>
  </div>`
}

// ─── quotes → sales order ───

const loadQuotes = async (): Promise<void> => {
  const payload = await api<{ quotes: readonly QuoteRow[] }>('/crm/quotes.json', 'GET')
  quotes = payload.quotes
  renderQuotes()
}

const loadProducts = async (): Promise<void> => {
  const payload = await api<{ products: readonly ProductOption[] }>('/crm/products.json', 'GET')
  products = payload.products
}

const renderQuotes = (): void => {
  el('quote-list').innerHTML = `
  <div class="hint" style="margin-bottom:10px">转单走服务端发号（SO-YYYY-NNNN）并按配置提交销售订单审批流；一张报价只能转一次（converted_so_code 幂等闸），重复转单会被拒绝并回显已转单号。</div>
  ${quotes.map((quote) => {
    const until = quote.valid_until === '' ? '' : ` · 有效期至 ${esc(quote.valid_until)}`
    const tail = quote.converted_so_code !== ''
      ? `<span class="chip blue">已转 ${esc(quote.converted_so_code)}</span>`
      : quote.convertible
        ? '<button class="go" type="button">一键转销售订单</button>'
        : '<span class="chip red">不可转（状态）</span>'
    return `
  <div class="qcard" data-quote-id="${String(quote.id)}">
    <span class="no">${esc(quote.quote_number)}</span>
    ${statusChip(quote.status)}
    <span class="meta">${esc(quote.customer)}${quote.deal === '' ? '' : ` · ${esc(quote.deal)}`} · ${esc(money(quote.total))}${until}</span>
    ${tail}
  </div>`
  }).join('')}`
  for (const btn of Array.from(el('quote-list').querySelectorAll('button.go'))) {
    btn.addEventListener('click', () => {
      const card = btn.closest('.qcard') as HTMLElement | null
      const quoteId = Number(card?.dataset.quoteId ?? '0')
      const quote = quotes.find(row => row.id === quoteId)
      if (quote === undefined) return
      openConvert(quote)
    })
  }
}

interface LineDraft { product_id: number; qty: string; unit_price: string }
let convertState: { quote: QuoteRow; needDate: string; lines: LineDraft[]; busy: boolean } | null = null

const openConvert = (quote: QuoteRow): void => {
  convertState = { quote, needDate: quote.valid_until === '' ? '' : quote.valid_until, lines: [], busy: false }
  renderConvert()
}

const renderConvert = (): void => {
  const state = convertState
  if (state === null) return
  const amount = state.lines.length > 0
    ? state.lines.reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.unit_price) || 0), 0)
    : state.quote.total
  el('dlg-mount').innerHTML = `
  <div class="dialog" id="cv-dlg">
    <div class="box card" style="margin-bottom:0">
      <h4>报价转销售订单 —— ${esc(state.quote.quote_number)}（${esc(state.quote.customer)}）</h4>
      <div class="kv" style="margin-bottom:8px">
        <b>报价金额</b><span>${esc(money(state.quote.total))}</span>
        <b>需求日期 need_date</b><span><input id="cv-need" type="date" value="${esc(state.needDate)}" /></span>
      </div>
      <div class="hint" style="margin-bottom:6px">产品行（可选——留空则按报价总额生成单头；填写则金额=Σ数量×单价）：</div>
      <div id="cv-lines">${state.lines.map((line, index) => `
        <div class="lrow" data-i="${String(index)}">
          <select class="cv-p" style="flex:1 1 220px">${products.map(product => `<option value="${String(product.id)}" ${product.id === line.product_id ? 'selected' : ''}>${esc(product.name)}</option>`).join('')}</select>
          <input class="cv-q" type="number" min="0" step="any" placeholder="数量" value="${esc(line.qty)}" style="width:110px" />
          <input class="cv-u" type="number" min="0" step="any" placeholder="单价" value="${esc(line.unit_price)}" style="width:110px" />
          <button class="ghost" type="button" data-del="${String(index)}">删行</button>
        </div>`).join('')}</div>
      <div class="actions" style="display:flex;gap:8px;margin-top:8px">
        <button class="ghost" type="button" id="cv-add">＋ 加一行</button>
        <button class="primary" type="button" id="cv-go" ${state.busy ? 'disabled' : ''}>确认转单（金额 ${esc(money(amount))}）</button>
        <button class="ghost" type="button" id="cv-cancel">取消</button>
      </div>
      <div class="hint" style="margin-top:8px">转单后：报价标记 converted（已转单号回写）、生成 so_orders 草稿并按配置提交审批流；同单二次转单将被幂等拒绝。</div>
    </div>
  </div>`
  const readLines = (): void => {
    if (convertState === null) return
    for (const row of Array.from(el('cv-lines').querySelectorAll('.lrow'))) {
      const index = Number(row.dataset.i)
      const draft = convertState.lines[index]
      if (draft === undefined) continue
      draft.product_id = Number((row.querySelector('.cv-p') as HTMLSelectElement)?.value ?? '0')
      draft.qty = (row.querySelector('.cv-q') as HTMLInputElement)?.value ?? ''
      draft.unit_price = (row.querySelector('.cv-u') as HTMLInputElement)?.value ?? ''
    }
  }
  el('cv-add').addEventListener('click', () => {
    readLines()
    const fallback = products[0]
    convertState?.lines.push({ product_id: fallback === undefined ? 0 : fallback.id, qty: '', unit_price: '' })
    renderConvert()
  })
  for (const btn of Array.from(el('dlg-mount').querySelectorAll('button[data-del]'))) {
    btn.addEventListener('click', () => {
      readLines()
      const index = Number((btn as HTMLElement).dataset.del)
      if (convertState !== null) convertState.lines = convertState.lines.filter((_, i) => i !== index)
      renderConvert()
    })
  }
  el('cv-need').addEventListener('change', () => {
    if (convertState !== null) convertState.needDate = (el<HTMLInputElement>('cv-need').value ?? '').trim()
  })
  el('cv-cancel').addEventListener('click', () => { el('dlg-mount').innerHTML = ''; convertState = null })
  el('cv-go').addEventListener('click', () => { void submitConvert() })
}

const submitConvert = async (): Promise<void> => {
  const state = convertState
  if (state === null || state.busy) return
  readLinesNow()
  const lines = state.lines
    .map(line => ({ product_id: line.product_id, qty: Number(line.qty), unit_price: Number(line.unit_price) }))
    .filter(line => line.qty > 0)
  state.busy = true
  el<HTMLButtonElement>('cv-go').disabled = true
  try {
    const outcome = await api<ConvertOutcome>('/crm/quote-to-so', 'POST', {
      quote_id: state.quote.id, need_date: state.needDate, lines,
    })
    if (outcome.refused) {
      showError(`拒绝转单：${outcome.duplicate ? `该报价已转单（${outcome.existing_so_code === '' ? '已 converted' : outcome.existing_so_code}）——幂等闸生效，未重复生成 SO` : '状态不可转'}`)
    } else {
      showOk(`已生成销售订单 ${outcome.so_code ?? ''}（金额 ${money(outcome.amount ?? 0)}${(outcome.lines ?? 0) > 0 ? ` · 产品行 ${String(outcome.lines ?? 0)}` : ''}）${outcome.submitted_to === undefined ? ' · 审批流未配置，保留草稿' : ` · 已提交审批（当前态 ${outcome.submitted_to}）`}`)
    }
    el('dlg-mount').innerHTML = ''
    convertState = null
    await loadQuotes()
  } catch (error) {
    showError((error as Error).message)
    if (convertState !== null) convertState.busy = false
    const btn = document.getElementById('cv-go') as HTMLButtonElement | null
    if (btn !== null) btn.disabled = false
  }
}

const readLinesNow = (): void => {
  const state = convertState
  if (state === null) return
  for (const row of Array.from(document.querySelectorAll('#cv-lines .lrow'))) {
    const index = Number((row as HTMLElement).dataset.i)
    const draft = state.lines[index]
    if (draft === undefined) continue
    draft.product_id = Number((row.querySelector('.cv-p') as HTMLSelectElement)?.value ?? '0')
    draft.qty = (row.querySelector('.cv-q') as HTMLInputElement)?.value ?? ''
    draft.unit_price = (row.querySelector('.cv-u') as HTMLInputElement)?.value ?? ''
  }
}

// ─── boot ───

renderIdentity()
if (token() === '') renderLogin()
else void enterAll().catch((error: Error) => { showError(error.message); renderLogin() })
