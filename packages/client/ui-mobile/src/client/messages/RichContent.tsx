/**
 * The assistant narrative renderer (v3 rich pipeline, 03 §4.5): every text
 * block renders as sanitized markdown (bold keeps its size at weight 600 with
 * the key-info underline, lists get the ink-teal square bullet, tables
 * typeset label/value), and adjacent numeric conclusion lines promote to the
 * half-width metric cards in the ticket face. The protocol fences were split
 * out upstream — what arrives here is people-language text only.
 */

import { useMemo, type JSX } from 'react'
import { renderMarkdown, sanitizeBizText, splitRichBlocks } from './rich.ts'
import css from './messages.module.css'

/** Rich-content props: the narrative text. */
export interface RichContentProps {
  readonly text: string
}

/**
 * Render one assistant narrative run.
 * @param props - the narrative text.
 * @returns the rendered content block.
 */
export function RichContent({ text }: RichContentProps): JSX.Element {
  const blocks = useMemo(() => splitRichBlocks(sanitizeBizText(text)), [text])
  return (
    <div className={css.richContent}>
      {blocks.map((block, index) =>
        block.kind === 'metric'
          ? (
            <div className={css.metricPair} key={String(index)}>
              {block.metrics.map(metric => (
                <span key={`${metric.label}:${metric.value}`} className={css.metricMini}>
                  <span className={css.metricMiniValue}>{metric.value}</span>
                  <span className={css.metricMiniLabel}>{metric.label}</span>
                </span>
              ))}
            </div>
          )
          : <div key={String(index)} className={css.richText} dangerouslySetInnerHTML={{ __html: renderMarkdown(block.text) }} />,
      )}
    </div>
  )
}
