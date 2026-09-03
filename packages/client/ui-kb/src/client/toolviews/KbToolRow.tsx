/**
 * The kb_* toolview row: one component registered under the four knowledge-
 * base tool names (`kb_search`, `kb_ingest`, `kb_ingest_url`, `kb_stats`),
 * discriminating on `toolName` only to pick its title and expanded body. The
 * collapsed line is the shared icon + title + summary chrome (a running call
 * is the summary alone; a failed call shows the result's first line); the
 * expanded body renders the numbered citation list for a search, the ingest
 * receipt for the ingest pair, and the three business counters for a stats
 * query — each degrading to the raw result text when the wire material does
 * not parse. Pure presentation of the frozen call slice.
 * @module @deepseek-ai/dsh-client-ui-kb/client/toolviews/KbToolRow
 */

import { useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { IconBrowseOutline16, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the keyed toolview hole's runtime share (ToolCallViewProps).
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { documentLabelOf, highlightSegments } from '../workbench/source.ts'
import {
  kbIngestRowModel, kbSearchRowModel, kbStatsRowModel,
  type KbCitation, type KbToolRowState,
} from './kb-tool-model.ts'
import css from './toolview.module.css'

/** Full row props: the toolview runtime share plus this package's locale seat. */
export type KbToolRowProps = ToolCallViewProps & PropsLocale<'kb'>

/** The per-tool derived row: lifecycle, collapsed texts, and expanded body. */
interface KbRowModel {
  readonly state: KbToolRowState
  /** Collapsed summary; the error state's first result line overrides it. */
  readonly summary: string
  /** First line of the result text on an error row; null otherwise. */
  readonly errorSummary: string | null
  /** Expanded body; null while there is nothing to show. */
  readonly body: ReactNode
}

/** Leading slot per state: the document icon at rest and on success, a dot on the failure states. */
function leadingFor(state: KbToolRowState): ReactNode {
  switch (state) {
    case 'error': return <StateDot state="error" />
    case 'stopped': return <StateDot state="warning" />
    default: return <IconBrowseOutline16 size={14} />
  }
}

/** The raw result text as the expanded fallback body (null when absent or blank). */
function rawBody(output: string | null): ReactNode {
  return output !== null && output !== '' ? <pre className={css.raw}>{output}</pre> : null
}

/**
 * Derive one tool's row model off the frozen call slice.
 * @param toolName - the wire tool name (the keyed dispatch value).
 * @param block - running call or settled result node.
 * @param t - the kb locale seat.
 * @returns the row model.
 */
function rowModelFor(toolName: string, block: ToolCallViewProps['block'], t: PropsLocale<'kb'>['t']): KbRowModel {
  switch (toolName) {
    case 'kb_ingest':
    case 'kb_ingest_url': {
      const model = kbIngestRowModel(block, toolName === 'kb_ingest_url')
      const fallback = toolName === 'kb_ingest' ? t('tool.ingestTitle') : t('tool.ingestUrlTitle')
      return {
        state: model.state,
        summary: model.name === '' ? fallback : model.name,
        errorSummary: model.errorSummary,
        body: model.state === 'ok' && model.chunks !== undefined
          ? <p className={css.receipt}>{t('ingest.done', { name: model.name, chunks: model.chunks })}</p>
          : rawBody(model.output),
      }
    }
    case 'kb_stats': {
      const model = kbStatsRowModel(block)
      return {
        state: model.state,
        summary: t('tool.statsTitle'),
        errorSummary: model.errorSummary,
        body: model.state === 'ok' && model.figures !== undefined
          ? (
            <dl className={css.figures}>
              <div><dd>{model.figures.searches}</dd><dt>{t('usage.searches')}</dt></div>
              <div><dd>{model.figures.ingestedDocuments}</dd><dt>{t('usage.ingested')}</dt></div>
              <div><dd>{model.figures.documents}</dd><dt>{t('usage.documents')}</dt></div>
            </dl>
          )
          : rawBody(model.output),
      }
    }
    default: {
      const model = kbSearchRowModel(block)
      const summary = model.state === 'running' || model.query === ''
        ? model.query === '' ? t('tool.searchTitle') : model.query
        : `${model.query} · ${t('tool.sourcesUnit', { n: model.hits })}`
      return {
        state: model.state,
        summary,
        errorSummary: model.errorSummary,
        body: model.state === 'ok' && model.citations.length > 0
          ? <CitationList citations={model.citations} terms={model.query.split(/\s+/)} t={t} />
          : rawBody(model.output),
      }
    }
  }
}

/** Props of the kb_search expanded citation list. */
interface CitationListProps {
  readonly citations: readonly KbCitation[]
  /** The query terms driving the passage highlight. */
  readonly terms: readonly string[]
  readonly t: PropsLocale<'kb'>['t']
}

/**
 * Render the numbered citation list with per-citation passage disclosure.
 * @param props - see {@link CitationListProps}.
 * @returns the citation list element.
 */
function CitationList({ citations, terms, t }: CitationListProps): JSX.Element {
  const [open, setOpen] = useState<number | undefined>(undefined)
  return (
    <ol className={css.citations}>
      {citations.map(citation => (
        <li key={citation.number} className={css.citation}>
          <div className={css.citationHead}>
            <span className={css.citationBadge}>[{citation.number}]</span>
            <span className={css.citationSource} title={citation.sourcePath}>
              {documentLabelOf(citation.sourcePath)}
              {citation.headingPath === undefined ? '' : ` — ${citation.headingPath}`}
            </span>
          </div>
          {citation.passage !== '' && (
            <>
              <p className={open === citation.number ? css.citationPassage : css.citationPassageClamped}>
                {highlightSegments(citation.passage, terms).map((segment, at) =>
                  segment.mark
                    ? <mark key={at} className={css.citationMark}>{segment.text}</mark>
                    : <span key={at}>{segment.text}</span>)}
              </p>
              <button
                type="button"
                className={css.citationToggle}
                onClick={() => { setOpen(current => current === citation.number ? undefined : citation.number) }}
              >
                {open === citation.number ? t('result.collapse') : t('result.expand')}
              </button>
            </>
          )}
        </li>
      ))}
    </ol>
  )
}

/**
 * Render one kb_* tool call as the shared summary row plus the tool's
 * expanded body.
 * @param props - the keyed toolview payload plus the kb locale seat.
 * @returns the row element.
 */
export function KbToolRow({ toolName, block, t }: KbToolRowProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const model = rowModelFor(toolName, block, t)
  const expandable = model.body !== null
  return (
    <div className={css.row}>
      <button
        type="button"
        className={css.head}
        aria-expanded={expanded}
        disabled={!expandable}
        onClick={() => { setExpanded(open => !open) }}
      >
        <span className={css.icon} aria-hidden="true">{leadingFor(model.state)}</span>
        <span className={css.title}>{titleFor(toolName, t)}</span>
        <span className={css.summary}>{model.errorSummary ?? model.summary}</span>
      </button>
      {expanded && model.body}
    </div>
  )
}

/** The row title per tool name. */
function titleFor(toolName: string, t: PropsLocale<'kb'>['t']): string {
  switch (toolName) {
    case 'kb_ingest': return t('tool.ingestTitle')
    case 'kb_ingest_url': return t('tool.ingestUrlTitle')
    case 'kb_stats': return t('tool.statsTitle')
    default: return t('tool.searchTitle')
  }
}
