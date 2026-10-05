/**
 * The work tab (v6「工作台」, the ledger first over the design's page-tools):
 * the page header with the tasks/files entries, the four-status capsule tabs
 * with live counts, the work cards (28px work stamp, ledger meta line,
 * source-chat back-link, demo tag, and the per-status quick action row — the
 * list is the quick console, flipping states in place with a toast), the
 * empty state's route to the agents page, and then the colleagues' tool grid
 * (one card per roster preset — the avatar-colored icon block, the duty
 * description, and 去聊聊 starting that colleague's chat with its first
 * starter message over the real createSession + promptSession path) below the
 * fold. The page scrolls as a whole so the ledger reads on entry. Work data
 * derives from the workStore through useSyncExternalStore.
 */

import { useMemo, useRef, useState, useSyncExternalStore, type JSX } from 'react'
import { Button, CapsuleTabs, DotLoading, Tag, Toast } from 'antd-mobile'
import { Bot, ChevronRight, ClipboardCheck, ClipboardList, Database, LineChart, ShieldCheck } from 'lucide-react'
import { buildReworkMessage, startWorkExecution } from '../actions.ts'
import { colleagueOf, welcomeOf } from '../colleagues.ts'
import { messageOf, useAsync } from '../hooks.ts'
import { EmptyState } from '../ui.tsx'
import { navigate } from '../router.ts'
import { createSession, listAiEmployees, promptSession } from '../sessionsService.ts'
import { byStatus, subscribeWork, transitionWorkItem, workSnapshot, type WorkItem, type WorkStatus } from '../workStore.ts'
import { WorkStamp } from './WorkStamp.tsx'
import css from './work.module.css'

/** One tool-grid card (the design's .tool-card): a roster preset as an entry. */
interface ToolCard {
  readonly preset: string
  readonly name: string
  readonly description: string
  readonly icon: JSX.Element
  /** The first starter's send text (the card's preseeded opening message). */
  readonly opening: string | undefined
}

/** The preset-id → icon glyph (the duty's semantics; Bot is the fallback). */
function toolIconOf(preset: string): JSX.Element {
  if (preset === 'mobile-form-assistant') return <ClipboardList size={22} strokeWidth={1.8} aria-hidden="true" />
  if (preset === 'business-advisor') return <LineChart size={22} strokeWidth={1.8} aria-hidden="true" />
  if (preset === 'enterprise-data-assistant') return <Database size={22} strokeWidth={1.8} aria-hidden="true" />
  if (preset === 'food-compliance-officer') return <ShieldCheck size={22} strokeWidth={1.8} aria-hidden="true" />
  return <Bot size={22} strokeWidth={1.8} aria-hidden="true" />
}

/** The tab order and copy of the four statuses. */
const STATUS_TABS: ReadonlyArray<{ readonly status: WorkStatus; readonly label: string }> = [
  { status: 'todo', label: '待处理' },
  { status: 'doing', label: '进行中' },
  { status: 'review', label: '待确认' },
  { status: 'done', label: '已完成' },
]

/**
 * The capsule tab the work tab reopens on (module state: the picked filter
 * must survive beyond this component instance — the shell keeps the page
 * alive, and this carries the pick across any future remount).
 */
let rememberedTab: WorkStatus = 'todo'

/** Work-tab props: the keep-alive visibility gate. */
export interface WorkViewProps {
  /** Suspends the roster read while the keep-alive page is hidden (default true). */
  readonly active?: boolean
}

