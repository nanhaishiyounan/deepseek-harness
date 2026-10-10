/**
 * Main-navigation plugin, browser half: occupies the sidebar's `nav.host`
 * seat with the NavRoot menu block (which declares the `sidebar.nav` menu
 * rows every function page contributes into) and registers the chat menu
 * row itself. The seat's common inject hands each row the view-context
 * navigation state hook and the activation channel, so function pages never
 * wire their own view-switch bridge for the nav.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ui-sidebar's SlotMap merge (the nav host seat).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls ui-view-context's Context merge (ctx.viewContext).
import type {} from '@deepseek-ai/dsh-client-ui-view-context/client'
import { ChatNavItem } from './ChatNavItem.tsx'
import { NavRoot } from './NavRoot.tsx'
import { en, zh, type NavKey } from './locales.ts'

export type {
  NavRootComponentProps, SidebarNavItemOwnerProps, SidebarNavSlotInject,
} from './contract/slots.ts'
export type { ChatNavItemProps } from './ChatNavItem.tsx'
export type { NavKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Nav menu block copy. */
    nav: NavKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'nav'

/** Retry cadence for the post-startSession switch (the header mounts asynchronously). */
const ACTIVATE_RETRY_MS = 120

/** Bounded retries: after ~3s the click leaves the session on its current view. */
const ACTIVATE_RETRY_LIMIT = 25

/** Services required by the nav plugin: slots, locale, the blank-session opener, and the view-context switch. */
export const inject = ['slots', 'locale', 'workspaces', 'viewContext']

/** Registers the nav menu block, its row seat, and the chat menu row.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-nav: dictionaries')

  const viewContext = ctx.viewContext

  // Best-effort activation: switch the current session's view when its ring
  // is reachable; with no mounted switch (no current session), open the
  // reusable blank session first, then retry once its header publishes the
  // switch. Bounded, so a session that never opens strands nothing.
  const activate = (view: string): void => {
    if (viewContext.switchView(view)) return
    ctx.workspaces.startSession()
    let attempts = 0
    const retry = (): void => {
      if (viewContext.switchView(view)) return
      if (++attempts >= ACTIVATE_RETRY_LIMIT) return
      setTimeout(retry, ACTIVATE_RETRY_MS)
    }
    setTimeout(retry, ACTIVATE_RETRY_MS)
  }

  ctx.slots.inject('sidebar.nav.host', () => ctx.slots.register({
    name: 'sidebar.nav.host',
    locale: NS,
    children: {
      'sidebar.nav': {
        kind: 'list',
        scope: 'root',
        inject: { hooks: { navState: viewContext.navState }, activate },
      },
    },
  }, NavRoot))

  ctx.slots.inject('sidebar.nav', () => ctx.slots.register({
    name: 'sidebar.nav',
    id: 'chat',
    order: 0,
    locale: NS,
  }, ChatNavItem))
}
