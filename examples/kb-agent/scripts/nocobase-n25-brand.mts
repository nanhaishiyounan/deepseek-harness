/**
 * N25 — brand whitelabel for the OSS boundary (plan batch C4): point
 * systemSettings at the DSH mark (title + logo) and overlay the built
 * client's favicon and fallback nocobase.png after `yarn build`. License
 * scope (LICENSE §5.2 OSS): only the top-left main logo and site title may
 * change; the footer "Powered by NocoBase" and other brand marks stay —
 * the QUICKSTART whitelabel section carries the boundary statement.
 *
 * The logo slot carries a plain object, not an association — the same
 * shape plugin-system-settings' install uses when file-manager is absent
 * (server.ts: { title, filename, extname, mimetype, url }). The attachment
 * store's ACL blocks anonymous reads (the login page renders the logo
 * before any session exists), so the SVG lives in the client's public
 * statics where every reader reaches it.
 *
 * Idempotent: systemSettings updates only on drift; file overlays compare
 * bytes before writing.
 *
 * Usage: node --import tsx/esm examples/kb-agent/scripts/nocobase-n25-brand.mts
 */
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const baseUrl = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
const rootEmail = process.env.NOCOBASE_ROOT_EMAIL ?? 'admin@nocobase.com'
const rootPassword = process.env.NOCOBASE_ROOT_PASSWORD ?? 'admin123'

const brandDir = join(repoRoot, 'examples/kb-agent/workspace/assets/brand')
const logoPath = join(brandDir, 'dsh-brand-logo.svg')
const faviconPath = join(brandDir, 'favicon.ico')
const fallbackPngPath = join(brandDir, 'dsh-fallback.png')
const BRAND_TITLE = 'DSH食品业务平台'
const LOGO_TITLE = 'dsh-brand-logo'
/** Public static URL the logo plain-object points at. */
const LOGO_URL = '/dsh-brand-logo.svg'

/** Built client roots whose favicon/, nocobase.png, and logo get the overlay. */
const CLIENT_ROOTS = ['client', 'client-v2'].map(name => join(repoRoot, 'platform/nocobase/packages/core/app/dist', name))

async function signIn(): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth:signIn`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account: rootEmail, password: rootPassword }),
  })
  const payload = await response.json().catch(() => null)
  const token = payload?.data?.token
  if (typeof token !== 'string' || token.length === 0) throw new Error(`sign-in as ${rootEmail} returned no token`)
  return token
}

async function dataOf(token: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`${method} ${path} -> HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`)
  return payload?.data ?? null
}

async function ensureSystemSettings(token: string): Promise<void> {
  const settings = await dataOf(token, 'GET', '/api/systemSettings:get')
  const logoMatch = settings?.logo?.title === LOGO_TITLE && settings?.logo?.url === LOGO_URL
  if (settings?.title === BRAND_TITLE && logoMatch) {
    console.log('nocobase-n25: systemSettings brand already applied (kept)')
    return
  }
  await dataOf(token, 'POST', `/api/systemSettings:update?filterByTk=${settings.id}`, {
    title: BRAND_TITLE,
    logo: { title: LOGO_TITLE, filename: 'dsh-brand-logo.svg', extname: '.svg', mimetype: 'image/svg+xml', url: LOGO_URL },
  })
  console.log(`nocobase-n25: systemSettings title -> "${BRAND_TITLE}" + logo ${LOGO_URL}`)
}

/** Byte-compared overlay so rebuilds restore the official assets and reruns reapply ours. */
function overlayFile(source: string, target: string): boolean {
  if (existsSync(target) && readFileSync(target).equals(readFileSync(source))) return false
  copyFileSync(source, target)
  return true
}

function overlayStaticAssets(): void {
  for (const root of CLIENT_ROOTS) {
    if (!existsSync(root)) continue
    const overlays = [
      [faviconPath, join(root, 'favicon', 'favicon.ico')],
      [fallbackPngPath, join(root, 'nocobase.png')],
      [logoPath, join(root, 'dsh-brand-logo.svg')],
    ] as const
    for (const [source, target] of overlays) {
      console.log(`nocobase-n25: ${overlayFile(source, target) ? `overlaid ${target}` : `${target} already ours (kept)`}`)
    }
  }
}

async function main(): Promise<void> {
  if (!existsSync(logoPath)) throw new Error(`${logoPath} missing (brand assets must ship with the example)`)
  if (!existsSync(faviconPath)) throw new Error(`${faviconPath} missing (derive it from dsh-favicon.svg; see the C4 batch log)`)
  if (!existsSync(fallbackPngPath)) throw new Error(`${fallbackPngPath} missing (derive it from dsh-favicon.svg; see the C4 batch log)`)
  const token = await signIn()
  await ensureSystemSettings(token)
  overlayStaticAssets()
  console.log('nocobase-n25: done — rerun nocobase-portal-deploy.mts if the portal assets need the base rebuild')
}

await main()
