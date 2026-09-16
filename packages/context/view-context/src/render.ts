/**
 * Pure renderers for the durable workbench-view snapshot block.
 * @module @deepseek-ai/dsh-view-context/render
 */

import type { ViewStateEntry, ViewSnapshotValue } from './types.ts'

/**
 * Render one snapshot scalar for the model-facing block.
 *
 * @param value - the snapshot scalar (string/number/boolean/null/string array).
 * @returns the display text (`无` for null, bracketed for arrays, `String` otherwise).
 */
export function formatViewSnapshotValue(value: ViewSnapshotValue): string {
  if (value === null) return '无'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (Array.isArray(value)) return `[${value.join(', ')}]`
  return String(value)
}

/** Render the view tab segment `label(view)` or bare `view`. */
function formatViewTab(entry: ViewStateEntry): string {
  return entry.label === undefined ? entry.view : `${entry.label}(${entry.view})`
}

/**
 * Render the durable injection text for one cached view state.
 *
 * `chat` (and the absent-cache fallback) inject the one-line minimal block;
 * every business view injects the tab segment, each snapshot field as
 * `key=value` joined by `；`, and the view-tools hint.
 *
 * @param entry - the session's cached view state, or undefined when nothing was reported.
 * @returns the snapshot block text.
 */
export function renderViewContextBlock(entry: ViewStateEntry | undefined): string {
  if (entry === undefined || entry.view === 'chat') {
    return '【当前工作台视图】当前为对话视图(chat)。'
  }
  const fields = Object.entries(entry.snapshot)
    .map(([key, value]) => `${key}=${formatViewSnapshotValue(value)}`)
    .join('；')
  const head = `【当前工作台视图】tab=${formatViewTab(entry)}`
  const body = fields === '' ? head : `${head}；${fields}`
  return `${body}。用户对话默认针对此视图；可用 view_apply 调整视图、view_state_get 获取完整状态。`
}
