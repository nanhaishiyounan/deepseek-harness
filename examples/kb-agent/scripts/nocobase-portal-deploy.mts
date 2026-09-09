/**
 * Build and deploy the demo portals (plan batch B5) to the NocoBase
 * gateway's static hosting: build demo-portal-crm/hub from their vendored
 * checkouts under platform/nocobase-portals/ and copy dist/ into
 * platform/nocobase/storage/dist-client/<crm|hub>/ (served at
 * http://<host>/dist/<name>/). Idempotent = directory replacement; source
 * clones are prerequisites (git clone --depth 1 from nocobase/demo-portal-*
 * with the network proxy, run once, recorded in the batch log).
 *
 * Usage: node --import tsx/esm examples/kb-agent/scripts/nocobase-portal-deploy.mts
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const portalsRoot = join(repoRoot, 'platform', 'nocobase-portals')
const distClient = join(repoRoot, 'platform', 'nocobase', 'storage', 'dist-client')

const PORTALS = [
  { name: 'crm', dir: 'demo-portal-crm', base: '/dist/crm/' },
  { name: 'hub', dir: 'demo-portal-hub', base: '/dist/hub/' },
] as const

function run(command: string, args: string[], cwd: string): boolean {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd })
  return result.status === 0
}

for (const portal of PORTALS) {
  const source = join(portalsRoot, portal.dir)
  if (!existsSync(join(source, 'package.json'))) {
    throw new Error(`${source} missing; clone nocobase/${portal.dir} there first (see plans/nocobase-full-features batch B5 log)`)
  }
  if (!existsSync(join(source, 'node_modules'))) {
    console.log(`nocobase-portals: pnpm install in ${portal.dir} (needs the network proxy)`)
    if (!run('pnpm', ['install'], source)) throw new Error(`pnpm install failed in ${portal.dir}`)
  }
  console.log(`nocobase-portals: building ${portal.dir}`)
  if (!run('pnpm', ['build'], source)) throw new Error(`build failed in ${portal.dir}`)
  const target = join(distClient, portal.name)
  mkdirSync(target, { recursive: true })
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  cpSync(join(source, 'dist'), target, { recursive: true })
  console.log(`nocobase-portals: deployed ${portal.name} → ${target} (served at /dist/${portal.name}/)`)
}
console.log('nocobase-portals: done')
