/**
 * The workbench's hero headline: the product name and one-line value
 * proposition replacing the shell's generic blank-session wording through the
 * additive `conversation.hero.headline` seat (unoccupied, the shell keeps its
 * own locale headline).
 * @module @deepseek-ai/dsh-client-ui-kb/client/hero/KbHeroHeadline
 */

import type { JSX } from 'react'
import { IconBrowseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the headline seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import css from './hero.module.css'

/** Full component props: the root-scope runtime share plus the locale seat. */
export type KbHeroHeadlineProps = PropsRuntime<'conversation.hero.headline'> & PropsLocale<'kb'>

/**
 * Render the product headline (icon + name + tagline).
 * @param props - the locale seat.
 * @returns the headline element the hero renders in place of the shell wording.
 */
export function KbHeroHeadline({ t }: KbHeroHeadlineProps): JSX.Element {
  return (
    <span className={css.headline}>
      <IconBrowseOutline16 className={css.headlineIcon} size={22} />
      <span className={css.headlineText}>
        {t('hero.title')}
        <span className={css.tagline}>{t('hero.tagline')}</span>
      </span>
    </span>
  )
}
