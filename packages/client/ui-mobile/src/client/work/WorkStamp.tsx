/**
 * The work stamp (03 §5): the stamp family's work-status seal — the v3 stamp
 * material class plus the four status modifiers. todo/doing/review carry the
 * hollow outline with their status text (doing breathes with DotLoading);
 * done fills the pass-green disc with a check mark (完成, never a row number
 * — that semantic belongs to the submitted phase stamp). 44px on the detail
 * page, 28px in the work list.
 */

import type { JSX } from 'react'
import { DotLoading } from 'antd-mobile'
import { Check } from 'lucide-react'
import type { WorkStatus } from '../workStore.ts'
import v3 from '../forms/v3/v3.module.css'
import css from './work.module.css'

/** Work-stamp props: the status and the size grade. */
export interface WorkStampProps {
  readonly status: WorkStatus
  /** 44px detail grade (default) or 28px list grade. */
  readonly size?: 'lg' | 'sm'
}

/** The stamp copy per status. */
const WORK_STATUS_TEXT: Readonly<Record<WorkStatus, string>> = {
  todo: '待处理',
  doing: '进行中',
  review: '待确认',
  done: '已完成',
}

/**
 * The work-status stamp seal.
 * @param props - the status and size grade.
 * @returns the stamp element.
 */
export function WorkStamp({ status, size = 'lg' }: WorkStampProps): JSX.Element {
  return (
    <span
      className={`${v3.stamp} ${size === 'sm' ? css.stampSm : ''} ${css[`stamp_${status}`]}`}
      data-status={status}
      data-testid="work-stamp"
    >
      {status === 'done'
        ? <Check size={size === 'sm' ? 12 : 14} strokeWidth={3} aria-hidden="true" />
        : (
          <>
            {WORK_STATUS_TEXT[status]}
            {status === 'doing' && <DotLoading color="currentColor" />}
          </>
        )}
    </span>
  )
}

/** The status dot's class for list rows (8px dot, TasksView/fields). */
export function statusDotClass(status: WorkStatus): string {
  /* v8 ignore next -- every WorkStatus carries a dot_ class in the module. */
  return css[`dot_${status}`] ?? ''
}
