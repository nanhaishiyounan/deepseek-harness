/**
 * The `order_create`/`order_status` toolview rows: the shared icon + title +
 * summary chrome (the addressed service or order while running, the order
 * receipt or delivered counts once settled), expanding to the raw result
 * text — the order receipt with the deliverable path reads as rendered
 * markdown text. A settled create carrying an order id adds the「查看订单」
 * entry that switches to the market view's orders section; replays of older
 * logs without the id render the receipt only. Malformed wire material
 * degrades to the raw result text. Pure presentation of the frozen call
 * slice.
 * @module @deepseek-ai/dsh-client-ui-kb/client/toolviews/OrderToolRow
 */

import { useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { IconBrowseOutline16, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the keyed toolview hole's runtime share (ToolCallViewProps).
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { orderRowModel } from './order-tool-model.ts'
import type { KbToolRowState } from './kb-tool-model.ts'
import css from './toolview.module.css'

/** The registration's injected view-navigation face (apply's kb view bridge). */
export interface OrderToolViewInjected {
  /** Switch the conversation view ring (the entry targets the `market` view). */
  requestView: (view: string) => void
}

/** Full row props: the toolview runtime share plus this package's locale seat and view bridge face. */
export type OrderToolRowProps = ToolCallViewProps & PropsLocale<'kb'> & InjectFace<OrderToolViewInjected>

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
 * Render one order tool call as the shared summary row plus the raw result
 * body, with the「查看订单」entry beside the head when a settled create
 * carries the order id.
 * @param props - the keyed toolview payload plus the kb locale seat, the view
 * bridge face, and the owning tool name.
 * @param props.block - the frozen call slice.
 * @param props.t - the kb locale seat.
 * @param props.requestView - the injected view switch (targets the market view).
 * @param props.toolName - the owning tool name (`order_create` or `order_status`).
 * @returns the row element.
 */
export function OrderToolRow({ block, t, toolName, requestView }: OrderToolRowProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const model = orderRowModel(block, toolName === 'order_status' ? 'order_status' : 'order_create')
  const output = model.output ?? ''
  const expandable = output !== ''
  const showViewOrder = model.viewOrderId !== null && model.state === 'ok'
  return (
    <div className={css.row} data-tool={toolName}>
      <div className={css.line}>
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
        {showViewOrder && (
          <button type="button" className={css.action} onClick={() => { requestView('market') }}>
            {t('tool.orderViewOrder')}
          </button>
        )}
      </div>
      {expanded && output !== '' && <pre className={css.raw}>{output}</pre>}
    </div>
  )
}
