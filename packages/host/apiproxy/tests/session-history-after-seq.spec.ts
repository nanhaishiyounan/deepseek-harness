/**
 * The session.history forward cursor (W8-B3): an afterSeq read carries only
 * the events strictly newer than the cursor, unpaginated, without the
 * projections baseline (a cursor reader already holds one), while the
 * request schema keeps afterSeq and beforeSeq mutually exclusive.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import ViewActionService from '@deepseek-ai/dsh-view-actions'
import { createApiProxy } from '../src/api-proxy.ts'
import { sessionHistoryRequestSchema } from '../src/api/sessions.schema.ts'
import type { RpcRequest } from '../src/api/rpc.ts'

let nextRpc = 1
function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: `after-seq-${String(nextRpc++)}` as never, payload }
}

async function harness(): Promise<{ ctx: Context; session: Session }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(ViewActionService)
  await ctx.plugin(AgentRegistry)
  const session = ctx.sessions.create()
  ctx.agents.register({ id: session.id, session, inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }), status: 'idle', ctx } as Agent)
  return { ctx, session }
}

function seedMessages(session: Session, count: number): void {
  for (let i = 0; i < count; i++) {
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: `m${i}` }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
  }
}

const api = (ctx: Context) => createApiProxy(ctx, { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp' })

describe('session.history afterSeq cursor', () => {
  it('answers only the events strictly newer than the cursor, unpaginated, without projections', async () => {
    const { ctx, session } = await harness()
    seedMessages(session, 5)
    const gateway = api(ctx)
    const tail = await gateway.sessions.history(request({ sessionId: session.id }))
    expect(tail.result.ok).toBe(true)
    if (!tail.result.ok) throw new Error('unreachable')
    const tailSeq = tail.result.value.events.at(-1)?.event.seq ?? 0

    // Nothing new since the tail: an empty cursor page.
    const fresh = await gateway.sessions.history(request({ sessionId: session.id, afterSeq: tailSeq }))
    expect(fresh.result.ok).toBe(true)
    if (!fresh.result.ok) throw new Error('unreachable')
    expect(fresh.result.value.events).toEqual([])
    expect(fresh.result.value.hasMore).toBe(false)
    expect(fresh.result.value.projections).toBeUndefined()

    // A cursor before the last message: exactly the newer events cross.
    const events = tail.result.value.events.map(entry => entry.event.seq)
    const midCursor = events[Math.max(0, events.length - 3)] as number
    const delta = await gateway.sessions.history(request({ sessionId: session.id, afterSeq: midCursor }))
    expect(delta.result.ok).toBe(true)
    if (!delta.result.ok) throw new Error('unreachable')
    expect(delta.result.value.events.map(entry => entry.event.seq)).toEqual(events.filter(seq => seq > midCursor))
    expect(delta.result.value.hasMore).toBe(false)
    expect(delta.result.value.projections).toBeUndefined()

    // Events appended after the cursor arrive on the next cursor read.
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'new' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    const next = await gateway.sessions.history(request({ sessionId: session.id, afterSeq: tailSeq }))
    expect(next.result.ok).toBe(true)
    if (!next.result.ok) throw new Error('unreachable')
    expect(next.result.value.events.length).toBe(1)
    expect(next.result.value.events[0]?.event.seq).toBeGreaterThan(tailSeq)
    await ctx.fiber.dispose()
  })
})

describe('session.history request schema keeps the cursors exclusive', () => {
  it('rejects a payload naming both afterSeq and beforeSeq', () => {
    const parsed = sessionHistoryRequestSchema.safeParse({
      sessionId: 's',
      afterSeq: 3,
      beforeSeq: 9,
    })
    expect(parsed.success).toBe(false)
    const alone = sessionHistoryRequestSchema.safeParse({ sessionId: 's', afterSeq: 3 })
    expect(alone.success).toBe(true)
  })
})
