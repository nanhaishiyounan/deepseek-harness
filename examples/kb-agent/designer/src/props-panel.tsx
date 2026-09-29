import { App as AntApp, AutoComplete, Button, Drawer, Form, Input, InputNumber, Radio, Select, Space } from 'antd'
import type { RadioChangeEvent } from 'antd'
import type { JSX } from 'react'
import { ASSIGNEE_TYPES, CONDITION_OPS, EMPTY_POLICIES, MULTI_MODES, NODE_TITLE_MAX, RUNTIME_ASSIGNEE_TYPES, titleFault, type DesignerMeta, type NodePayload } from './types'

/** One selectable earlier approval node (the rejectTo target list). */
export interface ApprovalNodeOption {
  readonly id: string
  readonly title: string
}

/** The right-side property panel's props — every change writes straight back through onChange. */
interface PropsPanelProps {
  open: boolean
  payload: NodePayload | null
  kind: string | null
  nodeId: string | null
  meta: DesignerMeta | null
  /** The canvas's other approval nodes (the rejectTo target list). */
  approvalNodes: ReadonlyArray<ApprovalNodeOption>
  onClose: () => void
  onChange: (mutate: (draft: NodePayload) => void) => void
}

/**
 * The right-side property panel — a pure antd5 form (inputs, selects, radios;
 * no JSON editing). Every change writes straight back into the node payload
 * through onChange, so the canvas card summary stays live.
 */
