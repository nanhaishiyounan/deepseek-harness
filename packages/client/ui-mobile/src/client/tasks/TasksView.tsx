/**
 * The tasks secondary page (02 §2.6, 03 §6.7): the mine/team capsule tabs
 * over the workStore's owner split — 我的 (owner === the identity) and 团队
 * (everyone else, headed by the 演示团队 banner with owner tails and the demo
 * tags). Rows order by due date ascending (undated last, due-soon in amber)
 * and route to the item's work detail.
 */

import { useMemo, useState, useSyncExternalStore, type JSX } from 'react'
import { CapsuleTabs, Tag } from 'antd-mobile'
import { CircleCheckBig } from 'lucide-react'
import { goBackOr, navigate } from '../router.ts'
import { EmptyState } from '../ui.tsx'
import { PageNav } from '../PageNav.tsx'
import { myTasks, subscribeWork, teamTasks, workSnapshot, type WorkItem } from '../workStore.ts'
import { statusDotClass } from '../work/WorkStamp.tsx'
import css from './tasks.module.css'

/** Tasks props: the current identity name (the 我的 split). */
export interface TasksViewProps {
  readonly identityName: string
}

/** The due-ascending row order (undated last). */
export function byDue(items: readonly WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => {
    if (a.due === undefined && b.due === undefined) return b.updatedAt - a.updatedAt
    if (a.due === undefined) return 1
    if (b.due === undefined) return -1
    return a.due < b.due ? -1 : a.due > b.due ? 1 : 0
  })
}

/** The due date's mono text (MM-DD), amber when ≤2 days out. */
function dueMeta(item: WorkItem): { text: string; soon: boolean } | undefined {
  if (item.due === undefined) return undefined
  const soon = new Date(`${item.due}T23:59:59`).getTime() - Date.now() < 2 * 86_400_000
  const date = new Date(`${item.due}T00:00:00`)
  return { text: `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`, soon }
}

/**
 * The tasks page.
 * @param props - the identity name.
 * @returns the page tree.
 */
export function TasksView({ identityName }: TasksViewProps): JSX.Element {
  const store = useSyncExternalStore(subscribeWork, workSnapshot)
  const [tab, setTab] = useState<'mine' | 'team'>('mine')
  const mine = useMemo(() => byDue(myTasks(store.items, identityName)), [store.items, identityName])
  const team = useMemo(() => byDue(teamTasks(store.items, identityName)), [store.items, identityName])
  const rows = tab === 'mine' ? mine : team

  return (
    <div className={css.page}>
      <PageNav title="我的任务" onBack={() => { goBackOr('#/work') }} />
      <CapsuleTabs activeKey={tab} onChange={(key) => { setTab(key as 'mine' | 'team') }} className={css.tabs as string}>
        <CapsuleTabs.Tab title={`我的 ${String(mine.length)}`} key="mine" />
        <CapsuleTabs.Tab title={`团队 ${String(team.length)}`} key="team" />
      </CapsuleTabs>
      <section className={css.list} aria-label="任务列表">
        {tab === 'team' && rows.length > 0 && <p className={css.teamBanner}>演示团队 · 数据来自演示样例，不声称来自后端</p>}
        {rows.length === 0 && (
          <EmptyState
            icon={<CircleCheckBig size={22} strokeWidth={1.8} />}
            title={tab === 'mine' ? '还没有你的任务' : '团队还没有任务'}
            description="任务由 AI 同事在对话中承接后生成"
            action={{ label: '去对话里让 AI 同事派个活', onClick: () => { navigate('#/chats') } }}
          />
        )}
        {rows.length > 0 && (
          <div className={css.rowCard}>
            {rows.map((item) => {
              const due = dueMeta(item)
              return (
                <button
                  key={item.id}
                  type="button"
                  className={css.taskRow}
                  aria-label={`打开 ${item.title}`}
                  onClick={() => { navigate(`#/work/${item.id}`) }}
                >
                  <span className={statusDotClass(item.status)} aria-hidden="true" />
                  <span className={css.taskTitle}>{item.title}</span>
                  {item.demo && <Tag className={css.demoTag as string} style={{ '--background-color': 'transparent', '--text-color': 'var(--dshm-ink-sub)', '--border-color': 'var(--dshm-line)' }}>示例</Tag>}
                  {tab === 'team' && <span className={css.taskOwner}>{item.owner}</span>}
                  {due !== undefined && (
                    <span className={`${css.taskDue} ${due.soon ? css.dueSoon : ''}`}>{due.text}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
