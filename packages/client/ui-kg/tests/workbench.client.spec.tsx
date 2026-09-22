// @vitest-environment jsdom
// The P2 workbench surfaces: the presentation layer's semantic/community
// coloring, the ontology tree (hierarchy build, add-child and deprecate
// flows through the KGCL callback, the revision footer), and the change
// feed (episode timeline, review cards' merge/reject/skip verdicts, the
// rollback receipt, the replay handoff).

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OntoTree, buildOntoTree } from '../src/client/OntoTree.tsx'
import { ChangeFeed } from '../src/client/ChangeFeed.tsx'
import { communityColorOf, nodeColorOf, semanticColorOf, semanticRootOf } from '../src/client/presentation.ts'
import { createKgClientStore } from '../src/client/kgStore.ts'
import type { KgEpisodeRow, KgNodeTypeRow, KgReviewEntryRow } from '../src/client/kgTypes.ts'
import { zh } from '../src/client/locales.ts'
import type { KgKey } from '../src/client/locales.ts'

/** The zh dictionary as the surfaces' t (params rendered the runtime way). */
const t = ((key: KgKey, params?: Record<string, string | number>) => {
  const template = zh[key]
  if (template === undefined) return key
  return template.replaceAll(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))
}) as never


/** The first element of a non-empty query result (indexing keeps the checked-array access honest). */
function firstOf<T>(items: readonly T[], what: string): T {
  const head = items[0]
  if (head === undefined) throw new Error(`no ${what} rendered`)
  return head
}

afterEach(cleanup)

describe('presentation semantic coloring', () => {
  const parentOf = (id: string): string | undefined =>
    ({ soySauce: 'seasoning', seasoning: 'food', tofu: 'food' })[id]

  it('resolves the ontology root through the extends chain', () => {
    expect(semanticRootOf('soySauce', parentOf)).toBe('food')
    expect(semanticRootOf('tofu', parentOf)).toBe('food')
    expect(semanticRootOf('company', parentOf)).toBe('company')
  })

  it('guards stale extends loops instead of hanging', () => {
    expect(semanticRootOf('a', id => (id === 'a' ? 'b' : 'a'))).toBe('a')
  })

  it('shares one hue across a root family and wraps the community ladder', () => {
    expect(semanticColorOf('food')).toBe(nodeColorOf('food'))
    expect(communityColorOf(3)).toBe(communityColorOf(3))
    expect(communityColorOf(13)).toBe(communityColorOf(3))
    expect(communityColorOf(-1)).toBe(communityColorOf(0))
  })
})

describe('buildOntoTree', () => {
  const row = (id: string, label: string, extendsId?: string): KgNodeTypeRow => ({
    id, label, layer: 'domain', ...(extendsId === undefined ? {} : { extends: extendsId }),
    prop_keys: [], source: 'builtin-food', status: 'active',
  })

  it('nests children under roots and roots dangling parents', () => {
    const tree = buildOntoTree([
      row('food', '食品'),
      row('tofu', '豆腐', 'food'),
      row('soySauce', '酱油', 'food'),
      row('orphan', '挂靠失效', 'ghost'),
    ])
    expect(tree.map(node => node.type.id).sort()).toEqual(['food', 'orphan'])
    const food = tree.find(node => node.type.id === 'food')
    expect(food?.children.map(node => node.type.id)).toEqual(['tofu', 'soySauce'])
  })

  it('breaks label ties by id inside one sibling group', () => {
    const tree = buildOntoTree([
      row('food', '食品'),
      row('bNode', '同名', 'food'),
      row('aNode', '同名', 'food'),
    ])
    const food = tree.find(node => node.type.id === 'food')
    expect(food?.children.map(node => node.type.id)).toEqual(['aNode', 'bNode'])
  })
})

