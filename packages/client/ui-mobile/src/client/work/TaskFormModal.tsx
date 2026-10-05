/**
 * The task-form bottom sheet (02 §6, 03 §6.5): antd-mobile form controls over
 * the v3 field language — the title input (required), the owner picker (the
 * demo team plus 我自己), the due date picker (default tomorrow, clearable),
 * the read-only AI suggestion block, and the 立即执行 switch. The submit side
 * effect chain runs in order (02 §6.2): validate → workStore.create (todo) →
 * the M1 notice to the source chat when one exists (a failed notice toasts
 * but never rolls back — the local truth already stands) → the optional
 * execution kickoff → toast → navigate to the new item's detail page.
 */

import { useEffect, useMemo, useState, type JSX } from 'react'
import { Button, DatePicker, Input, Picker, Popup, Switch, Toast } from 'antd-mobile'
import { ChevronRight, X } from 'lucide-react'
import { portalContainer } from '../portal.ts'
import { buildTaskCreatedMessage, startWorkExecution } from '../actions.ts'
import { TEAM_MEMBERS } from '../demoSeed.ts'
import { navigate } from '../router.ts'
import { promptSession } from '../sessionsService.ts'
import { createWorkItem } from '../workStore.ts'
import css from './work.module.css'

/**
 * The sheet head's business-seal word (W9-B6): 采/销/库 off the prefill's
 * source title, 任 as the plain task word.
 * @param sourceTitle - the prefill's source title, when present.
 * @returns the seal character.
 */
function bizSealOf(sourceTitle: string | undefined): string {
  if (sourceTitle === undefined) return '任'
  if (sourceTitle.includes('采购') || sourceTitle.includes('进货')) return '采'
  if (sourceTitle.includes('销') || sourceTitle.includes('出货')) return '销'
  if (sourceTitle.includes('库') || sourceTitle.includes('盘')) return '库'
  return '任'
}

/** The modal's prefilled creation anchor (a report action's create-task fields). */
export interface TaskPrefill {
  readonly title: string
  readonly suggestion: string | undefined
}

/** Task-form props: the visibility pair, the identity, and the creation anchor. */
export interface TaskFormModalProps {
  readonly visible: boolean
  readonly onClose: () => void
  /** The current identity's display name (the 我自己 picker entry). */
  readonly identityName: string
  /** The report action's prefill, when the modal opened from a card. */
  readonly prefill: TaskPrefill | undefined
  /** The report card's source chat; absent on manual creation. */
  readonly sourceSessionId: string | undefined
  /** The report card's assistant seq (stringified), for the detail back-link. */
  readonly sourceAnchor: string | undefined
}

/** Tomorrow at 09:00 (the due picker's default, 03 §6.5). */
function tomorrowAtNine(): Date {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  date.setHours(9, 0, 0, 0)
  return date
}

