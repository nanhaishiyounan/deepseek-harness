// @vitest-environment jsdom
/**
 * The mobile-preview surface plugin end to end: the host half (an empty apply
 * plus the invariant companion that reserves package ownership), and the
 * browser half over the slot/locale runtimes — the conversation-view seat, the
 * dictionary namespace, the title-level view-context projection, and the bezel
 * view's ResizeObserver fit (downscale, clamp at tiny sizes, and the null-ref
 * early return).
 */

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import * as Host from '../src/index.ts'
import * as Invariant from '../src/invariant.ts'
import { apply, inject } from '../src/client/index.ts'
import { MobilePreviewView } from '../src/client/MobilePreviewView.tsx'
import type { MobilePreviewViewProps } from '../src/client/MobilePreviewView.tsx'
import { zh, type MobilePreviewKey } from '../src/client/locales.ts'

/** Declare the one seat this plugin rides, as its owning package would. */
function declareSeats(ctx: Context): () => void {
  return ctx.slots.register({
    name: 'root',
    children: { 'conversation.view': { kind: 'list', scope: 'session' } },
  } as never, () => null)
}

/** Boot the client plugin over the slot/locale runtimes (plus an optional scripted viewContext). */
async function bench(viewContext?: { provide: (projection: unknown) => () => void }) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  if (viewContext !== undefined) ctx.provide('viewContext', viewContext as never)
  apply(ctx)
  const disposeSeats = declareSeats(ctx)
  return { ctx, locale, disposeSeats }
}

/** The zh dictionary as the view's locale seat (shared vocabulary keys fall back to their id). */
const t: MobilePreviewViewProps['t'] = key => zh[key as MobilePreviewKey] ?? key

/** Mount the bezel: it reads only the locale seat, so the conversation-view runtime share stays absent. */
function mountView(): ReturnType<typeof render> {
  return render(<MobilePreviewView {...{ t } as unknown as MobilePreviewViewProps} />)
}

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
})

describe('ui-mobile-preview host half', () => {
  it('applies with no host-side behavior', () => {
    expect(() => { Host.apply() }).not.toThrow()
  })

  it('declares the companion plugin name and its required service', () => {
    expect(Invariant.name).toBe('client-ui-mobile-preview-invariant')
    expect(Invariant.inject).toEqual(['invariants'])
  })

  it('registers package ownership and resolves with the disposer', async () => {
    const disposer = (): void => {}
    const register = vi.fn(() => disposer)
    const ctx = { invariants: { register } } as unknown as Parameters<typeof Invariant.apply>[0]
    await expect(Invariant.apply(ctx)).resolves.toBe(disposer)
    expect(register).toHaveBeenCalledWith('@deepseek-ai/dsh-client-ui-mobile-preview', expect.any(Function))
  })
})

describe('ui-mobile-preview client apply', () => {
  it('declares the services it drives', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('registers the conversation-view seat with its zh label', async () => {
    const { ctx, locale, disposeSeats } = await bench()
    try {
      const seat = ctx.get('slots') as SlotRegistry
      const entry = seat.entries('conversation.view').find(candidate => candidate.options.id === 'mobile-preview')
      expect(entry).toBeDefined()
      expect(entry?.options.order).toBe(16)
      const label = entry?.options.label
      expect(typeof label === 'function' ? label() : label).toBe('移动端预览')
      expect(locale.bind('mobilePreview')('view.hint')).toBe(zh['view.hint'])
    } finally {
      disposeSeats()
      await ctx.fiber.dispose()
    }
  })

  it('provides the title-level view-context projection (mounted fact only)', async () => {
    const disposers: string[] = []
    const provide = vi.fn((projection: unknown) => {
      disposers.push((projection as { view: string }).view)
      return () => {}
    })
    const { ctx, disposeSeats } = await bench({ provide })
    try {
      expect(provide).toHaveBeenCalledTimes(1)
      const projection = provide.mock.calls[0]?.[0] as {
        view: string
        label: () => string
        snapshot: () => Record<string, string>
      }
      if (projection === undefined) throw new Error('no projection provided')
      expect(projection.view).toBe('mobile-preview')
      expect(projection.label()).toBe('移动端预览')
      expect(projection.snapshot()).toEqual({ '预览目标': '/mobile' })
      expect(disposers).toEqual(['mobile-preview'])
    } finally {
      disposeSeats()
      await ctx.fiber.dispose()
    }
  })
})

describe('MobilePreviewView', () => {
  /** Install a ResizeObserver stub that records every observer callback. */
  function stubResizeObserver(): (width: number, height: number) => void {
    const callbacks: ((entries: { target: HTMLElement }[]) => void)[] = []
    class ResizeObserverStub {
      public constructor(callback: (entries: { target: HTMLElement }[]) => void) {
        callbacks.push(callback)
      }
      public observe(): void { /* jsdom never lays out; tests fire the callback by hand */ }
      public disconnect(): void { /* the view's cleanup path */ }
      public unobserve(): void { /* unused by the view */ }
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    return (width: number, height: number) => {
      const element = document.querySelector('iframe')?.parentElement?.parentElement
      if (element === null || element === undefined) throw new Error('stage element missing')
      Object.defineProperty(element, 'clientWidth', { configurable: true, value: width })
      Object.defineProperty(element, 'clientHeight', { configurable: true, value: height })
      for (const callback of callbacks) callback([{ target: element }])
      if (callbacks.length === 0) throw new Error('no observer callback recorded')
    }
  }

  it('renders the hint and the iframe bezel at natural size without an observer firing', () => {
    stubResizeObserver()
    const view = mountView()
    expect(view.getByText(zh['view.hint'])).toBeTruthy()
    const frame = view.container.querySelector('iframe')
    expect(frame?.getAttribute('src')).toBe('/mobile')
    expect(frame?.getAttribute('title')).toBe('移动端预览')
    const device = view.container.querySelector('iframe')?.parentElement
    expect(device?.style.width).toBe('430px')
    expect(device?.style.height).toBe('844px')
    expect(device?.style.transform).toBe('scale(1)')
  })

  it('downscales the bezel to fit a narrower stage', () => {
    const fire = stubResizeObserver()
    const view = mountView()
    act(() => { fire(300, 900) })
    const device = view.container.querySelector('iframe')?.parentElement
    // (300-24)/430 ≈ 0.64 is the binding constraint; height 900 fits whole.
    const scale = Number(device?.style.transform.match(/scale\(([\d.]+)\)/u)?.[1] ?? NaN)
    expect(scale).toBeCloseTo(276 / 430, 10)
  })

  it('clamps the fit back to full size when the stage collapses', () => {
    const fire = stubResizeObserver()
    const view = mountView()
    act(() => { fire(0, 0) })
    const device = view.container.querySelector('iframe')?.parentElement
    expect(device?.style.transform).toBe('scale(1)')
  })
})
