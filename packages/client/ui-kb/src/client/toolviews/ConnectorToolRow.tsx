/**
 * The `connector_discover` toolview row: the shared icon + title + summary
 * chrome (the query while running, the dataset/provider counts with the
 * discovered experts once settled), expanding to the raw discovery listing —
 * the expert cards with their orderable services read as rendered markdown
 * text. Malformed wire material degrades to the raw result text. Pure
 * presentation of the frozen call slice.
 * @module @deepseek-ai/dsh-client-ui-kb/client/toolviews/ConnectorToolRow
 */

import { useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { IconBrowseOutline16, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the keyed toolview hole's runtime share (ToolCallViewProps).
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { connectorDiscoverRowModel } from './connector-tool-model.ts'
import type { KbToolRowState } from './kb-tool-model.ts'
import css from './toolview.module.css'

/** Full row props: the toolview runtime share plus this package's locale seat. */
export type ConnectorToolRowProps = ToolCallViewProps & PropsLocale<'kb'>

/** Leading slot per state: the browse icon at rest and on success, a dot on the failure states. */
function leadingFor(state: KbToolRowState): ReactNode {
  switch (state) {
    case 'error': return <StateDot state="error" />
    case 'stopped': return <StateDot state="warning" />
    default: return <IconBrowseOutline16 aria-hidden="true" />
  }
}

/** The collapsed summary: counts plus expert names when the meta validated. */
function summaryFor(model: ReturnType<typeof connectorDiscoverRowModel>, t: PropsLocale<'kb'>['t']): string {
  if (model.datasets === undefined || model.providers === undefined) {
    return model.query
  }
  const counts = `${t('tool.datasetsUnit', { n: model.datasets })} · ${model.providers.join(', ')}`
  const experts = model.experts.join('、')
  return experts === '' ? counts : `${counts} · ${experts}`
}

/**
 * Render one connector_discover call as the shared summary row plus the raw
 * listing body.
 * @param props - the keyed toolview payload plus the kb locale seat.
 * @returns the row element.
 */
export function ConnectorToolRow({ block, t }: ConnectorToolRowProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const model = connectorDiscoverRowModel(block)
  const output = model.output ?? ''
  const expandable = output !== ''
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
        <span className={css.title}>{t('tool.discoverTitle')}</span>
        <span className={css.summary}>{model.errorSummary ?? summaryFor(model, t)}</span>
      </button>
      {expanded && output !== '' && <pre className={css.raw}>{output}</pre>}
    </div>
  )
}