describe('OntoTree', () => {
  const TYPES: readonly KgNodeTypeRow[] = [
    {
      id: 'food', label: '食品', layer: 'top', prop_keys: ['qty'], source: 'builtin-food', status: 'active',
      foodon_uri: 'http://purl.obolibrary.org/obo/FOODON_00002451', foodon_id: 'FOODON:00002451',
    },
    { id: 'tofu', label: '豆腐', layer: 'domain', extends: 'food', prop_keys: [], source: 'builtin-food', status: 'active' },
    { id: 'legacyMix', label: '旧混合类', layer: 'domain', extends: 'food', prop_keys: [], source: 'agent-defined', status: 'draft' },
  ]
  const REVISIONS = [{ id: 3, summary: 'ontology-edit：1 个 KGCL 操作（add_node ×1）', created_at: '2026-09-18T02:00:00.000Z' }]

  it('renders the hierarchy with badges, the FoodOn anchor, and the revision trail', () => {
    render(<OntoTree types={TYPES} relations={[]} revisions={REVISIONS} onEdit={vi.fn()} t={t} />)
    expect(screen.getByText('豆腐')).toBeTruthy()
    expect(screen.getByText('FOODON:00002451')).toBeTruthy()
    expect(screen.getByText('draft')).toBeTruthy()
    expect(screen.getByText(/ontology-edit：1 个 KGCL 操作/)).toBeTruthy()
    expect(screen.getByTestId('kg-onto-tree')).toBeTruthy()
  })

  it('adds a subclass through the KGCL callback and shows the receipt', async () => {
    const onEdit = vi.fn().mockResolvedValue({ applied: ['新增类 frozenTofu（冻豆腐）挂在 tofu 下'], revision_id: 7, episode_uuid: 'human-edit:1' })
    render(<OntoTree types={TYPES} relations={[]} revisions={[]} onEdit={onEdit} t={t} />)
    fireEvent.click(firstOf(screen.getAllByText('＋子类'), 'add-child buttons'))
    fireEvent.change(screen.getByPlaceholderText('类 id（字母开头）'), { target: { value: 'frozenTofu' } })
    fireEvent.change(screen.getByPlaceholderText('显示名'), { target: { value: '冻豆腐' } })
    fireEvent.click(screen.getByText('应用'))
    await waitFor(() => {
      expect(onEdit).toHaveBeenCalledWith([{ op: 'add_node', target_id: 'frozenTofu', label: '冻豆腐', parent_id: 'food' }])
    })
    await waitFor(() => { expect(screen.getByTestId('kg-onto-notice').textContent).toContain('revision #7') })
  })

  it('surfaces the refusal inline when the edit rejects', async () => {
    const onEdit = vi.fn().mockRejectedValue(new Error('node type "frozenTofu" is already registered'))
    render(<OntoTree types={TYPES} relations={[]} revisions={[]} onEdit={onEdit} t={t} />)
    fireEvent.click(firstOf(screen.getAllByText('＋子类'), 'add-child buttons'))
    fireEvent.change(screen.getByPlaceholderText('类 id（字母开头）'), { target: { value: 'frozenTofu' } })
    fireEvent.change(screen.getByPlaceholderText('显示名'), { target: { value: '冻豆腐' } })
    fireEvent.click(screen.getByText('应用'))
    await waitFor(() => { expect(screen.getByText(/already registered/)).toBeTruthy() })
  })

  it('deprecates through the select with an optional replacement', async () => {
    const onEdit = vi.fn().mockResolvedValue({ applied: ['废弃类 legacyMix（替代 tofu）'], revision_id: 8, episode_uuid: 'human-edit:2' })
    render(<OntoTree types={TYPES} relations={[]} revisions={[]} onEdit={onEdit} t={t} />)
    const deprecateButtons = screen.getAllByText('废弃')
    fireEvent.click(firstOf(deprecateButtons.reverse(), 'deprecate buttons'))
    fireEvent.change(screen.getByLabelText('（可选）替代类…'), { target: { value: 'tofu' } })
    await waitFor(() => {
      expect(onEdit).toHaveBeenCalledWith([{ op: 'deprecate_node', target_id: 'legacyMix', replaced_by: 'tofu' }])
    })
  })
})

