/**
 * First-run demo seed and its cleanup: the demo team constant (the
 * TaskFormModal owner picker and the seed owners share one table) plus the
 * three seeded work items — two team tasks (doing/review) and one pinned
 * report artifact. Everything seeded carries `demo: true`, so the views can
 * tag it 示例 and 「清除演示数据」 can remove exactly it while real items
 * stay. Pure data layer; no React imports.
 */

import type { ReportPayload } from './protocol.ts'
import {
  createWorkItem, deleteWorkItem, markWorkSeeded, resetWorkSeeded, updateWorkItem, workSnapshot,
} from './workStore.ts'

/** One demo team member (name + duty line the pickers and cards render). */
export interface TeamMember {
  readonly name: string
  readonly duty: string
}

/** The demo team: names pair with the hub business domains but never claim backend origin. */
export const TEAM_MEMBERS: readonly TeamMember[] = [
  { name: '陈晨', duty: '采购' },
  { name: '高翔', duty: '品控' },
  { name: '林小满', duty: '仓储' },
]

/** The seeded report artifact (a legal ReportPayload the FilesView/ReportCard render). */
const DEMO_REPORT: ReportPayload = {
  v: 3,
  type: 'report',
  id: 'r_1',
  title: '本月经营概览',
  subtitle: '截至今天 · 数据来自湖仓指标',
  metrics: [
    { label: '采购额', value: '¥128,600', kind: 'money' },
    { label: '待处理单据', value: '5', kind: 'count', tone: 'warning' },
    { label: '按期交付率', value: '96%', kind: 'percent', tone: 'positive' },
  ],
  rows: [
    { label: '冷链箱采购价上涨', hint: '较上月 +8%，建议月底前锁价', level: 'medium' },
    { label: '两家供应商资质临期', hint: '证照 30 天内到期，需换发', level: 'high' },
  ],
  actions: [
    { kind: 'create-task', label: '创建处理任务', title: '供应商资质换发跟进', suggestion: '联系临期供应商确认换发材料' },
    { kind: 'view', label: '查看工作', route: '#/work' },
  ],
}

/** The next day's 'YYYY-MM-DD' (the demo due dates). */
function tomorrow(): string {
  const date = new Date(Date.now() + 86_400_000)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Write the first-run demo seed: two team tasks (doing/review) and one
 * pinned report artifact, all demo-marked. Idempotent — a seeded store
 * replays nothing.
 */
export function seedDemoData(): void {
  if (workSnapshot().seeded) return
  const now = Date.now()
  createWorkItem({
    title: '供应商资质到期提醒',
    owner: '陈晨',
    due: tomorrow(),
    suggestion: '近 30 天内到期的资质证照建议本周完成换发确认',
    status: 'doing',
    demo: true,
  })
  const review = createWorkItem({
    title: '本月采购月报整理',
    owner: '高翔',
    due: tomorrow(),
    suggestion: '按品类汇总本月采购单据并标注价格异常',
    status: 'review',
    demo: true,
  })
  updateWorkItem(review.id, { result: { summary: '已汇总本月五类采购单据，两项价格异常待确认', finishedAt: now } })
  const artifact = createWorkItem({ title: '本月经营概览', owner: '林小满', status: 'done', demo: true })
  updateWorkItem(artifact.id, {
    result: { summary: '已生成本月经营概览报告', finishedAt: now },
    artifact: DEMO_REPORT,
    pinned: true,
  })
  markWorkSeeded()
}

/**
 * Remove every demo-marked item, keeping real ones, and unlatch the seeded
 * flag — the demo workspace can be re-seeded on the next shell mount.
 */
export function clearDemoData(): void {
  for (const item of workSnapshot().items) {
    if (item.demo) deleteWorkItem(item.id)
  }
  resetWorkSeeded()
}
