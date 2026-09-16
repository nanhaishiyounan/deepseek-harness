/**
 * The view-tools toolview row: one component claimed under the three wire tool
 * names (`switch_view`, `view_apply`, `view_state_get`), rendering the shared
 * icon + title + summary chrome. A running call shows the target view/action;
 * a settled call shows the result's first line (the executor's summary or the
 * failure text). Pure presentation of the frozen call slice.
 * @module @deepseek-ai/dsh-client-ui-view-context/client/ViewToolRow
 */

import type { JSX, ReactNode } from 'react'
import { IconBrowseOutline16, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { viewToolRowModel, type ViewToolRowState } from './viewToolModel.ts'
import css from './toolrow.module.css'

/** Full row props: the toolview runtime share plus this package's locale seat. */
export type ViewToolRowProps = ToolCallViewProps & PropsLocale<'viewContext'>

/** Leading slot per state: the browse icon at rest and on success, a dot on the failure states. */
function leadingFor(state: ViewToolRowState): ReactNode {
  switch (state) {
    case 'error': return <StateDot state="error" />
    case 'stopped': return <StateDot state="warning" />
    default: return <IconBrowseOutline16 aria-hidden="true" />
  }
}

/**
 * Render one view-tool call as the shared summary row.
 * @param props - the keyed toolview payload plus the locale seat.
 * @returns the row element.
 */
export function ViewToolRow({ toolName, block, t }: ViewToolRowProps): JSX.Element {
  const model = viewToolRowModel(toolName, block)
  const title = toolName === 'switch_view'
    ? t('tool.switchTitle')
    : toolName === 'view_state_get' ? t('tool.stateTitle') : t('tool.applyTitle')
  const summary = model.state === 'ok' || model.state === 'running'
    ? `${title} · ${model.summary}`
    : title
  return (
    <div className={css.row}>
      <span className={css.icon} aria-hidden="true">{leadingFor(model.state)}</span>
      <span className={css.title}>{title}</span>
      <span className={css.summary}>{model.errorSummary ?? summary}</span>
    </div>
  )
}
