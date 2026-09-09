/**
 * Shared NocoBase workflow plumbing for demo-full-journey.mts and the
 * real-track e2e: a workflow lease that pauses the production approval
 * workflow and always restores it (destroying the private clone it tracks),
 * the four-node approval clone wired against a private fulfill callback,
 * draining stranded pending approvals, resolving the live manual approval
 * task the way the UI approver does, and closing callback HTTP servers
 * without the optional-chaining trap (a `server?.close(resolve)` on a
 * never-started server never settles the promise).
 * @module nocobase-workflow
 */

import type { Server } from 'node:http'
import { withResilience } from './resilience.ts'

/** Shared origin plus API key for the NocoBase REST API. */
export interface NocoBaseEndpoint {
  readonly baseUrl: string
  readonly apiKey: string
}

/**
 * POST one resourcer action, refusing a non-2xx answer so a failed mutation
 * of the production approval flow is never treated as done. One attempt with
 * a hard timeout budget and no retry: the mutative actions here include
 * workflow toggles (a flip — a retry after a lost answer would flip back),
 * so only the lease state machine above decides what is safe to re-issue.
 * @param endpoint - the NocoBase origin and API key.
 * @param path - the action path (query included).
 * @param body - the JSON body, or `undefined` for a bodyless action.
 * @returns the fetch response after the ok check.
 */
