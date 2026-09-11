/**
 * The workbench's document zone: the session-local record list (ingest
 * receipts plus search sightings — the API has no document-list face, and the
 * header says so) with its empty and totals-only states, and the button that
 * opens the ingest wizard. Presentation is a pure function of the records and
 * the stats snapshot.
 * @module @deepseek-ai/dsh-client-ui-kb/client/workbench/KbDocumentList
 */

import { useState } from 'react'
import type { JSX } from 'react'
import { Button, EmptyState, IconListPenOutline16, IconPlusOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { KbClientState } from '../kbStore.ts'
import { relativeTimeOf } from './source.ts'
import css from './workbench.module.css'

/** Props of the document zone. */
export interface KbDocumentListProps extends PropsLocale<'kb'> {
  /** The shared client-session snapshot (records + stats). */
  readonly state: KbClientState
  /** Display language for the relative-time phrases. */
  readonly language: 'zh' | 'en'
  /** Open the ingest wizard. */
  readonly onAdd: () => void
}

/**
 * Render the document zone.
 * @param props - see {@link KbDocumentListProps}.
 * @returns the document zone element.
 */
export function KbDocumentList({ state, language, onAdd, t }: KbDocumentListProps): JSX.Element {
  const [now] = useState(() => Date.now())
  const usage = state.stats?.status === 'ready' ? state.stats.usage : undefined
  const empty = usage !== undefined && usage.documents === 0

  return (
    <section className={css.zone} aria-label={t('docs.title')}>
      <header className={css.zoneHead}>
        <h3 className={css.zoneTitle}>{t('docs.title')}</h3>
        <Button variant="ghost" size="sm" icon={<IconPlusOutline16 size={14} />} onClick={onAdd}>
          {t('docs.addDocument')}
        </Button>
      </header>

      {empty
        ? (
          <EmptyState
            title={t('docs.empty.title')}
            hint={t('docs.empty.body')}
            icon={<IconListPenOutline16 />}
          />
        )
        : state.records.length === 0
          ? (
            <p className={css.zoneNote}>
              {usage !== undefined ? `${t('docs.total', { n: usage.documents })} · ` : ''}
              {t('docs.sessionNote')}
            </p>
          )
          : (
            <>
              <p className={css.zoneNote}>{t('docs.sessionNote')}</p>
              <ul className={css.docs}>
                {state.records.map(record => (
                  <li key={record.path} className={css.docRow} title={record.path}>
                    <span className={css.docName}>{record.name}</span>
                    <span className={css.docMeta}>
                      {relativeTimeOf(record.at, now, language)}
                      {record.chunks === undefined ? '' : (
                        <span className={css.docChunks}>{t('docs.chunksUnit', { n: record.chunks })}</span>
                      )}
                      {' · '}
                      <span className={css.docReady}>{t('docs.ready')}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
    </section>
  )
}
