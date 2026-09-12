/**
 * Build and deploy the demo portals (plan batch B5) to the NocoBase
 * gateway's static hosting: build demo-portal-crm/hub from their vendored
 * checkouts under platform/nocobase-portals/ and copy dist/ into
 * platform/nocobase/storage/dist-client/<crm|hub>/ (served at
 * http://<host>/dist/<name>/). Idempotent = directory replacement; source
 * clones are prerequisites (git clone --depth 1 from nocobase/demo-portal-*
 * with the network proxy, run once, recorded in the batch log).
 *
 * C6 brand pass: after every copy the entry HTML title is rebranded and the
 * favicon plus the light/dark logo-marks are overlaid with the DSH brand
 * assets (a rebuild restores the upstream demo marks, so the overlay rides
 * after each copy and reruns land on identical bytes).
 *
 * Usage: node --import tsx/esm examples/kb-agent/scripts/nocobase-portal-deploy.mts
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BRAND_TITLE, overlayFile } from './dsh-brand.mts'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const portalsRoot = join(repoRoot, 'platform', 'nocobase-portals')
const distClient = join(repoRoot, 'platform', 'nocobase', 'storage', 'dist-client')
const brandDir = join(repoRoot, 'examples/kb-agent/workspace/assets/brand')

const PORTALS = [
  { name: 'crm', dir: 'demo-portal-crm', base: '/dist/crm/' },
  { name: 'hub', dir: 'demo-portal-hub', base: '/dist/hub/' },
] as const

function run(command: string, args: string[], cwd: string, env: Record<string, string> = {}): boolean {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd, env: { ...process.env, ...env } })
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
  // NOCOBASE_PORTAL_BASE is the vendored vite.config's native deployment
  // prefix (vite.config.ts normalizeBase): without it the bundle emits
  // root-absolute asset URLs, so the portal's floating AI-chat icon 404s into
  // the gateway's HTML fallback and renders blank (C4 root cause).
  if (!run('pnpm', ['build'], source, { NOCOBASE_PORTAL_BASE: portal.base })) throw new Error(`build failed in ${portal.dir}`)
  const target = join(distClient, portal.name)
  mkdirSync(target, { recursive: true })
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  cpSync(join(source, 'dist'), target, { recursive: true })
  // Brand overlay: the shell reads the favicon and the light/dark logo-mark
  // slots (assetUrl resolves them against the runtime portal base); the
  // rounded-square DSH mark reads on both themes, so one asset fills the
  // light and dark slots.
  const markPath = join(brandDir, 'dsh-logo-mark.png')
  if (!existsSync(markPath)) throw new Error(`${markPath} missing (derive it from dsh-brand-logo.svg; see the C6 batch log)`)
  const overlays = [
    [join(brandDir, 'favicon.ico'), join(target, 'favicon.ico')],
    [markPath, join(target, 'logo-mark.png')],
    [markPath, join(target, 'logo-mark-dark.png')],
  ] as const
  for (const [overlaySource, overlayTarget] of overlays) {
    if (!existsSync(overlaySource)) throw new Error(`${overlaySource} missing (brand assets must ship with the example)`)
    console.log(`nocobase-portals: ${overlayFile(overlaySource, overlayTarget) ? `overlaid ${overlayTarget}` : `${overlayTarget} already ours (kept)`}`)
  }
  // The bundle resolves runtime asset URLs against window.NOCOBASE_PORTAL_BASE
  // (vite emits `new URL(path, new URL(window.NOCOBASE_PORTAL_BASE || "/",
  // window.location.origin))`), so the entry HTML must define it — without
  // the define every dynamically-resolved asset (the floating AI-chat icon)
  // falls back to the origin root and dies in the gateway's HTML fallback.
  // window.NOCOBASE_API_URL is defined explicitly at its direct-serving
  // default ("/api"): the same-origin proxy rewrites the root-absolute value
  // onto its prefix so the portal's runtime API probes ride the proxy too.
  const entry = join(target, 'index.html')
  let html = readFileSync(entry, 'utf8')
  // The two defines inject independently: an entry that already ships one
  // marker must not silence the other's injection, and each marker still
  // missing after injection fails the deploy instead of the portal runtime
  // gate that reads it.
  const missingDefines = [
    ['window.NOCOBASE_PORTAL_BASE', `window.NOCOBASE_PORTAL_BASE=${JSON.stringify(portal.base)}`],
    ['window.NOCOBASE_API_URL', 'window.NOCOBASE_API_URL="/api"'],
  ].filter(([marker]) => !html.includes(marker))
  if (missingDefines.length > 0) {
    const script = `<script>${missingDefines.map(([, expr]) => expr).join(';')}</script>`
    html = html.replace('<head>', `<head>\n    ${script}`)
    if (!html.includes(script)) throw new Error(`${portal.name} entry has no <head> element to host the ${missingDefines.map(([marker]) => marker).join(' + ')} define`)
    console.log(`nocobase-portals: injected ${missingDefines.map(([marker]) => marker).join(' + ')} into ${portal.name}/index.html`)
  }
  for (const marker of ['window.NOCOBASE_PORTAL_BASE', 'window.NOCOBASE_API_URL']) {
    if (!html.includes(marker)) throw new Error(`${portal.name} entry lacks ${marker} after injection`)
  }
  // The entry title is the DSH site name (the in-app DocumentTitleHandler
  // appName carries the runtime title); fail loud when a template change
  // removes the element the rebrand rides on.
  if (!html.includes(`<title>${BRAND_TITLE}</title>`)) {
    const titled = html.replace(/<title>[^<]*<\/title>/u, `<title>${BRAND_TITLE}</title>`)
    if (titled === html) throw new Error(`${portal.name} entry carries no <title> element to rebrand`)
    html = titled
    console.log(`nocobase-portals: rebranded ${portal.name} entry title -> "${BRAND_TITLE}"`)
  }
  writeFileSync(entry, html)
  console.log(`nocobase-portals: deployed ${portal.name} → ${target} (served at /dist/${portal.name}/)`)
}
console.log('nocobase-portals: done')