export function PropsPanel(props: PropsPanelProps): JSX.Element {
  const { message } = AntApp.useApp()
  const { open, payload, kind, nodeId, meta, approvalNodes, onClose, onChange } = props
  if (payload === null || kind === null) {
    return <Drawer open={open} onClose={onClose} title="节点属性" width={380} data-testid="props-panel-empty">未选中节点</Drawer>
  }

  const assigneeOptions = (): Array<{ value: string; label: string }> => {
    const list = meta ?? { docTypes: [], users: [], roles: [], departments: [], formFields: [], userFields: [] }
    switch (payload.approval?.assigneeType) {
      case 'role': return list.roles
      case 'department': return list.departments
      case 'user': default: return list.users
    }
  }

  const onAssigneeType = (event: RadioChangeEvent): void => {
    onChange((draft) => {
      if (draft.approval === undefined) return
      draft.approval.assigneeType = String(event.target.value)
      // The selector vocabulary changes with the type — stale values would
      // dangle; runtime-resolved types carry no static assignees at all.
      draft.approval.assignees = []
      draft.approval.levels = undefined
      if (draft.approval.emptyPolicy !== 'assignUser') draft.approval.emptyAssignee = undefined
    })
  }

  const addConditionRow = (): void => {
    onChange((draft) => {
      if (draft.condition === undefined) return
      draft.condition.rows.push({ field: '', op: '>=', value: '' })
    })
  }

  const removeConditionRow = (index: number): void => {
    onChange((draft) => {
      if (draft.condition === undefined) return
      draft.condition.rows.splice(index, 1)
      if (draft.condition.rows.length === 0) draft.condition.rows.push({ field: '', op: '>=', value: '' })
    })
  }

  const mutateConditionRow = (index: number, patch: (row: { field: string; op: string; value: string }) => void): void => {
    onChange((draft) => {
      if (draft.condition === undefined) return
      draft.condition.rows = draft.condition.rows.map((row, rowIndex) => {
        if (rowIndex !== index) return row
        const next = { field: row.field, op: row.op, value: row.value }
        patch(next)
        return next
      })
    })
  }

  const assigneeType = payload.approval?.assigneeType ?? 'user'
  const runtimeResolved = RUNTIME_ASSIGNEE_TYPES.has(assigneeType)
  const assigneeLabel = assigneeType === 'formField'
    ? '审批人（表单联系人字段）'
    : '审批人（可多选）'

  return (
    <Drawer open={open} onClose={onClose} width={400} title={`节点属性 · ${payload.title}`} data-testid="props-panel">
      <Form layout="vertical" data-node-id={nodeId ?? undefined}>
        <Form.Item label="节点名称（最长 64 字符，不允许 < > 与纯空白）" required>
          <Input
            value={payload.title}
            maxLength={NODE_TITLE_MAX}
            data-testid="prop-title"
            onChange={(event) => {
              // 输入即 trim 写回：首尾空白（含全角空格/tab）进不了画布与库。
              const next = event.target.value.trim()
              const fault = titleFault(next)
              if (fault !== null) {
                void message.warning(fault)
                // Re-write the current title so the rerender pulls the DOM
                // input back to the rejected-free value (controlled inputs
                // otherwise keep the typed text until the next state change).
                onChange((draft) => { draft.title = payload.title })
                return
              }
              onChange((draft) => { draft.title = next })
            }}
          />
        </Form.Item>

        {kind === 'approval' && payload.approval !== undefined && (
          <>
            <Form.Item label="审批人类型">
              <Radio.Group value={payload.approval.assigneeType} onChange={onAssigneeType} data-testid="prop-assignee-type">
                {ASSIGNEE_TYPES.map(entry => <Radio.Button key={entry.value} value={entry.value}>{entry.label}</Radio.Button>)}
              </Radio.Group>
            </Form.Item>
            {assigneeType === 'deptLeader' && (
              <Form.Item label="审批人">
                <div className="panel-hint" data-testid="prop-runtime-hint">
                  提交人所在部门的主管（运行时按提交人解析；部门主管在「组织架构 → 部门成员」中勾选负责人）。审批人为空时按下方空策略处理。
                </div>
              </Form.Item>
            )}
            {assigneeType === 'supervisorChain' && (
              <Form.Item label="主管链级数（1..10）">
                <InputNumber
                  min={1}
                  max={10}
                  precision={0}
                  value={payload.approval.levels ?? 1}
                  data-testid="prop-levels"
                  onChange={(value) => {
                    onChange((draft) => {
                      if (draft.approval === undefined) return
                      draft.approval.levels = value === null ? 1 : Math.round(value)
                    })
                  }}
                />
                <div className="panel-hint">从提交人所在部门起，逐级向上取部门主管，依次作为本节点审批人（每级取该部门「负责人」）。</div>
              </Form.Item>
            )}
            {assigneeType === 'formField' && (
              <Form.Item label={assigneeLabel}>
                <AutoComplete
                  allowClear
                  placeholder="选择或输入人员字段（如 owner）"
                  options={(meta?.userFields ?? []).map(field => ({ value: field }))}
                  value={payload.approval.assignees[0]}
                  data-testid="prop-assignees"
                  onChange={(value) => {
                    onChange((draft) => {
                      if (draft.approval === undefined) return
                      draft.approval.assignees = value === '' ? [] : [value]
                    })
                  }}
                />
                <div className="panel-hint">需为关联用户的字段（经办人/负责人）；发布校验字段在单据内且为人员类型。</div>
              </Form.Item>
            )}
            {!runtimeResolved && assigneeType !== 'formField' && (
              <Form.Item label={assigneeLabel}>
                <Select
                  mode="multiple"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={assigneeOptions()}
                  value={payload.approval.assignees}
                  data-testid="prop-assignees"
                  onChange={(value) => {
                    onChange((draft) => {
                      if (draft.approval === undefined) return
                      draft.approval.assignees = value.slice()
                    })
                  }}
                />
              </Form.Item>
            )}
            {payload.approval.emptyPolicy === 'assignUser' && (
              <Form.Item label="空审批人时指定回退审批人">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={meta?.users ?? []}
                  value={payload.approval.emptyAssignee}
                  data-testid="prop-empty-assignee"
                  onChange={(value: string | undefined) => {
                    onChange((draft) => {
                      if (draft.approval === undefined) return
                      draft.approval.emptyAssignee = value === undefined ? undefined : value
                    })
                  }}
                />
              </Form.Item>
            )}
            {approvalNodes.length > 0 && (
              <Form.Item label="驳回回退（可选）">
                <Select
                  allowClear
                  placeholder="默认：驳回到「已驳回」由提交人修改后重提"
                  options={approvalNodes.map(node => ({ value: node.id, label: node.title }))}
                  value={payload.approval.rejectTo === '' ? undefined : payload.approval.rejectTo}
                  data-testid="prop-reject-to"
                  onChange={(value: string | undefined) => {
                    onChange((draft) => {
                      if (draft.approval === undefined) return
                      draft.approval.rejectTo = value === undefined ? undefined : value
                    })
                  }}
                />
                <div className="panel-hint">配置后本节点拒绝时单据退回所选更早的审批节点重审（仅二级审批可回退一级）。</div>
              </Form.Item>
            )}
            <Form.Item label="多人审批方式">
              <Radio.Group
                value={payload.approval.mode}
                optionType="button"
                buttonStyle="solid"
                data-testid="prop-mode"
                onChange={(event) => {
                  onChange((draft) => { if (draft.approval !== undefined) draft.approval.mode = String(event.target.value) })
                }}
              >
                {MULTI_MODES.map(entry => <Radio.Button key={entry.value} value={entry.value}>{entry.label}</Radio.Button>)}
              </Radio.Group>
            </Form.Item>
            <Form.Item label="审批人为空时">
              <Radio.Group
                value={payload.approval.emptyPolicy}
                data-testid="prop-empty-policy"
                onChange={(event) => {
                  onChange((draft) => { if (draft.approval !== undefined) draft.approval.emptyPolicy = String(event.target.value) })
                }}
              >
                {EMPTY_POLICIES.map(entry => <Radio key={entry.value} value={entry.value}>{entry.label}</Radio>)}
              </Radio.Group>
            </Form.Item>
          </>
        )}

        {kind === 'cc' && payload.cc !== undefined && (
          <Form.Item label="抄送人（可多选）">
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              options={meta?.users ?? []}
              value={payload.cc.assignees}
              data-testid="prop-cc-assignees"
              onChange={(value) => {
                onChange((draft) => { if (draft.cc !== undefined) draft.cc.assignees = value.slice() })
              }}
            />
          </Form.Item>
        )}

        {kind === 'condition' && payload.condition !== undefined && (
          <>
            <Form.Item label="条件关系">
              <Radio.Group
                value={payload.condition.join}
                optionType="button"
                buttonStyle="solid"
                data-testid="prop-join"
                onChange={(event) => {
                  onChange((draft) => { if (draft.condition !== undefined) draft.condition.join = event.target.value as 'and' | 'or' })
                }}
              >
                <Radio.Button value="and">全部满足（且）</Radio.Button>
                <Radio.Button value="or">任一满足（或）</Radio.Button>
              </Radio.Group>
            </Form.Item>
            {payload.condition.rows.map((row, index) => (
              <div className="condition-row" key={index} data-testid="prop-condition-row">
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    placeholder="字段（如 amount）"
                    style={{ flex: 2 }}
                    value={row.field}
                    onChange={(event) => { mutateConditionRow(index, (target) => { target.field = event.target.value }) }}
                  />
                  <Select
                    placeholder="操作符"
                    style={{ width: 96 }}
                    value={row.op}
                    options={CONDITION_OPS.map(op => ({ value: op, label: op }))}
                    onChange={(value) => { mutateConditionRow(index, (target) => { target.op = value }) }}
                  />
                  <Input
                    placeholder="值"
                    style={{ flex: 2 }}
                    value={row.value}
                    onChange={(event) => { mutateConditionRow(index, (target) => { target.value = event.target.value }) }}
                  />
                </Space.Compact>
                <Button size="small" danger type="text" onClick={() => { removeConditionRow(index) }}>删除</Button>
              </div>
            ))}
            <Button type="dashed" block onClick={addConditionRow} data-testid="prop-add-condition">+ 添加条件行</Button>
          </>
        )}

        {kind === 'start' && <div className="panel-hint">开始节点：单据提交入口。「保存」落编辑态，「发布」编译派生引擎行表即刻生效。</div>}
        {kind === 'end' && <div className="panel-hint">结束节点：流程终点。</div>}
      </Form>
    </Drawer>
  )
}