describe('ChangeFeed', () => {
  const EPISODES: readonly KgEpisodeRow[] = [
    {
      uuid: 'rollback:1', source: 'rollback', name: '回滚 本体编辑',
      content: '回滚 episode ai-edit:1', created_at: '2026-09-18T03:00:00.000Z', mentions: 2,
    },
    {
      uuid: 'ai-edit:1', source: 'ai-edit', name: '把张红喜的供应商关系改成中粮',
      content: '+ 新增关系 张红喜 —[supplies]→ 中粮\n− 移除关系 张红喜 —[supplies]→ 宏发',
      created_at: '2026-09-18T02:00:00.000Z', mentions: 2,
    },
    {
      uuid: 'ingest:1', source: 'ingest', name: '跨源共指对齐',
      content: 'crossSourceAlign v2：判定 6 对…', created_at: '2026-09-18T01:00:00.000Z', mentions: 4,
    },
  ]
  const REVIEW: readonly KgReviewEntryRow[] = [
    { doc_id: 'kb:doc#大豆', row_id: 'nocobase:materials:7', doc_name: '大豆', row_name: '非转基因大豆原料', confidence: 0.72, reason: '名称包含，语义相近' },
  ]

  it('renders the timeline with source badges and the diff content', () => {
    render(
      <ChangeFeed episodes={EPISODES} review={[]} loading={false} error={undefined}
        onReload={vi.fn()} onRollback={vi.fn()} onDecide={vi.fn()} onReplay={vi.fn()} t={t} />,
    )
    expect(screen.getByText('把张红喜的供应商关系改成中粮')).toBeTruthy()
    expect(screen.getByTestId('kg-episode-list').children).toHaveLength(3)
    expect(screen.getByText('AI').textContent).toBe('AI')
    expect(screen.getByText(/新增关系 张红喜/)).toBeTruthy()
  })

  it('records a merge verdict and reloads the queue', async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined)
    const onReload = vi.fn()
    render(
      <ChangeFeed episodes={EPISODES} review={REVIEW} loading={false} error={undefined}
        onReload={onReload} onRollback={vi.fn()} onDecide={onDecide} onReplay={vi.fn()} t={t} />,
    )
    expect(screen.getByTestId('kg-review-card').textContent).toContain('大豆')
    fireEvent.click(screen.getByText('合并'))
    await waitFor(() => {
      expect(onDecide).toHaveBeenCalledWith(REVIEW[0], 'merge')
      expect(onReload).toHaveBeenCalled()
      expect(screen.getByTestId('kg-feed-notice').textContent).toContain('已合并')
    })
  })

  it('rejects and skips without merge edges', async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(
      <ChangeFeed episodes={EPISODES} review={REVIEW} loading={false} error={undefined}
        onReload={vi.fn()} onRollback={vi.fn()} onDecide={onDecide} onReplay={vi.fn()} t={t} />,
    )
    fireEvent.click(screen.getByText('不合并'))
    await waitFor(() => { expect(onDecide).toHaveBeenCalledWith(REVIEW[0], 'reject') })
    rerender(
      <ChangeFeed episodes={EPISODES} review={REVIEW} loading={false} error={undefined}
        onReload={vi.fn()} onRollback={vi.fn()} onDecide={onDecide} onReplay={vi.fn()} t={t} />,
    )
    fireEvent.click(screen.getByText('跳过'))
    await waitFor(() => { expect(onDecide).toHaveBeenCalledWith(REVIEW[0], 'skip') })
  })

  it('rolls one episode back and reports the retired/restored receipt', async () => {
    const onRollback = vi.fn().mockResolvedValue({ rollback_uuid: 'rollback:2', rolled_back: 'ai-edit:1', retired: 1, restored: 1 })
    const onReload = vi.fn()
    render(
      <ChangeFeed episodes={EPISODES} review={[]} loading={false} error={undefined}
        onReload={onReload} onRollback={onRollback} onDecide={vi.fn()} onReplay={vi.fn()} t={t} />,
    )
    fireEvent.click(firstOf(screen.getAllByText('回滚到此之前'), 'rollback buttons'))
    await waitFor(() => {
      expect(onRollback).toHaveBeenCalledWith('ai-edit:1')
      expect(screen.getByTestId('kg-feed-notice').textContent).toContain('1 条边失效、1 条恢复')
      expect(onReload).toHaveBeenCalled()
    })
  })

  it('hands the episode instant to the replay callback', () => {
    const onReplay = vi.fn()
    render(
      <ChangeFeed episodes={EPISODES} review={[]} loading={false} error={undefined}
        onReload={vi.fn()} onRollback={vi.fn()} onDecide={vi.fn()} onReplay={onReplay} t={t} />,
    )
    fireEvent.click(screen.getAllByText('回放此时刻')[1] as HTMLElement)
    expect(onReplay).toHaveBeenCalledWith('2026-09-18T02:00:00.000Z')
  })
})

