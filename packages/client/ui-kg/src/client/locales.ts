/**
 * The graph page's copy, Chinese-first with an English mirror. Business
 * language only: entities, relations, provenance — never registry ids,
 * relation enums, or wire codes (rows show human-facing labels).
 * @module @deepseek-ai/dsh-client-ui-kg/client/locales
 */

/** The graph page dictionary's keys. */
export type KgKey =
  | 'view.kg'
  | 'entry.label'
  | 'entry.entitiesBadge'
  | 'page.title'
  | 'page.tagline'
  | 'search.placeholder'
  | 'search.action'
  | 'search.emptyTitle'
  | 'search.emptyHint'
  | 'search.noHits'
  | 'phrase.placeholder'
  | 'phrase.action'
  | 'phrase.unsupported'
  | 'phrase.examples'
  | 'phrase.restate.supply'
  | 'phrase.restate.orders'
  | 'phrase.restate.contains'
  | 'phrase.restate.input-suppliers'
  | 'phrase.restate.batch-flow'
  | 'phrase.restate.suppliers'
  | 'phrase.restate.customers'
  | 'phrase.restate.made-from'
  | 'kg.freshness'
  | 'kg.freshnessUnknown'
  | 'phrase.traceExamples'
  | 'canvas.title'
  | 'canvas.loading'
  | 'canvas.emptyTitle'
  | 'canvas.emptyHint'
  | 'canvas.truncated'
  | 'canvas.degradedTitle'
  | 'canvas.degradedHint'
  | 'canvas.expandHint'
  | 'canvas.zoomIn'
  | 'canvas.zoomOut'
  | 'canvas.reset'
  | 'legend.title'
  | 'legend.all'
  | 'legend.groupOntology'
  | 'legend.groupBusiness'
  | 'legend.filterHint'
  | 'legend.loading'
  | 'details.title'
  | 'details.type'
  | 'details.degree'
  | 'details.provenance'
  | 'details.naturalKey'
  | 'details.ask'
  | 'details.expand'
  | 'details.selectHint'
  | 'quality.title'
  | 'quality.nodes'
  | 'quality.edges'
  | 'quality.islands'
  | 'quality.conflicts'
  | 'quality.coverage'
  | 'quality.lastRun'
  | 'quality.mappingsTitle'
  | 'quality.mappingPending'
  | 'quality.mappingNodes'
  | 'quality.mappingEdges'
  | 'stats.counters'
  | 'build.unbuiltTitle'
  | 'build.unbuiltHint'
  | 'build.runBuild'
  | 'mode.graph'
  | 'mode.onto'
  | 'mode.feed'
  | 'color.type'
  | 'color.semantic'
  | 'color.community'
  | 'replay.banner'
  | 'replay.back'
  | 'onto.title'
  | 'onto.hint'
  | 'onto.addChild'
  | 'onto.rename'
  | 'onto.move'
  | 'onto.deprecate'
  | 'onto.apply'
  | 'onto.cancel'
  | 'onto.idPlaceholder'
  | 'onto.labelPlaceholder'
  | 'onto.parentPlaceholder'
  | 'onto.replacePlaceholder'
  | 'onto.revisions'
  | 'onto.empty'
  | 'onto.propsCount'
  | 'onto.cardinality'
  | 'feed.title'
  | 'feed.hint'
  | 'feed.refresh'
  | 'feed.reviewTitle'
  | 'feed.reviewHint'
  | 'feed.merge'
  | 'feed.reject'
  | 'feed.skip'
  | 'feed.confidence'
  | 'feed.source.ingest'
  | 'feed.source.ai-edit'
  | 'feed.source.human-edit'
  | 'feed.source.rollback'
  | 'feed.mentions'
  | 'feed.rollback'
  | 'feed.rollbackConfirm'
  | 'feed.replay'
  | 'feed.empty'
  | 'feed.rollbackDone'
  | 'error.unavailable'
  | 'error.retry'

