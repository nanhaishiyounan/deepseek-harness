/**
 * The agents tab (v6「同事」, the design's page-roster): the page header with
 * the local search box, then the roster rendered in capability bands (the
 * colleagues table's grouping; empty bands drop their headings, presets the
 * table leaves ungrouped collect under 更多 AI 同事). One roster item per
 * preset — the 42px stamp avatar with the presence dot, the roster name and
 * role, the duty tag line, the skill pills, and the presence chip; a tap
 * starts that colleague's chat over the real createSession path. The roster
 * read renders skeleton rows while loading and notice cards for the empty
 * and failure states; a starting item carries the DotLoading mark.
 */

import { useMemo, useRef, useState, type JSX } from 'react'
import { DotLoading, Toast } from 'antd-mobile'
import { Search } from 'lucide-react'
import { colleagueOf, rosterBandsOf, statusLabelOf, type ColleagueVisual } from '../colleagues.ts'
import { messageOf, useAsync } from '../hooks.ts'
import { navigate } from '../router.ts'
import { createSession, listAiEmployees } from '../sessionsService.ts'
import { NoticeCard, SkelRow } from '../ui.tsx'
import { Avatar } from '../ui.tsx'
import css from './agents.module.css'

/** The agents tab. */
export function AgentsView(): JSX.Element {
  const roster = useAsync(listAiEmployees)
  /**
   * The starting row: a synchronous ref so two clicks in the same render
   * frame cannot both pass the guard (React batches the state update), plus
   * the state that renders the one busy row's marks.
   */
  const startingRef = useRef<string | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')

  /** One roster row: the wire entry joined with its visual metadata. */
  interface RosterRow {
    readonly id: string
    readonly name: string
    readonly description: string
    readonly visual: ColleagueVisual
  }

  const bands = useMemo(() => {
    const rows: readonly RosterRow[] = (roster.value ?? []).map(employee => ({
      id: employee.id,
      name: employee.name,
      description: employee.description,
      visual: colleagueOf(employee.id),
    }))
    const needle = keyword.trim()
    const filtered = needle === ''
      ? rows
      : rows.filter(row => row.name.includes(needle)
        || row.description.includes(needle)
        || row.visual.duty.includes(needle)
        || row.visual.skills.some(skill => skill.includes(needle)))
    // rosterBandsOf keeps the row references, so the bands carry the full rows.
    return rosterBandsOf(filtered)
  }, [roster.value, keyword])

  const start = (presetId: string): void => {
    if (startingRef.current !== null) return
    startingRef.current = presetId
    setStartingId(presetId)
    void createSession(presetId)
      .then((sessionId) => { navigate(`#/chat/${sessionId}`) })
      .catch((cause: unknown) => {
        Toast.show({ content: messageOf(cause) })
      })
      .finally(() => {
        startingRef.current = null
        setStartingId(null)
      })
  }

  return (
    <div className={css.page}>
      <header className={css.header}>
        <h1 className={css.headerTitle}>AI 同事</h1>
      </header>
      <div className={css.searchWrap}>
        <div className={css.searchBox}>
          <Search size={17} strokeWidth={1.8} aria-hidden="true" />
          <input
            className={css.searchInput}
            type="text"
            value={keyword}
            aria-label="搜索 AI 同事"
            placeholder="搜索姓名 / 职能 / 技能"
            onChange={(event) => { setKeyword(event.target.value) }}
          />
        </div>
      </div>
      <section className={css.list} aria-label="AI 同事目录">
        {roster.status === 'loading' && (
          <div className={css.skelGroup} role="status" aria-label="正在加载 AI 同事">
            <SkelRow />
            <SkelRow />
            <SkelRow />
          </div>
        )}
        {roster.status === 'error' && <NoticeCard kind="error" text={roster.error} />}
        {roster.status === 'ready' && roster.value.length === 0 && (
          <NoticeCard kind="empty" text="部署未配置 AI 同事预设" />
        )}
        {bands.map(band => (
          <div key={band.title} className={css.band}>
            <h2 className={css.bandTitle}>{band.title}</h2>
            {band.entries.map((row) => {
              const visual = row.visual
              const duty = row.description !== '' ? row.description : visual.duty
              const statusLabel = statusLabelOf(visual.status)
              return (
                <button
                  key={row.id}
                  type="button"
                  className={css.rosterItem}
                  aria-label={`找 ${row.name}`}
                  disabled={startingId === row.id}
                  onClick={() => { start(row.id) }}
                >
                  <span className={css.rosterAva}>
                    <Avatar background={visual.color} acronym={visual.acronym} size={42} />
                    <span className={`${css.avaDot} ${css[`dot_${visual.status}`]}`} aria-hidden="true" />
                  </span>
                  <span className={css.rosterInfo}>
                    <span className={css.rosterNameRow}>
                      <span className={css.rosterName}>{row.name}</span>
                      <span className={css.rosterRole}>{visual.duty}</span>
                    </span>
                    {/* The description tag only renders when the roster carried one;
                        an empty description would repeat the duty beside it. */}
                    {row.description !== '' && <span className={css.rosterTag}>{duty}</span>}
                    {visual.skills.length > 0 && (
                      <span className={css.skillPills}>
                        {visual.skills.map(skill => <span key={skill} className={css.skillPill}>{skill}</span>)}
                      </span>
                    )}
                    {startingId === row.id && (
                      <span className={css.starting}>
                        <DotLoading color="currentColor" /> 创建中
                      </span>
                    )}
                  </span>
                  <span className={`${css.statusChip} ${css[`chip_${visual.status}`]}`}>{statusLabel}</span>
                </button>
              )
            })}
          </div>
        ))}
        {roster.status === 'ready' && keyword.trim() !== '' && bands.length === 0 && (
          <NoticeCard kind="empty" text="没有找到匹配的同事" />
        )}
      </section>
    </div>
  )
}
