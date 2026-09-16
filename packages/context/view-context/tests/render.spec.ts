import { describe, expect, it } from 'vitest'
import { formatViewSnapshotValue, renderViewContextBlock } from '@deepseek-ai/dsh-view-context'
import type { ViewStateEntry } from '@deepseek-ai/dsh-view-context'

function entry(overrides: Partial<ViewStateEntry> = {}): ViewStateEntry {
  return {
    view: 'kg',
    snapshot: { '选中实体': '海天味业', '类型过滤': ['Supplier', 'Product'] },
    actions: { kg: ['set_type_filter'] },
    reportedAt: 0,
    ...overrides,
  }
}

describe('formatViewSnapshotValue', () => {
  it('renders each scalar kind', () => {
    expect(formatViewSnapshotValue(null)).toBe('无')
    expect(formatViewSnapshotValue(true)).toBe('是')
    expect(formatViewSnapshotValue(false)).toBe('否')
    expect(formatViewSnapshotValue(214)).toBe('214')
    expect(formatViewSnapshotValue('酱油')).toBe('酱油')
    expect(formatViewSnapshotValue(['Supplier', 'Product'])).toBe('[Supplier, Product]')
  })
})

describe('renderViewContextBlock', () => {
  it('renders the minimal block for an absent cache and for chat', () => {
    const minimal = '【当前工作台视图】当前为对话视图(chat)。'
    expect(renderViewContextBlock(undefined)).toBe(minimal)
    expect(renderViewContextBlock(entry({ view: 'chat' }))).toBe(minimal)
  })

  it('renders tab segment, snapshot fields, and the tool hint', () => {
    expect(renderViewContextBlock(entry({ label: '知识图谱' }))).toBe(
      '【当前工作台视图】tab=知识图谱(kg)；选中实体=海天味业；类型过滤=[Supplier, Product]。'
      + '用户对话默认针对此视图；可用 view_apply 调整视图、view_state_get 获取完整状态。',
    )
  })

  it('omits the fields segment for an empty snapshot and renders bare view ids without label', () => {
    expect(renderViewContextBlock(entry({ snapshot: {} }))).toBe(
      '【当前工作台视图】tab=kg。'
      + '用户对话默认针对此视图；可用 view_apply 调整视图、view_state_get 获取完整状态。',
    )
  })
})
