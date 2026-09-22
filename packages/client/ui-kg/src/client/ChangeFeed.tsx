/**
 * The change feed: the episode ledger as a timeline (instruction text,
 * operator badge, diff rendering, mention counts) with per-episode rollback
 * (`kg.rollback`) and revision replay (`kg.history` at the episode's
 * instant), plus the cross-source gray-zone review cards (merge / reject /
 * skip — each a `kg.reviewDecide` episode). Every write path rides the real
 * RPCs; the component owns no graph state.
 * @module @deepseek-ai/dsh-client-ui-kg/client/ChangeFeed
 */

import { useState } from 'react'
import type { JSX } from 'react'
import { Button, ErrorStrip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { KgEpisodeRow, KgRollbackResultRow, KgReviewEntryRow } from './kgTypes.ts'
import css from './kg.module.css'

/** The locale keys this component reads. */
export type ChangeFeedLocale = (
  key: 'feed.title' | 'feed.hint' | 'feed.refresh' | 'feed.reviewTitle' | 'feed.reviewHint'
  | 'feed.merge' | 'feed.reject' | 'feed.skip' | 'feed.confidence' | 'feed.source.ingest' | 'feed.source.ai-edit'
  | 'feed.source.human-edit' | 'feed.source.rollback' | 'feed.mentions' | 'feed.rollback' | 'feed.rollbackConfirm'
  | 'feed.replay' | 'feed.empty' | 'feed.rollbackDone' | 'error.unavailable' | 'error.retry',
  params?: Record<string, string>,
) => string

/** Full component props (plain data + callbacks; the view owns the wiring). */
export interface ChangeFeedProps {
  /** The episode ledger (newest first). */
  episodes: readonly KgEpisodeRow[]
  /** The pending gray-zone pairs. */
  review: readonly KgReviewEntryRow[]
  /** Whether a (re)load is in flight. */
  loading: boolean
  /** The load failure text, when the ledger read refused. */
  error: string | undefined
  /** Reload episodes + the review queue. */
  onReload: () => void
  /** Roll back one episode; resolves with the rollback receipt or rejects. */
  onRollback: (episodeUuid: string) => Promise<KgRollbackResultRow>
  /** Record one human verdict on a gray-zone pair. */
  onDecide: (entry: KgReviewEntryRow, decision: 'merge' | 'reject' | 'skip') => Promise<void>
  /** Replay the canvas at one episode's instant (leaves replay through the graph view). */
  onReplay: (asOf: string) => void
  /** Locale lookup. */
  t: ChangeFeedLocale
}

/**
 * Render the change feed column.
 * @param props - the ledger, the queue, and the write callbacks.
 * @returns the feed column.
 */
export function ChangeFeed(
  { episodes, review, loading, error, onReload, onRollback, onDecide, onReplay, t }: ChangeFeedProps,
): JSX.Element {
  const [busy, setBusy] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<{ readonly kind: 'ok' | 'error'; readonly text: string } | undefined>(undefined)

  /** Run one write callback with busy/notice plumbing. */
  const run = (key: string, action: () => Promise<string>): void => {
    setBusy(key)
    setNotice(undefined)
    action().then((text) => {
      setNotice({ kind: 'ok', text })
      setBusy(undefined)
      onReload()
    }).catch((failure: unknown) => {
      setNotice({ kind: 'error', text: failure instanceof Error ? failure.message : String(failure) })
      setBusy(undefined)
    })
  }

  return (
    <section className={css.feedZone} data-testid="kg-change-feed">
      <h3 className={css.zoneTitle}>{t('feed.title')}</h3>
      <p className={css.ontoHint}>
        {t('feed.hint')}
        <Button variant="ghost" size="sm" disabled={loading} onClick={onReload}>{t('feed.refresh')}</Button>
      </p>
      {error !== undefined && (
        <ErrorStrip
          message={<>{t('error.unavailable')} — {error}</>}
          action={<Button variant="ghost" size="sm" onClick={onReload}>{t('error.retry')}</Button>}
        />
      )}
      {notice?.kind === 'error' && <ErrorStrip message={notice.text} />}
      {notice?.kind === 'ok' && <p className={css.ontoNotice} data-testid="kg-feed-notice">{notice.text}</p>}

      {review.length > 0 && (
        <div className={css.reviewZone} data-testid="kg-review-queue">
          <h4 className={css.qualitySubTitle}>{t('feed.reviewTitle')}</h4>
          <p className={css.ontoHint}>{t('feed.reviewHint')}</p>
          <ul>
            {review.map(entry => (
              <li key={`${entry.doc_id}::${entry.row_id}`} className={css.reviewCard} data-testid="kg-review-card">
                <div className={css.reviewPair}>
                  <span className={css.reviewName}>{entry.doc_name}</span>
                  <span className={css.reviewApprox} aria-hidden="true">≈</span>
                  <span className={css.reviewName}>{entry.row_name}</span>
                </div>
                <div className={css.reviewMeta}>
                  <span>{`${t('feed.confidence')}${String(Math.round(entry.confidence * 100))}%`}</span>
                  {entry.reason.length > 0 && <span className={css.reviewReason}>{entry.reason}</span>}
                </div>
                <div className={css.reviewActions}>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy !== undefined}
                    onClick={() => {
                      run(`${entry.doc_id}::${entry.row_id}:merge`, () => onDecide(entry, 'merge').then(() => `已合并 ${entry.doc_name} ≈ ${entry.row_name}`))
                    }}
                  >
                    {t('feed.merge')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy !== undefined}
                    onClick={() => {
                      run(`${entry.doc_id}::${entry.row_id}:reject`, () => onDecide(entry, 'reject').then(() => `已判定不合并 ${entry.doc_name} ≉ ${entry.row_name}`))
                    }}
                  >
                    {t('feed.reject')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy !== undefined}
                    onClick={() => {
                      run(`${entry.doc_id}::${entry.row_id}:skip`, () => onDecide(entry, 'skip').then(() => `已跳过 ${entry.doc_name} / ${entry.row_name}`))
                    }}
                  >
                    {t('feed.skip')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {episodes.length === 0
        ? <p className={css.legendLoading}>{t('feed.empty')}</p>
        : (
          <ol className={css.feedList} data-testid="kg-episode-list">
            {episodes.map(episode => (
              <li key={episode.uuid} className={css.feedCard} data-feed-source={episode.source}>
                <div className={css.feedHead}>
                  <span className={css.feedBadge} data-feed-badge={episode.source}>{t(`feed.source.${episode.source}`)}</span>
                  <span className={css.feedName}>{episode.name}</span>
                  <time className={css.feedTime}>{episode.created_at.slice(0, 19).replace('T', ' ')}</time>
                </div>
                {episode.content.length > 0 && <pre className={css.feedContent}>{episode.content}</pre>}
                <div className={css.feedMeta}>
                  <span>{`${t('feed.mentions')}${String(episode.mentions)}`}</span>
                  <span className={css.feedActions}>
                    {episode.source !== 'rollback' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy !== undefined || episode.mentions === 0}
                        title={t('feed.rollbackConfirm')}
                        onClick={() => {
                          run(`rollback:${episode.uuid}`, () => onRollback(episode.uuid)
                            .then(result => t('feed.rollbackDone', {
                              retired: String(result.retired),
                              restored: String(result.restored),
                            })))
                        }}
                      >
                        {t('feed.rollback')}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => { onReplay(episode.created_at) }}>
                      {t('feed.replay')}
                    </Button>
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
    </section>
  )
}
