// @vitest-environment jsdom
// The shared page-skeleton atoms: PageHero (eyebrow/title/tagline/meta tiering),
// EmptyState (icon + title + hint + action slot), ErrorStrip (alert semantics
// with the message and retry slot), and PageSkeleton (structured, aria-hidden
// loading previews per variant).

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EmptyState, ErrorStrip, PageHero, PageSkeleton } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconSearchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'

afterEach(cleanup)

describe('PageHero', () => {
  it('renders the title with optional eyebrow, tagline, and meta tiers', () => {
    render(
      <PageHero
        eyebrow="数据资产"
        title="数据资产市场"
        tagline="发现并订阅企业数据产品"
        meta={<span>3 项</span>}
      />,
    )
    expect(screen.getByRole('heading', { level: 2, name: '数据资产市场' })).toBeDefined()
    expect(screen.getByText('数据资产')).toBeDefined()
    expect(screen.getByText('发现并订阅企业数据产品')).toBeDefined()
    expect(screen.getByText('3 项')).toBeDefined()
  })

  it('omits absent tiers and renders the trailing content slot', () => {
    render(<PageHero title="连接器">{<p>featured</p>}</PageHero>)
    expect(screen.getByRole('heading', { name: '连接器' })).toBeDefined()
    expect(screen.getByText('featured')).toBeDefined()
    // No eyebrow/tagline paragraph renders when the props are absent.
    expect(screen.queryByText('undefined')).toBeNull()
  })
})

describe('EmptyState', () => {
  it('renders icon, title, hint, and the action slot', () => {
    render(
      <EmptyState
        title="市场还没有资产"
        hint="先在连接器页接入一个数据源"
        icon={<IconSearchOutline16 />}
      >
        <button type="button">去连接</button>
      </EmptyState>,
    )
    expect(screen.getByText('市场还没有资产')).toBeDefined()
    expect(screen.getByText('先在连接器页接入一个数据源')).toBeDefined()
    expect(screen.getByRole('button', { name: '去连接' })).toBeDefined()
    // The icon box is decorative and hidden from assistive tech.
    expect(screen.getByText('市场还没有资产').closest('section')?.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })

  it('renders without icon and hint', () => {
    render(<EmptyState title="暂无数据" />)
    expect(screen.getByText('暂无数据')).toBeDefined()
  })
})

describe('ErrorStrip', () => {
  it('is an alert carrying the message and the action slot', () => {
    render(
      <ErrorStrip
        message={<>市场暂不可用 — assets-not-composed</>}
        action={<button type="button">重试</button>}
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('assets-not-composed')
    expect(alert.textContent).toContain('重试')
  })

  it('renders message-only without the action slot', () => {
    render(<ErrorStrip message="加载失败" />)
    expect(screen.getByRole('alert').textContent).toBe('加载失败')
  })
})

describe('PageSkeleton', () => {
  it('renders the requested unit count, aria-hidden', () => {
    const { container } = render(<PageSkeleton variant="list" rows={4} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('aria-hidden')).toBe('true')
    expect(root.children.length).toBe(4)
  })

  it('applies per-variant default unit counts', () => {
    const list = render(<PageSkeleton variant="list" />).container.firstElementChild as HTMLElement
    expect(list.children.length).toBe(3)
    const grid = render(<PageSkeleton variant="grid" />).container.firstElementChild as HTMLElement
    expect(grid.children.length).toBe(6)
    const block = render(<PageSkeleton variant="block" />).container.firstElementChild as HTMLElement
    expect(block.children.length).toBe(1)
  })
})
