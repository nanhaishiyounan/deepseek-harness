// W24-B6: register the five-source metalake and its catalogs in Gravitino,
// then verify the Iceberg REST bridge answers for the lakehouse catalog.
// Idempotent: re-running refreshes nothing (existing objects are skipped by
// checking the API first). Run from the repository root:
//   node examples/kb-agent/scripts/b6-register-metalake.mts
import { mkdirSync, writeFileSync } from 'node:fs'

const GV = process.env.GRAVITINO_URL ?? 'http://localhost:8090'
const EVIDENCE_DIR = 'research/2026-10-09-w24-rebuild/b6-governance'
const log = []
const say = (line) => { console.log(line); log.push(line) }

async function api(path, init) {
  const res = await fetch(`${GV}${path}`, init)
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

async function ensureMetalake() {
  const check = await api('/api/metalakes/dsh')
  if (check.status === 200) { say(`metalake dsh exists (version ${check.body?.metalake?.audit?.createTime ?? '?'})`) ; return }
  const created = await api('/api/metalakes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'dsh', comment: 'dsh five-source catalog hub (W24-B6)' }),
  })
  say(`create metalake dsh -> ${created.status} ${JSON.stringify(created.body).slice(0, 120)}`)
}

async function ensureCatalog(catalog) {
  const check = await api(`/api/metalakes/dsh/catalogs/${catalog.name}`)
  if (check.status === 200) { say(`catalog ${catalog.name} exists`); return }
  const created = await api('/api/metalakes/dsh/catalogs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(catalog),
  })
  say(`create catalog ${catalog.name} (${catalog.provider}) -> ${created.status} ${created.status >= 400 ? JSON.stringify(created.body).slice(0, 260) : 'ok'}`)
}

// The four Gravitino-side seats for the five sources (the graph seat rides
// the model catalog per the research report's 3.5/4 verdict: no Neo4j
// connector exists, so Neo4j registers as a model asset + the engine-side
// governance catalog carries its live inventory).
const CATALOGS = [
  {
    name: 'lakehouse',
    type: 'relational',
    provider: 'lakehouse-iceberg',
    comment: 'Tier1 lakehouse: Iceberg tables over SeaweedFS S3 (warehouse s3://lakehouse/)',
    properties: {
      'catalog-backend': 'memory',
      // placeholder uri: the memory backend needs none, but the create
      // validation requires the key.
      uri: 'jdbc:h2:mem:iceberg',
      'io-impl': 'org.apache.iceberg.aws.s3.S3FileIO',
      warehouse: 's3://lakehouse/',
      's3-endpoint': 'http://dsh-seaweedfs:8333',
      's3-access-key-id': process.env.S3_ACCESS_KEY ?? 'dshlake',
      's3-secret-access-key': process.env.S3_SECRET_KEY ?? 'dshlake-secret',
      's3-path-style-access': 'true',
    },
  },
  {
    name: 'kb-corpus',
    type: 'fileset',
    provider: 'fileset',
    comment: 'Knowledge-base corpus files (WeKnora sidecar corpus + kb-sqlite workspace)',
    properties: { location: 'file:///root/gravitino/data/kb-corpus' },
  },
  {
    name: 'carbon-business',
    type: 'relational',
    provider: 'jdbc-postgresql',
    comment: 'carbon business ERP PostgreSQL (federated metadata; read via the carbon PG port)',
    properties: {
      'jdbc-url': process.env.CARBON_JDBC_URL ?? 'jdbc:postgresql://host.docker.internal:51538/postgres',
      'jdbc-user': process.env.CARBON_JDBC_USER ?? 'postgres',
      'jdbc-password': process.env.CARBON_JDBC_PASSWORD ?? 'postgres',
      'jdbc-driver': 'org.postgresql.Driver',
    },
  },
  {
    name: 'ontology-graph',
    type: 'model',
    provider: 'model',
    comment: 'Ontology registry versions + the Neo4j graph asset (no graph connector; registered as model assets per r2a 3.6)',
    properties: {},
  },
]

say(`== gravitino ${GV}`)
await ensureMetalake()
for (const catalog of CATALOGS) await ensureCatalog(catalog)

const listed = await api('/api/metalakes/dsh/catalogs')
say(`== metalake dsh catalogs: ${listed.body?.catalogs?.map((c) => c.name).join(', ')}`)

// The Iceberg REST bridge (aux :8181): its catalog list must include the
// lakehouse catalog now that the metalake carries it.
const rest = await fetch(`${process.env.GRAVITINO_REST_URL ?? 'http://localhost:8181'}/iceberg/v1/config?warehouse=lakehouse`)
say(`== iceberg-rest /v1/config?warehouse=lakehouse -> ${rest.status}`)
say(JSON.stringify(await rest.json()).slice(0, 200))

mkdirSync(EVIDENCE_DIR, { recursive: true })
writeFileSync(`${EVIDENCE_DIR}/04-metalake-registration.txt`, `${log.join('\n')}\n`)
say(`evidence -> ${EVIDENCE_DIR}/04-metalake-registration.txt`)
