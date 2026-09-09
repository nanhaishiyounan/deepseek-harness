/**
 * Seed the batch-5 expert roster (workspace/data/experts/roster-batch5.json)
 * into a NocoBase backend: 32 domain experts with orderable services and
 * knowledge-asset documents. Idempotent by natural keys — experts and
 * services by name, knowledge assets by title — so re-runs neither
 * duplicate nor mutate existing rows. Also removes leftover e2e/demo
 * marker rows (`nb-e2e-*`, `演示专家-*`) that pollute the market catalog;
 * the authoritative 张红喜 dataset.json stays untouched.
 *
 * Usage (repo root, tsx loader, credentials from ambient env or root .env):
 *   node --env-file=.env --import tsx/esm examples/kb-agent/scripts/seed-experts-roster.mts
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { NocoBaseClient } from '@deepseek-ai/dsh-connector-nocobase'

/** The roster fixture: same row shapes as dataset.json, disjoint natural keys. */
export interface RosterFixture {
  readonly experts: ReadonlyArray<{ readonly id: number; readonly name: string; readonly org?: string; readonly domains?: string; readonly bio?: string; readonly updatedAt?: string }>
  readonly expert_services: ReadonlyArray<{ readonly id: number; readonly expertId?: number; readonly name: string; readonly deliverable?: string; readonly price?: string; readonly summary?: string; readonly updatedAt?: string }>
  readonly knowledge_assets: ReadonlyArray<{ readonly kind: 'document'; readonly title: string; readonly content?: string; readonly updatedAt?: string }>
}

/** Per-collection outcome counts for the run report. */
interface RosterReport {
  expertsCreated: number
  expertsSkipped: number
  servicesCreated: number
  servicesSkipped: number
  assetsCreated: number
  assetsSkipped: number
  residueRemoved: number
}

const exampleRoot = new URL('..', import.meta.url).pathname

/** Marker prefixes identifying test-residue expert rows (never real roster names). */
const RESIDUE_PREFIXES = ['nb-e2e-', '演示专家-'] as const

/**
 * True when both provenance fields are empty. Every roster and dataset.json
 * expert carries org and domains; e2e/demo rows are created with a name only,
 * so this is the narrow guard that keeps a hypothetical same-prefix real row
 * from ever being destroyed by the cleanup.
 */
function isBlankResidue(row: { org?: string | null; domains?: string | null }): boolean {
  return (row.org ?? '') === '' && (row.domains ?? '') === ''
}

/**
 * Seed the roster, the residue cleanup, and report counts.
 * @param client - the NocoBase REST client bound to the target backend.
 * @param fixtures - the parsed roster fixture source.
 * @returns per-collection created/skipped/removed counts.
 */
export async function seedExpertRoster(
  client: NocoBaseClient,
  fixtures: RosterFixture,
  credentials: { baseUrl: string; token: string },
): Promise<RosterReport> {
  // Residue cleanup first so the market catalog reflects only real rows. A
  // row is residue only when its name carries a marker prefix AND both
  // provenance fields are blank. The destroy endpoint is raw REST (the client
  // class carries no destroy face), so the caller's credentials ride the
  // header directly.
  let residueRemoved = 0
  const expertList = await client.list<{ id: number; name: string; org?: string | null; domains?: string | null }>('experts', { page: 1, pageSize: 200 })
  for (const row of expertList.rows) {
    if (!RESIDUE_PREFIXES.some(prefix => row.name.startsWith(prefix))) continue
    if (!isBlankResidue(row)) continue
    await fetch(`${credentials.baseUrl}/api/experts:destroy?filterByTk=${row.id}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${credentials.token}` },
    })
    residueRemoved += 1
  }

  // Experts by name; server-assigned ids remap the roster's local expert ids.
  const existingExperts = new Map<string, number>()
  for (const row of await client.list<{ id: number; name: string }>('experts', { page: 1, pageSize: 200 }).then(result => result.rows)) {
    existingExperts.set(row.name, row.id)
  }
  const idRemap = new Map<number, number>()
  let expertsCreated = 0
  let expertsSkipped = 0
  for (const row of fixtures.experts) {
    if (existingExperts.has(row.name)) {
      idRemap.set(row.id, existingExperts.get(row.name)!)
      expertsSkipped += 1
      continue
    }
    const { id: _localId, ...fields } = row
    const created = await client.create('experts', fields)
    idRemap.set(row.id, created.id)
    expertsCreated += 1
  }

  // Services by name; expertId remapped onto server ids when the roster named one.
  const existingServices = new Set(
    (await client.list<{ name: string }>('expert_services', { page: 1, pageSize: 300 })).rows.map(row => row.name),
  )
  let servicesCreated = 0
  let servicesSkipped = 0
  for (const row of fixtures.expert_services) {
    if (existingServices.has(row.name)) {
      servicesSkipped += 1
      continue
    }
    const { id: _localId, expertId, ...fields } = row
    await client.create('expert_services', expertId !== undefined && idRemap.has(expertId) ? { ...fields, expertId: idRemap.get(expertId) } : fields)
    servicesCreated += 1
  }

  // Knowledge assets are document-kind datasets rows, idempotent by title.
  const existingTitles = new Set(
    (await client.list<{ title: string }>('datasets', { page: 1, pageSize: 300 })).rows.map(row => row.title),
  )
  let assetsCreated = 0
  let assetsSkipped = 0
  for (const row of fixtures.knowledge_assets) {
    if (existingTitles.has(row.title)) {
      assetsSkipped += 1
      continue
    }
    await client.create('datasets', { kind: 'document', title: row.title, content: row.content ?? '', updatedAt: row.updatedAt })
    assetsCreated += 1
  }

  return { expertsCreated, expertsSkipped, servicesCreated, servicesSkipped, assetsCreated, assetsSkipped, residueRemoved }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const baseUrl = process.env.NOCOBASE_BASE_URL
  const token = process.env.NOCOBASE_API_KEY
  if (baseUrl === undefined || baseUrl.length === 0 || token === undefined || token.length === 0) {
    console.error('seed-experts-roster: NOCOBASE_BASE_URL and NOCOBASE_API_KEY must be set (ambient or --env-file=.env)')
    process.exit(1)
  }
  const fixtures = JSON.parse(await readFile(join(exampleRoot, 'workspace/data/experts/roster-batch5.json'), 'utf8')) as RosterFixture
  const report = await seedExpertRoster(new NocoBaseClient({ baseUrl, token }), fixtures, { baseUrl, token })
  console.log(`seed-experts-roster: ${JSON.stringify(report)}`)
}
