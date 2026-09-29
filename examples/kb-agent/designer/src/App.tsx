import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type IsValidConnection,
} from '@xyflow/react'
import { App as AntApp, Button, Select, Space, Tag, Typography } from 'antd'
import type { JSX } from 'react'
import { fetchGraph, fetchMeta, publishGraph, saveGraph } from './api'
import { DesignerNodeCard, PaletteRail, type DesignerNode } from './nodes'
import { PropsPanel } from './props-panel'
import { GRAPH_VERSION, defaultPayload, type DesignerMeta, type GraphDoc, type NodeKind, type NodePayload } from './types'

let nodeSeq = 1
const mintId = (kind: NodeKind): string => `n_${kind}_${String(nodeSeq++)}_${Date.now().toString(36).slice(-4)}`

/**
 * The W5-B0 designer shell: palette rail → React Flow canvas → antd property
 * drawer, with a top bar driving the doc-type select plus save/load against
 * approval-engine's /flow-graph (wfl_flow_configs.graph, json column).
 */
export function DesignerApp(): JSX.Element {
  const { message, modal } = AntApp.useApp()
  const { screenToFlowPosition } = useReactFlow()
  const [meta, setMeta] = useState<DesignerMeta | null>(null)
  const [docType, setDocType] = useState<string | null>(null)
  const [flowTitle, setFlowTitle] = useState('')
  const [graphVersion, setGraphVersion] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  // W5-B1 发布链路：发布态与在途锁（发布 = 门禁校验 + 单向编译派生引擎行表）。
  const [publishing, setPublishing] = useState(false)
  const publishingRef = useRef(false)
  const publishedMeta = meta?.docTypes.find(entry => entry.doc_type === docType) ?? null
  const publishedVersion = publishedMeta?.published_graph_version ?? null
  const publishedAt = publishedMeta?.published_at ?? null
  const isPublished = !dirty && publishedVersion !== null && publishedVersion === graphVersion
  // W5-R1：在途保存的取消源（切流/重载时 abort），以及最新 docType 的同步镜像
  //（保存响应回来时若画布已换流，状态不再回写——B 的版本号不被 A 的保存污染）。
  const saveAbortRef = useRef<AbortController | null>(null)
  const docTypeRef = useRef<string | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<DesignerNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    fetchMeta()
      .then((loaded) => {
        setMeta(loaded)
        const fromUrl = new URLSearchParams(window.location.search).get('doc_type')
        const first = loaded.docTypes[0] as { doc_type: string } | undefined
        const initial = fromUrl !== null && loaded.docTypes.some(entry => entry.doc_type === fromUrl)
          ? fromUrl
          : first?.doc_type ?? null
        if (initial !== null) setDocType(initial)
      })
      .catch((error: unknown) => { void message.error(`加载元数据失败：${String(error)}`) })
  }, [message])

  useEffect(() => { docTypeRef.current = docType }, [docType])

  const loadFlow = useCallback(async (target: string) => {
    // W5-R1：切流/重载先取消在途保存——旧保存的响应既不该弹 toast 也不该回写新画布。
    saveAbortRef.current?.abort()
    saveAbortRef.current = null
    try {
      const { graph, graph_version } = await fetchGraph(target)
      setGraphVersion(graph_version)
      const entry = meta?.docTypes.find(row => row.doc_type === target)
      setFlowTitle(entry?.title ?? target)
      if (graph === null) {
        setNodes([])
        setEdges([])
      } else {
        const maxSeq = graph.nodes.reduce((max, node) => {
          const match = /_(\d+)(?:_[0-9a-z]+)?$/.exec(node.id)
          return match === null ? max : Math.max(max, Number(match[1]))
        }, 0)
        nodeSeq = maxSeq + 1
        setNodes(graph.nodes.map(node => ({
          id: node.id,
          type: 'designer',
          position: node.position,
          data: { kind: node.type, payload: node.data },
        })))
        setEdges(graph.edges.map(edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          markerEnd: { type: MarkerType.ArrowClosed },
        })))
      }
      setDirty(false)
      setSelectedId(null)
    } catch (error) {
      void message.error(`加载流程失败：${String(error)}`)
    }
  }, [meta, message, setEdges, setNodes])

  useEffect(() => {
    if (docType !== null) void loadFlow(docType)
  }, [docType, loadFlow])

  // W5-R1：选择器变化同步回 URL ?doc_type=——刷新/分享后仍落在当前流。
  useEffect(() => {
    if (docType === null) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('doc_type') === docType) return
    params.set('doc_type', docType)
    window.history.replaceState(null, '', `?${params.toString()}`)
  }, [docType])

  const selected = useMemo(() => nodes.find(node => node.id === selectedId) ?? null, [nodes, selectedId])

  const onConnect = useCallback((connection: Connection): void => {
    setEdges(current => addEdge({ ...connection, markerEnd: { type: MarkerType.ArrowClosed } }, current))
    setDirty(true)
  }, [setEdges])

  /** Reject self-loops and duplicate edges at drag time (structural checks ride the server on save). */
  const isValidConnection: IsValidConnection = useCallback((connection) => {
    if (connection.source === connection.target) return false
    return !edges.some(edge =>
      edge.source === connection.source && edge.target === connection.target
      && (edge.sourceHandle ?? null) === (connection.sourceHandle ?? null)
      && (edge.targetHandle ?? null) === (connection.targetHandle ?? null))
  }, [edges])

  const onDrop = useCallback((event: React.DragEvent): void => {
    event.preventDefault()
    const raw = event.dataTransfer.getData('application/designer-node')
    if (raw === '') return
    if (!RECOGNIZED_KINDS.includes(raw)) return
    const kind = raw as NodeKind
    // xyflow 12's screenToFlowPosition subtracts the pane bounds itself — pass
    // raw client coordinates; pre-subtracting shifts every drop by the offset.
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const id = mintId(kind)
    setNodes(current => [...current, { id, type: 'designer', position, data: { kind, payload: defaultPayload(kind) }, selected: true }])
    setSelectedId(id)
    setDirty(true)
  }, [screenToFlowPosition, setNodes])

  const mutateSelected = useCallback((mutate: (draft: NodePayload) => void) => {
    if (selectedId === null) return
    setNodes(current => current.map((node) => {
      if (node.id !== selectedId) return node
      const draft = structuredClone(node.data.payload as NodePayload)
      mutate(draft)
      return { ...node, data: { ...node.data, payload: draft } }
    }))
    setDirty(true)
  }, [selectedId, setNodes])

  /**
   * Persist the canvas; returns the landed graph_version (null = rejected,
   * aborted, or already in flight) — publish chains onto the saved version.
   */
  const persistGraph = useCallback(async (): Promise<number | null> => {
    if (docType === null || savingRef.current) return null
    savingRef.current = true
    setSaving(true)
    const controller = new AbortController()
    saveAbortRef.current?.abort()
    saveAbortRef.current = controller
    const graph: GraphDoc = {
      version: GRAPH_VERSION,
      nodes: nodes.map(node => ({
        id: node.id,
        type: (node.data.kind as NodeKind),
        // Negative coordinates would crop the node off the canvas — clamp at
        // the persistence gate (the server additionally rejects them raw).
        position: { x: Math.max(0, Math.round(node.position.x)), y: Math.max(0, Math.round(node.position.y)) },
        data: structuredClone(node.data.payload as NodePayload),
      })),
      edges: edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target })),
    }
    try {
      const { graph_version } = await saveGraph(docType, graph, graphVersion, controller.signal)
      if (docTypeRef.current !== docType) return graph_version
      setGraphVersion(graph_version)
      setDirty(false)
      void message.success(`已保存：${docType} graph v${String(graph_version)}（编辑态落库——点「发布」编译派生引擎行表）`)
      return graph_version
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // 切流/重载主动取消：不是失败，不弹 toast——画布已由 loadFlow 接管。
        return null
      }
      void message.error(`保存被拒：${error instanceof Error ? error.message : String(error)}`)
      return null
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [docType, edges, graphVersion, message, nodes])

  /**
   * W5-B1 发布链路：门禁校验 + 单向编译派生引擎行表。未保存的修改先落库
   * （发布走同一 CAS 计数器——并发保存/发布同刻恰好一胜一败）；成功弹派生
   * 统计（N 状态 M 转移），失败逐条列出可读错误，409 提示重载。
   */
  const publishFlow = useCallback(async (): Promise<void> => {
    if (docType === null || publishingRef.current) return
    publishingRef.current = true
    setPublishing(true)
    try {
      let baseVersion = graphVersion
      if (dirty) {
        const savedVersion = await persistGraph()
        if (savedVersion === null) return
        baseVersion = savedVersion
      }
      if (docTypeRef.current !== docType) return
      const result = await publishGraph(docType, baseVersion)
      if (docTypeRef.current !== docType) return
      if (result.ok) {
        setGraphVersion(result.graph_version ?? baseVersion + 1)
        const derived = result.derived
        const rolesText = derived === undefined || derived.roles.length === 0 ? '—' : derived.roles.join('、')
        modal.success({
          title: `发布成功：${docType} graph v${String(result.graph_version ?? baseVersion + 1)}`,
          content: `已单向编译派生 ${String(derived?.states ?? '?')} 个状态 / ${String(derived?.transitions ?? '?')} 条转移（${derived?.vocabulary === 'admission' ? '准入四态' : '单据六态'}，审批角色：${rolesText}）。发布时间 ${result.published_at ?? ''}，引擎即刻按新行表流转。`,
          okText: '知道了',
        })
        const refreshed = await fetchMeta()
        if (docTypeRef.current === docType) setMeta(refreshed)
        return
      }
      if (result.status === 409) {
        void message.error(result.error ?? '版本冲突：他端已保存/发布过，请点「重新加载」拉取最新版本后再发布')
        return
      }
      const errors = result.errors ?? [result.error ?? `HTTP ${String(result.status)}`]
      modal.error({
        title: `发布被拒（门禁未通过 ${String(errors.length)} 处）`,
        width: 560,
        content: (
          <ul style={{ paddingLeft: 18, margin: 0, maxHeight: 320, overflowY: 'auto' }}>
            {errors.map((entry, index) => (
              <li key={index} style={{ marginBottom: 4 }}>{entry}</li>
            ))}
          </ul>
        ),
        okText: '知道了',
      })
    } catch (error) {
      void message.error(`发布请求失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      publishingRef.current = false
      setPublishing(false)
    }
  }, [dirty, docType, graphVersion, message, modal, persistGraph])

  /** Dirty doc-type switches offer three ways out: discard, save-then-switch, or cancel. */
  const onDocTypeChange = (value: string): void => {
    if (!dirty || value === docType) {
      setDocType(value)
      return
    }
    let instance: { destroy: () => void } | null = null
    instance = modal.confirm({
      title: '当前画布有未保存的修改',
      content: `切换到 ${value} 会加载新流程，当前未保存的修改将丢失。`,
      footer: () => (
        <Space>
          <Button
            danger
            data-testid="switch-discard"
            onClick={() => { if (instance !== null) instance.destroy(); setDocType(value) }}
          >
            放弃修改并切换
          </Button>
          <Button
            type="primary"
            loading={saving}
            data-testid="switch-save"
            onClick={() => {
              void persistGraph().then((version) => {
                if (version === null) return
                if (instance !== null) instance.destroy()
                setDocType(value)
              })
            }}
          >
            保存并切换
          </Button>
          <Button data-testid="switch-cancel" onClick={() => { if (instance !== null) instance.destroy() }}>取消</Button>
        </Space>
      ),
    })
  }

  return (
    <div className="designer-shell">
      <header className="designer-topbar" data-testid="designer-topbar">
        <Typography.Title level={5} style={{ margin: 0 }}>审批流设计器</Typography.Title>
        <Select
          style={{ width: 260 }}
          placeholder="选择单据类型"
          value={docType}
          showSearch
          optionFilterProp="label"
          options={(meta?.docTypes ?? []).map(entry => ({ value: entry.doc_type, label: `${entry.doc_type}（${entry.title}）` }))}
          onChange={(value) => { onDocTypeChange(value) }}
          data-testid="doc-type-select"
        />
        <span className="topbar-title">{flowTitle}</span>
        <Tag data-testid="graph-version">graph v{String(graphVersion)}{dirty ? ' · 未保存' : ''}</Tag>
        {isPublished
          ? <Tag color="green" data-testid="published-tag">已发布 v{String(publishedVersion)} · {publishedAt === null ? '' : publishedAt.slice(0, 16).replace('T', ' ')}</Tag>
          : <Tag color="orange" data-testid="published-tag">{publishedVersion === null ? '未发布' : `未发布（v${String(publishedVersion)} 之后有改动）`}</Tag>}
        <div style={{ flex: 1 }} />
        <Button data-testid="btn-reload" onClick={() => { if (docType !== null) void loadFlow(docType) }}>重新加载</Button>
        <Button data-testid="btn-save" loading={saving} onClick={() => { void persistGraph() }} disabled={docType === null}>保存</Button>
        <Button type="primary" ghost data-testid="btn-publish" loading={publishing} onClick={() => { void publishFlow() }} disabled={docType === null}>发布</Button>
      </header>
      <div className="designer-body">
        <PaletteRail />
        <div className="canvas-wrap" data-testid="canvas-wrap">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={(changes) => {
              onNodesChange(changes)
              if (changes.some(change => change.type !== 'select' && change.type !== 'dimensions')) setDirty(true)
            }}
            onEdgesChange={(changes) => {
              onEdgesChange(changes)
              if (changes.some(change => change.type !== 'select')) setDirty(true)
            }}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onDrop={onDrop}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }}
            onNodeClick={(_, node) => { setSelectedId(node.id) }}
            onPaneClick={() => { setSelectedId(null) }}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
      </div>
      <PropsPanel
        open={selected !== null}
        payload={selected === null ? null : selected.data.payload as NodePayload}
        kind={selected === null ? null : String(selected.data.kind)}
        nodeId={selected?.id ?? null}
        meta={meta}
        onClose={() => { setSelectedId(null) }}
        onChange={mutateSelected}
      />
    </div>
  )
}

const RECOGNIZED_KINDS: ReadonlyArray<string> = ['start', 'approval', 'cc', 'condition', 'end']
const NODE_TYPES = { designer: DesignerNodeCard }