async function postAction(endpoint: NocoBaseEndpoint, path: string, body?: unknown): Promise<Response> {
  const response = await withResilience(`POST ${path}`, signal => fetch(`${endpoint.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${endpoint.apiKey}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal,
  }), { attempts: 1, timeoutMs: 30_000 })
  if (!response.ok) throw new Error(`POST ${path} failed: HTTP ${response.status}`)
  return response
}

/**
 * GET one resourcer read as JSON, refusing a non-2xx answer so a degraded
 * response (an error page) is never parsed as task data. Reads are
 * idempotent, so they ride the shared retry policy with a short budget.
 * @param endpoint - the NocoBase origin and API key.
 * @param path - the read path (query included).
 * @returns the parsed JSON body.
 */
export async function getJson(endpoint: NocoBaseEndpoint, path: string): Promise<unknown> {
  const response = await withResilience(`GET ${path}`, signal => fetch(`${endpoint.baseUrl}${path}`, {
    headers: { authorization: `Bearer ${endpoint.apiKey}` },
    signal,
  }), { attempts: 3, timeoutMs: 15_000, baseDelayMs: 500 })
  if (!response.ok) throw new Error(`GET ${path} failed: HTTP ${response.status}`)
  return response.json()
}

/** List pending manual approval task ids, newest first.
 * @param endpoint - the NocoBase origin and API key.
 * @param pageSize - how many task ids to fetch.
 * @returns the pending task ids (empty when none exist).
 */
async function listPendingTaskIds(endpoint: NocoBaseEndpoint, pageSize: number): Promise<number[]> {
  const tasks = await getJson(endpoint, `/api/workflowManualTasks:list?filter=${encodeURIComponent(JSON.stringify({ status: { $eq: 0 } }))}&pageSize=${pageSize}&sort=-id`) as { data?: Array<{ id?: number }> }
  return (tasks.data ?? []).map(task => task.id).filter((id): id is number => id !== undefined)
}

/**
 * A pause/restore lease over the production approval workflow: toggle it
 * off, run private operations against a clone, then `restore()` destroys the
 * tracked clone and re-enables the production workflow. toggle is a flip, so
 * only a pause whose HTTP answer confirmed ok is ever re-toggled by
 * `restore()`; both restore actions are attempted even when one fails, and
 * neither failure is swallowed. Each succeeded restore action clears its own
 * lease state, so a repeated call re-toggles nothing and a retry after a
 * partial success performs only the unfinished action.
 */
export class WorkflowLease {
  private cloneId: number | undefined
  private paused = false

  /**
   * @param endpoint - the NocoBase origin and API key.
   * @param productionId - the production workflow id this lease guards.
   */
  constructor(private readonly endpoint: NocoBaseEndpoint, private readonly productionId: number) {}

  /** Toggle the production workflow off once; a repeated call while paused
   * returns without toggling again (toggle is a flip — a second call would
   * re-enable production mid-lease). Only a confirmed pause is restorable. */
  async pause(): Promise<void> {
    if (this.paused) return
    await postAction(this.endpoint, `/api/workflows:toggle?filterByTk=${this.productionId}`)
    this.paused = true
  }

  /**
   * Remember the private clone's id so `restore()` destroys it.
   * @param id - the clone workflow id.
   */
  setClone(id: number): void {
    this.cloneId = id
  }

  /** Destroy the tracked clone (when present) and re-enable the production workflow.
   * Idempotent per action: a succeeded action clears its own state (the clone
   * id, the paused flag), so a retried restore performs only the unfinished
   * action (toggle is a flip — re-enabling twice would disable again), and a
   * fully restored lease makes a later call return without action.
   * @throws the collected failure descriptions when either action fails; the
   * failed action's state stays set so a retried restore finishes it.
   */
  async restore(): Promise<void> {
    if (this.cloneId === undefined && !this.paused) return
    const failures: string[] = []
    if (this.cloneId !== undefined) {
      try {
        await postAction(this.endpoint, `/api/workflows:destroy?filterByTk=${this.cloneId}`)
        this.cloneId = undefined
      } catch (error) {
        failures.push(`destroying clone workflow ${this.cloneId} failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (this.paused) {
      try {
        await postAction(this.endpoint, `/api/workflows:toggle?filterByTk=${this.productionId}`)
        this.paused = false
      } catch (error) {
        failures.push(`re-enabling production workflow ${this.productionId} failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (failures.length > 0) throw new Error(failures.join('; '))
  }
}

/**
 * Create the private four-node approval clone (collection trigger → manual
 * approval → condition branch → request callback / reject write-back) whose
 * request node targets the caller's fulfill callback from birth.
 * @param endpoint - the NocoBase origin and API key.
 * @param title - the clone workflow's title.
 * @param callbackUrl - the fulfill callback base url the request node posts to.
 * @returns the clone workflow id.
 * @throws naming the step when creation or any node fails.
 */
export async function createApprovalClone(endpoint: NocoBaseEndpoint, title: string, callbackUrl: string): Promise<number> {
  const created = await postAction(endpoint, '/api/workflows:create', {
    title,
    enabled: true,
    type: 'collection',
    config: { collection: 'orders', mode: 1 },
  }).then(response => response.json() as Promise<{ data?: { id?: number } }>)
  const cloneId = created.data?.id
  if (cloneId === undefined) throw new Error('creating the approval clone workflow failed (no id served)')
  await postAction(endpoint, `/api/workflows:toggle?filterByTk=${cloneId}`)
  await postAction(endpoint, `/api/workflows:toggle?filterByTk=${cloneId}`)
  const manual = await postAction(endpoint, '/api/flow_nodes:create', {
    workflow: cloneId,
    title: '订单审批',
    type: 'manual',
    config: { assignees: [1], forms: { f1: { type: 'custom', actions: [{ key: 'resolve', status: 1 }, { key: 'reject', status: 1 }] } } },
  }).then(response => response.json() as Promise<{ data?: { id?: number; key?: string } }>)
  const manualId = manual.data?.id
  const manualKey = manual.data?.key
  if (manualId === undefined || manualKey === undefined) throw new Error('creating the clone manual approval node failed')
  const condition = await postAction(endpoint, '/api/flow_nodes:create', {
    workflow: cloneId,
    title: '审批结果分支',
    type: 'condition',
    upstreamId: manualId,
    config: { engine: 'basic', rejectOnFalse: false, calculation: { calculator: 'equal', operands: [`{{$jobsMapByNodeKey.${manualKey}._}}`, 'resolve'] } },
  }).then(response => response.json() as Promise<{ data?: { id?: number } }>)
  const conditionId = condition.data?.id
  if (conditionId === undefined) throw new Error('creating the clone condition node failed')
  await postAction(endpoint, `/api/flow_nodes:update?filterByTk=${manualId}`, { downstreamId: conditionId })
  await postAction(endpoint, '/api/flow_nodes:create', {
    workflow: cloneId,
    title: '回调 DSH 生成交付物',
    type: 'request',
    upstreamId: conditionId,
    branchIndex: 1,
    config: {
      url: `${callbackUrl}/api/orders.fulfill`,
      method: 'POST',
      contentType: 'application/json',
      data: { type: 'client-request', rpcId: 'wf-{{$context.data.id}}', method: 'orders.fulfill', payload: { order_id: '{{$context.data.id}}' } },
      timeout: 300000,
    },
  })
  await postAction(endpoint, '/api/flow_nodes:create', {
    workflow: cloneId,
    title: '驳回标记失败',
    type: 'update',
    upstreamId: conditionId,
    branchIndex: 0,
    config: { collection: 'orders', params: { filter: { id: '{{$context.data.id}}' }, values: { status: 'failed', error: '审批驳回' } } },
  })
  return cloneId
}

/**
 * Drain stranded PENDING approval tasks from earlier runs: each one's resume
 * queues ahead of this journey on the serial dispatcher, and a backlog of
 * them starves the approval poll.
 * @param endpoint - the NocoBase origin and API key.
 */
export async function drainPendingApprovals(endpoint: NocoBaseEndpoint): Promise<void> {
  for (let drained = 0; drained < 10; drained++) {
    const taskId = (await listPendingTaskIds(endpoint, 1))[0]
    if (taskId === undefined) break
    await postAction(endpoint, `/api/workflowManualTasks:submit?filterByTk=${taskId}`, { result: { _: 'resolve', f1: {} } })
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
}

/**
 * Resolve the live manual approval task the way the UI approver does (action
 * key `resolve` on form f1), re-submitting a still-pending task up to three
 * times — a lost resume would otherwise strand the order.
 * @param endpoint - the NocoBase origin and API key.
 * @returns whether the task left PENDING within the rounds.
 * @throws when the submit request itself fails.
 */
export async function resolveManualApprovalTask(endpoint: NocoBaseEndpoint): Promise<boolean> {
  for (let round = 0; round < 3; round++) {
    let taskId: number | undefined
    for (let attempt = 0; attempt < 30 && taskId === undefined; attempt++) {
      taskId = (await listPendingTaskIds(endpoint, 20))[0]
      if (taskId === undefined) await new Promise(resolve => setTimeout(resolve, 1000))
    }
    if (taskId === undefined) return false
    await postAction(endpoint, `/api/workflowManualTasks:submit?filterByTk=${taskId}`, { result: { _: 'resolve', f1: {} } })
    await new Promise(resolve => setTimeout(resolve, 4000))
    const stillPending = await getJson(endpoint, `/api/workflowManualTasks/${taskId}`) as { data?: { status?: number } }
    if (stillPending.data?.status !== 0) return true
  }
  return false
}

/**
 * Close an HTTP server that may never have started: an undefined server (a
 * skipped track) resolves immediately instead of hanging forever on a
 * short-circuited `server?.close(resolve)`. Keep-alive sockets (the workflow
 * request node's axios) are dropped first or close() would wait for them.
 * The close callback's error slot is not inspected: node's `server.close`
 * callback for a listening server passes no error, and this helper only
 * closes servers it started.
 * @param server - the server to close, or `undefined` when none was started.
 */
export async function closeHttpServer(server: Server | undefined): Promise<void> {
  if (server === undefined) return
  server.closeAllConnections()
  await new Promise<void>((resolve) => {
    server.close(() => { resolve() })
  })
}