/** Chinese copy (the graph page's primary language). */
export const zh: Record<KgKey, string> = {
  'view.kg': '图谱',
  'entry.label': '图谱',
  'entry.entitiesBadge': '图谱实体数量',
  'page.title': '知识图谱',
  'page.tagline': '企业实体关系一图看清：供应商、客户、商品、订单与合规关联',
  'search.placeholder': '搜索实体名称…',
  'search.action': '搜实体',
  'search.emptyTitle': '输入实体名开始探索',
  'search.emptyHint': '例如：宏发食品、张红喜，或任意客户/商品名',
  'search.noHits': '没有匹配的实体，换个说法试试',
  'phrase.placeholder': '试试自然语言：宏发食品的供货链 / 张红喜供货的所有产品 / 酱油相关的2跳关系',
  'phrase.action': '查子图',
  'phrase.unsupported': '暂不支持这种问法，换个模板试试',
  'phrase.examples': '如：宏发食品的供货链 · 含山梨酸钾的产品 · 张红喜供货的所有产品 · 宏发食品相关的2跳关系',
  'phrase.restate.supply': '「{entity}」周边两跳关系',
  'phrase.restate.orders': '「{entity}」的订单关系',
  'phrase.restate.contains': '含「{entity}」的商品关系',
  'phrase.restate.input-suppliers': '「{entity}」的原料供应商（两跳）',
  'phrase.restate.batch-flow': '「{entity}」批次的客户流向（两跳）',
  'phrase.restate.suppliers': '「{entity}」的供应商（两跳）',
  'phrase.restate.customers': '「{entity}」的客户（两跳）',
  'phrase.restate.made-from': '「{entity}」使用的原料',
  'kg.freshness': '数据截至 {time}',
  'kg.freshnessUnknown': '数据时点未知（未运行过构建）',
  'phrase.traceExamples': '追溯：酱油的原料来自哪些供应商 · 20260911批次流向哪些客户 · 宏发食品的供应商',
  'canvas.title': '关系画布',
  'canvas.loading': '子图绘制中…',
  'canvas.emptyTitle': '画布还是空的',
  'canvas.emptyHint': '搜索一个实体或用上面的短语框，把它的关系画出来',
  'canvas.truncated': '子图较大已截断，缩小范围可看到全部',
  'canvas.degradedTitle': '当前环境不支持图形渲染',
  'canvas.degradedHint': '已切换为关系清单视图，双击展开与详情面板仍然可用',
  'canvas.expandHint': '双击节点展开邻居，单击查看详情',
  'canvas.zoomIn': '放大',
  'canvas.zoomOut': '缩小',
  'canvas.reset': '重置视图（适配全图）',
  'legend.title': '类型图例',
  'legend.all': '全部类型',
  'legend.groupOntology': '通用类型',
  'legend.groupBusiness': '业务数据类型',
  'legend.filterHint': '点选类型可过滤画布',
  'legend.loading': '类型清单加载中…',
  'details.title': '实体详情',
  'details.type': '类型',
  'details.degree': '关联数',
  'details.provenance': '来源',
  'details.naturalKey': '业务键',
  'details.ask': '问此实体',
  'details.expand': '展开邻居',
  'details.selectHint': '点击画布节点查看详情',
  'quality.title': '质量与映射',
  'quality.nodes': '节点',
  'quality.edges': '边',
  'quality.islands': '孤岛节点',
  'quality.conflicts': '冲突事实',
  'quality.coverage': '节点覆盖',
  'quality.lastRun': '上次构建',
  'quality.mappingsTitle': '映射清单',
  'quality.mappingPending': '尚未构建',
  'quality.mappingNodes': '节点',
  'quality.mappingEdges': '边',
  'stats.counters': '实体',
  'build.unbuiltTitle': '图谱还未构建',
  'build.unbuiltHint': '运行 kg-build 管线（业务表结构化映射 + 文档实体抽取）后，这里会呈现企业实体关系',
  'build.runBuild': '查看构建指引',
  'mode.graph': '实例图',
  'mode.onto': '本体树',
  'mode.feed': '变更流',
  'color.type': '按类型',
  'color.semantic': '按本体语义',
  'color.community': '按社区',
  'replay.banner': '历史快照 · {time}（只读）',
  'replay.back': '返回实时图',
  'onto.title': '本体树（KGCL 编辑）',
  'onto.hint': '新增/改名/移动父类/废弃走 KGCL 原语；每次变更写 ontology revision 并在变更流留痕',
  'onto.addChild': '＋子类',
  'onto.rename': '改名',
  'onto.move': '移动',
  'onto.deprecate': '废弃',
  'onto.apply': '应用',
  'onto.cancel': '取消',
  'onto.idPlaceholder': '类 id（字母开头）',
  'onto.labelPlaceholder': '显示名',
  'onto.parentPlaceholder': '选择新父类…',
  'onto.replacePlaceholder': '（可选）替代类…',
  'onto.revisions': '本体变更留痕（ontology revision）',
  'onto.empty': '本体未加载',
  'onto.propsCount': '{n} 个属性',
  'onto.cardinality': '已注册关系：',
  'feed.title': '变更流（episode 时间线）',
  'feed.hint': '每条 episode 记录指令原文、操作者与 diff；可回滚或按时间点回放图状态',
  'feed.refresh': '刷新',
  'feed.reviewTitle': '共指审核队列（0.5–0.9 灰区）',
  'feed.reviewHint': '人工裁决合并/不合并/跳过；裁决作为 episode 留痕，合并走 corefers_with 边',
  'feed.merge': '合并',
  'feed.reject': '不合并',
  'feed.skip': '跳过',
  'feed.confidence': '置信度 ',
  'feed.source.ingest': '构建',
  'feed.source.ai-edit': 'AI',
  'feed.source.human-edit': '人工',
  'feed.source.rollback': '回滚',
  'feed.mentions': '涉及边 ',
  'feed.rollback': '回滚到此之前',
  'feed.rollbackConfirm': '回滚该 episode：其新增边失效、其恢复过的边还原',
  'feed.replay': '回放此时刻',
  'feed.empty': '暂无 episode 记录（构建或编辑后出现）',
  'feed.rollbackDone': '已回滚：{retired} 条边失效、{restored} 条恢复',
  'error.unavailable': '图谱页暂不可用',
  'error.retry': '重试',
}

