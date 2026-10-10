// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { NavRootComponentProps, SidebarNavItemOwnerProps } from '../src/client/contract/slots.ts'
import type { ChatNavItemProps } from '../src/client/ChatNavItem.tsx'
import type { NavState } from '@deepseek-ai/dsh-client-ui-view-context/client'
import { NavRoot } from '../src/client/NavRoot.tsx'
import { ChatNavItem } from '../src/client/ChatNavItem.tsx'
import { en } from '../src/client/locales.ts'

// English-dictionary translate stub: the components render the same copy the
// assertions below query by accessible name.
const t: NavRootComponentProps['t'] = key => (en as Record<string, string>)[key] ?? key

// The components never read the global hooks themselves, but they ride the
// standard props share; stub them as never-called functions.
const neverHook = (() => { throw new Error('nav components must not read global hooks') }) as never

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** A useNavState fake over one frozen snapshot (selector applied directly). */
function navStateHookOf(state: NavState): ChatNavItemProps['useNavState'] {
  return (selector: (s: NavState) => unknown) => selector(state) as never
}

function mountRoot({ wide }: { wide: boolean }) {
  let rowsOwner: SidebarNavItemOwnerProps | undefined
  const root = () => (
    <NavRoot
      wide={wide}
      useSessions={neverHook} useWorkspaces={neverHook}
      t={t}
      renderSlot={((key: string, owner: SidebarNavItemOwnerProps) => {
        if (key !== 'sidebar.nav') throw new Error(`unexpected slot ${key}`)
        rowsOwner = owner
        return <div data-testid="menu-rows" data-wide={String(owner.wide)} />
      }) as NavRootComponentProps['renderSlot']}
    />
  )
  const view = render(root())
  return {
    rowsOwner: () => {
      if (rowsOwner === undefined) throw new Error('rows owner not rendered')
      return rowsOwner
    },
    rerender(next: { wide: boolean }) {
      view.rerender(<NavRoot
        wide={next.wide}
        useSessions={neverHook} useWorkspaces={neverHook}
        t={t}
        renderSlot={((_key: string, owner: SidebarNavItemOwnerProps) =>
          <div data-testid="menu-rows" data-wide={String(owner.wide)} />) as NavRootComponentProps['renderSlot']}
      />)
    },
  }
}

describe('NavRoot menu block', () => {
  it('hands the rows the wide state inside the labeled menu region', () => {
    const b = mountRoot({ wide: true })
    expect(b.rowsOwner().wide).toBe(true)
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy()
    expect(screen.getByTestId('menu-rows').dataset.wide).toBe('true')
  })

  it('hands the rows the rail state when the sidebar column collapses', () => {
    const b = mountRoot({ wide: false })
    expect(b.rowsOwner().wide).toBe(false)
    expect(screen.getByTestId('menu-rows').dataset.wide).toBe('false')
    b.rerender({ wide: true })
    expect(screen.getByTestId('menu-rows').dataset.wide).toBe('true')
  })
})

describe('ChatNavItem', () => {
  const activeState: NavState = { screen: { sessionId: 's1' as never, view: 'chat' }, switchable: true }
  const otherState: NavState = { screen: { sessionId: 's1' as never, view: 'kb' }, switchable: true }
  const unresolvedState: NavState = { screen: undefined, switchable: false }

  function mountItem(props: { wide: boolean; state: NavState }) {
    const activate = vi.fn()
    render(<ChatNavItem
      wide={props.wide}
      useSessions={neverHook}
      useWorkspaces={neverHook}
      useNavState={navStateHookOf(props.state)}
      activate={activate}
      t={t}
    />)
    return { activate }
  }

  it('marks itself current for the chat view and the unresolved screen', () => {
    for (const state of [activeState, unresolvedState]) {
      cleanup()
      const { activate } = mountItem({ wide: true, state })
      const button = screen.getByRole('button', { name: 'Chat' })
      expect(button.getAttribute('aria-current')).toBe('page')
      fireEvent.click(button)
      expect(activate).toHaveBeenCalledWith('chat')
    }
  })

  it('drops the current mark on another view and hides the label on the rail', () => {
    const { activate } = mountItem({ wide: false, state: otherState })
    const button = screen.getByRole('button', { name: 'Chat' })
    expect(button.getAttribute('aria-current')).toBe(null)
    expect(button.textContent).not.toContain('Chat')
    fireEvent.click(button)
    expect(activate).toHaveBeenCalledWith('chat')
  })
})
