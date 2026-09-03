/**
 * The workbench's search zone: the large query box (auto-focused), the sample
 * chips before the first search, the result summary line, and the numbered hit
 * cards. Data arrives through the injected search callback; presentation is a
 * pure function of props and local form state.
 * @module @deepseek-ai/dsh-client-ui-kb/client/workbench/KbSearch
 */

import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { KbHitState, KbSearchState } from '../KbTypes.ts'
import { noteRecentSearch } from '../recentSearches.ts'
import { documentLabelOf } from './source.ts'
import { KbHitCard } from './KbHitCard.tsx'
import css from './workbench.module.css'

/** Props of the search zone. */
export interface KbSearchProps extends PropsLocale<'kb'> {
  /** Run one knowledge-base search; rejects with the failure message. */
  readonly search: (query: string) => Promise<KbSearchState>
  /** Fold the hits into the session-local document records. */
  readonly noteSearched: (hits: readonly KbHitState[]) => void
  /** Reload the shared stats cache (the search counter increments server-side). */
  readonly refresh: () => void
  /** Fill the conversation draft (the carry-to-chat action). */
  readonly setDraft: (text: string) => void
  /** Best-effort switch back to the chat tab; a no-op when unavailable. */
  readonly requestChatView: () => void
}

/**
 * Render the search zone.
 * @param props - see {@link KbSearchProps}.
 * @returns the search zone element.
 */
export function KbSearch({ search, noteSearched, refresh, setDraft, requestChatView, t }: KbSearchProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<{ query: string; value: KbSearchState } | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)
  // A synchronous re-entry guard: `busy` only re-renders one commit later, so
  // a same-frame double dispatch would otherwise run two searches and count
  // the query twice server-side.
  const busyRef = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  /** One round trip for an already-trimmed query. */
  const runWith = (text: string): (void) => {
    if (text.length === 0 || busyRef.current) return
    busyRef.current = true
    setFailure(undefined)
    setBusy(true)
    search(text).then((value) => {
      setResult({ query: text, value })
      noteSearched(value.results)
      noteRecentSearch(text)
      refresh()
    }).catch((error: unknown) => {
      setFailure(error instanceof Error ? error.message : String(error))
    }).finally(() => {
      busyRef.current = false
      setBusy(false)
    })
  }

  const idle = result === undefined && failure === undefined && !busy

  return (
    <section className={css.zone} aria-label={t('workbench.searchAction')}>
      <div className={css.searchRow}>
        <input
          ref={inputRef}
          className={css.searchInput}
          type="text"
          value={query}
          placeholder={t('workbench.searchPlaceholder')}
          onChange={(event) => { setQuery(event.target.value) }}
          onKeyDown={(event) => { if (event.key === 'Enter') runWith(query.trim()) }}
        />
        <Button variant="primary" disabled={busy} onClick={() => { runWith(query.trim()) }}>
          {t('workbench.searchAction')}
        </Button>
      </div>

      {failure !== undefined && (
        <div className={css.failure} role="alert">
          <span>{t('error.searchFailed')}</span>
          <Button variant="ghost" size="sm" onClick={() => { runWith(query.trim()) }}>{t('error.retry')}</Button>
        </div>
      )}

      {busy && result === undefined && (
        <div className={css.hits} aria-busy="true">
          {[0, 1, 2].map(index => <span key={index} className={css.hitSkeleton} />)}
        </div>
      )}

      {idle && (
        <div className={css.samples}>
          {[t('workbench.sample1'), t('workbench.sample2'), t('workbench.sample3')].map(sample => (
            <Button key={sample} variant="ghost" size="sm" onClick={() => { setQuery(sample); runWith(sample) }}>
              {sample}
            </Button>
          ))}
        </div>
      )}

      {result !== undefined && result.value.results.length === 0 && (
        <div className={css.emptyResult}>
          <span>{t('workbench.searchEmpty')}</span>
          <Button variant="ghost" size="sm" onClick={requestChatView}>{t('workbench.goChat')}</Button>
        </div>
      )}

      {result !== undefined && result.value.results.length > 0 && (
        <>
          <p className={css.summary}>
            {t('workbench.resultSummary', {
              hits: result.value.results.length,
              docs: new Set(result.value.results.map(hit => hit.source_path)).size,
            })}
          </p>
          <div className={css.hits}>
            {result.value.results.map((hit, index) => (
              <KbHitCard
                key={`${hit.source_path}:${index}`}
                t={t}
                index={index + 1}
                hit={hit}
                terms={result.query.split(/\s+/)}
                onCarryToChat={() => {
                  setDraft(t('result.carryDraft', {
                    label: documentLabelOf(hit.source_path),
                    query: result.query,
                  }))
                  requestChatView()
                }}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