/** English mirror. */
export const en: Record<KgKey, string> = {
  'view.kg': 'Graph',
  'entry.label': 'Graph',
  'entry.entitiesBadge': 'graph entity count',
  'page.title': 'Knowledge graph',
  'page.tagline': 'Company relations at a glance — suppliers, customers, products, orders, and compliance links',
  'search.placeholder': 'Search entity names…',
  'search.action': 'Find',
  'search.emptyTitle': 'Type an entity name to explore',
  'search.emptyHint': 'e.g. a customer, product, or expert name',
  'search.noHits': 'No matching entity; try another phrasing',
  'phrase.placeholder': 'Try natural language: supply chain around a company / products supplied by an expert',
  'phrase.action': 'Walk',
  'phrase.unsupported': 'This phrasing is not supported yet; try a template',
  'phrase.examples': 'e.g. supply chain of a company · products containing an additive · products supplied by an expert',
  'phrase.restate.supply': 'Two-hop relations around "{entity}"',
  'phrase.restate.orders': 'Order relations of "{entity}"',
  'phrase.restate.contains': 'Products containing "{entity}"',
  'phrase.restate.input-suppliers': 'input suppliers of "{entity}" (2 hops)',
  'phrase.restate.batch-flow': 'customer flow of batch "{entity}" (2 hops)',
  'phrase.restate.suppliers': 'suppliers of "{entity}" (2 hops)',
  'phrase.restate.customers': 'customers of "{entity}" (2 hops)',
  'phrase.restate.made-from': 'inputs used by "{entity}"',
  'kg.freshness': 'Data as of {time}',
  'kg.freshnessUnknown': 'Data freshness unknown (no build run)',
  'phrase.traceExamples': 'Trace: input suppliers of 酱油 · customer flow of batch 20260911 · suppliers of 宏发食品',
  'canvas.title': 'Relation canvas',
  'canvas.loading': 'Drawing the subgraph…',
  'canvas.emptyTitle': 'The canvas is empty',
  'canvas.emptyHint': 'Search an entity or use the phrase box to draw its relations',
  'canvas.truncated': 'Large subgraph truncated; narrow the scope to see everything',
  'canvas.degradedTitle': 'Graphics rendering unavailable here',
  'canvas.degradedHint': 'Switched to the relation list view; double-click expand and the details panel still work',
  'canvas.expandHint': 'Double-click a node to expand neighbors; click for details',
  'canvas.zoomIn': 'Zoom in',
  'canvas.zoomOut': 'Zoom out',
  'canvas.reset': 'Reset view (fit graph)',
  'legend.title': 'Type legend',
  'legend.all': 'All types',
  'legend.groupOntology': 'General types',
  'legend.groupBusiness': 'Business data types',
  'legend.filterHint': 'Pick types to filter the canvas',
  'legend.loading': 'Loading types…',
  'details.title': 'Entity details',
  'details.type': 'Type',
  'details.degree': 'Degree',
  'details.provenance': 'Source',
  'details.naturalKey': 'Business key',
  'details.ask': 'Ask about this',
  'details.expand': 'Expand neighbors',
  'details.selectHint': 'Click a canvas node to inspect it',
  'quality.title': 'Quality & mappings',
  'quality.nodes': 'Nodes',
  'quality.edges': 'Edges',
  'quality.islands': 'Islands',
  'quality.conflicts': 'Conflicts',
  'quality.coverage': 'Coverage',
  'quality.lastRun': 'Last build',
  'quality.mappingsTitle': 'Mapped collections',
  'quality.mappingPending': 'not built yet',
  'quality.mappingNodes': 'nodes',
  'quality.mappingEdges': 'edges',
  'stats.counters': 'entities',
  'build.unbuiltTitle': 'The graph is not built yet',
  'build.unbuiltHint': 'Run the kg-build pipeline (structured business-table mapping + document extraction) and company relations appear here',
  'build.runBuild': 'See the build guide',
  'mode.graph': 'Instance graph',
  'mode.onto': 'Ontology tree',
  'mode.feed': 'Change feed',
  'color.type': 'By type',
  'color.semantic': 'By ontology',
  'color.community': 'By community',
  'replay.banner': 'Historical snapshot · {time} (read-only)',
  'replay.back': 'Back to live graph',
  'onto.title': 'Ontology tree (KGCL editing)',
  'onto.hint': 'Add/rename/re-parent/deprecate ride KGCL primitives; every change journals an ontology revision and an episode',
  'onto.addChild': '+ subclass',
  'onto.rename': 'Rename',
  'onto.move': 'Move',
  'onto.deprecate': 'Deprecate',
  'onto.apply': 'Apply',
  'onto.cancel': 'Cancel',
  'onto.idPlaceholder': 'class id (starts with a letter)',
  'onto.labelPlaceholder': 'Display label',
  'onto.parentPlaceholder': 'Pick a new parent…',
  'onto.replacePlaceholder': '(optional) replaced by…',
  'onto.revisions': 'Ontology change trail (revisions)',
  'onto.empty': 'Ontology not loaded',
  'onto.propsCount': '{n} props',
  'onto.cardinality': 'Registered relations:',
  'feed.title': 'Change feed (episode timeline)',
  'feed.hint': 'Each episode carries the instruction, the operator, and the diff; roll back or replay the graph at its instant',
  'feed.refresh': 'Refresh',
  'feed.reviewTitle': 'Coreference review queue (0.5–0.9 gray zone)',
  'feed.reviewHint': 'Human merge/reject/skip verdicts; every decision lands as an episode, merges ride the corefers_with edge',
  'feed.merge': 'Merge',
  'feed.reject': 'Keep apart',
  'feed.skip': 'Skip',
  'feed.confidence': 'confidence ',
  'feed.source.ingest': 'build',
  'feed.source.ai-edit': 'AI',
  'feed.source.human-edit': 'human',
  'feed.source.rollback': 'rollback',
  'feed.mentions': 'edges touched ',
  'feed.rollback': 'Roll back to before this',
  'feed.rollbackConfirm': 'Rolls the episode back: edges it added retire, edges it restored return',
  'feed.replay': 'Replay at this instant',
  'feed.empty': 'No episodes yet (appear after a build or edit)',
  'feed.rollbackDone': 'Rolled back: {retired} edges retired, {restored} restored',
  'error.unavailable': 'The graph page is unavailable',
  'error.retry': 'Retry',
}
