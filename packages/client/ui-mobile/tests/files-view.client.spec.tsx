// @vitest-environment jsdom
/**
 * The files secondary page (02 §2.7, 03 §6.8): the three sections — the
 * AI-generated artifacts newest first, the recent window deduplicated against
 * the generated section (empty copy under the full listing), the pinned
 * favorites with the amber star toggle — plus the inline read-only report
 * preview and the row's source routing.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FilesView } from '../src/client/files/FilesView.tsx'
import { createWorkItem, deleteWorkItem, updateWorkItem, workSnapshot } from '../src/client/workStore.ts'
import type { ReportPayload } from '../src/client/protocol.ts'

/** One artifact payload. */
function artifactOf(title: string): ReportPayload {
  return { v: 3, type: 'report', id: `r_${title}`, title, metrics: [{ label: '指标', value: '1', kind: 'count' }] }
}

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

describe('FilesView', () => {
  it('renders the empty copy for all three sections', () => {
    render(<FilesView />)
    expect(screen.getByText('近 7 天还没有 AI 生成的报告')).toBeTruthy()
    expect(screen.getByText('近 7 天没有新文件')).toBeTruthy()
    expect(screen.getByText('还没有收藏')).toBeTruthy()
    expect(screen.getByText('点亮星标收进这里')).toBeTruthy()
  })

  it('lists the generated artifacts newest first and previews one inline', async () => {
    const older = createWorkItem({ title: '旧报告', owner: '业务员' })
    updateWorkItem(older.id, { artifact: artifactOf('旧报告') })
    await new Promise((resolve) => { setTimeout(resolve, 5) })
    const newer = createWorkItem({ title: '新报告', owner: '业务员', sourceSessionId: 's_src' })
    updateWorkItem(newer.id, { artifact: artifactOf('新报告') })
    render(<FilesView />)
    // The complementary ruling: the recent window holds every artifact and
    // AI 生成 is its origin-filtered subset — both sections list both rows,
    // each badged with its AI origin.
    const rows = screen.getAllByTestId('file-row')
    expect(rows).toHaveLength(4)
    expect(rows[0]?.textContent).toContain('新报告')
    expect(rows[1]?.textContent).toContain('旧报告')
    expect(screen.getAllByText('AI').length).toBe(4)
    // The read-only preview opens and closes (no action buttons inside).
    fireEvent.click(screen.getAllByRole('button', { name: '查看报告' })[0] as HTMLButtonElement)
    await waitFor(() => { expect(screen.getByTestId('report-card')).toBeTruthy() })
    expect(screen.getByText('指标')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '收起报告' }))
    expect(screen.queryByTestId('report-card')).toBeNull()
    // Only the clicked section's row expanded (the same id lives in both).
    fireEvent.click(screen.getAllByRole('button', { name: '查看报告' })[1] as HTMLButtonElement)
    await waitFor(() => { expect(screen.getAllByTestId('report-card')).toHaveLength(1) })
    // The row routes back to its source chat.
    fireEvent.click(screen.getAllByRole('button', { name: '打开 新报告' })[0] as HTMLButtonElement)
    expect(location.hash).toBe('#/chat/s_src')
  })

  it('drops artifacts older than the 7-day window from both sections', () => {
    vi.useFakeTimers()
    try {
      createWorkItem({ title: '上周报告', owner: '业务员' })
      const item = workSnapshot().items[0]
      expect(item).toBeDefined()
      updateWorkItem(item!.id, { artifact: artifactOf('上周报告') })
      // Eight days later the artifact falls outside the recent window.
      vi.setSystemTime(Date.now() + 8 * 86_400_000)
      render(<FilesView />)
      expect(screen.queryByText('上周报告')).toBeNull()
      expect(screen.getByText('近 7 天还没有 AI 生成的报告')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('routes an unsourced row to its work detail', () => {
    const item = createWorkItem({ title: '无源报告', owner: '业务员' })
    updateWorkItem(item.id, { artifact: artifactOf('无源报告') })
    render(<FilesView />)
    fireEvent.click(screen.getAllByRole('button', { name: '打开 无源报告' })[0] as HTMLButtonElement)
    expect(location.hash).toBe(`#/work/${item.id}`)
  })

  it('carries the subtitle, the source link, and the keyboard star toggle', async () => {
    const item = createWorkItem({ title: '带副题报告', owner: '业务员', sourceSessionId: 's_meta' })
    updateWorkItem(item.id, {
      artifact: {
        v: 3, type: 'report', id: 'r_meta', title: '带副题报告', subtitle: '截至今天 · 湖仓指标',
        metrics: [{ label: '指标', value: '2', kind: 'count' }],
      },
    })
    render(<FilesView />)
    expect(screen.getAllByText('截至今天 · 湖仓指标').length).toBe(2)
    fireEvent.click(screen.getAllByRole('button', { name: '去源对话' })[0] as HTMLButtonElement)
    expect(location.hash).toBe('#/chat/s_meta')
    location.hash = ''
    // The star toggles through the keyboard path too.
    const star = screen.getAllByRole('button', { name: '收藏' })[0] as HTMLButtonElement
    fireEvent.keyDown(star, { key: 'Enter' })
    await waitFor(() => { expect(workSnapshot().items[0]?.pinned).toBe(true) })
  })

  it('ignores non-Enter keys on the star and fires the nav back', async () => {
    const item = createWorkItem({ title: '键盘报告', owner: '业务员' })
    updateWorkItem(item.id, { artifact: artifactOf('键盘报告') })
    const { container } = render(<FilesView />)
    const star = screen.getAllByRole('button', { name: '收藏' })[0] as HTMLButtonElement
    fireEvent.keyDown(star, { key: 'Escape' })
    expect(workSnapshot().items[0]?.pinned).toBe(false)
    fireEvent.click(container.querySelector('.adm-nav-bar-back') as HTMLElement)
  })

  it('sanitizes the row title and subtitle: no casing variant reaches a files row (W23-R4)', () => {
    const item = createWorkItem({ title: '待办概览', owner: '业务员' })
    updateWorkItem(item.id, {
      artifact: {
        v: 3, type: 'report', id: 'r_files_leak', title: 'WFL_Approval_Todos 待办概览',
        subtitle: '实时查询 · 待办表 WFL_Approval_Todos 已清空',
        metrics: [{ label: '指标', value: '1', kind: 'count' }],
      },
    })
    render(<FilesView />)
    expect(/wfl_approval_todos/i.test(document.body.textContent ?? '')).toBe(false)
    expect(screen.getAllByText('待办概览').length).toBeGreaterThan(0)
    expect(screen.getAllByText('实时查询 · 待办表 已清空').length).toBeGreaterThan(0)
  })

  it('carries the demo tag on a seeded artifact row', () => {
    createWorkItem({ title: '演示报告', owner: '林小满', demo: true })
    const item = workSnapshot().items[0]
    updateWorkItem(item?.id ?? '', { artifact: artifactOf('演示报告') })
    render(<FilesView />)
    expect(screen.getAllByText('示例').length).toBeGreaterThan(0)
  })

  it('pins and unpins from the favorites star (local state only)', async () => {
    const item = createWorkItem({ title: '收藏报告', owner: '业务员' })
    updateWorkItem(item.id, { artifact: artifactOf('收藏报告'), pinned: true })
    const { container } = render(<FilesView />)
    expect(screen.getAllByText('收藏报告').length).toBeGreaterThan(0)
    // The favorites section holds the pinned row with an active star.
    expect(container.querySelectorAll('[class*="starActive"]').length).toBeGreaterThan(0)
    // The pinned row renders in both the generated section and favorites; the
    // generated section's star unpins it.
    fireEvent.click(screen.getAllByRole('button', { name: '取消收藏' })[0] as HTMLButtonElement)
    await waitFor(() => { expect(workSnapshot().items[0]?.pinned).toBe(false) })
    expect(screen.getByText('还没有收藏')).toBeTruthy()
    expect(screen.getByText('点亮星标收进这里')).toBeTruthy()
    // Pin back through the generated section's star (unpinned rows show it in favorites only).
    fireEvent.click(screen.getAllByRole('button', { name: '收藏' })[0] as HTMLButtonElement)
    await waitFor(() => { expect(workSnapshot().items[0]?.pinned).toBe(true) })
  })
})
