/**
 * Seed the batch-5 data-asset market catalog (workspace/data/market/
 * assets-batch5.json) into the NocoBase `datasets` collection. Two moves:
 * (1) extend the collection with the market metadata fields (domain, source,
 * pricing, summary) — idempotent per field via fields:create; (2) seed each
 * asset as a document-kind row — idempotent by title. The connector's
 * discovery projects these rows onto the market page as document cards whose
 * blurb is the summary field.
 *
 * Usage (repo root, tsx loader, credentials from ambient env or root .env):
 *   node --env-file=.env --import tsx/esm examples/kb-agent/scripts/seed-market.mts
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { NocoBaseClient } from '@deepseek-ai/dsh-connector-nocobase'

/** One market-asset row as the fixture declares it. */
interface AssetFixtureRow {
  readonly title: string
  readonly domain: string
  readonly source: string
  readonly pricing: string
  readonly summary: string
  readonly content: string
  readonly updatedAt: string
}

/** The fixture file: a $comment plus the asset rows. */
interface AssetFixture {
  readonly assets: readonly AssetFixtureRow[]
}

/** The market-metadata fields this seeder owns on the datasets collection. */
const MARKET_FIELDS: ReadonlyArray<{ name: string; type: string }> = [
  { name: 'domain', type: 'string' },
  { name: 'source', type: 'string' },
  { name: 'pricing', type: 'string' },
  { name: 'summary', type: 'text' },
]

/** Run report counts. */
interface MarketReport { fieldsCreated: number; assetsCreated: number; assetsSkipped: number }

const exampleRoot = new URL('..', import.meta.url).pathname

/**
 * Ensure the metadata fields exist, then seed the catalog by title.
 * @param baseUrl - the NocoBase root, for the raw fields:create REST call.
 * @param token - an authorized API token.
 * @param client - the REST client for row reads/writes.
 * @param fixtures - the parsed asset fixture source.
 * @returns field/asset created/skipped counts.
 */
export async function seedMarketCatalog(
  baseUrl: string,
  token: string,
  client: NocoBaseClient,
  fixtures: AssetFixture,
): Promise<MarketReport> {
  // Field extension is idempotent: probe fields:list scoped to datasets.
  const fieldsResponse = await fetch(
    `${baseUrl}/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'datasets' } }))}&pageSize=200`,
    { headers: { authorization: `Bearer ${token}` } },
  )
  const fieldsPayload = await fieldsResponse.json() as { data?: Array<{ name?: string }> }
  const existing = new Set((fieldsPayload.data ?? []).map(field => field.name))
  let fieldsCreated = 0
  for (const field of MARKET_FIELDS) {
    if (existing.has(field.name)) continue
    const created = await fetch(`${baseUrl}/api/fields:create`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ collectionName: 'datasets', ...field }),
    })
    if (!created.ok) throw new Error(`fields:create ${field.name} -> HTTP ${String(created.status)}`)
    fieldsCreated += 1
  }

  const titles = new Set(
    (await client.list<{ title: string }>('datasets', { page: 1, pageSize: 300 })).rows.map(row => row.title),
  )
  let assetsCreated = 0
  let assetsSkipped = 0
  for (const row of fixtures.assets) {
    if (titles.has(row.title)) {
      assetsSkipped += 1
      continue
    }
    await client.create('datasets', {
      kind: 'document',
      title: row.title,
      domain: row.domain,
      source: row.source,
      pricing: row.pricing,
      summary: row.summary,
      content: row.content,
      updatedAt: row.updatedAt,
    })
    assetsCreated += 1
  }
  return { fieldsCreated, assetsCreated, assetsSkipped }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const baseUrl = process.env.NOCOBASE_BASE_URL
  const token = process.env.NOCOBASE_API_KEY
  if (baseUrl === undefined || baseUrl.length === 0 || token === undefined || token.length === 0) {
    console.error('seed-market: NOCOBASE_BASE_URL and NOCOBASE_API_KEY must be set (ambient or --env-file=.env)')
    process.exit(1)
  }
  const fixtures = JSON.parse(await readFile(join(exampleRoot, 'workspace/data/market/assets-batch5.json'), 'utf8')) as AssetFixture
  const report = await seedMarketCatalog(baseUrl, token, new NocoBaseClient({ baseUrl, token }), fixtures)
  console.log(`seed-market: ${JSON.stringify(report)}`)
}