describe('OntoTree editor tails', () => {
  const TYPED: readonly KgNodeTypeRow[] = [
    { id: 'food', label: '食品', layer: 'top', prop_keys: [], source: 'builtin-food', status: 'active' },
    { id: 'tofu', label: '豆腐', layer: 'domain', extends: 'food', prop_keys: [], source: 'builtin-food', status: 'active' },
    { id: 'legacyMix', label: '旧混合类', layer: 'domain', extends: 'food', prop_keys: [], source: 'agent-defined', status: 'draft' },
    { id: 'retired', label: '已废弃类', layer: 'domain', extends: 'food', prop_keys: [], source: 'agent-defined', status: 'deprecated' },
    { id: 'foodonChemical', label: 'FoodOn化学类', layer: 'domain', extends: 'food', prop_keys: [], source: 'foodon-imported', status: 'active' },
  ]

  it('collapses and reopens a branch through the toggle', () => {
    render(<OntoTree types={TYPED} relations={[]} revisions={[]} onEdit={vi.fn()} t={t} />)
    expect(screen.getByText('豆腐')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '−' }))
    expect(screen.queryByText('豆腐')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '+' }))
    expect(screen.getByText('豆腐')).toBeTruthy()
  })

  it('renames through the inline form, guarding blank and unchanged labels', async () => {
    const onEdit = vi.fn().mockResolvedValue({ applied: ['改名类 food（食品大类）'], revision_id: 9, episode_uuid: 'human-edit:3' })
    render(<OntoTree types={TYPED} relations={[]} revisions={[]} onEdit={onEdit} t={t} />)
    fireEvent.click(screen.getAllByText('改名')[0] as HTMLElement)
    const input = screen.getByPlaceholderText('显示名') as HTMLInputElement
    // Unchanged and blank labels keep the apply button disabled.
    const applyButton = screen.getByText('应用').closest<HTMLButtonElement>('button')
    expect(applyButton?.disabled).toBe(true)
    fireEvent.change(input, { target: { value: '   ' } })
    expect(applyButton?.disabled).toBe(true)
    fireEvent.change(input, { target: { value: '食品大类' } })
    fireEvent.click(screen.getByText('应用'))
    await waitFor(() => {
      expect(onEdit).toHaveBeenCalledWith([{ op: 'rename_node', target_id: 'food', label: '食品大类' }])
    })
  })

  it('moves a class under a new parent, offering neither itself nor its current one', async () => {
    const onEdit = vi.fn().mockResolvedValue({ applied: ['移动类 food → tofu'], revision_id: 10, episode_uuid: 'human-edit:4' })
    render(<OntoTree types={TYPED} relations={[]} revisions={[]} onEdit={onEdit} t={t} />)
    fireEvent.click(screen.getAllByText('移动')[0] as HTMLElement)
    const select = screen.getByLabelText('选择新父类…') as HTMLSelectElement
    const offered = [...select.querySelectorAll('option')].map(option => option.value)
    expect(offered).not.toContain('food')
    fireEvent.change(select, { target: { value: 'tofu' } })
    await waitFor(() => {
      expect(onEdit).toHaveBeenCalledWith([{ op: 'set_parent', target_id: 'food', new_parent_id: 'tofu' }])
    })
  })

  it('deprecating with the placeholder replacement selected sends no replaced_by', async () => {
    const onEdit = vi.fn().mockResolvedValue({ applied: ['废弃类 legacyMix'], revision_id: 11, episode_uuid: 'human-edit:5' })
    render(<OntoTree types={TYPED} relations={[]} revisions={[]} onEdit={onEdit} t={t} />)
    const buttons = screen.getAllByText('废弃')
    // The deprecated class renders no deprecate button; legacyMix's comes third.
    fireEvent.click(buttons[2] as HTMLElement)
    fireEvent.change(screen.getByLabelText('（可选）替代类…'), { target: { value: '' } })
    await waitFor(() => {
      expect(onEdit).toHaveBeenCalledWith([{ op: 'deprecate_node', target_id: 'legacyMix' }])
    })
  })

  it('re-clicking the same editor button closes the editor; cancel closes every kind', () => {
    render(<OntoTree types={TYPED} relations={[]} revisions={[]} onEdit={vi.fn()} t={t} />)
    const addChild = screen.getAllByText('＋子类')[0] as HTMLElement
    fireEvent.click(addChild)
    expect(screen.getByTestId('kg-onto-editor-add')).toBeTruthy()
    fireEvent.click(addChild)
    expect(screen.queryByTestId('kg-onto-editor-add')).toBeNull()
    // The add editor's own cancel button closes it as well.
    fireEvent.click(addChild)
    fireEvent.click(screen.getByText('取消'))
    expect(screen.queryByTestId('kg-onto-editor-add')).toBeNull()

    for (const [label, testid] of [
      ['改名', 'kg-onto-editor-rename'],
      ['移动', 'kg-onto-editor-move'],
    ] as const) {
      const button = screen.getAllByText(label)[0] as HTMLElement
      fireEvent.click(button)
      expect(screen.getByTestId(testid)).toBeTruthy()
      fireEvent.click(button)
      expect(screen.queryByTestId(testid)).toBeNull()
    }

    const deprecate = screen.getAllByText('废弃')[2] as HTMLElement
    fireEvent.click(deprecate)
    expect(screen.getByTestId('kg-onto-editor-deprecate')).toBeTruthy()
    fireEvent.click(deprecate)
    expect(screen.queryByTestId('kg-onto-editor-deprecate')).toBeNull()

    // Every editor kind also closes through its own cancel button.
    for (const [label, testid] of [
      ['改名', 'kg-onto-editor-rename'],
      ['移动', 'kg-onto-editor-move'],
    ] as const) {
      fireEvent.click(screen.getAllByText(label)[0] as HTMLElement)
      expect(screen.getByTestId(testid)).toBeTruthy()
      fireEvent.click(screen.getByText('取消'))
      expect(screen.queryByTestId(testid)).toBeNull()
    }
    fireEvent.click(deprecate)
    fireEvent.click(screen.getByText('取消'))
    expect(screen.queryByTestId('kg-onto-editor-deprecate')).toBeNull()
  })

  it('re-selecting the move placeholder submits nothing', () => {
    const onEdit = vi.fn()
    render(<OntoTree types={TYPED} relations={[]} revisions={[]} onEdit={onEdit} t={t} />)
    fireEvent.click(screen.getAllByText('移动')[0] as HTMLElement)
    fireEvent.change(screen.getByLabelText('选择新父类…'), { target: { value: '' } })
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('a FoodOn anchor without a curated id falls back to the FOODON label', () => {
    const withBareFoodon = [
      ...TYPED,
      { id: 'foodonBare', label: '裸FoodOn类', layer: 'domain' as const, extends: 'food', prop_keys: [], source: 'foodon-imported' as const, status: 'active' as const, foodon_uri: 'http://purl.obolibrary.org/obo/FOODON_00000001' },
    ]
    render(<OntoTree types={withBareFoodon} relations={[]} revisions={[]} onEdit={vi.fn()} t={t} />)
    // The bare anchor prints the FOODON fallback; both foodon-imported rows keep their badges.
    expect(screen.getAllByText('FOODON').length).toBe(1)
    expect(screen.getAllByText('FoodOn').length).toBe(2)
  })

  it('renders the deprecated and FoodOn badges plus the relation registry line', () => {
    render(
      <OntoTree
        types={TYPED}
        relations={[{ id: 'supplies', label: '供货', constraints: [], kind: 'object', source: 'builtin-food' }]}
        revisions={[]}
        onEdit={vi.fn()}
        t={t}
      />,
    )
    expect(document.querySelector('[data-onto-badge="deprecated"]')).not.toBeNull()
    expect(document.querySelector('[data-onto-badge="foodon"]')).not.toBeNull()
    expect(screen.getByText(zh['onto.cardinality'])).toBeTruthy()
    expect(screen.getByText('supplies')).toBeTruthy()
  })

  it('renders the empty-tree placeholder before any registry loads', () => {
    render(<OntoTree types={[]} relations={[]} revisions={[]} onEdit={vi.fn()} t={t} />)
    expect(screen.getByText(zh['onto.empty'])).toBeTruthy()
  })

  it('stringifies a non-Error refusal for the inline notice', async () => {
    const onEdit = vi.fn().mockRejectedValue('网关直接拒绝了字符串')
    render(<OntoTree types={TYPED} relations={[]} revisions={[]} onEdit={onEdit} t={t} />)
    fireEvent.click(screen.getAllByText('＋子类')[0] as HTMLElement)
    fireEvent.change(screen.getByPlaceholderText('类 id（字母开头）'), { target: { value: 'frozenTofu' } })
    fireEvent.change(screen.getByPlaceholderText('显示名'), { target: { value: '冻豆腐' } })
    fireEvent.click(screen.getByText('应用'))
    await waitFor(() => { expect(screen.getByText(/网关直接拒绝了字符串/)).toBeTruthy() })
  })
})

