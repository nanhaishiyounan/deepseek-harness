/**
 * The persistent agent/mode selector above the composer textarea (the
 * `conversation.input.mode` seat). Unlike the hero chip, whose window closes
 * once a conversation starts, this one renders in every session state and
 * adapts its pick behavior:
 *
 * - no session or a blank session: `select()` — the staged choice reaches the
 *   session the flow hands over to (the chip's own semantics);
 * - a started session: the host refuses the swap (an applied composition owns
 *   the recorded tool calls), so a different pick opens a NEW session staged
 *   on it — the offer the trigger's hint states up front.
 *
 * Same roster, same store, and same two-line menu rows as the chip; the
 * deployment's composition decides whether the seat exists at all (an empty
 * roster renders nothing and the accessory row collapses).
 *
 * @module @deepseek-ai/dsh-client-ui-agent-preset/client/ModeSelector
 */

import { useEffect, useState } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconAgentPresetOutline16, IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: pulls the ui-conversation SlotMap merge (the mode seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { AgentPresetSeatState } from './seat-store.ts'
import { presetDisplayText } from './locales.ts'
import css from './ModeSelector.module.css'

/** Registration-side business face for the composer mode selector. */
export interface ModeSelectorInjected {
  hooks: {
    /** Seat snapshot bound by the renderer as useAgentPresetSeat. */
    agentPresetSeat: SnapshotStore<AgentPresetSeatState>
  }
  /** Read the roster when the selector first renders. */
  load: () => Promise<void>
  /**
   * Stage and apply one preset — the pick path while no session is current or
   * the current session is still blank.
   */
  select: (id: string) => Promise<void>
  /**
   * Stage one preset and open a new session on it — the pick path for a
   * started session, whose composition the host refuses to swap.
   */
  startSessionOn: (id: string) => void
}

/** Full component props: the mode-seat runtime share plus the inject face and locale seat. */
export type ModeSelectorProps =
  PropsRuntime<'conversation.input.mode'>
  & PropsLocale<'settings.agentPreset'>
  & InjectFace<ModeSelectorInjected>

/**
 * Render the composer-card mode selector.
 * @param props - composed slot props.
 * @returns the selector, or null when the deployment composes no presets.
 */
export function ModeSelector({ load, select, startSessionOn, useAgentPresetSeat, t }: ModeSelectorProps) {
  const state = useAgentPresetSeat(snapshot => snapshot)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  // The session's own composition outranks a stale display choice; on no
  // session or a blank one the staged/default current is the honest read.
  const shown = state.session?.agentPreset ?? state.current
  const chosen = state.options.find(option => option.id === shown)
  const chosenText = chosen === undefined ? undefined : presetDisplayText(chosen, t)
  const label = chosenText?.name ?? shown
  const ready = state.options.length > 0 && shown !== ''
  // A started session keeps its composition: picking another preset can only
  // land on a new session (the host's agent-preset lock).
  const started = state.session !== undefined && !state.session.blank

  // Nothing to choose between: same contract as the chip.
  if (!ready) return null

  return (
    <Menu
      open={open}
      onClose={() => { setOpen(false) }}
      items={state.options.map((option) => {
        const text = presetDisplayText(option, t)
        return {
          id: option.id,
          // Name and description together, the chip's menu contract.
          label: (
            <span className={css.item}>
              <span className={css.itemName}>{text.name}</span>
              <span className={css.itemDesc}>{text.description ?? t('noDescription')}</span>
            </span>
          ),
        }
      })}
      selectedId={shown}
      onSelect={(id) => {
        setOpen(false)
        // Re-picking the running composition is a no-op, not a new session.
        if (started) {
          if (id !== shown) startSessionOn(id)
        } else {
          void select(id)
        }
      }}
      align="start"
      portal
      anchor={(
        <button
          type="button"
          className={css.mode}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t('modeLabel')}
          title={state.error ?? (started ? t('applyInNewSession') : t('modeHint'))}
          disabled={state.busy}
          onClick={() => { setOpen(value => !value) }}
        >
          <IconAgentPresetOutline16 className={css.modeIcon} />
          <span className={css.modeLabel}>{label}</span>
          <IconChevronDownOutline14 className={css.chevron} />
        </button>
      )}
    />
  )
}
