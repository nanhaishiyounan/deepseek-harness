/**
 * viewToolRowModel derivation matrix over frozen call slices: the running
 * target off streamed arguments, the settled summary off result content, and
 * the degraded fallbacks (truncated JSON, empty results, error-only bodies)
 * down to the tool name.
 */
import { describe, expect, it } from 'vitest'
import type { RunningToolCall, ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client'
import { viewToolRowModel } from '../src/client/viewToolModel.ts'

function running(argsRaw: unknown, name = 'view_apply'): RunningToolCall {
  return {
    callId: 'c1', name, argsRaw: argsRaw as string, turn: 1, step: 1, time: 0,
    callView: null, subCalls: [],
  }
}

function settled(parts: Partial<ToolResultNode> = {}): ToolResultNode {
  return {
    kind: 'tool-result', seq: 2, time: 0, callId: 'c1',
    call: { name: 'view_apply', argsRaw: '{}' }, callTime: 0,
    content: [], isError: false, callView: null, resultView: null, subCalls: [],
    ...parts,
  }
}

describe('viewToolRowModel running rows', () => {
  it('shows `view · action` once a view_apply call has streamed both fields', () => {
    const model = viewToolRowModel('view_apply', running('{"view":"kg","action":"set_filter"}'))
    expect(model).toEqual({ state: 'running', summary: 'kg · set_filter', errorSummary: null })
  })

  it('a non-view_apply tool shows just the view (switch_view navigation)', () => {
    expect(viewToolRowModel('switch_view', running('{"view":"market"}', 'switch_view')).summary).toBe('market')
  })

  it('view_apply with a missing or non-string action degrades to the view', () => {
    expect(viewToolRowModel('view_apply', running('{"view":"kg","action":""}')).summary).toBe('kg')
    expect(viewToolRowModel('view_apply', running('{"view":"kg","action":7}')).summary).toBe('kg')
  })

  it('a missing, empty, or non-string view degrades to the tool name', () => {
    expect(viewToolRowModel('view_apply', running('{"view":"","action":"x"}')).summary).toBe('view_apply')
    expect(viewToolRowModel('view_apply', running('{"view":123}')).summary).toBe('view_apply')
    expect(viewToolRowModel('view_apply', running('{}')).summary).toBe('view_apply')
  })

  it('truncated mid-stream JSON and non-object JSON parse to no args', () => {
    expect(viewToolRowModel('view_apply', running('{"view":"kg')).summary).toBe('view_apply')
    expect(viewToolRowModel('view_apply', running('"text"')).summary).toBe('view_apply')
    expect(viewToolRowModel('view_apply', running('null')).summary).toBe('view_apply')
  })

  it('a running call with no args at all still names the tool', () => {
    expect(viewToolRowModel('switch_view', running(undefined)).summary).toBe('switch_view')
  })
})

describe('viewToolRowModel settled rows', () => {
  it('an ok row collapses to the result text\'s first line', () => {
    expect(viewToolRowModel('view_apply', settled({
      content: [{ type: 'text', text: 'filtered: Supplier' }],
    }))).toEqual({ state: 'ok', summary: 'filtered: Supplier', errorSummary: null })
    expect(viewToolRowModel('view_apply', settled({
      content: [{ type: 'text', text: 'line one\nline two' }],
    })).summary).toBe('line one')
  })

  it('non-text content blocks serialize to indented JSON; the row keeps its first line', () => {
    const model = viewToolRowModel('view_state_get', settled({
      content: [{ type: 'image', data: 'x' } as never],
    }))
    expect(model.summary).toBe('{')
    expect(model.errorSummary).toBe(null)
  })

  it('text and structured blocks join with newlines; the first line wins', () => {
    const model = viewToolRowModel('view_state_get', settled({
      content: [{ type: 'text', text: 'view state' }, { type: 'image', data: 'x' } as never],
    }))
    expect(model.summary).toBe('view state')
  })

  it('an ok body with no content names the error it carries', () => {
    expect(viewToolRowModel('view_apply', settled({
      error: { name: 'ViewError', code: 'E1' },
    })).summary).toBe('ViewError: E1')
  })

  it('an ok body with neither content nor error falls back to the tool name', () => {
    expect(viewToolRowModel('view_apply', settled())).toEqual({
      state: 'ok', summary: 'view_apply', errorSummary: null,
    })
  })

  it('an error row keeps the tool name as summary and the first line as error text', () => {
    expect(viewToolRowModel('view_apply', settled({
      isError: true, content: [{ type: 'text', text: 'boom\ntrace' }],
    }))).toEqual({ state: 'error', summary: 'view_apply', errorSummary: 'boom' })
    expect(viewToolRowModel('view_apply', settled({ isError: true })).errorSummary).toBe('failed')
  })

  it('an interrupted row is stopped: error text when present, null otherwise', () => {
    expect(viewToolRowModel('view_apply', settled({
      error: { name: 'Cancel', code: 'interrupted' }, content: [{ type: 'text', text: 'stopped mid-way' }],
    }))).toEqual({ state: 'stopped', summary: 'view_apply', errorSummary: 'stopped mid-way' })
    // A result whose first line is empty (leading newline) has no error text.
    expect(viewToolRowModel('view_apply', settled({
      error: { name: 'Cancel', code: 'interrupted' }, content: [{ type: 'text', text: '\nstack below' }],
    })).errorSummary).toBe(null)
  })
})
