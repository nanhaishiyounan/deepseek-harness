/**
 * Nav slot contract: the menu block that occupies the sidebar-owned
 * `sidebar.nav.host` seat, plus the `sidebar.nav` menu rows this block
 * declares. The block owns only the menu chrome (spacing and the scroll
 * clamp once the rows outgrow the column); every row is a `sidebar.nav`
 * registrant's, and the seat's common inject hands each row the navigation
 * state hook and the activation channel (both sourced from ui-view-context).
 */
import type { HostObservable, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.nav.host' entry)
// into every program that sees this contract, so PropsRuntime resolves.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the NavState projection type of ui-view-context.
import type {} from '@deepseek-ai/dsh-client-ui-view-context/client'
import type { NavState } from '@deepseek-ai/dsh-client-ui-view-context/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * One main-nav menu row (icon + label + active state). Declared by this
     * package's menu block; each function page registers its own row. The
     * common inject face carries the activation machinery so registrants
     * never wire their own view-switch bridge for the nav.
     */
    'sidebar.nav': {
      kind: 'list'
      scope: 'root'
      owner: SidebarNavItemOwnerProps
      inject: SidebarNavSlotInject
    }
  }
}

/**
 * Owner share of one menu row: the column display state, decided at the
 * block's renderSlot call site (wide renders icon + label rows; the rail
 * renders icon-only rows with tooltips).
 */
export interface SidebarNavItemOwnerProps {
  /** Whether the sidebar renders wide content (false = 56px icon rail). */
  wide: boolean
}

/**
 * The common inject face every `sidebar.nav` registrant receives: the
 * view-context navigation state (bound by the renderer as `useNavState`)
 * and the activation channel.
 */
export interface SidebarNavSlotInject {
  hooks: {
    /** Live navigation state: the resolved active screen and switchability. */
    navState: HostObservable<NavState>
  }
  /**
   * Request the target conversation view: switches the current session's
   * view when a switch is published, else opens the reusable blank session
   * and retries once its view ring mounts. Best-effort by design.
   */
  activate: (view: string) => void
}

/**
 * Full component props of the menu block: the host-seat owner share plus
 * the declared rows' render share and the standard locale seat. No store is
 * registered and the block carries no injected callbacks — the sidebar owns
 * the column chrome.
 */
export type NavRootComponentProps =
  PropsRuntime<'sidebar.nav.host'>
  & PropsRenderSlots<'sidebar.nav'>
  & PropsLocale<'nav'>
