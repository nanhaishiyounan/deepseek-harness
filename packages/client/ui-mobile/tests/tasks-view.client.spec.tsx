// @vitest-environment jsdom
/**
 * The tasks secondary page (02 §2.6, 03 §6.7): the mine/team split with live
 * counts, the due-ascending row order (undated last, due-soon amber class),
 * the team banner with owner tails, the demo tags, the empty state's chats
 * route, and the rows routing to the work detail.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TasksView, byDue } from '../src/client/tasks/TasksView.tsx'
import { createWorkItem, deleteWorkItem, workSnapshot, type WorkItem } from '../src/client/workStore.ts'

/** One bare item at a fixed clock for the order assertions. */
function rowAt(title: string, due: string | undefined, updatedAt: number, overrides: Partial<WorkItem> = {}): WorkItem {
  const item = createWorkItem({ title, owner: '业务员', ...(due === undefined ? {} : { due }) })
  return { ...item, ...overrides, updatedAt }
}

describe('byDue', () => {
  it('orders dated rows ascending with undated last, fresh first among ties', () => {
    const rows = [
      rowAt('无期晚', undefined, 2),
      rowAt('晚到期', '2030-09-01', 9),
      rowAt('无期早', undefined, 1),
      rowAt('早到期', '2030-01-01', 9),
      rowAt('同日', '2030-01-01', 9),
    ]
    const ordered = byDue(rows).map(item => item.title)
    // Fresh first among the undated ties (newest updatedAt leads).
    expect(ordered.indexOf('无期晚')).toBeLessThan(ordered.indexOf('无期早'))
    expect(ordered.filter(name => name !== '无期早' && name !== '无期晚'))
      .toEqual(expect.arrayContaining(['早到期', '同日', '晚到期']))
    expect(ordered.indexOf('早到期')).toBeLessThan(ordered.indexOf('晚到期'))
    // A pure two-element descending input also exercises the > arm directly.
    expect(byDue([rowAt('乙', '2030-09-01', 9), rowAt('甲', '2030-01-01', 9)]).map(item => item.title))
      .toEqual(['甲', '乙'])
    // An ascending pair exercises the < arm just as directly.
    expect(byDue([rowAt('甲', '2030-01-01', 9), rowAt('乙', '2030-09-01', 9)]).map(item => item.title))
      .toEqual(['甲', '乙'])
  })
})
beforeEach(() => {
  localStorage.clear()
  for (const item of workSnapshot().items) deleteWorkItem(item.id)
  location.hash = ''
  vi.stubGlobal('fetch', vi.fn(async (): Promise<Response> => new Response('{}', { status: 200 })))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  cleanup()
})

describe('TasksView', () => {
  it('renders the mine empty state routing to chats', () => {
    render(<TasksView identityName="业务员" />)
    expect(screen.getByText('还没有你的任务')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '去对话里让 AI 同事派个活' }))
    expect(location.hash).toBe('#/chats')
  })

  it('splits mine and team, ordering by due with the demo tail', () => {
    createWorkItem({ title: '无期限', owner: '业务员' })
    createWorkItem({ title: '后到期', owner: '业务员', due: '2030-09-01' })
    createWorkItem({ title: '先到期', owner: '业务员', due: '2030-01-01' })
    createWorkItem({ title: '同事的', owner: '陈晨', due: '2030-05-01', demo: true })
    render(<TasksView identityName="业务员" />)
    expect(screen.getByText('我的 3')).toBeTruthy()
    expect(screen.getByText('团队 1')).toBeTruthy()
    // Due ascending: 先到期 before 后到期, undated last.
    const labels = screen.getAllByRole('button', { name: /打开 / }).map(row => row.textContent ?? '')
    const first = labels.find(text => text.includes('先到期'))
    const second = labels.find(text => text.includes('后到期'))
    const last = labels.find(text => text.includes('无期限'))
    expect(labels.indexOf(first ?? '')).toBeLessThan(labels.indexOf(second ?? ''))
    expect(labels.indexOf(second ?? '')).toBeLessThan(labels.indexOf(last ?? ''))
    // The team tab carries the banner, the owner tail, and the demo tag.
    fireEvent.click(screen.getByText('团队 1'))
    expect(screen.getByText(/演示团队/)).toBeTruthy()
    expect(screen.getByText('陈晨')).toBeTruthy()
    expect(screen.getByText('示例')).toBeTruthy()
  })

  it('renders two undated rows under the both-undated order branch', () => {
    createWorkItem({ title: '无期乙', owner: '业务员' })
    createWorkItem({ title: '无期甲', owner: '业务员' })
    render(<TasksView identityName="业务员" />)
    // Same-millisecond creations tie; both rows surface, order unspecified.
    const labels = screen.getAllByRole('button', { name: /打开 / }).map(row => row.textContent ?? '')
    expect(labels.some(text => text.includes('无期甲'))).toBe(true)
    expect(labels.some(text => text.includes('无期乙'))).toBe(true)
  })

  it('marks the due-soon date and routes a row to its detail', () => {
    const soon = new Date(Date.now() + 86_400_000)
    const due = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`
    const item = createWorkItem({ title: '临期任务', owner: '业务员', due })
    const { container } = render(<TasksView identityName="业务员" />)
    const soonNode = Array.from(container.querySelectorAll('[class*="dueSoon"]'))
    expect(soonNode.length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /打开 临期任务/ }))
    expect(location.hash).toBe(`#/work/${item.id}`)
  })

  it('fires the nav back through the domain fallback', () => {
    const realBack = history.back.bind(history)
    const back = vi.fn()
    history.back = back
    try {
      const { container } = render(<TasksView identityName="业务员" />)
      fireEvent.click(container.querySelector('.adm-nav-bar-back') as HTMLElement)
      expect(back).toHaveBeenCalled()
    } finally {
      history.back = realBack
    }
  })

  it('renders the team empty state', () => {
    createWorkItem({ title: '只有我的', owner: '业务员' })
    render(<TasksView identityName="业务员" />)
    fireEvent.click(screen.getByText('团队 0'))
    expect(screen.getByText('团队还没有任务')).toBeTruthy()
  })
})
