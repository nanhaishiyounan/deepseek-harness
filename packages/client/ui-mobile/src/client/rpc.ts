/**
 * Unary RPC client for the mobile page: the same `/api/<method>` wire the PC
 * shell's fetch carrier speaks (client-request POST → server-response body),
 * reduced to the methods the mobile surface reads. Same-origin by
 * construction — the page is served by the gateway process itself. The
 * identity-gated methods (`nocobase.list/get/update`, `session.prompt`)
 * carry the signed-in gateway session token (`authToken`) the server derives
 * the acting identity and collection scope from.
 */

import type {
  RequestPayload, ResponseValue, RpcMethodMap,
} from '@deepseek-ai/dsh-host-apiproxy/api'
import { handleSessionExpired, loadIdentity } from './auth.ts'

/** The methods whose payloads accept the sign-in session token server-side. */
const TOKEN_METHODS: ReadonlySet<string> = new Set([
  'nocobase.list', 'nocobase.get', 'nocobase.update', 'nocobase.alertAct', 'session.prompt',
  'nocobase.mobileWorkSave', 'nocobase.mobileWorkDelete',
])

/** The method names the mobile surface calls. */
export type MobileRpcMethod =
  | 'session.list'
  | 'session.create'
  | 'session.history'
  | 'session.prompt'
  | 'session.cancel'
  | 'session.rename'
  | 'session.search'
  | 'agentPreset.list'
  | 'llm.models'
  | 'kg.stats'
  | 'kg.search'
  | 'kg.subgraph'
  | 'nocobase.listMeta'
  | 'nocobase.list'
  | 'nocobase.get'
  | 'nocobase.alertAct'
  | 'nocobase.signIn'
  | 'nocobase.mobileWorkSave'
  | 'nocobase.mobileWorkDelete'
  | 'lakehouse.overview'
  | 'data.describeImage'
  | 'data.extractText'

/** One server-response body narrowed to its result slot (the error keeps the gateway's code). */
interface WireResponse<T> {
  rpcId: string
  result: { ok: true; value: T } | { ok: false; error: { code?: string; message: string } }
}

/**
 * A gateway refusal carrying its wire code: consumers narrow expiry by code
 * (`isSessionExpiredError`) instead of matching message text.
 */
export class RpcFailure extends Error {
  /** The gateway's structured error code ('nocobase-unauthorized', …). */
  readonly code: string | undefined

  constructor(message: string, code: string | undefined) {
    super(message)
    this.name = 'RpcFailure'
    this.code = code
  }
}

/**
 * Whether one thrown rpc failure says the sign-in session expired (W8-B3):
 * the gateway answers `nocobase-unauthorized` for a presented-but-invalid
 * token across every identity-gated method.
 * @param cause - the value a call site caught.
 * @returns true when the failure is the expiry signal.
 */
export function isSessionExpiredError(cause: unknown): boolean {
  return cause instanceof RpcFailure && cause.code === 'nocobase-unauthorized'
}

/**
 * Call one unary gateway method and return its ok value.
 * @param method - gateway method name (`session.list`, `kg.subgraph`, …).
 * @param payload - the method's request payload.
 * @returns the validated response value the gateway produced.
 * @throws {Error} the transport failure, or the server error's message.
 */
export async function rpc<K extends MobileRpcMethod>(
  method: K,
  payload: RequestPayload<K> & Record<string, unknown>,
): Promise<ResponseValue<K>> {
  const rpcId = crypto.randomUUID()
  const identity = TOKEN_METHODS.has(method) ? loadIdentity() : undefined
  const wire = identity === undefined || payload['authToken'] !== undefined
    ? payload
    : { ...payload, authToken: identity.token }
  const response = await fetch(`/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload: wire }),
  })
  if (!response.ok) {
    throw new Error(`移动端请求失败（${method}，HTTP ${String(response.status)}）`)
  }
  const full = await response.json() as WireResponse<ResponseValue<K>>
  if (full.rpcId !== rpcId) {
    throw new Error(`移动端请求应答错配（${method}）`)
  }
  if (!full.result.ok) {
    // The expiry signal routes every caller the same way (W8-B3): clear the
    // dead token, tell the user once, and land on the login gate — local
    // work items and both outboxes stay untouched for the re-login backfill.
    if (full.result.error.code === 'nocobase-unauthorized') {
      handleSessionExpired()
    }
    throw new RpcFailure(full.result.error.message, full.result.error.code)
  }
  return full.result.value
}

/**
 * Method-name helper keeping the payload/value pair tied to one key.
 * @param method - the gateway method the closure calls.
 * @returns the unary call function for that method.
 */
export function rpcCall<K extends keyof RpcMethodMap & MobileRpcMethod>(
  method: K,
): (payload: RequestPayload<K> & Record<string, unknown>) => Promise<ResponseValue<K>> {
  return payload => rpc(method, payload)
}
