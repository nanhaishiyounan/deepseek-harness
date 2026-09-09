/**
 * URL admission for the `kb_ingest_url` channel: scheme and credential
 * hygiene plus the private-network (SSRF) gate. The web seam's fetch provider
 * already enforces http(s)-only, credential-free, same-origin-redirect URLs;
 * this module adds what it deliberately defers — refusing to fetch hosts that
 * resolve into private, loopback, link-local, CGNAT, or unique-local address
 * space — so the knowledge base never becomes an intranet probe.
 * @module @deepseek-ai/dsh-tool-kb/url-policy
 */

import { lookup } from 'node:dns/promises'
import { KB_DOC_KINDS } from '@deepseek-ai/dsh-kb'

/** Inclusive upper bound on a request URL's length. */
const MAX_URL_LENGTH = 2_048

/** IPv4 private/reserved ranges as [network address, prefix bits] pairs, networks in hex form. */
const IPV4_PRIVATE: ReadonlyArray<readonly [bigint, bigint]> = [
  [0x00000000n, 8n], // "this" network 0.0.0.0/8
  [0x0A000000n, 8n], // RFC1918 private 10.0.0.0/8
  [0x64400000n, 10n], // CGNAT 100.64.0.0/10
  [0x7F000000n, 8n], // loopback 127.0.0.0/8
  [0xA9FE0000n, 16n], // link-local 169.254.0.0/16
  [0xAC100000n, 12n], // RFC1918 private 172.16.0.0/12
  [0xC0A80000n, 16n], // RFC1918 private 192.168.0.0/16
]

/** True when the packed IPv4 address falls in a private range. */
function isPrivateIpv4(a: number, b: number, c: number, d: number): boolean {
  const packed = (BigInt(a) << 24n) | (BigInt(b) << 16n) | (BigInt(c) << 8n) | BigInt(d)
  for (const [network, prefix] of IPV4_PRIVATE) {
    if (packed >> (32n - prefix) === network >> (32n - prefix)) return true
  }
  return false
}

/**
 * Classify one literal IP address as private (never fetchable) or public.
 * IPv4-mapped IPv6 addresses classify by their embedded IPv4 address.
 * @param address - the literal address a hostname resolved to.
 * @returns true for loopback, private, link-local, CGNAT, unspecified, and
 *   unique-local/link-local IPv6 space.
 */
export function isPrivateAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/gu, '')
  if (bare.includes('.')) {
    const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(bare)
    if (match !== null) {
      const [a, b, c, d] = match.slice(1).map(Number) as [number, number, number, number]
      return isPrivateIpv4(a, b, c, d)
    }
  }
  if (bare.toLowerCase().startsWith('::ffff:')) {
    return isPrivateAddress(bare.slice('::ffff:'.length))
  }
  const lower = bare.toLowerCase()
  if (lower === '::1' || lower === '::') return true
  // Unique-local fc00::/7 and link-local fe80::/10.
  if (/^f[cd][0-9a-f]{2}:/u.test(lower)) return true
  if (/^fe[89ab][0-9a-f]:/u.test(lower)) return true
  return false
}

/** Model-facing `kb_ingest_url` arguments. */
export interface KbIngestUrlArgs {
  url: string
  /** Always rejected at parse time: the tenant is the deployment-side binding, never model input. */
  tenant?: string
  doc_kind?: string
  title?: string
  collected_at?: string
}

/** Validated `kb_ingest_url` input after defaulting. */
export interface KbIngestUrlInput {
  url: string
  docKind: 'meeting' | 'interview' | 'report' | 'regulation' | 'profile' | 'table' | 'other'
  title: string | undefined
  collectedAt: string | undefined
}

/**
 * Validate the raw `kb_ingest_url` arguments: a non-blank http(s) URL without
 * embedded credentials, a known `doc_kind`, an ISO-8601 `collected_at` when
 * given, and no `tenant` argument (the tenant is deployment-bound).
 * @param args - the schema-validated `kb_ingest_url` arguments.
 * @returns the validated input.
 */
export function parseIngestUrlArgs(args: KbIngestUrlArgs): KbIngestUrlInput {
  if (args.tenant !== undefined) {
    throw new Error('kb_ingest_url: the tenant is bound by the deployment; a tenant argument is not accepted')
  }
  const raw = args.url.trim()
  if (raw.length === 0) throw new Error('kb_ingest_url: url must be a non-empty string')
  if (raw.length > MAX_URL_LENGTH) {
    throw new Error(`kb_ingest_url: url exceeds the maximum length of ${MAX_URL_LENGTH}`)
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch (error: unknown) {
    throw new Error(`kb_ingest_url: invalid url: ${raw}`, { cause: error })
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`kb_ingest_url: unsupported URL scheme "${url.protocol}" (only http and https are allowed)`)
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new Error('kb_ingest_url: credentials in URLs are not allowed')
  }
  let docKind: KbIngestUrlInput['docKind'] = 'other'
  if (args.doc_kind !== undefined) {
    if (!(KB_DOC_KINDS as readonly string[]).includes(args.doc_kind)) {
      throw new Error(`kb_ingest_url: doc_kind must be one of ${KB_DOC_KINDS.join(', ')}`)
    }
    docKind = args.doc_kind as KbIngestUrlInput['docKind']
  }
  let collectedAt: string | undefined
  if (args.collected_at !== undefined) {
    if (Number.isNaN(Date.parse(args.collected_at))) {
      throw new Error('kb_ingest_url: collected_at must be an ISO-8601 date string')
    }
    collectedAt = args.collected_at
  }
  return {
    url: url.href,
    docKind,
    title: args.title === undefined || args.title.trim().length === 0 ? undefined : args.title,
    collectedAt,
  }
}

/**
 * Resolve the URL's host, refuse when any resolved address is private, and
 * return the admitted addresses for the fetch request's pin set: a provider
 * that honors pins connects to one of them directly, so DNS cannot re-answer
 * between this check and the connect (DNS rebinding). DNS answers are
 * checked as a set — one private address among many still blocks the fetch —
 * and pinning applies on the intranet opt-in path too. The check runs once
 * per ingest; the fetch provider's same-origin redirect policy keeps later
 * hops on the same hostname, so the pin set stays valid across redirects.
 * @param url - the parsed request URL.
 * @param allowPrivateNetworks - the composition's explicit opt-in (for
 *   fixtures and intranet deployments).
 * @throws when the host resolves (wholly or partly) into private space.
 * @returns the admitted addresses to pin the fetch to. A name that does not
 *   resolve here stays admitted with an empty set: the fetch provider's own
 *   resolution is authoritative, and an unresolvable name cannot reach any
 *   address. Only resolved private addresses block the fetch.
 */
export async function resolveAdmittedAddresses(url: URL, allowPrivateNetworks: boolean): Promise<readonly string[]> {
  const hostname = url.hostname.replace(/^\[|\]$/gu, '')
  const addresses = await lookup(hostname, { all: true }).then(
    resolved => resolved.map(entry => entry.address),
    () => [] as string[],
  )
  if (!allowPrivateNetworks) {
    for (const address of addresses) {
      /* v8 ignore next -- the pass-through arm needs a resolvable public host; keyless tests resolve only loopback literals. */
      if (isPrivateAddress(address)) {
        throw new Error(
          `kb_ingest_url: refusing to fetch the private or internal address ${address} for "${hostname}" (set allowPrivateNetworks to fetch intranet sources explicitly)`,
        )
      }
    }
  }
  return addresses
}
