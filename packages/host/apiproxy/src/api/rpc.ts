/**
 * Four-quadrant RPC message model. Channels and messages are decoupled: HTTP,
 * WebSocket, and in-process SSE are physical carriers, while logical messages
 * are channel-independent and form a four-member discriminated union.
 * api/ contract layer: zero Node dependencies, importable from the browser.
 */

import type { z as zCore } from 'zod'
type ZodIssue = zCore.core.$ZodIssue
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { MessageId } from '@deepseek-ai/dsh-llm/brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/**
 * Message correlation id: the initiator mints it on a request; a response
 * echoes the matching request's rpcId and never mints a new one.
 */
export type RpcId = Branded<'rpc-id'>

/**
 * Brands a string as RpcId (same precedent as core `SessionId()`). Minted by the initiator:
 * client-request → client mints; server-request → host mints (answerable frames get a stable
 * logical id, pure pushes mint a fresh one each time).
 * @param id - Raw id string (implementations mint UUIDs; tests may pass fixtures).
 * @returns The same string, branded (compile-time cast, zero runtime cost).
 */
export function RpcId(id: string): RpcId {
  return id as RpcId
}

/** Error code → details type map (a second table isomorphic to RpcMethodMap). New code = one row here + one branch in the error schema. */
export interface RpcErrorDetailsMap {
  'bad-request': { issues: ZodIssue[] }
  'cancelled': {}
  'session-not-found': { sessionId: SessionId }
  'model-unavailable': { provider: string; model: string }
  'session-conflict': { sessionId: SessionId; requestedCwd: string; existingCwd?: string }
  'invalid-time-zone': { value: string }
  'workspace-attach-failed': { sessionId: SessionId; workspaceId: string }
  'workspace-not-found': { workspaceId: string }
  'workspace-invalid-path': { path: string }
  'workspace-name-conflict': { name: string }
  'workspace-move-invalid': { workspaceId: string; sessionId: SessionId; beforeSessionId?: SessionId }
  'directory-unreadable': { path: string }
  'directory-exists': { path: string }
  'directory-create-failed': { path: string }
  'directory-picker-unavailable': { capability: string }
  'agent-preset-read-only': { agentPreset: string; reason: string }
  'agent-preset-locked': { sessionId: SessionId; agentPreset: string }
  'agent-preset-conflict': { sessionId: SessionId; requestedPreset: string; existingPreset?: string }
  'agent-preset-not-found': { agentPreset: string; available: string[] }
  'agent-preset-invalid': { agentPreset: string; reason: string }
  'agent-busy': { reason: string }
  'attachment-error': { reason: string }
  'queue-item-not-found': { itemId: MessageId }
  'steer-unavailable': { itemId: MessageId }
  /** The session.viewStateReport uplink found no view-context plugin composed in the deployment. */
  'view-state-unavailable': { sessionId: SessionId }
  /** The session.viewStateReport payload failed the view-state cache's bounds (size, empty view). */
  'view-state-invalid': { sessionId: SessionId }
  /** The browser refused a view-action request it had registered (unknown local state, executor error). */
  'view-action-failed': {}
  /** A known slash command reported a usage/state error; the message is the command's own text. */
  'command-error': {}
  /** A leading-/ prompt named no registered command; the message names the token. */
  'unknown-command': {}
  /**
   * A settings write was refused (schema validation, unknown namespace,
   * read-only provider, or storage failure); the message is the seam's text.
   */
  'settings-rejected': { ns: string }
  /**
   * A settings write carried an `expectedRevision` the namespace has already
   * moved past: another writer (tab, editor, or an external file edit) landed
   * first. The details carry both revisions so a client can re-read and retry.
   */
  'settings-conflict': { ns: string; expected: number; actual: number }
  /** A credential write was refused (read-only shadowing layer or storage failure); the message is the seam's own text. */
  'credential-rejected': { ref: string }
  /**
   * Interrogating a draft provider endpoint did not produce a model listing:
   * no adapter family serves the namespace, the protocol has no listing this
   * build can read, or the endpoint was unreachable, refused the credential,
   * or answered with something else. The message is the adapter's own text —
   * it is what the form shows before falling back to hand-entry — and the
   * details name the endpoint asked, never the credential offered.
   */
  'model-discovery-failed': { settingsNs: string; baseURL?: string }
  'title-invalid': { sessionId: SessionId }
  'fork-unavailable': { sessionId: SessionId }
  'subagent-parent-unavailable': { parentSessionId: SessionId }
  'subagent-not-found': { parentSessionId: SessionId; childSessionId: SessionId }
  'subagent-catalog-diagnostic': {
    parentSessionId: SessionId
    childSessionId: SessionId
    reason: 'corrupt' | 'unsupported' | 'unavailable'
  }
  'subagent-not-resumable': { childSessionId: SessionId }
  'subagent-unauthorized': { childSessionId: SessionId }
  'subagent-delivery-unavailable': { childSessionId: SessionId }
  /** The kb workbench was used in a deployment that composes no knowledge base. */
  'kb-not-composed': {}
  /** A kb workbench call ran with no tenant bound on the api-gateway config. */
  'kb-tenant-unbound': {}
  /** A kb workbench write method ran in a deployment that did not opt into writes. */
  'kb-write-disabled': {}
  /** A kb workbench call named a doc_kind outside the closed KbDocKind union. */
  'kb-invalid-doc-kind': { docKind: string }
  /** A kb workbench ingest named a path without an accepted extension. */
  'kb-invalid-path': { path: string }
  /** A kb workbench upload's file name had no safe single path segment after sanitizing. */
  'kb-invalid-filename': { filename: string }
  /** A kb workbench upload's decoded bytes exceeded the workbench byte limit. */
  'kb-upload-too-large': { filename: string; maxBytes: number }
  /** A kb workbench URL ingest named something that is not a URL. */
  'kb-invalid-url': { url: string }
  /** A kb workbench file ingest found no filesystem service composed. */
  'kb-fs-unavailable': {}
  /** A kb workbench URL ingest found no web service composed. */
  'kb-web-unavailable': {}
  /** A kb workbench ingest failed (unreadable source, parser, or seam refusal); the message is the cause's text. */
  'kb-ingest-failed': { path?: string; url?: string }
  /** A nocobase-domain call ran in a deployment that did not opt in through `nocobaseEnabled`. */
  'nocobase-not-composed': {}
  /** A nocobase-domain call resolved no service-account credentials (base url or API key missing). */
  'nocobase-unavailable': {}
  /** A nocobase-domain call the backend refused (HTTP error, unknown collection); the message is the client's text. */
  'nocobase-request-failed': {}
  /** A nocobase.get named a row the backend does not have (the v2 wire answers `{data: null}`). */
  'nocobase-row-missing': { collection: string; id: number }
  /** An assets-domain call ran in a deployment that did not opt in through `assetsEnabled`. */
  'assets-not-composed': {}
  /** An assets-domain call found the deployment composing no connector capability. */
  'assets-connector-missing': {}
  /** An assets-domain call was refused by a provider or the seed file; the message is the cause's text. */
  'assets-rejected': {}
  /** An assets.detail named a dataset no provider declares. */
  'assets-asset-missing': { providerId: string; datasetId: string }
  /** A kg-domain call ran in a deployment that did not opt in through `kgEnabled`. */
  'kg-not-composed': {}
  /** A kg.query phrase matched no template; details carry the supported examples. */
  'kg-query-unsupported': { examples: string[] }
  /** A kg-domain call found the deployment composing no knowledge-graph seam. */
  'kg-graph-missing': {}
  /** A kg-domain call found no tenant binding (`kgTenant` unset). */
  'kg-tenant-unbound': {}
  /** A kg.subgraph seed list resolved to no node at all; the details carry the asked seeds. */
  'kg-seed-unresolved': { seeds: string[] }
  /** A kg-domain read failed at the graph store; the message is the cause's text. */
  'kg-read-failed': {}
  'kg-episode-unknown': {}
  'kg-rollback-invalid': {}
  /** A kg.history instant failed ISO parsing; the details carry the raw text. */
  'kg-history-invalid': { as_of: string }
  /** A connectors-domain call ran in a deployment that did not opt in through `connectorsEnabled`. */
  'connectors-not-composed': {}
  /** A connectors-domain call found the deployment composing no connector capability. */
  'connectors-connector-missing': {}
  /** A connectors-domain delivery read failed at the lakehouse seam; the message is the cause's text. */
  'connectors-transfers-rejected': {}
  /** An orders-domain call ran in a deployment that composes no orders capability (the expert-orders seam). */
  'orders-not-composed': {}
  /** An orders write (create/fulfill) ran in a deployment that did not opt in through `ordersEnabled`. */
  'orders-write-disabled': {}
  /** An orders call was refused by the seam (missing source, unknown order, illegal transition, pipeline failure). */
  'orders-rejected': {}
  /** A unified data upload ran in a deployment that did not opt into data writes (`dataUploadEnabled`). */
  'data-write-disabled': {}
  /** A unified data upload could not classify the file (no whitelisted extension or mime type). */
  'data-unsupported-type': { filename: string }
  /** A unified data upload's magic number contradicted its classified kind. */
  'data-type-mismatch': { filename: string }
  /** A unified data upload carried an empty body. */
  'data-empty-file': { filename: string }
  /** A unified data upload routed to the lakehouse in a deployment that composes none. */
  'data-lakehouse-unavailable': {}
  /** A unified data upload's decoded bytes exceeded the workbench byte limit. */
  'data-upload-too-large': { filename: string; maxBytes: number }
  /** A unified data upload failed (decode, parser, or seam refusal); the message is the cause's text. */
  'data-ingest-failed': { path: string }
  /** A lakehouse-overview call ran in a deployment that configured no overview seed (`lakehouseOverviewPath`). */
  'lakehouse-overview-not-configured': {}
  /** A lakehouse-overview call found the deployment composing no lakehouse seam. */
  'lakehouse-not-composed': {}
  /** The configured overview seed file could not be read or parsed; details carry the path. */
  'lakehouse-overview-seed-invalid': { path: string }
  /** A nocobase.update call ran in a deployment that did not opt in through `nocobaseWriteEnabled`. */
  'nocobase-write-disabled': {}
  'internal': {}
}

