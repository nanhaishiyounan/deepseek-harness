/**
 * The new-chat bottom sheet (02 §4.2, 03 §4.8): the roster's AI rows — the
 * fill assistant first, then the rest — with the starterable form chips, and
 * the three most recent sessions as direct entries. Starting a session sends
 * nothing as the user; the chat's local welcome owns the opening. This sheet
 * replaces the standalone contacts route.
 */

import { useEffect, useMemo, useState, type JSX } from 'react'
import { Popup, Tag, Toast } from 'antd-mobile'
import { X } from 'lucide-react'
import { portalContainer } from '../portal.ts'
import { navigate } from '../router.ts'
import { useAsync } from '../hooks.ts'
import { Avatar } from '../ui.tsx'
import { colleagueColor, colleagueNameOf, colleagueOf, stampAcronymOf } from '../colleagues.ts'
import { FORM_REGISTRY } from '../formRegistry.ts'
import { createSession, listAiEmployees, listSessions, relativeTimeOf, titleOf } from '../sessionsService.ts'
import css from './newchat.module.css'

/** New-chat-sheet props: the visibility pair. */
export interface NewChatSheetProps {
  readonly visible: boolean
  readonly onClose: () => void
}

/** The sheet. */
export function NewChatSheet({ visible, onClose }: NewChatSheetProps): JSX.Element {
  const roster = useAsync(listAiEmployees)
  const recent = useAsync(listSessions)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const rows = useMemo(() => {
    const value = roster.value ?? []
    const fill = value.find(row => row.id === 'mobile-form-assistant')
    return fill === undefined ? value : [fill, ...value.filter(row => row.id !== fill.id)]
  }, [roster.value])

  // A failed roster read or start lands as one transient toast.
  useEffect(() => {
    if (roster.error !== undefined) Toast.show({ content: roster.error })
  }, [roster.error])
  useEffect(() => {
    if (error !== undefined) Toast.show({ content: error })
  }, [error])

  const recentRows = useMemo(() => (recent.value ?? []).slice(0, 3), [recent.value])

  const start = async (presetId: string): Promise<void> => {
    // The entry rows carry `disabled={busy}`, so a second click while a start
    // is in flight never reaches this guard.
    /* v8 ignore next -- the disabled row screens the busy arm. */
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      const sessionId = await createSession(presetId)
      onClose()
      navigate(`#/chat/${sessionId}`)
    } catch (cause) {
      // the rpc seam only rejects with Error.
      /* v8 ignore next -- the rpc seam never rejects with a non-Error value. */
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popup
      visible={visible}
      onMaskClick={onClose}
      destroyOnClose
      getContainer={portalContainer}
      bodyClassName={css.sheetBody as string}
      className={css.sheetWrap as string}
    >
      <div className={css.sheet} aria-label="新建会话">
        <span className={css.handle} aria-hidden="true" />
        <header className={css.head}>
          <h2 className={css.title}>新建会话</h2>
          <button type="button" className={css.close} aria-label="关闭" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <ul className={css.roster} aria-label="AI 同事">
          {rows.map((employee) => {
            const visual = colleagueOf(employee.id)
            const duty = employee.description !== '' ? employee.description : visual.duty
            const formChips = employee.id === 'mobile-form-assistant'
              ? FORM_REGISTRY.slice(0, 3).map(entry => entry.bizName)
              : []
            return (
              <li key={employee.id}>
                <button type="button" className={css.rosterRow} disabled={busy} onClick={() => { void start(employee.id) }}>
                  <Avatar
                    background={colleagueColor(employee.id)}
                    acronym={stampAcronymOf(employee.id, colleagueNameOf(employee.id, employee))}
                    size={40}
                  />
                  <span className={css.rosterMain}>
                    <span className={css.rosterName}>{employee.name}</span>
                    <span className={css.rosterDuty}>{duty}</span>
                    {formChips.length > 0 && (
                      <span className={css.rosterChips}>
                        {/* The chips ride inside the row button (their start
                            action is the row's own), so they render as display
                            Tags — a nested button would be invalid HTML. */}
                        {formChips.map(chip => (
                          <Tag
                            key={chip}
                            className={css.rosterChip as string}
                            style={{ '--background-color': 'var(--dshm-brand-soft)', '--text-color': 'var(--dshm-brand)', '--border-color': 'transparent' }}
                          >
                            {chip}
                          </Tag>
                        ))}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
          {roster.value?.length === 0 && <li className={css.empty}>部署未配置 AI 同事预设</li>}
        </ul>
        {recentRows.length > 0 && (
          <>
            <h3 className={css.sectionTitle}>最近</h3>
            <ul className={css.recent} aria-label="最近会话">
              {recentRows.map(summary => (
                <li key={summary.sessionId}>
                  <button
                    type="button"
                    className={css.recentRow}
                    onClick={() => {
                      onClose()
                      navigate(`#/chat/${summary.sessionId}`)
                    }}
                  >
                    <span className={css.recentTitle}>{titleOf(summary)}</span>
                    <span className={css.recentTime}>{relativeTimeOf(summary.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Popup>
  )
}
