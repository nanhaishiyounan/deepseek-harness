/**
 * The `order_create`/`order_status` toolview rows: the shared icon + title +
 * summary chrome (the addressed service or order while running, the order
 * receipt or delivered counts once settled), expanding to the raw result
 * text — the order receipt with the deliverable path reads as rendered
 * markdown text. Malformed wire material degrades to the raw result text.
 * Pure presentation of the frozen call slice.
 * @module @deepseek-ai/dsh-client-ui-kb/client/toolviews/OrderToolRow
 */

import { useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { IconBrowseOutline16, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the keyed toolview hole's runtime share (ToolCallViewProps).
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { orderRowModel } from './order-tool-model.ts'
import type { KbToolRowState } from './kb-tool-model.ts'
import css from './toolview.module.css'

/** Full row props: the toolview runtime share plus this package's locale seat. */
export type OrderToolRowProps = ToolCallViewProps & PropsLocale<'kb'>

/** Leading slot per state: the browse icon at rest and on success, a dot on the failure states. */
function leadingFor(state: KbToolRowState): ReactNode {
  switch (state) {
    case 'error': return <StateDot state="error" />
    case 'stopped': return <StateDot state="warning" />
    default: return <IconBrowseOutline16 aria-hidden="true" />
  }
}

/** The collapsed summary: the receipt (create) or counts (status), falling back to the addressed subject. */
function summaryFor(model: ReturnType<typeof orderRowModel>): string {
  return model.receipt ?? model.counts ?? model.subject
}

/**
 * Render one order tool call as the shared summary row plus the raw result body.
 * @param props - the keyed toolview payload plus the kb locale seat and owning tool name.
 * @param props.block - the frozen call slice.
 * @param props.t - the kb locale seat.
 * @param props.toolName - the owning tool name (`order_create` or `order_status`).
 * @returns the row element.
 */
export function OrderToolRow({ block, t, toolName }: OrderToolRowProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const model = orderRowModel(block, toolName === 'order_status' ? 'order_status' : 'order_create')
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
        <span className={css.title}>{toolName === 'order_create' ? t('tool.orderCreateTitle') : t('tool.orderStatusTitle')}</span>
        <span className={css.summary}>{model.errorSummary ?? summaryFor(model)}</span>
      </button>
      {expanded && output !== '' && <pre className={css.raw}>{output}</pre>}
    </div>
  )
}