/** Closed error-code union (the keys of RpcErrorDetailsMap). */
export type RpcErrorCode = keyof RpcErrorDetailsMap

/**
 * Distributive union expanded from the map: code is the discriminant, so
 * `switch (error.code)` narrows details. details is required (internal uses an explicit {}).
 */
export type RpcError = {
  [C in RpcErrorCode]: { code: C; message: string; details: RpcErrorDetailsMap[C] }
}[RpcErrorCode]

/** Business success/failure result: the result slot of a unary response; methods never throw business errors. */
export type RpcResult<T> = { ok: true; value: T } | { ok: false; error: RpcError }

/**
 * Fold a transport exception into the RpcResult error branch (unified error
 * API; 'internal' as the catch-all code). Lives with RpcResult so every
 * carrier consumer folds the same way.
 * @param error - the thrown value from the carrier.
 * @returns the error branch of an RpcResult.
 */
export function transportError<T>(error: unknown): RpcResult<T> {
  return {
    ok: false,
    error: { code: 'internal', message: error instanceof Error ? error.message : String(error), details: {} },
  }
}

/**
 * Signature-layer narrow form, request side (domain-interface view, shared by
 * both directions): rpcId is explicit in the signature, never mixed into the
 * business payload; the type tag and method are filled in by the carrier layer.
 */
