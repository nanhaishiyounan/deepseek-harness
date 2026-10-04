/**
 * The W6-B3 label server leg (the engine's /label/* handlers import this):
 * the lot list for the SPA's picker and one lot's SVG label through the
 * shared {@link ./code128.ts} encoder. The GTIN rides hub_inv_products.sku
 * (digits-only, EAN-13 shaped; anything else falls back to the 9-prefixed
 * internal GTIN-14 — the label never fails on a half-maintained SKU).
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { labelSvg, gs1Payload } from './code128.ts'

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

/** One picker row: the lot with its product/supplier display names. */
export interface LabelLot {
  readonly id: number
  readonly lot_no: string
  readonly product: string
  readonly gtin: string
  readonly production_date: string | null
  readonly expiry_date: string | null
  readonly supplier: string
  readonly status: string
}

/**
 * The lots the picker offers (FG lots first — the printable batch labels are
 * mostly finished goods, then raw lots for receiving labels).
 * @returns the picker rows.
 */
export function labelLots(): LabelLot[] {
  const rows = psql(`SELECT l.id || '|' || l.lot_no || '|' || COALESCE(p.name, '') || '|' || COALESCE(p.sku, '') || '|'
  || COALESCE(l.production_date::text, '') || '|' || COALESCE(l.expiry_date::text, '') || '|' || COALESCE(s.name, '') || '|' || COALESCE(l.status, '')
FROM wms_lots l
LEFT JOIN hub_inv_products p ON p.id = l.product_id
LEFT JOIN srm_suppliers s ON s.id = l.supplier_id
ORDER BY (EXISTS (SELECT 1 FROM mfg_completions c WHERE c.lot_no = l.lot_no)) DESC, l.id;`)
    .split('\n').map(line => line.trim()).filter(line => line !== '')
  return rows.map((line) => {
    const [id, lotNo, product, sku, production, expiry, supplier, status] = line.split('|')
    return {
      id: Number(id), lot_no: lotNo ?? '', product: product ?? '', gtin: sku ?? '',
      production_date: production === '' ? null : production, expiry_date: expiry === '' ? null : expiry,
      supplier: supplier ?? '', status: status ?? '',
    }
  })
}

/**
 * Render one lot's label SVG: GS1-128 (AI 01+10+11+17, the legal minimum
 * four) or plain Code128 of the lot number; the human lines carry batch /
 * product / dates / supplier (食安法第 50/51 条记录要素). A lot without both
 * dates downgrades to plain mode with the dates line reading「效期未维护」,
 * a lot without a supplier prints「供应商未维护」in place — the legal four
 * never silently drop off the label (W6-R3: no filter-row degradation).
 * @param lotNo - the lot number.
 * @param code - 'gs1' | 'plain'.
 * @param size - '100x50' | '50x30'.
 * @returns the SVG document text.
 */
export function lotLabelSvg(lotNo: string, code: string, size: string): string {
  const row = psql(`SELECT l.lot_no || '|' || COALESCE(p.name, '') || '|' || COALESCE(p.sku, '') || '|' || l.product_id || '|'
  || COALESCE(l.production_date::text, '') || '|' || COALESCE(l.expiry_date::text, '') || '|' || COALESCE(s.name, '')
FROM wms_lots l
LEFT JOIN hub_inv_products p ON p.id = l.product_id
LEFT JOIN srm_suppliers s ON s.id = l.supplier_id
WHERE l.lot_no = ${sqlLit(lotNo)};`).trim()
  if (row === '') throw new Error(`批次 ${lotNo} 不存在`)
  const [lot, product, sku, productId, production, expiry, supplier] = row.split('|')
  const widthMm = size === '50x30' ? 50 : 100
  const heightMm = size === '50x30' ? 30 : 50
  const dateLine = production !== '' && expiry !== ''
    ? `生产 ${production ?? ''} · 到期 ${expiry ?? ''}`
    : '效期未维护（四日期缺失——数据质量信号）'
  const supplierLine = supplier === '' ? '供应商未维护（法定四要素缺失）' : `供应商：${supplier ?? ''}`
  if (code === 'plain' || production === '' || expiry === '') {
    return labelSvg({
      payload: lot ?? lotNo, gs1: false, human: lot ?? lotNo,
      lines: [product === '' ? '品名未维护' : product ?? '', dateLine, supplierLine].filter(line => line !== ''),
      widthMm, heightMm, title: '批次标签',
    })
  }
  // GTIN is product-level: a digits-only sku serves verbatim, otherwise the
  // deterministic internal GTIN-14 (prefix 9 + zero-padded product id) keeps
  // one product on one GTIN across labels.
  const gtin = /^\d{13,14}$/.test(sku ?? '') ? (sku ?? '') : `9${(productId ?? '0').padStart(13, '0')}`
  const payload = gs1Payload({ gtin, batch: lot ?? lotNo, productionDate: production ?? '', expiryDate: expiry ?? '' })
  const human = `(01)${gtin.padStart(14, '0')}(10)${lot ?? ''}(11)${(production ?? '').slice(2, 4)}${(production ?? '').slice(5, 7)}${(production ?? '').slice(8, 10)}(17)${(expiry ?? '').slice(2, 4)}${(expiry ?? '').slice(5, 7)}${(expiry ?? '').slice(8, 10)}`
  return labelSvg({
    payload, gs1: true, human,
    lines: [product === '' ? '品名未维护' : product ?? '', dateLine, supplierLine].filter(line => line !== ''),
    widthMm, heightMm, title: '批次标签',
  })
}
