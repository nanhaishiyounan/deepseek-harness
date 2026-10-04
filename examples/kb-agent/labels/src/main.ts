/**
 * The W6-B3 label-print SPA (vanilla, zero npm dependencies): pick a batch
 * from the engine's /label/lots.json, pick a template (50×30 批次标 / 100×50
 * 箱标) and a symbology (GS1-128 with AI 01+10+11+17 / plain Code128), then
 * print through the browser (window.print + the @media print sheet below).
 *
 * The legal minimum lines (批次号/品名/效期/供应商 — 食安法第 50/51 条记录要素)
 * render under the bars both on screen and in the print sheet. Same-origin
 * with the engine (served at /labels), so the preview <img> and the lot list
 * need no credentials beyond the demo terminal token posture.
 */
interface LotRow {
  readonly id: number
  readonly lot_no: string
  readonly product: string
  readonly gtin: string
  readonly production_date: string | null
  readonly expiry_date: string | null
  readonly supplier: string
  readonly status: string
}

interface LotsResponse {
  readonly lots: readonly LotRow[]
}

const state = { lotNo: '', template: '100x50', symbology: 'gs1' } as { lotNo: string; template: string; symbology: string; lots: LotRow[] | null }
state.lots = null

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id)
  if (node === null) throw new Error(`#${id} missing`)
  return node as T
}

const svgUrl = (lot: LotRow): string =>
  `/label/lot.svg?lot_no=${encodeURIComponent(lot.lot_no)}&code=${state.symbology}&size=${state.template}`

const refreshPreview = (): void => {
  const lots = state.lots ?? []
  const lot = lots.find(row => row.lot_no === state.lotNo)
  const box = el<HTMLDivElement>('preview')
  const meta = el<HTMLDivElement>('meta')
  if (lot === undefined) {
    box.innerHTML = '<div class="hint">选择批次后预览标签</div>'
    meta.textContent = ''
    return
  }
  box.innerHTML = `<img alt="标签 ${lot.lot_no}" src="${svgUrl(lot)}" />`
  const datePair = [lot.production_date, lot.expiry_date].map(date => date ?? '—').join(' → ')
  meta.textContent = `${lot.product} · 生产/到期 ${datePair} · 供应商 ${lot.supplier || '—'} · 状态 ${lot.status}`
}

const renderSheet = (): void => {
  const lots = state.lots ?? []
  const lot = lots.find(row => row.lot_no === state.lotNo)
  const sheet = el<HTMLDivElement>('sheet')
  if (lot === undefined) {
    sheet.innerHTML = '<div class="hint">打印区空：选择批次</div>'
    return
  }
  sheet.innerHTML = `<div class="label ${state.template === '50x30' ? 'label-small' : 'label-box'}"><img alt="" src="${svgUrl(lot)}&print=1" /></div>`
}

const boot = async (): Promise<void> => {
  const response = await fetch('/label/lots.json')
  if (!response.ok) throw new Error(`lots.json ${String(response.status)}`)
  const data = (await response.json()) as LotsResponse
  state.lots = [...data.lots]
  const select = el<HTMLSelectElement>('lot')
  select.innerHTML = state.lots.map(lot => `<option value="${lot.lot_no}">${lot.lot_no} — ${lot.product}</option>`).join('')
  state.lotNo = state.lots[0]?.lot_no ?? ''
  select.addEventListener('change', () => {
    state.lotNo = select.value
    refreshPreview()
    renderSheet()
  })
  for (const group of [['template', '50x30'], ['symbology', 'plain']] as const) {
    const radios = document.querySelectorAll<HTMLInputElement>(`input[name=${group[0]}]`)
    radios.forEach((radio) => {
      radio.addEventListener('change', () => {
        state.template = (document.querySelector<HTMLInputElement>('input[name=template]:checked')?.value) ?? '100x50'
        state.symbology = (document.querySelector<HTMLInputElement>('input[name=symbology]:checked')?.value) ?? 'gs1'
        refreshPreview()
        renderSheet()
      })
    })
  }
  el<HTMLButtonElement>('print').addEventListener('click', () => { window.print() })
  refreshPreview()
  renderSheet()
}

void boot()
