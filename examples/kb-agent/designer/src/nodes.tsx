import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { Node } from '@xyflow/react'
import { Alert } from 'antd'
import type { JSX } from 'react'
import { NODE_KINDS, isNodePayload, payloadSummary } from './types'

export type DesignerNode = Node<Record<string, unknown>, 'designer'>

/** One draggable palette entry in the left rail (HTML5 drag → canvas onDrop). */
export function PaletteItem(props: { kind: string; label: string; hint: string; color: string }): JSX.Element {
  return (
    <div
      className="palette-item"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('application/designer-node', props.kind)
        event.dataTransfer.effectAllowed = 'move'
      }}
      style={{ borderLeft: `3px solid ${props.color}` }}
      data-node-kind={props.kind}
    >
      <div className="palette-label">{props.label}</div>
      <div className="palette-hint">{props.hint}</div>
    </div>
  )
}

export function PaletteRail(): JSX.Element {
  return (
    <aside className="palette-rail" data-testid="palette-rail">
      <div className="palette-title">节点面板（拖入画布）</div>
      {NODE_KINDS.map(entry => <PaletteItem key={entry.kind} {...entry} />)}
      <div className="palette-foot">连线：从节点右侧圆点拖到目标左侧圆点；选中节点后右侧配置属性；Delete 键删除选中。</div>
    </aside>
  )
}

/**
 * The canvas node card — a plain antd-toned card with left/right handles.
 * Persisted graphs whose node kinds or payloads fail the structural check
 * degrade to this gray card (never a render-time throw), so a shape-illegal
 * row still loads as a visible, selectable, deletable node.
 */
export function DesignerNodeCard(props: NodeProps<DesignerNode>): JSX.Element {
  const { data, selected } = props
  const kind = String(data.kind)
  const known = NODE_KINDS.some(entry => entry.kind === kind)
  if (!known || !isNodePayload(data.payload)) {
    return (
      <div className={`flow-node kind-unknown ${selected ? 'selected' : ''}`} data-node-kind="unknown" data-testid="node-unknown">
        <Handle type="target" position={Position.Left} aria-label="连线入口（左）" />
        <Alert
          type="warning"
          showIcon
          message="未知节点"
          description="保存的节点类型或数据形状非法；可删除后重新拖入。"
        />
        <Handle type="source" position={Position.Right} aria-label="连线出口（右）" />
      </div>
    )
  }
  const payload = data.payload
  const meta = NODE_KINDS.find(entry => entry.kind === kind)
  const summary = payloadSummary(payload)
  return (
    <div
      className={`flow-node kind-${kind} ${selected ? 'selected' : ''}`}
      data-node-kind={kind}
      style={{ borderColor: meta?.color ?? '#6b7280' }}
    >
      <Handle type="target" position={Position.Left} aria-label="连线入口（左）" />
      <div className="flow-node-kind" style={{ color: meta?.color ?? '#6b7280' }}>{meta?.label ?? kind}</div>
      <div className="flow-node-title">{payload.title}</div>
      {summary !== '' && <div className="flow-node-summary">{summary}</div>}
      <Handle type="source" position={Position.Right} aria-label="连线出口（右）" />
    </div>
  )
}