/** The work tab. */
export function WorkView({ active = true }: WorkViewProps): JSX.Element {
  const store = useSyncExternalStore(subscribeWork, workSnapshot)
  const roster = useAsync(listAiEmployees, active)
  /**
   * The starting lock: a synchronous ref so two clicks in the same render
   * frame cannot both pass the guard (React batches the state update), plus
   * the state that renders the disabled cards.
   */
  const startingRef = useRef(false)
  const [startingTool, setStartingTool] = useState(false)
  const [tab, setTab] = useState<WorkStatus>(rememberedTab)

  const tools = useMemo<readonly ToolCard[]>(() => (roster.value ?? []).slice(0, 8).map((employee) => {
    const visual = colleagueOf(employee.id)
    return {
      preset: employee.id,
      name: employee.name,
      description: employee.description !== '' ? employee.description : visual.duty,
      icon: toolIconOf(employee.id),
      opening: welcomeOf(employee.id, employee.welcome).starters[0]?.send,
    }
  }), [roster.value])

  /** One tool card: create the colleague's session, preseed its opener, land on the chat. */
  const openTool = (tool: ToolCard): void => {
    if (startingRef.current) return
    startingRef.current = true
    setStartingTool(true)
    void createSession(tool.preset)
      .then(async (sessionId) => {
        if (tool.opening !== undefined) {
          // The opener rides the same promptSession lane the composer uses.
          await promptSession(sessionId, tool.opening)
        }
        navigate(`#/chat/${sessionId}`)
      })
      .catch((cause: unknown) => {
        Toast.show({ content: messageOf(cause) })
      })
      .finally(() => {
        startingRef.current = false
        setStartingTool(false)
      })
  }
  const selectTab = (next: WorkStatus): void => {
    rememberedTab = next
    setTab(next)
  }
  const rows = useMemo(() => byStatus(store.items, tab), [store.items, tab])

  /** Flip one card to doing through the shared execution kickoff. */
  const start = (item: WorkItem): void => {
    void startWorkExecution(item).then((outcome) => { Toast.show({ content: outcome.message }) })
  }

  /** Confirm from the list: the M3 notice already landed at review time. */
  const confirm = (item: WorkItem): void => {
    transitionWorkItem(item.id, 'done')
    Toast.show({ content: '已确认完成' })
  }

  /** Reject from the list: the M4 rework directive, then back to doing. */
  const reject = (item: WorkItem): void => {
    const directive = buildReworkMessage()
    if (item.execSessionId !== undefined) {
      void promptSession(item.execSessionId, directive).catch((cause: unknown) => {
        Toast.show({ content: messageOf(cause) })
      })
    }
    transitionWorkItem(item.id, 'doing')
    Toast.show({ content: '已打回，AI 同事将返工' })
  }

  return (
    <div className={css.workPage}>
      <header className={css.workHeader}>
        <h1 className={css.workTitle}>工作</h1>
        <div className={css.workEntries}>
          <Button type="button" fill="outline" size="small" className={css.entryLink} style={{ '--border-color': 'var(--dshm-line-strong)' }} onClick={() => { navigate('#/tasks') }}>任务</Button>
          <Button type="button" fill="outline" size="small" className={css.entryLink} style={{ '--border-color': 'var(--dshm-line-strong)' }} onClick={() => { navigate('#/files') }}>文件</Button>
        </div>
      </header>
      <CapsuleTabs
        activeKey={tab}
        onChange={(key) => { selectTab(key as WorkStatus) }}
        className={css.statusTabs as string}
      >
        {STATUS_TABS.map(entry => (
          <CapsuleTabs.Tab
            key={entry.status}
            title={`${entry.label} ${String(byStatus(store.items, entry.status).length)}`}
          />
        ))}
      </CapsuleTabs>
      <section className={css.workList} aria-label="工作列表">
        {rows.length === 0 && (
          <EmptyState
            icon={<ClipboardCheck size={22} strokeWidth={1.8} />}
            title="这个状态还没有工作"
            description="去聊天里让 AI 同事帮你处理"
            action={{ label: '去找 AI 同事', onClick: () => { navigate('#/agents') } }}
          />
        )}
        {rows.map(item => (
          <article key={item.id} className={`${css.workCard} ${css[`card_${item.status}`]}`} data-testid="work-card">
            <div className={css.cardHeadRow}>
              <button
                type="button"
                className={css.cardHeadButton}
                aria-label={`打开 ${item.title}`}
                onClick={() => { navigate(`#/work/${item.id}`) }}
              >
                <WorkStamp status={item.status} size="sm" />
                <span className={css.cardTitle}>{item.title}</span>
              </button>
              {item.demo && <Tag className={css.cardDemoTag as string} style={{ '--background-color': 'transparent', '--text-color': 'var(--dshm-ink-sub)', '--border-color': 'var(--dshm-line)' }}>示例</Tag>}
            </div>
            <div className={css.cardMeta}>
              <span>负责人 {item.owner}</span>
              {item.due !== undefined && <span>截止 {item.due}</span>}
              {item.sourceSessionId !== undefined && (
                <Button
                  type="button"
                  size="mini"
                  fill="none"
                  className={css.sourceBadge}
                  onClick={() => { navigate(`#/chat/${item.sourceSessionId}`) }}
                >
                  来自对话 <ChevronRight size={10} aria-hidden="true" />
                </Button>
              )}
            </div>
            {item.status === 'todo' && (
              <div className={css.cardActions}>
                <Button type="button" color="primary" size="small" className={css.actionPrimary} onClick={() => { start(item) }}>开始执行</Button>
              </div>
            )}
            {item.status === 'doing' && (
              <div className={css.cardActions}>
                <span className={css.doingNote}><DotLoading color="currentColor" /> AI 同事执行中</span>
                <Button
                  type="button"
                  fill="outline"
                  size="small"
                  className={css.actionSecondary}
                  style={{ '--border-color': 'var(--dshm-line)' }}
                  onClick={() => { navigate(`#/work/${item.id}`) }}
                >
                  查看进度
                </Button>
              </div>
            )}
            {item.status === 'review' && (
              <div className={css.cardActions}>
                <Button type="button" fill="outline" size="small" className={css.actionSecondary} style={{ '--border-color': 'var(--dshm-line)' }} onClick={() => { reject(item) }}>打回</Button>
                <Button type="button" color="primary" size="small" className={css.actionPrimary} onClick={() => { confirm(item) }}>确认完成</Button>
              </div>
            )}
            {item.status === 'done' && (
              <div className={css.cardActions}>
                <span className={css.doneSummary}>{item.result?.summary ?? '已完成'}</span>
                <Button type="button" color="primary" fill="none" size="small" className={css.actionLink} onClick={() => { navigate(`#/work/${item.id}`) }}>
                  查看结果
                </Button>
              </div>
            )}
          </article>
        ))}
      </section>
      {tools.length > 0 && (
        <section className={css.toolsGrid} aria-label="AI 同事工具">
          {tools.map(tool => (
            <button
              key={tool.preset}
              type="button"
              className={css.toolCard}
              aria-label={`去聊聊 ${tool.name}`}
              disabled={startingTool}
              onClick={() => { openTool(tool) }}
            >
              <span className={css.toolIcon}>{tool.icon}</span>
              <span className={css.toolName}>{tool.name}</span>
              <span className={css.toolDesc}>{tool.description}</span>
              <span className={css.toolGo}>去聊聊</span>
            </button>
          ))}
        </section>
      )}
    </div>
  )
}
