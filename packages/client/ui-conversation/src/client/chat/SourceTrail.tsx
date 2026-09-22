/**
 * The per-turn answer-source trail: under a turn's closing assistant message,
 * one chip row aggregating where the answer's facts came from — kb document
 * citations, lakehouse tables (with the executed SQL), NocoBase collections,
 * and knowledge-graph seeds (with their provenance systems). A chip expands
 * its bucket inline; kb items open the source document through the Host, the
 * kg bucket offers the「查看图谱证据」view jump. Pure presentation of the
 * frozen turn slice via {@link sourceTrailOf}; a turn with no extractable
 * source renders nothing.
 * @module @deepseek-ai/dsh-client-ui-conversation/client/chat/SourceTrail
 */

import { useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { SnapshotSelectorHook, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  ConversationSnapshot, ToolCallBlock, TurnLocation,
} from '@deepseek-ai/dsh-client-runtime/client'
import { kbSourceLabel, hasSources, sourceTrailOf } from './source-trail-model.ts'
import type { ToolChatData } from '../contract/chat-nodes.ts'
import css from './SourceTrail.module.css'

/** The chat view's conversation-snapshot selector hook. */
type UseConversation = SnapshotSelectorHook<ConversationSnapshot>

/** The conversation locale seat's translate type. */
type Translate = TranslateNS<'conversation'>

/** SourceTrail props: the closing turn, the open-file/view-switch actions, the locale seat. */
export interface SourceTrailProps {
  /** The turn whose settled tool calls the closing answer rests on. */
  readonly turn: TurnLocation
  /** The chat view's conversation snapshot hook. */
  readonly useSession: UseConversation
  /** Open a filesystem path through the Host (kb source documents). */
  readonly openFile: (path: string) => void
  /**
   * Best-effort view switch by ring id (the kg jump); absent on render sites
   * without a view ring, so the kg bucket renders without its jump button.
   * The optional payload rides the view-context pending channel: the kg view
   * walks and highlights the carried seed entities (the deep link).
   */
  readonly requestView?: ((view: string, options?: { readonly seeds?: readonly string[] }) => void) | undefined
  /** The conversation locale seat (zh copy ships first-class). */
  readonly t: Translate
}

/** One chip bucket's identity. */
type Bucket = 'kb' | 'lakehouse' | 'nocobase' | 'kg'

/**
 * Collect the turn's tool-call roots off the location index. The selector
 * caches on the turn's key-array identity: the index keeps a stable array
 * reference between rebuilds, so unrelated store updates (later turns
 * streaming) do not recompute or re-render this closed turn's trail.
 * @param useSession - the conversation snapshot hook.
 * @param turn - the closing turn's number.
 * @returns the frozen root blocks (settled and running; the model filters).
 */
function useTurnToolCalls(useSession: UseConversation, turn: number): readonly ToolCallBlock[] {
  const cache = useRef<{ keys: readonly string[] | undefined; value: readonly ToolCallBlock[] }>({
    keys: undefined,
    value: [],
  })
  return useSession((snapshot) => {
    const keys = snapshot.chat.locations.getTurn(turn)
    if (keys === cache.current.keys) return cache.current.value
    const value = collectRoots(snapshot, keys)
    cache.current = { keys, value }
    return value
  })
}

/** Map one turn's node keys to its tool-call roots, in anchor order. */
function collectRoots(snapshot: ConversationSnapshot, keys: readonly string[]): readonly ToolCallBlock[] {
  const blocks: ToolCallBlock[] = []
  for (const key of keys) {
    const node = snapshot.chat.nodes.get(key)
    if (node !== undefined && node.kind === 'tool-call') {
      const root = (node.data as ToolChatData).root
      blocks.push(root)
    }
  }
  return blocks
}

/**
 * Render the aggregated source chips and the expanded bucket detail.
 * @param props - see {@link SourceTrailProps}.
 * @returns the trail element, or null when the turn carries no source.
 */
export function SourceTrail({ turn, useSession, openFile, requestView, t }: SourceTrailProps): JSX.Element | null {
  const blocks = useTurnToolCalls(useSession, turn.turn)
  const [open, setOpen] = useState<Bucket | undefined>(undefined)
  // Extraction re-runs only when the collected root blocks change identity;
  // a closed turn's blocks are frozen, so this is once per turn in practice.
  const model = useMemo(() => sourceTrailOf(blocks), [blocks])
  if (!hasSources(model)) return null

  const chips: Array<{ bucket: Bucket; label: string }> = []
  if (model.kb.length > 0) chips.push({ bucket: 'kb', label: `${t('sourceTrail.kb')} ×${String(model.kb.length)}` })
  for (const table of model.lakehouse) {
    chips.push({ bucket: 'lakehouse', label: `${t('sourceTrail.lakehouse')} ${table.table}` })
  }
  if (model.nocobase.length === 1) {
    const only = model.nocobase[0]
    /* v8 ignore next -- the length guard above guarantees presence. */
    chips.push({ bucket: 'nocobase', label: `${t('sourceTrail.nocobase')} ${only?.collection ?? ''}` })
  } else if (model.nocobase.length > 1) {
    chips.push({ bucket: 'nocobase', label: `${t('sourceTrail.nocobase')} ×${String(model.nocobase.length)}` })
  }
  for (const read of model.kg) {
    const lead = read.seeds[0] ?? ''
    chips.push({ bucket: 'kg', label: lead === '' ? t('sourceTrail.kg') : `${t('sourceTrail.kg')} ${lead}` })
  }

  return (
    <div className={css.trail} data-testid="source-trail">
      <span className={css.title}>{t('sourceTrail.title')}</span>
      <div className={css.chips} role="group" aria-label={t('sourceTrail.title')}>
        {chips.map(chip => (
          <button
            key={chip.label}
            type="button"
            className={css.chip}
            data-source-kind={chip.bucket}
            aria-expanded={open === chip.bucket}
            onClick={() => { setOpen(current => current === chip.bucket ? undefined : chip.bucket) }}
          >
            {chip.label}
          </button>
        ))}
      </div>
      {open === 'kb' && (
        <ol className={css.detail} data-testid="source-trail-kb">
          {model.kb.map(item => (
            <li key={item.sourcePath} className={css.detailRow}>
              <span className={css.detailBadge}>[{item.number}]</span>
              <span className={css.detailLabel} title={item.sourcePath}>
                {kbSourceLabel(item.sourcePath)}
                {item.headingPath === undefined ? '' : ` — ${item.headingPath}`}
              </span>
              <button
                type="button"
                className={css.detailAction}
                onClick={() => { openFile(`data/${item.sourcePath}`) }}
              >
                {t('sourceTrail.openOrigin')}
              </button>
            </li>
          ))}
        </ol>
      )}
      {open === 'lakehouse' && (
        <ul className={css.detail} data-testid="source-trail-lakehouse">
          {model.lakehouse.map(item => (
            <li key={item.table} className={css.detailRow}>
              <span className={css.detailLabel}>{item.table}</span>
              {item.sql.length > 0 && <pre className={css.sql}>{item.sql}</pre>}
            </li>
          ))}
        </ul>
      )}
      {open === 'nocobase' && (
        <ul className={css.detail} data-testid="source-trail-nocobase">
          {model.nocobase.map(item => (
            <li key={item.collection} className={css.detailRow}>
              <span className={css.detailLabel}>{item.collection}</span>
            </li>
          ))}
        </ul>
      )}
      {open === 'kg' && (
        <div className={css.detail} data-testid="source-trail-kg">
          {model.kg.map((read, index) => (
            <div key={index} className={css.detailRow}>
              <span className={css.detailLabel}>{read.seeds.join(' + ')}</span>
              {read.systems.length > 0 && (
                <span className={css.systems}>
                  {read.systems.map(system => <span key={system} className={css.systemBadge}>{system}</span>)}
                </span>
              )}
              {requestView !== undefined && read.seeds.length > 0 && (
                <button
                  type="button"
                  className={css.detailAction}
                  data-testid={`source-trail-kg-deeplink-${String(index)}`}
                  onClick={() => { requestView('kg', { seeds: read.seeds }) }}
                >
                  {t('sourceTrail.locateInGraph')}
                </button>
              )}
            </div>
          ))}
          {requestView !== undefined && (
            <button type="button" className={css.detailAction} onClick={() => { requestView('kg') }}>
              {t('sourceTrail.viewKg')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