describe('ChangeFeed failure tails', () => {
  const EPISODES: readonly KgEpisodeRow[] = [
    { uuid: 'ingest:1', source: 'ingest', name: '跨源共指对齐', content: 'c', created_at: '2026-09-18T01:00:00.000Z', mentions: 4 },
  ]
  const REVIEW: readonly KgReviewEntryRow[] = [
    { doc_id: 'kb:doc#大豆', row_id: 'nocobase:materials:7', doc_name: '大豆', row_name: '非转基因大豆', confidence: 0.72, reason: '' },
  ]

  it('surfaces the ledger refusal with an inline retry', () => {
    const onReload = vi.fn()
    render(
      <ChangeFeed episodes={[]} review={[]} loading={false} error="kg-not-composed"
        onReload={onReload} onRollback={vi.fn()} onDecide={vi.fn()} onReplay={vi.fn()} t={t} />,
    )
    expect(screen.getByText(/kg-not-composed/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['error.retry'] }))
    expect(onReload).toHaveBeenCalled()
  })

  it('a rejected verdict lands the refusal notice and releases the busy lock', async () => {
    // The first rejection is a bare string (a transport quirk): the notice
    // still renders it through String().
    const onDecide = vi.fn().mockRejectedValueOnce('queue-closed-string').mockResolvedValueOnce(undefined)
    render(
      <ChangeFeed episodes={EPISODES} review={REVIEW} loading={false} error={undefined}
        onReload={vi.fn()} onRollback={vi.fn()} onDecide={onDecide} onReplay={vi.fn()} t={t} />,
    )
    fireEvent.click(screen.getByText('合并'))
    await waitFor(() => { expect(screen.getByText(/queue-closed-string/u)).toBeTruthy() })
    // The busy flag cleared with the failure, so the next verdict still fires.
    fireEvent.click(screen.getByText('跳过'))
    await waitFor(() => { expect(onDecide).toHaveBeenCalledWith(REVIEW[0], 'skip') })
  })

  it('prints an Error refusal through its own message', async () => {
    const onRollback = vi.fn().mockRejectedValueOnce(new Error('episode-settled：该集已结算'))
    render(
      <ChangeFeed episodes={EPISODES} review={[]} loading={false} error={undefined}
        onReload={vi.fn()} onRollback={onRollback} onDecide={vi.fn()} onReplay={vi.fn()} t={t} />,
    )
    fireEvent.click(screen.getByText(zh['feed.rollback']))
    await waitFor(() => { expect(screen.getByText(/episode-settled：该集已结算/u)).toBeTruthy() })
  })

  it('renders the empty ledger hint before any episode exists', () => {
    render(
      <ChangeFeed episodes={[]} review={[]} loading={false} error={undefined}
        onReload={vi.fn()} onRollback={vi.fn()} onDecide={vi.fn()} onReplay={vi.fn()} t={t} />,
    )
    expect(screen.getByText(zh['feed.empty'])).toBeTruthy()
  })
})

