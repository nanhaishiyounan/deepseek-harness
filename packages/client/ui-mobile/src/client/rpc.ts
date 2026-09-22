/**
 * Unary RPC client for the mobile page: the same `/api/<method>` wire the PC
 * shell's fetch carrier speaks (client-request POST → server-response body),
 * reduced to the methods the mobile surface reads. Same-origin by
 * construction — the page is served by the gateway process itself, so the
 * request needs no credentials or base configuration.
 */

import type {
  RequestPayload, ResponseValue, RpcMethodMap,
} from '@deepseek-ai/dsh-host-apiproxy/api'

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
  | 'kg.stats'
  | 'kg.search'
  | 'kg.subgraph'
  | 'nocobase.listMeta'
  | 'nocobase.list'
  | 'lakehouse.overview'

/** One server-response body narrowed to its result slot. */
interface WireResponse<T> {
  rpcId: string
  result: { ok: true; value: T } | { ok: false; error: { message: string } }
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
  const response = await fetch(`/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
  })
  if (!response.ok) {
    throw new Error(`移动端请求失败（${method}，HTTP ${String(response.status)}）`)
  }
  const full = await response.json() as WireResponse<ResponseValue<K>>
  if (full.rpcId !== rpcId) {
    throw new Error(`移动端请求应答错配（${method}）`)
  }
  if (!full.result.ok) {
    throw new Error(full.result.error.message)
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
