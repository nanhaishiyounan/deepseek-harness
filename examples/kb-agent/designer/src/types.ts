/**
 * The W5-B0 approval-graph DSL — the editing truth stored in
 * wfl_flow_configs.graph (json column). The engine keeps this shape verbatim;
 * the publish-time compile to states/transitions rows is B1 (this batch only
 * persists the editing state; the runtime engine still reads its rows).
 */

export const GRAPH_VERSION = 1

/** The five node kinds B0 ships (parallel/handler are B2). */
export type NodeKind = 'start' | 'approval' | 'cc' | 'condition' | 'end'

export const NODE_KINDS: ReadonlyArray<{ kind: NodeKind; label: string; hint: string; color: string }> = [
  { kind: 'start', label: '开始', hint: '发起人（提交单据）', color: '#16a34a' },
  { kind: 'approval', label: '审批', hint: '审批人/多人方式/空策略', color: '#2563eb' },
  { kind: 'cc', label: '抄送', hint: '通知指定人员', color: '#0891b2' },
  { kind: 'condition', label: '条件分支', hint: '字段/操作符/值 条件行', color: '#d97706' },
  { kind: 'end', label: '结束', hint: '终点', color: '#6b7280' },
]

export const ASSIGNEE_TYPES = [
  { value: 'user', label: '指定成员' },
  { value: 'role', label: '角色' },
  { value: 'deptLeader', label: '部门主管' },
  { value: 'supervisorChain', label: '连续多级主管' },
  { value: 'formField', label: '表单联系人字段' },
] as const

export const MULTI_MODES = [
  { value: 'sequential', label: '依次审批' },
  { value: 'countersign', label: '会签（全过）' },
  { value: 'or', label: '或签（任一）' },
] as const

export const EMPTY_POLICIES = [
  { value: 'autoPass', label: '自动通过' },
  { value: 'autoReject', label: '自动拒绝' },
  { value: 'transferAdmin', label: '转交管理员' },
  { value: 'assignUser', label: '指定人员' },
] as const

export const CONDITION_OPS = ['>', '>=', '<', '<=', '==', '!=', 'contains', 'in'] as const

/** Node-title ceiling mirrored by validateFlowGraph on the server (Important 8). */
export const NODE_TITLE_MAX = 64

/** Why a node title cannot be persisted, or null when it can (the server mirrors this gate). */
export const titleFault = (title: string): string | null => {
  if (title.trim() === '') return '节点名称不能为空或纯空白'
  if (title.length > NODE_TITLE_MAX) return `节点名称最长 ${String(NODE_TITLE_MAX)} 字符`
  if (title.includes('<') || title.includes('>')) return '节点名称不能包含 < 或 > 字符'
  return null
}

/** One structured condition row (field / operator / value — no JSON textarea anywhere). */
export interface ConditionRow {
  field: string
  op: string
  value: string
}

/** The business payload a designer node carries. */
export interface NodePayload {
  title: string
  approval?: {
    assigneeType: string
    assignees: string[]
    mode: string
    emptyPolicy: string
  }
  cc?: { assignees: string[] }
  condition?: { join: 'and' | 'or'; rows: ConditionRow[] }
}

/**
 * Structural check for payloads decoded off the persisted graph — the render
 * path degrades unknown shapes to a gray card instead of throwing, and the
 * server-side validateFlowGraph keeps honest saves from ever needing it.
 */
export const isNodePayload = (value: unknown): value is NodePayload => {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  if (typeof candidate['title'] !== 'string') return false
  const approval = candidate['approval']
  if (approval !== undefined) {
    if (typeof approval !== 'object' || approval === null) return false
    const block = approval as Record<string, unknown>
    if (typeof block['assigneeType'] !== 'string' || typeof block['mode'] !== 'string') return false
    if (typeof block['emptyPolicy'] !== 'string') return false
    if (!Array.isArray(block['assignees']) || !block['assignees'].every(entry => typeof entry === 'string')) return false
  }
  const cc = candidate['cc']
  if (cc !== undefined) {
    if (typeof cc !== 'object' || cc === null) return false
    const block = cc as Record<string, unknown>
    if (!Array.isArray(block['assignees']) || !block['assignees'].every(entry => typeof entry === 'string')) return false
  }
  const condition = candidate['condition']
  if (condition !== undefined) {
    if (typeof condition !== 'object' || condition === null) return false
    const block = condition as Record<string, unknown>
    if (block['join'] !== 'and' && block['join'] !== 'or') return false
    if (!Array.isArray(block['rows'])) return false
    for (const row of block['rows']) {
      if (typeof row !== 'object' || row === null) return false
      const entries = row as Record<string, unknown>
      if (typeof entries['field'] !== 'string' || typeof entries['op'] !== 'string' || typeof entries['value'] !== 'string') return false
    }
  }
  return true
}

/** The persisted graph document (the json column wfl_flow_configs.graph). */
export interface GraphDoc {
  version: number
  nodes: Array<{ id: string; type: NodeKind; position: { x: number; y: number }; data: NodePayload }>
  edges: Array<{ id: string; source: string; target: string }>
  viewport?: { x: number; y: number; zoom: number }
}

/** GET /designer/meta — the option lists the property panel selects feed on. */
export interface DesignerMetaDocType {
  doc_type: string
  title: string
  graph_version: number
  has_graph: boolean
  published_graph_version?: number | null
  published_at?: string | null
}

export interface DesignerMeta {
  docTypes: DesignerMetaDocType[]
  users: Array<{ value: string; label: string }>
  roles: Array<{ value: string; label: string }>
  departments: Array<{ value: string; label: string }>
  /** Editable field names across the doc-type collections — the formField AutoComplete vocabulary. */
  formFields: string[]
}

export const defaultPayload = (kind: NodeKind): NodePayload => {
  const titles: Record<NodeKind, string> = { start: '发起人', approval: '审批节点', cc: '抄送节点', condition: '条件分支', end: '结束' }
  const base: NodePayload = { title: titles[kind] }
  if (kind === 'approval') {
    base.approval = { assigneeType: 'user', assignees: [], mode: 'or', emptyPolicy: 'autoPass' }
  } else if (kind === 'cc') {
    base.cc = { assignees: [] }
  } else if (kind === 'condition') {
    base.condition = { join: 'and', rows: [{ field: '', op: '>=', value: '' }] }
  }
  return base
}

/** The one-line summary a node card renders under its title. */
export const payloadSummary = (data: NodePayload): string => {
  if (data.approval !== undefined) {
    const typeLabel = ASSIGNEE_TYPES.find(entry => entry.value === data.approval?.assigneeType)?.label ?? data.approval.assigneeType
    const who = data.approval.assignees.length > 0 ? data.approval.assignees.join('、') : '（未配置）'
    return `${typeLabel}：${who}`
  }
  if (data.cc !== undefined) return data.cc.assignees.length > 0 ? data.cc.assignees.join('、') : '（未配置）'
  if (data.condition !== undefined) {
    const count = data.condition.rows.filter(row => row.field !== '').length
    return `${data.condition.join === 'and' ? '全部满足' : '任一满足'} · ${String(count)} 条`
  }
  return ''
}
