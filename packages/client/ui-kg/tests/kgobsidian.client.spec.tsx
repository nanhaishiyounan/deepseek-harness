// @vitest-environment jsdom
// The Obsidian canvas over stubbed graphPage calls: the global view's
// island-stats footer, the search-to-locate flow (query → hits → click
// enters the local view with the seed named and selects the node), the
// back-to-global control, and the node-detail relations panel (out/in
// lists).

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KgObsidianCanvas } from '../src/client/KgObsidianCanvas.tsx'
// The renderer is statically imported (single-artifact client contract), so
// the spec stubs the module like the sigma canvas spec does: force-graph's
// canvas measurement cannot run under jsdom.
vi.mock('react-force-graph-2d', () => ({
  default: () => null,
}))
import type { KgObsidianCalls } from '../src/client/KgObsidianCanvas.tsx'
import { zh } from '../src/client/locales.ts'

const t = ((key: string, params?: Record<string, string | number>) => {
  const template = zh[key as keyof typeof zh]
  if (template === undefined) return key
  return template.replaceAll(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))
}) as never

/** The recorded call face one test scenario shares. */
function recordedCalls(): { calls: KgObsidianCalls; log: string[] } {
  const log: string[] = []
  const calls: KgObsidianCalls = {
    global: async () => {
      log.push('global')
      return {
        nodes: [
          { id: 'lake.carbon:item:i1', type: 'Item', name: '酱油', props: { readableId: 'IT-1' }, degree: 3 },
          { id: 'lake.carbon:customer:c1', type: 'Customer', name: '宏发食品', props: {}, degree: 1 },
        ],
        edges: [{ id: 'e1', relation: 'orderedItem', source: 'lake.carbon:customer:c1', target: 'lake.carbon:item:i1' }],
        truncated: false,
        stats: { nodes: 2, edges: 1, islands: 1, largest_component: 2 },
      }
    },
    local: async (nodeId, hops) => {
      log.push(`local:${nodeId}:${String(hops)}`)
      return {
        nodes: [
          { id: nodeId, type: 'Item', name: '酱油', props: { readableId: 'IT-1' }, degree: 3 },
          { id: 'lake.carbon:salesOrder:so1', type: 'SalesOrder', name: 'SO000001', props: {}, degree: 2 },
        ],
        edges: [],
        truncated: false,
        hops,
      }
    },
    search: async (query) => {
      log.push(`search:${query}`)
      return [{ id: 'lake.carbon:item:i1', type: 'Item', name: '酱油', degree: 3 }]
    },
    node: async (nodeId) => {
      log.push(`node:${nodeId}`)
      return {
        id: nodeId, type: 'Item', name: '酱油', props: { readableId: 'IT-1' }, degree: 3,
        out_relations: [{ relation: 'orderedItem', direction: 'out' as const, other_id: 'n2',
          other_name: 'SO000001', other_type: 'SalesOrder' }],
        in_relations: [{ relation: 'stockedIn', direction: 'in' as const, other_id: 'lake.carbon:location:l1',
          other_name: 'Location loc_APP', other_type: 'Location' }],

      }
    },
  }
  return { calls, log }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('KgObsidianCanvas', () => {
  it('loads the global view with the island-stats footer', async () => {
    const { calls, log } = recordedCalls()
    render(<KgObsidianCanvas calls={calls} t={t} />)
    await waitFor(() => { expect(screen.getByTestId('kg-obsidian')).toBeTruthy() })
    expect(log).toContain('global')
    await waitFor(() => {
      expect(screen.getByText('全局：2 节点 / 1 边 / 1 孤岛 · 最大连通分量 2')).toBeTruthy()
    })
  })

  it('searches, lists hits, and a hit click enters the local view', async () => {
    const { calls, log } = recordedCalls()
    render(<KgObsidianCanvas calls={calls} t={t} />)
    const box = await screen.findByTestId('kg-obsidian-search')
    fireEvent.change(box, { target: { value: '酱油' } })
    fireEvent.click(screen.getByText('定位'))
    const hit = await screen.findByText('酱油')
    fireEvent.click(hit.closest('button') as HTMLButtonElement)
    await waitFor(() => { expect(log.some(entry => entry.startsWith('local:lake.carbon:item:i1'))).toBe(true) })
    await waitFor(() => {
      expect(screen.getByText(/局部图：酱油（1 跳）/u)).toBeTruthy()
    })
    // Back to global re-runs the global read.
    fireEvent.click(screen.getByText('← 全局图'))
    await waitFor(() => { expect(log.filter(entry => entry === 'global').length).toBeGreaterThanOrEqual(2) })
  })

  it('renders the relations panel rows for a fetched node detail', async () => {
    const { calls } = recordedCalls()
    render(<KgObsidianCanvas calls={calls} t={t} />)
    await screen.findByTestId('kg-obsidian')
    // The detail panel rides the node call; drive it through search→click.
    fireEvent.change(screen.getByTestId('kg-obsidian-search'), { target: { value: '酱油' } })
    fireEvent.click(screen.getByText('定位'))
    fireEvent.click(await screen.findByText('酱油'))
    await waitFor(() => { expect(screen.getByTestId('kg-obsidian-panel')).toBeTruthy() })
    expect(screen.getByText('→ SO000001')).toBeTruthy()
    expect(screen.getByText('← Location loc_APP')).toBeTruthy()
  })
})