/** One Date → the store's 'YYYY-MM-DD' due string. */
function dueOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** One due string → the picker row's friendly text (09-24（周五）). */
function dueLabel(due: string | undefined): string {
  if (due === undefined) return '未定'
  const date = new Date(`${due}T00:00:00`)
  const weekday = date.toLocaleDateString('zh-CN', { weekday: 'short' })
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}（${weekday}）`
}

/**
 * The task-form bottom sheet.
 * @param props - visibility, identity, and the creation anchor.
 * @returns the sheet element (a Popup wrapping the form).
 */
export function TaskFormModal(
  { visible, onClose, identityName, prefill, sourceSessionId, sourceAnchor }: TaskFormModalProps,
): JSX.Element {
  const [title, setTitle] = useState('')
  const [titleError, setTitleError] = useState<string | undefined>(undefined)
  const [owner, setOwner] = useState(identityName)
  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false)
  const [dueDate, setDueDate] = useState<Date | undefined>(tomorrowAtNine)
  const [duePickerOpen, setDuePickerOpen] = useState(false)
  const [runNow, setRunNow] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Every open re-seeds the form from the anchor (a later card's prefill wins).
  useEffect(() => {
    if (!visible) return
    setTitle(prefill?.title ?? '')
    setTitleError(undefined)
    setOwner(identityName)
    setDueDate(tomorrowAtNine())
    setRunNow(false)
  }, [visible, prefill, identityName])

  const ownerColumns = useMemo<Array<Array<{ value: string; label: string }>>>(() => [[
    { value: identityName, label: `我自己（${identityName}）` },
    ...TEAM_MEMBERS.map(member => ({ value: member.name, label: `${member.name} · ${member.duty}（演示团队）` })),
  ]], [identityName])
  /** The owner row's face: the self label, else the picked member's name (a wheel gesture jsdom cannot drive). */
  /* v8 ignore next 2 -- the wheel's touch re-selection is an e2e gesture, not a jsdom lane. */
  const ownerFace = owner === identityName
    ? `我自己（${identityName}）`
    : owner

  const submit = async (): Promise<void> => {
    const trimmed = title.trim()
    if (trimmed === '') {
      setTitleError('标题必填')
      return
    }
    /* v8 ignore next -- the disabled submit screens the in-flight arm. */
    if (submitting) return
    setSubmitting(true)
    const due = dueDate === undefined ? undefined : dueOf(dueDate)
    const suggestion = prefill?.suggestion
    try {
      const item = createWorkItem({
        title: trimmed,
        owner,
        ...(due !== undefined ? { due } : {}),
        ...(suggestion !== undefined ? { suggestion } : {}),
        ...(sourceSessionId !== undefined ? { sourceSessionId } : {}),
        ...(sourceAnchor !== undefined ? { sourceAnchor } : {}),
        status: 'todo',
      })
      if (sourceSessionId !== undefined) {
        try {
          await promptSession(sourceSessionId, buildTaskCreatedMessage({ title: trimmed, owner, due, suggestion }))
        } catch {
          // The local truth already stands; the notice can catch up later.
          Toast.show({ content: '任务已创建，但通知源会话失败' })
        }
      }
      if (runNow) {
        const started = await startWorkExecution(item)
        if (!started.ok) Toast.show({ content: `已创建任务，自动执行启动失败：${started.message}` })
      }
      Toast.show({ content: `已创建任务 · ${trimmed}` })
      onClose()
      navigate(`#/work/${item.id}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Popup
      visible={visible}
      onMaskClick={onClose}
      destroyOnClose
      getContainer={portalContainer}
      bodyClassName={css.sheetBody as string}
    >
      <div className={css.sheet} aria-label="创建处理任务">
        <header className={css.sheetHead}>
          <span className={css.sheetSeal} aria-hidden="true">{bizSealOf(prefill?.title)}</span>
          <h2 className={css.sheetTitle}>创建处理任务</h2>
          <button type="button" className={css.sheetClose} aria-label="关闭" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className={css.sheetScroller}>
          {prefill !== undefined && <div className={css.sourceStrip}>来自：{prefill.title}</div>}
          <div className={css.fieldGroup}>
            <label className={css.fieldLabel} htmlFor="task-title">任务标题</label>
            <Input
              id="task-title"
              clearable
              className={`${css.fieldInput} ${titleError !== undefined ? css.fieldInvalid : ''}`}
              value={title}
              placeholder="要跟进的事，如：接口联调延期处理"
              onChange={(next) => {
                setTitle(next)
                setTitleError(undefined)
              }}
            />
            {titleError !== undefined && <p className={css.fieldError}>{titleError}</p>}
          </div>
          <button type="button" className={css.pickerRow} onClick={() => { setOwnerPickerOpen(true) }}>
            <span className={css.pickerLabel}>负责人</span>
            <span className={css.pickerValue}>
              {ownerFace}
              <ChevronRight size={14} className={css.pickerChevron} aria-hidden="true" />
            </span>
          </button>
          <Picker
            columns={ownerColumns}
            visible={ownerPickerOpen}
            getContainer={portalContainer}
            onClose={() => { setOwnerPickerOpen(false) }}
            onConfirm={(value) => {
              /* v8 ignore next -- the single owner column always confirms a picked value. */
              setOwner(String(value[0] ?? identityName))
            }}
            value={[owner]}
          />
          <button type="button" className={css.pickerRow} onClick={() => { setDuePickerOpen(true) }}>
            <span className={css.pickerLabel}>截止时间</span>
            <span className={css.pickerValue}>
              {dueLabel(dueDate === undefined ? undefined : dueOf(dueDate))}
              {dueDate !== undefined && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="清除截止时间"
                  className={css.pickerClear}
                  onClick={(event) => { event.stopPropagation(); setDueDate(undefined) }}
                  onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); setDueDate(undefined) } }}
                >
                  <X size={14} aria-hidden="true" />
                </span>
              )}
              <ChevronRight size={14} className={css.pickerChevron} aria-hidden="true" />
            </span>
          </button>
          <DatePicker
            visible={duePickerOpen}
            getContainer={portalContainer}
            onClose={() => { setDuePickerOpen(false) }}
            onConfirm={(date) => { setDueDate(date) }}
            value={dueDate}
            precision="day"
            min={new Date(Date.now() - 86_400_000)}
          />
          {prefill?.suggestion !== undefined && prefill.suggestion.trim() !== '' && (
            <div className={css.suggestionBlock}>
              <span className={css.suggestionLabel}>AI 建议</span>
              <p className={css.suggestionText}>{prefill.suggestion}</p>
            </div>
          )}
          <div className={css.switchRow}>
            <span className={css.switchTexts}>
              <span className={css.switchTitle}>立即执行</span>
              <span className={css.switchHint}>创建后直接交给 AI 同事开始执行</span>
            </span>
            <Switch checked={runNow} aria-label="立即执行" onChange={setRunNow} />
          </div>
        </div>
        <div className={css.sheetActions}>
          <Button type="button" size="large" fill="outline" className={css.sheetCancel} style={{ '--border-color': 'var(--dshm-ink-sub)' }} disabled={submitting} onClick={onClose}>取消</Button>
          <Button
            type="button"
            size="large"
            color="primary"
            className={css.sheetSubmit}
            loading={submitting}
            loadingText="创建中…"
            onClick={() => { void submit() }}
          >
            创建任务
          </Button>
        </div>
      </div>
    </Popup>
  )
}
