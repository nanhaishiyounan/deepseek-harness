import { authHeaders } from './lib/auth'
import type { DesignerMeta, GraphDoc } from './types'

/** The designer SPA is served by approval-engine --serve on the same origin (default :13110; ?base= overrides for local dev). */
const base = (): string => {
  const param = new URLSearchParams(window.location.search).get('base')
  return param === null ? '' : param.replace(/\/$/u, '')
}

export async function fetchMeta(): Promise<DesignerMeta> {
  const response = await fetch(`${base()}/designer/meta`, { headers: authHeaders() })
  if (!response.ok) throw new Error(`GET /designer/meta → HTTP ${String(response.status)}`)
  const payload = await response.json() as { ok?: boolean; meta?: DesignerMeta }
  if (payload.meta === undefined) throw new Error('/designer/meta returned no meta')
  return payload.meta
}

export async function fetchGraph(docType: string): Promise<{ graph: GraphDoc | null; graph_version: number }> {
  const response = await fetch(`${base()}/flow-graph?doc_type=${encodeURIComponent(docType)}`, { headers: authHeaders() })
  if (!response.ok) throw new Error(`GET /flow-graph → HTTP ${String(response.status)}`)
  const payload = await response.json() as { ok?: boolean; graph?: GraphDoc | null; graph_version?: number }
  return { graph: payload.graph ?? null, graph_version: payload.graph_version ?? 0 }
}

/**
 * Persist the editing graph. base_version is the graph_version this edit
 * started from — the server commits it through one conditional UPDATE
 * (WHERE id AND doc_type AND graph_version = base_version); a stale base
 * matches zero rows and answers HTTP 409, so two same-instant saves land
 * exactly one winner (the loser reloads and redoes). The optional signal
 * cancels an in-flight save when the canvas switches or reloads doc types.
 */
/** The publish outcome: derived stats on success, the readable gate list on refusal. */
export interface PublishResult {
  ok: boolean
  status: number
  graph_version?: number
  published_at?: string
  derived?: { states: number; transitions: number; vocabulary: string; cc: number; roles: string[] }
  errors?: string[]
  error?: string
}

/**
 * Publish the stored graph — the one-way compile into the engine's
 * states/transitions rows. base_version rides the same CAS counter as
 * saveGraph, so a concurrent save or publish on the same base loses loudly
 * with 409 (exactly one winner).
 */
export async function publishGraph(docType: string, baseVersion: number): Promise<PublishResult> {
  const response = await fetch(`${base()}/flow-graph/publish`, {
    method: 'POST',
    headers: { ...authHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ doc_type: docType, base_version: baseVersion }),
  })
  const payload = await response.json().catch(() => null) as PublishResult | null
  if (payload === null) {
    return { ok: false, status: response.status, error: `POST /flow-graph/publish → HTTP ${String(response.status)}（响应非 JSON）` }
  }
  return { ...payload, ok: response.status === 200 && payload.ok, status: response.status }
}

export async function saveGraph(
  docType: string,
  graph: GraphDoc,
  baseVersion: number,
  signal?: AbortSignal,
): Promise<{ graph_version: number }> {
  const response = await fetch(`${base()}/flow-graph`, {
    method: 'POST',
    headers: { ...authHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ doc_type: docType, graph, base_version: baseVersion }),
    signal,
  })
  const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; graph_version?: number } | null
  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.error ?? `POST /flow-graph → HTTP ${String(response.status)}`)
  }
  return { graph_version: payload.graph_version ?? 0 }
}
