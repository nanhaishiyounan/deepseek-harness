/**
 * Pure row-model derivation for the view-tools toolview row: the settled
 * state off the frozen call slice, the result's first line as the collapsed
 * summary, and the running target off the raw arguments. Pure functions of
 * the frozen slice; malformed material degrades to the tool name.
 * @module @deepseek-ai/dsh-client-ui-view-context/client/viewToolModel
 */

import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'

/** Row lifecycle, the kb rows' vocabulary. */
export type ViewToolRowState = 'running' | 'ok' | 'error' | 'stopped'

/** The view-tools row model. */
export interface ViewToolRowModel {
  readonly state: ViewToolRowState
  /** Collapsed summary: the result's first line on success, the target while running. */
  readonly summary: string
  /** First line of the result text on an error row; null otherwise. */
  readonly errorSummary: string | null
}

/** Text up to the first newline, or the whole text. */
function firstLine(text: string): string {
  const newline = text.indexOf('\n')
  return newline === -1 ? text : text.slice(0, newline)
}

/** Flatten a settled result's content blocks to display text; null while running. */
function resultTextOf(block: ToolCallBlock): string | null {
  /* v8 ignore next 1 -- defensive: the sole caller has already narrowed to
   * the settled form, so a kind-less (running) block cannot reach here. */
  if (!('kind' in block)) return null
  const parts: string[] = []
  for (const item of block.content) {
    parts.push(item.type === 'text' ? item.text : JSON.stringify(item, null, 2))
  }
  if (parts.length === 0 && block.error !== undefined) {
    parts.push(`${block.error.name}: ${block.error.code}`)
  }
  return parts.join('\n') || null
}

/** The parsed arguments object; undefined while the JSON is still streaming. */
function argsOf(block: ToolCallBlock): Record<string, unknown> | undefined {
  /* v8 ignore next 1 -- the sole caller passes the running form, which never
   * carries kind; the settled arm of this guard is unreachable. */
  const raw = ('kind' in block ? block.call?.argsRaw : block.argsRaw) ?? ''
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>
  } catch {
    // A truncated JSON prefix mid-stream: the summary falls back to the tool name.
  }
  return undefined
}

/** The running target summary: `view · action` when the args streamed. */
function runningSummary(toolName: string, args: Record<string, unknown> | undefined): string {
  const view = args?.['view']
  const action = args?.['action']
  if (typeof view !== 'string' || view === '') return toolName
  if (toolName !== 'view_apply' || typeof action !== 'string' || action === '') return view
  return `${view} · ${action}`
}

/**
 * Derive the view-tools row model.
 * @param toolName - the wire tool name (the keyed dispatch value).
 * @param block - running call or settled result node.
 * @returns the row model.
 */
export function viewToolRowModel(toolName: string, block: ToolCallBlock): ViewToolRowModel {
  if (!('kind' in block)) {
    return { state: 'running', summary: runningSummary(toolName, argsOf(block)), errorSummary: null }
  }
  const output = resultTextOf(block) ?? ''
  const line = firstLine(output)
  if (block.error?.code === 'interrupted') {
    return { state: 'stopped', summary: toolName, errorSummary: line || null }
  }
  if (block.isError) {
    return { state: 'error', summary: toolName, errorSummary: line || 'failed' }
  }
  return { state: 'ok', summary: line || toolName, errorSummary: null }
}
