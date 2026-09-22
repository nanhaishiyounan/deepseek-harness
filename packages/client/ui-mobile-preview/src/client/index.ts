/**
 * Mobile-preview surface plugin, browser half: registers the `mobile-preview`
 * conversation view (the 390×844 phone bezel over the same-origin /mobile
 * iframe) and its title-level view-context projection — the plan's degraded
 * snapshot stance: the iframe's internal state never enters the model-visible
 * report, only the fact that the preview is mounted.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-slots SlotMap merges (every seat this plugin rides).
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation slot declaration the view rides.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the view-context service Context merge (ctx.viewContext).
import type {} from '@deepseek-ai/dsh-client-ui-view-context/client'
import { MobilePreviewView } from './MobilePreviewView.tsx'
import { en, zh } from './locales.ts'
import type { MobilePreviewKey } from './locales.ts'

export type { MobilePreviewViewProps } from './MobilePreviewView.tsx'
export type { MobilePreviewKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The mobile-preview view's copy. */
    mobilePreview: MobilePreviewKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'mobilePreview'

/** Required services: the slot registry and the locale dictionaries. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the dictionaries, the conversation view, and
 * the title-level view-context projection.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-mobile-preview: dictionaries')
  const bound = ctx.locale.bind(NS)

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'mobile-preview',
    order: 16,
    locale: NS,
    label: () => bound('view.label'),
  }, MobilePreviewView))

  // Title-level projection only: the iframe page's state stays out of the
  // model-visible report by design (cross-document state is not observable
  // here and the mobile page needs no view actions).
  ctx.inject(['viewContext'], (sub) => {
    ctx.effect(() => sub.viewContext.provide({
      view: 'mobile-preview',
      label: () => bound('view.label'),
      snapshot: () => ({ '预览目标': '/mobile' }),
    }), 'ui-mobile-preview: view-context provider')
  })
}