export interface RpcRequest<P> {
  rpcId: RpcId
  payload: P
}

/** Signature-layer narrow form, response side: rpcId always echoes the matching request. */
export interface RpcResponse<T> {
  rpcId: RpcId
  result: RpcResult<T>
}

// ---- Wire full forms: four named members of a discriminated union (discriminant = the four `type` literals) ----

/** Call initiated by the client (wire carrier: POST /api/<method> body). */
export interface ClientRequest {
  type: 'client-request'
  rpcId: RpcId
  method: string
  payload: unknown
}

/** Response to a ClientRequest (wire carrier: the HTTP response body of that POST); rpcId echoed. */
export interface ServerResponse {
  type: 'server-response'
  rpcId: RpcId
  result: RpcResult<unknown>
}

/**
 * Message initiated by the server (wire carrier: downstream stream frame). Answerable interactions
 * (approval/question requested — stable rpcId, reused on replay) and pure pushes
 * (session/event etc. — rpcId identifies that one push) share this shape; whether a
 * response is expected is determined statically by method (a strict dichotomy, no third kind).
 */
export interface ServerRequest {
  type: 'server-request'
  rpcId: RpcId
  method: string
  payload: unknown
}

/** Response to a ServerRequest (wire carrier: POST /api/respond body); rpcId echoed, never minted anew. */
export interface ClientResponse {
  type: 'client-response'
  rpcId: RpcId
  result: RpcResult<unknown>
}

/** Authoritative wire full-form union; narrow via `switch (message.type)`. */
export type RpcMessage = ClientRequest | ServerResponse | ServerRequest | ClientResponse

/**
 * Carrier receipt (not an RpcMessage — it belongs to the carrier layer, same
 * discipline as "HTTP status describes only the carrier"): the HTTP response
 * body of the POST carrying a client-response. Late/duplicate responses yield not-pending.
 */
export type RpcReceipt = { accepted: true } | { accepted: false; reason: 'not-pending' | 'bad-response' }
