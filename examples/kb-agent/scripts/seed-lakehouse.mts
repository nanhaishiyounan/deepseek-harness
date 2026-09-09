/**
 * Seed three business-meaningful tables into the kb-agent lakehouse through
 * the same seam the workbench upload channel rides — `lakehouse.load` writes
 * the Parquet file and registers the catalog row, and each load lands a
 * connector transfer record so the connector page's delivery timeline has a
 * real trail. Tables (deterministic generated rows, fixed pseudo-random
 * seed so re-runs are byte-stable):
 *
 *   ingredient_prices_monthly  240 rows — 10 原辅料 × 2 市场 × 12 个月
 *   import_export_monthly      120 rows — 5 目的国 × 2 品类 × 12 个月
 *   cold_chain_rates           108 rows — 9 线路 × 3 温区 × 4 季度
 *
 * Same-table reloads replace (the seam's own idempotency); transfer records
 * are append-only by design (one fresh trail entry per run).
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/seed-lakehouse.mts
 */
import { Context } from '@deepseek-ai/cordis'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import * as LakehouseSqliteCatalog from '@deepseek-ai/dsh-lakehouse-sqlite-catalog'
import * as LakehouseDuckDb from '@deepseek-ai/dsh-lakehouse-duckdb'
import type { TabularData } from '@deepseek-ai/dsh-lakehouse'

const tenant = 'demo-food-co'

/** Deterministic pseudo-random in [0,1) — a fixed-seed LCG keeps reruns stable. */
function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296
    return state / 4_294_967_296
  }
}

/** Round to `digits` decimals. */
function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** Build the monthly ingredient-price table: 10 materials × 2 markets × 12 months. */
function ingredientPrices(): TabularData {
  const materials = ['白砂糖(一级)', '面粉(中筋)', '面粉(高筋)', '大豆油(一级)', '棕榈油(24度)', '白羽肉鸡(毛鸡)', '牛肉(牛腩)', '辣椒干(三樱椒)', '白芝麻', '瓦楞纸箱(五层)'] as const
  const markets = ['漯河批发市场', '郑州批发市场'] as const
  const units = ['元/吨', '元/吨', '元/吨', '元/吨', '元/吨', '元/斤', '元/公斤', '元/公斤', '元/公斤', '元/平方米'] as const
  const bases = [6380, 3120, 3290, 8080, 8760, 3.72, 57.8, 20.8, 14.6, 3.78] as const
  const random = seededRandom(20260901)
  const columns = [
    { name: 'month', sqlType: 'TEXT' },
    { name: 'material', sqlType: 'TEXT' },
    { name: 'market', sqlType: 'TEXT' },
    { name: 'unit', sqlType: 'TEXT' },
    { name: 'price_avg', sqlType: 'DOUBLE' },
    { name: 'chg_mom', sqlType: 'DOUBLE' },
  ] as const
  const rows: readonly unknown[][] = []
  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const month = monthIndex === 0 ? '2025-10' : monthIndex === 11 ? '2026-09' : `2026-${String(monthIndex).padStart(2, '0')}`
    for (const [materialIndex, material] of materials.entries()) {
      for (const market of markets) {
        const drift = 1 + (random() - 0.5) * 0.06
        const marketPremium = market === '郑州批发市场' ? 1.005 : 1.0
        const price = round(bases[materialIndex]! * drift * marketPremium, 2)
        rows.push([month, material, market, units[materialIndex]!, price, round((random() - 0.45) * 6, 1)])
      }
    }
  }
  return { columns, rows }
}

/** Build the monthly import/export table: 5 destination countries × 2 categories × 12 months. */
function importExport(): TabularData {
  const countries = ['俄罗斯', '哈萨克斯坦', '乌兹别克斯坦', '吉尔吉斯斯坦', '印度尼西亚'] as const
  const categories = ['调味品', '休闲食品'] as const
  const random = seededRandom(20260902)
  const columns = [
    { name: 'month', sqlType: 'TEXT' },
    { name: 'dest_country', sqlType: 'TEXT' },
    { name: 'category', sqlType: 'TEXT' },
    { name: 'export_value_10kusd', sqlType: 'DOUBLE' },
    { name: 'export_qty_t', sqlType: 'DOUBLE' },
    { name: 'avg_price_usd_t', sqlType: 'DOUBLE' },
    { name: 'chg_yoy', sqlType: 'DOUBLE' },
  ] as const
  const rows: readonly unknown[][] = []
  for (let monthIndex = 1; monthIndex <= 12; monthIndex += 1) {
    const month = monthIndex <= 9 ? `2026-${String(monthIndex).padStart(2, '0')}` : monthIndex === 10 ? '2025-11' : monthIndex === 11 ? '2025-12' : '2026-09'
    for (const country of countries) {
      for (const category of categories) {
        const qty = round(180 + random() * 900, 1)
        const avgPrice = round(980 + random() * 640, 0)
        rows.push([month, country, category, round(qty * avgPrice / 10_000, 1), qty, avgPrice, round((random() - 0.3) * 30, 1)])
      }
    }
  }
  return { columns, rows }
}

