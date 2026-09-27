// @vitest-environment jsdom
/** The B7 plan-card protocol: payload validation and the fold's plan projection. */

import { describe, expect, it } from 'vitest'
import { foldHistory, type FoldEvent } from '../src/client/fold.ts'
import { buildPlanConfirmMessage, parseDshPayload } from '../src/client/protocol.ts'

const suggestFence = '{"v":3,"type":"plan_suggest","id":"pl_1","suggestionId":"4","planType":"MO","product":"海苔芝士米果 80g","qty":"7706","suggestDate":"2026-10-07","driverSo":"SO-2026-0002","needDate":"2026-10-17"}'

describe('parseDshPayload · plan payloads', () => {
  it('parses a valid plan_suggest with optional hints', () => {
    expect(parseDshPayload(suggestFence)).toEqual({
      v: 3, type: 'plan_suggest', id: 'pl_1', suggestionId: '4', planType: 'MO',
      product: '海苔芝士米果 80g', qty: '7706', suggestDate: '2026-10-07',
      driverSo: 'SO-2026-0002', needDate: '2026-10-17',
    })
  })

  it('rejects a bad plan type, missing suggestionId, and wrong-version bodies', () => {
    expect(parseDshPayload('{"v":3,"type":"plan_suggest","id":"p","suggestionId":"x","planType":"XX","product":"a","qty":"1"}')).toBeUndefined()
    expect(parseDshPayload('{"v":3,"type":"plan_suggest","id":"p","planType":"MO","product":"a","qty":"1"}')).toBeUndefined()
    expect(parseDshPayload('{"v":2,"type":"plan_suggest","id":"p","suggestionId":"1","planType":"MO","product":"a","qty":"1"}')).toBeUndefined()
  })

  it('parses plan_result and plan_confirm bodies', () => {
    expect(parseDshPayload('{"v":3,"type":"plan_result","planId":"pl_1","suggestionId":"4","planType":"MO","product":"米果","outcome":"converted","docCode":"MO-2026-0007","state":"draft","by":"计划员甲"}'))
      .toMatchObject({ type: 'plan_result', outcome: 'converted', docCode: 'MO-2026-0007' })
    expect(parseDshPayload('{"v":3,"type":"plan_confirm","planId":"pl_1","suggestionId":"4","action":"dismiss","planType":"PR","product":"橙汁"}'))
      .toMatchObject({ type: 'plan_confirm', action: 'dismiss' })
  })

  it('builds the plan_confirm message from a pending payload', () => {
    const payload = parseDshPayload(suggestFence)
    if (payload === undefined || payload.type !== 'plan_suggest') throw new Error('fixture failed')
    expect(buildPlanConfirmMessage(payload, 'confirm')).toEqual({
      v: 3, type: 'plan_confirm', planId: 'pl_1', suggestionId: '4',
      action: 'confirm', planType: 'MO', product: '海苔芝士米果 80g',
    })
  })
})

describe('foldHistory · plan projection', () => {
  it('folds an assistant plan_suggest fence into a plan item and a user plan_confirm into an action', () => {
    const events: FoldEvent[] = [
      { type: 'user/message', seq: 1, time: 1, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '跑一下 MRP' }] } },
      { type: 'assistant/message', seq: 2, time: 2, data: { message: { content: [{ type: 'text', text: `本轮日结有 1 条生产建议。\n\n\`\`\`dsh\n${suggestFence}\n\`\`\`` }] } } },
      { type: 'user/message', seq: 3, time: 3, data: { source: { kind: 'user' }, content: [{ type: 'text', text: `\`\`\`dsh\n${JSON.stringify({ v: 3, type: 'plan_confirm', planId: 'pl_1', suggestionId: '4', action: 'confirm', planType: 'MO', product: '海苔芝士米果 80g' })}\n\`\`\`` }] } },
    ]
    const { items } = foldHistory(events)
    const plan = items.find(item => item.kind === 'plan')
    expect(plan).toMatchObject({ kind: 'plan', seq: 2.01, payload: { type: 'plan_suggest', qty: '7706' } })
    const action = items.find(item => item.kind === 'action')
    expect(action).toMatchObject({ kind: 'action', seq: 3, action: 'confirm' })
  })

  it('folds a plan_result outcome card and classifies a dismiss as a reject action', () => {
    const resultFence = { v: 3, type: 'plan_result', planId: 'pl_1', suggestionId: '4', planType: 'MO', product: '米果', outcome: 'converted', docCode: 'MO-2026-0007', state: 'draft', by: '计划员甲' }
    const dismissFence = { v: 3, type: 'plan_confirm', planId: 'pl_2', suggestionId: '5', action: 'dismiss', planType: 'PR', product: '橙汁' }
    const events: FoldEvent[] = [
      { type: 'assistant/message', seq: 1, time: 1, data: { message: { content: [{ type: 'text', text: `已转单。\n\n\`\`\`dsh\n${JSON.stringify(resultFence)}\n\`\`\`` }] } } },
      { type: 'user/message', seq: 2, time: 2, data: { source: { kind: 'user' }, content: [{ type: 'text', text: `\`\`\`dsh\n${JSON.stringify(dismissFence)}\n\`\`\`` }] } },
    ]
    const { items } = foldHistory(events)
    expect(items.find(item => item.kind === 'plan')).toMatchObject({ payload: { type: 'plan_result', outcome: 'converted', docCode: 'MO-2026-0007' } })
    expect(items.find(item => item.kind === 'action')).toMatchObject({ kind: 'action', seq: 2, action: 'reject' })
  })
})
