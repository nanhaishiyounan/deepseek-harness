import { App as AntApp, AutoComplete, Button, Drawer, Form, Input, Radio, Select, Space } from 'antd'
import type { RadioChangeEvent } from 'antd'
import type { JSX } from 'react'
import { ASSIGNEE_TYPES, CONDITION_OPS, EMPTY_POLICIES, MULTI_MODES, NODE_TITLE_MAX, titleFault, type DesignerMeta, type NodePayload } from './types'

/** The right-side property panel's props — every change writes straight back through onChange. */
interface PropsPanelProps {
  open: boolean
  payload: NodePayload | null
  kind: string | null
  nodeId: string | null
  meta: DesignerMeta | null
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
  const { open, payload, kind, nodeId, meta, onClose, onChange } = props
  if (payload === null || kind === null) {
    return <Drawer open={open} onClose={onClose} title="节点属性" width={380} data-testid="props-panel-empty">未选中节点</Drawer>
  }

  const assigneeOptions = (): Array<{ value: string; label: string }> => {
    const list = meta ?? { docTypes: [], users: [], roles: [], departments: [], formFields: [] }
    switch (payload.approval?.assigneeType) {
      case 'role': return list.roles
      case 'deptLeader': return list.departments
      case 'user': default: return list.users
    }
  }

  const onAssigneeType = (event: RadioChangeEvent): void => {
    onChange((draft) => {
      if (draft.approval === undefined) return
      draft.approval.assigneeType = String(event.target.value)
      // The selector vocabulary changes with the type — stale values would dangle.
      draft.approval.assignees = []
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
  const singleValue = assigneeType === 'supervisorChain' || assigneeType === 'formField'
  const assigneeLabel = assigneeType === 'supervisorChain'
    ? '审批人（主管链起点角色）'
    : assigneeType === 'formField'
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
            <Form.Item label={assigneeLabel}>
              {assigneeType === 'supervisorChain' && (
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="选择主管链起点角色"
                  options={meta?.roles ?? []}
                  value={payload.approval.assignees[0]}
                  data-testid="prop-assignees"
                  onChange={(value: string | undefined) => {
                    onChange((draft) => {
                      if (draft.approval === undefined) return
                      draft.approval.assignees = value === undefined ? [] : [value]
                    })
                  }}
                />
              )}
              {assigneeType === 'formField' && (
                <AutoComplete
                  allowClear
                  placeholder="输入表单联系人字段路径（可自由输入）"
                  options={(meta?.formFields ?? []).map(field => ({ value: field }))}
                  value={payload.approval.assignees[0]}
                  data-testid="prop-assignees"
                  onChange={(value) => {
                    onChange((draft) => {
                      if (draft.approval === undefined) return
                      draft.approval.assignees = value === '' ? [] : [value]
                    })
                  }}
                />
              )}
              {!singleValue && (
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
              )}
            </Form.Item>
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

        {kind === 'start' && <div className="panel-hint">开始节点：单据提交入口。引擎按现有 states/transitions 行执行；发布编译在 B1 批次接入。</div>}
        {kind === 'end' && <div className="panel-hint">结束节点：流程终点。</div>}
      </Form>
    </Drawer>
  )
}