/** Build the cold-chain rate table: 9 lanes × 3 temperature zones × 4 quarters. */
function coldChainRates(): TabularData {
  const lanes = [
    '漯河-北京', '漯河-上海', '漯河-广州', '郑州-乌鲁木齐', '漯河-莫斯科(分段)', '郑州-阿拉木图(分段)',
    '漯河-青岛港', '漯河-成都', '郑州-哈尔滨',
  ] as const
  const zones = ['冷冻(-18℃)', '冷藏(0-4℃)', '恒温(≤25℃)'] as const
  const random = seededRandom(20260903)
  const columns = [
    { name: 'quarter', sqlType: 'TEXT' },
    { name: 'lane', sqlType: 'TEXT' },
    { name: 'temp_zone', sqlType: 'TEXT' },
    { name: 'rate_cny_t', sqlType: 'DOUBLE' },
    { name: 'surcharge_cny_t', sqlType: 'DOUBLE' },
    { name: 'transit_days', sqlType: 'INTEGER' },
  ] as const
  const baseRates = [420, 560, 760, 1180, 3050, 2680, 690, 830, 950] as const
  const baseDays = [2, 3, 4, 6, 18, 14, 3, 4, 5] as const
  const quarters = ['2025-Q4', '2026-Q1', '2026-Q2', '2026-Q3'] as const
  const rows: readonly unknown[][] = []
  for (const [quarterIndex, quarter] of quarters.entries()) {
    for (const [laneIndex, lane] of lanes.entries()) {
      for (const [zoneIndex, zone] of zones.entries()) {
        const seasonal = 1 + quarterIndex * 0.03 + (quarterIndex === 0 ? 0.08 : 0)
        const zoneFactor = zoneIndex === 0 ? 1.12 : zoneIndex === 1 ? 1.05 : 1.0
        const rate = round(baseRates[laneIndex]! * seasonal * zoneFactor * (1 + (random() - 0.5) * 0.05), 0)
        rows.push([quarter, lane, zone, rate, round(rate * 0.08, 0), baseDays[laneIndex]! + Math.floor(random() * 3)])
      }
    }
  }
  return { columns, rows }
}

/** The three seed tables with their catalog identities. */
const SEED_TABLES: ReadonlyArray<{ tableName: string; title: string; build: () => TabularData }> = [
  { tableName: 'ingredient_prices_monthly', title: '原辅料价格月度表', build: ingredientPrices },
  { tableName: 'import_export_monthly', title: '食品进出口月度统计表', build: importExport },
  { tableName: 'cold_chain_rates', title: '冷链物流运价表', build: coldChainRates },
]

const ctx = new Context()
try {
  await ctx.plugin(LakehouseRuntime, { dataRoot: 'examples/kb-agent/workspace/lakehouse' })
  await ctx.plugin(LakehouseSqliteCatalog, { path: 'examples/kb-agent/workspace/lakehouse-catalog.sqlite' })
  await ctx.plugin(LakehouseDuckDb, {})
  const lakehouse = ctx.get('lakehouse')
  if (lakehouse === undefined) throw new Error('lakehouse service did not compose')

  for (const table of SEED_TABLES) {
    const loaded = await lakehouse.load({
      tenantId: tenant,
      tableName: table.tableName,
      tabular: table.build(),
      provenance: { provider: 'batch5-seed', collectedSource: `scripts/seed-lakehouse.mts (${table.title})` },
    })
    await lakehouse.recordTransfer({
      source: 'batch5-seed',
      destination: 'lakehouse',
      datasetId: table.tableName,
      rows: loaded.table.rowCount,
      transferredAt: new Date().toISOString(),
    })
    console.log(`seed-lakehouse: ${table.tableName} loaded ${String(loaded.table.rowCount)} rows (replaced=${String(loaded.replaced)})`)
  }
  const tables = await lakehouse.listTables(tenant)
  console.log(`seed-lakehouse: tenant now holds ${String(tables.length)} tables — ${tables.map(table => table.tableName).join(', ')}`)
} finally {
  await ctx.fiber.dispose()
}
