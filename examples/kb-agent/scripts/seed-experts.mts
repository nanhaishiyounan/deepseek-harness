/**
 * Seed the 张红喜 expert dataset into a NocoBase backend. The authoritative
 * fixture source is workspace/data/experts/dataset.json (the same JSON the
 * connector-nocobase mock serves), so the seeded backend and the mock wire
 * can never drift apart. Creates go row by row through the resourcer's
 * `:create` action; server-assigned ids are captured so expert_services rows
 * can remap their expertId onto the created expert. The seeding logic is an
 * exported function; the command entry runs only when executed directly.
 *
 * Usage (repo root, tsx loader):
 *   NOCOBASE_BASE_URL=http://127.0.0.1:13000 NOCOBASE_API_KEY=... \
 *     node --import tsx/esm examples/kb-agent/scripts/seed-experts.mts
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { NocoBaseClient } from '@deepseek-ai/dsh-connector-nocobase'

/** One fixture source file: the four collections the expert dataset spans. */
export interface ExpertFixtureSource {
  experts: Array<Omit<import('@deepseek-ai/dsh-connector-nocobase').NocoBaseExpertRow, 'id'> & { id: number }>
  expert_services: Array<Omit<import('@deepseek-ai/dsh-connector-nocobase').NocoBaseServiceRow, 'id'> & { id: number }>
  datasets: Array<Omit<import('@deepseek-ai/dsh-connector-nocobase').NocoBaseDatasetRow, 'id'> & { id: number }>
  customs_export: import('@deepseek-ai/dsh-connector-nocobase').NocoBaseSourceRow[]
}

/** Per-collection created-row counts. */
export interface SeedReport {
  experts: number
  expertServices: number
  datasets: number
  sourceRows: number
}

/** Drop the fixture id (NocoBase assigns primary keys) keeping every other field. */
function withoutId(row: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, ...fields } = row
  return fields
}

/**
 * Seed every fixture collection into the backend the client points at.
 * Expert ids returned by the server remap the expert_services rows' expertId
 * before they are created.
 * @param client - the NocoBase REST client bound to the target backend.
 * @param fixtures - the parsed authoritative fixture source.
 * @param signal - cancellation forwarded to every create.
 * @returns the per-collection created-row counts.
 */
export async function seedExpertDataset(
  client: NocoBaseClient,
  fixtures: ExpertFixtureSource,
  signal?: AbortSignal,
): Promise<SeedReport> {
  const expertIds = new Map<number, number>()
  for (const row of fixtures.experts) {
    const created = await client.create('experts', withoutId(row), signal)
    expertIds.set(row.id, created.id)
  }
  let expertServices = 0
  for (const row of fixtures.expert_services) {
    const fields = withoutId(row)
    if (row.expertId !== undefined && expertIds.has(row.expertId)) {
      fields.expertId = expertIds.get(row.expertId)
    }
    await client.create('expert_services', fields, signal)
    expertServices += 1
  }
  let datasets = 0
  for (const row of fixtures.datasets) {
    await client.create('datasets', withoutId(row), signal)
    datasets += 1
  }
  let sourceRows = 0
  for (const row of fixtures.customs_export) {
    await client.create('customs_export', row, signal)
    sourceRows += 1
  }
  return { experts: fixtures.experts.length, expertServices, datasets, sourceRows }
}

const exampleRoot = new URL('..', import.meta.url).pathname

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const baseUrl = process.env.NOCOBASE_BASE_URL
  const token = process.env.NOCOBASE_API_KEY
  if (baseUrl === undefined || baseUrl.length === 0 || token === undefined || token.length === 0) {
    console.error('seed-experts: NOCOBASE_BASE_URL and NOCOBASE_API_KEY must be set (the NocoBase business backend this seeds)')
    process.exit(1)
  }
  const fixtures = JSON.parse(await readFile(join(exampleRoot, 'workspace/data/experts/dataset.json'), 'utf8')) as ExpertFixtureSource
  const report = await seedExpertDataset(new NocoBaseClient({ baseUrl, token }), fixtures)
  console.log(`seeded 张红喜 expert dataset: ${JSON.stringify(report)}`)
}
