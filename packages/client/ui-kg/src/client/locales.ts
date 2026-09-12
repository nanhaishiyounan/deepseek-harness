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
  | 'phrase.restate.supply'
  | 'phrase.restate.orders'
  | 'phrase.restate.contains'
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
  | 'stats.counters'
  | 'build.unbuiltTitle'
  | 'build.unbuiltHint'
  | 'build.runBuild'
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
  'phrase.placeholder': '试试自然语言：宏发食品的供货链',
  'phrase.action': '查子图',
  'phrase.restate.supply': '「{entity}」周边两跳关系',
  'phrase.restate.orders': '「{entity}」的订单关系',
  'phrase.restate.contains': '含「{entity}」的商品关系',
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
  'stats.counters': '实体',
  'build.unbuiltTitle': '图谱还未构建',
  'build.unbuiltHint': '运行 kg-build 管线（业务表结构化映射 + 文档实体抽取）后，这里会呈现企业实体关系',
  'build.runBuild': '查看构建指引',
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
  'phrase.placeholder': 'Try natural language: supply chain around a company',
  'phrase.action': 'Walk',
  'phrase.restate.supply': 'Two-hop relations around "{entity}"',
  'phrase.restate.orders': 'Order relations of "{entity}"',
  'phrase.restate.contains': 'Products containing "{entity}"',
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
  'stats.counters': 'entities',
  'build.unbuiltTitle': 'The graph is not built yet',
  'build.unbuiltHint': 'Run the kg-build pipeline (structured business-table mapping + document extraction) and company relations appear here',
  'build.runBuild': 'See the build guide',
  'error.unavailable': 'The graph page is unavailable',
  'error.retry': 'Retry',
}