describe('kgStore workbench caches', () => {
  it('carries episodes, review, communities, history, and the color mode', () => {
    const store = createKgClientStore()
    store.beginEpisodes()
    store.setEpisodes([{ uuid: 'u1', source: 'human-edit', name: 'n', content: 'c', created_at: 't', mentions: 0 }])
    store.setReview([{ doc_id: 'd', row_id: 'r', doc_name: 'a', row_name: 'b', confidence: 0.6, reason: '' }], 'ingest:1')
    store.setCommunities({ communities: [{ id: 0, nodes: ['n1'] }], modularity: 0.5, node_count: 1 })
    store.beginHistory()
    store.setHistory({ nodes: [], edges: [], truncated: false, asOf: '2026-01-01T00:00:00Z' })
    store.setColorMode('community')
    const snapshot = store.store.getSnapshot()
    expect(snapshot.episodes?.status).toBe('ready')
    expect(snapshot.review?.status).toBe('ready')
    expect(snapshot.communities?.status).toBe('ready')
    expect(snapshot.history?.status).toBe('ready')
    expect(snapshot.colorMode).toBe('community')
    store.clearHistory()
    expect(store.store.getSnapshot().history).toBeUndefined()
    store.failEpisodes('x')
    store.failReview('x')
    store.failCommunities('x')
    store.failHistory('x')
    expect(store.store.getSnapshot().episodes?.status).toBe('error')
    expect(store.store.getSnapshot().review?.status).toBe('error')
    expect(store.store.getSnapshot().communities?.status).toBe('error')
    expect(store.store.getSnapshot().history?.status).toBe('error')
  })

  it('tracks the panel, search, review, and communities lifecycles with an optional mappings readout', () => {
    const store = createKgClientStore()
    store.beginPanel()
    expect(store.store.getSnapshot().panel).toEqual({ status: 'loading' })
    store.setPanel({ islands: 1, conflicts: 0 }, { triples: 2, entities: 1 })
    const barePanel = store.store.getSnapshot().panel
    expect(barePanel?.status).toBe('ready')
    expect(barePanel?.status === 'ready' ? 'mappings' in barePanel.value : false).toBe(false)
    const mappings = {
      file: 'kg-mappings.yml',
      version: 1,
      rules: { skipHiddenCollections: true, emptyFkNoEdge: true, derivesTitle: true },
      collections: [{ name: 'experts', fkLinkCount: 0 }],
    }
    store.setPanel({ islands: 1, conflicts: 0 }, { triples: 2, entities: 1 }, mappings)
    const panel = store.store.getSnapshot().panel
    expect(panel?.status === 'ready' ? panel.value.mappings : undefined).toEqual(mappings)
    store.failPanel('x')
    expect(store.store.getSnapshot().panel).toEqual({ status: 'error', error: 'x' })

    store.beginSearch()
    expect(store.store.getSnapshot().search).toEqual({ status: 'loading' })
    store.failSearch('y')
    expect(store.store.getSnapshot().search).toEqual({ status: 'error', error: 'y' })

    store.beginReview()
    expect(store.store.getSnapshot().review).toEqual({ status: 'loading' })
    store.beginCommunities()
    expect(store.store.getSnapshot().communities).toEqual({ status: 'loading' })
  })
})
