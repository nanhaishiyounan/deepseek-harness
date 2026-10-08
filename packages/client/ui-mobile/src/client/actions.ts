/**
 * The v5 work-action module: the report-card dispatch executor (02 §5) plus
 * the human-readable action-message templates M1–M4 (04 §3) and the shared
 * todo→doing execution kickoff. Every model-visible fact rides a real user
 * message through `promptSession` — the「模型可见⟺日志可重建」red line —
 * while the pure UI moves (view/link navigation, modal opens) never touch the
 * durable log. No React imports.
 */

import { Toast } from 'antd-mobile'
import type { ReportAction } from './protocol.ts'
import { navigate } from './router.ts'
import { createSession, promptSession } from './sessionsService.ts'
import { currentRunMode } from './runMode.ts'
import { registerExecSession, transitionWorkItem, type WorkItem } from './workStore.ts'

/** The action-message templates' task fields. */
interface TemplateTask {
  readonly title: string
  readonly owner: string
  readonly due: string | undefined
  readonly suggestion: string | undefined
}

/**
 * Template M1 — TaskFormModal's creation notice to the source chat.
 * @param task - the created task's fields.
 * @returns the user message text.
 */
export function buildTaskCreatedMessage(task: TemplateTask): string {
  return `已创建处理任务：${task.title}，负责人 ${task.owner}，截止 ${task.due ?? '未定'}。请知悉。`
}

/**
 * Template M2 — the execution session's opening directive (todo→doing, live
 * mode). The directive itself is the message, so it lands in the log.
 * @param task - the task entering execution.
 * @returns the user message text.
 */
export function buildExecDirectiveMessage(task: Pick<TemplateTask, 'title' | 'suggestion'>): string {
  return `执行工作任务：${task.title}。背景：${task.suggestion ?? '无'}。完成后给出结果摘要。`
}

/**
 * Template M3 — the completion notice to the source chat (doing→review).
 * @param task - the finished task.
 * @param summary - the clipped one-sentence outcome.
 * @returns the user message text.
 */
export function buildWorkDoneMessage(task: Pick<TemplateTask, 'title'>, summary: string): string {
  return `工作已完成：${task.title}。结果摘要：${summary}。请确认。`
}

/**
 * Template M4 — the rework directive to the execution session (review→doing).
 * @param reason - the user's optional one-line reason; the default asks for a recheck.
 * @returns the user message text.
 */
export function buildReworkMessage(reason?: string): string {
  return `该工作需要返工：${reason?.trim() === '' || reason === undefined ? '请复核并修正' : reason}。`
}

/** The dispatch executor's context: the report card's source chat plus the modal opener. */
export interface ReportActionContext {
  /** The session the report card rendered in. */
  readonly sessionId: string
  /** Opens the host page's TaskFormModal with the action's prefill. */
  readonly onCreateTask: (prefill: { readonly title: string; readonly suggestion: string | undefined }) => void
}

/** One dispatch outcome: success, or a user-readable failure reason. */
export type DispatchResult = { readonly ok: true } | { readonly ok: false; readonly reason: string }

/**
 * The view-route shape contract (W23-B1), the client mirror of the
 * server-side present_card check: the route head must be one of the live
 * router names and the param count must fit the head — `docs` takes one or
 * two (`#/docs/<collection>[/<rowId>]`), `chat` exactly one, and every other
 * head none (`work/:id` keys client-local work ids a model cannot know, so a
 * model-authored `#/work/<x>/<y>` chain dies here instead of on the dead
 * detail page). A query string may trail any of them.
 */
const VIEW_PARAM_HEADS: Readonly<Record<string, number>> = {
  docs: 2,
  chat: 1,
  work: 0,
  chats: 0,
  me: 0,
  tasks: 0,
  todos: 0,
  files: 0,
  agents: 0,
  alerts: 0,
}

/**
 * Whether a view action's route names a live in-product page with a legal
 * param shape.
 * @param route - the action's route string.
 * @returns true when the route starts `#/`, its head is a router name (the
 * bare `#/` names home), and the trailing segments fit that head's param
 * count.
 */
export function isProductRoute(route: string): boolean {
  if (!route.startsWith('#/')) return false
  const path = route.slice(2).split('?', 2)[0] ?? ''
  const segments = path.split('/').filter(segment => segment !== '')
  const [head] = segments
  if (head === undefined) return true
  const maxParams = VIEW_PARAM_HEADS[head]
  if (maxParams === undefined) return false
  return segments.length - 1 <= maxParams
}

/**
 * Execute one report-card action (02 §5): view navigates in-product,
 * create-task opens the host modal prefilled, send posts the text as the
 * user's own message, link opens externally. Failures toast and return
 * `{ok: false}` — a bad action never crashes the chat flow.
 * @param action - the report payload's action button.
 * @param ctx - the dispatch context (source session + modal opener).
 * @returns the dispatch outcome.
 */
export async function dispatchReportAction(action: ReportAction, ctx: ReportActionContext): Promise<DispatchResult> {
  switch (action.kind) {
    case 'view': {
      if (!isProductRoute(action.route)) {
        Toast.show({ content: '不支持的目标' })
        return { ok: false, reason: `route 非法（不在产品路由枚举内）：${action.route}` }
      }
      navigate(action.route)
      return { ok: true }
    }
    case 'create-task': {
      ctx.onCreateTask({ title: action.title, suggestion: action.suggestion })
      return { ok: true }
    }
    case 'send': {
      try {
        await promptSession(ctx.sessionId, action.text)
        return { ok: true }
      } catch (cause) {
        /* v8 ignore next -- the rpc seam never rejects with a non-Error value. */
        const reason = cause instanceof Error ? cause.message : String(cause)
        Toast.show({ content: reason, position: 'bottom' })
        return { ok: false, reason }
      }
    }
    case 'link': {
      let parsed: URL
      try {
        // A required non-empty string that still fails URL parsing is invalid.
        parsed = new URL(action.url)
      } catch {
        Toast.show({ content: '链接无效' })
        return { ok: false, reason: `url 非法：${action.url}` }
      }
      // URL parsing alone accepts javascript:/data: script vectors; only the
      // browsable schemes may reach window.open.
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        Toast.show({ content: '不支持该链接协议' })
        return { ok: false, reason: `链接协议不支持：${parsed.protocol}` }
      }
      window.open(action.url, '_blank', 'noopener')
      return { ok: true }
    }
  }
}

/** The execution-kickoff outcome for the calling surface to toast about. */
export interface ExecutionStart {
  readonly ok: boolean
  readonly message: string
}

/**
 * Kick one todo item into execution (the shared §3.2 todo→doing path for the
 * detail page's 开始执行 and the modal's 立即执行). Live mode creates the
 * isolated exec session, registers it (isolation set first — a failed
 * directive must not leak the session into the chat lists), flips the status,
 * then sends the M2 directive (a failed send toasts but never rolls back).
 * Demo mode only flips the status: the detail page's simulated timeline owns
 * the progress. A failed session create leaves the item on todo.
 * @param item - the todo item entering execution.
 * @returns the outcome pair the caller toasts.
 */
export async function startWorkExecution(item: WorkItem): Promise<ExecutionStart> {
  if (await currentRunMode() === 'demo') {
    transitionWorkItem(item.id, 'doing')
    return { ok: true, message: '已开始执行' }
  }
  let execSessionId: string
  try {
    execSessionId = await createSession()
  } catch (cause) {
    /* v8 ignore next -- the rpc seam never rejects with a non-Error value. */
    return { ok: false, message: cause instanceof Error ? cause.message : String(cause) }
  }
  registerExecSession(item.id, execSessionId)
  transitionWorkItem(item.id, 'doing')
  try {
    await promptSession(execSessionId, buildExecDirectiveMessage(item))
  } catch (cause) {
    /* v8 ignore next -- the rpc seam never rejects with a non-Error value. */
    const message = cause instanceof Error ? cause.message : String(cause)
    return { ok: true, message: `已开始执行，但指令发送失败：${message}` }
  }
  return { ok: true, message: '已开始执行' }
}
