/**
 * The KB workbench's copy, Chinese-first with an English mirror. Business
 * language only: documents, passages, sources, and search counts — never
 * chunks, embeddings, or doc_kind enums.
 * @module @deepseek-ai/dsh-client-ui-kb/client/locales
 */

/** Dictionary keys owned by this plugin's `kb` locale namespace. */
export type KbKey =
  | 'entry.label'
  | 'entry.documentsBadge'
  | 'view.kb'
  | 'view.scenarios'
  | 'scenarios.page.title'
  | 'scenarios.page.tagline'
  | 'settings.nav'
  | 'tool.searchTitle'
  | 'tool.sourcesUnit'
  | 'tool.ingestTitle'
  | 'tool.ingestUrlTitle'
  | 'tool.statsTitle'
  | 'tool.discoverTitle'
  | 'tool.datasetsUnit'
  | 'tool.orderCreateTitle'
  | 'tool.orderStatusTitle'
  | 'tool.orderViewOrder'
  | 'hero.title'
  | 'hero.tagline'
  | 'hero.sample1'
  | 'hero.sample2'
  | 'hero.empty'
  | 'hero.emptyAction'
  | 'hero.recent'
  | 'hero.recentEmpty'
  | 'hero.recentClear'
  | 'usage.title'
  | 'usage.chipDocuments'
  | 'usage.chipSearches'
  | 'usage.chipScenarios'
  | 'usage.documents'
  | 'usage.searches'
  | 'usage.ingested'
  | 'usage.firstSearch'
  | 'scenario.title'
  | 'scenario.railCount'
  | 'scenario.featuredTitle'
  | 'scenario.browseTitle'
  | 'scenario.searchLabel'
  | 'scenario.searchPlaceholder'
  | 'scenario.searchResultCount'
  | 'scenario.searchEmpty'
  | 'scenario.start'
  | 'scenario.cancel'
  | 'scenario.probeLabel'
  | 'scenario.probeColon'
  | 'scenario.failed'
  | 'overview.loading'
  | 'overview.title'
  | 'overview.kpiError'
  | 'overview.pinned'
  | 'overview.pinnedEmpty'
  | 'overview.deliverables'
  | 'overview.deliverablesEmpty'
  | 'overview.unavailable'
  | 'scenario.pin'
  | 'scenario.unpin'
  | 'scenario.category.market'
  | 'scenario.category.process'
  | 'scenario.category.food-safety'
  | 'scenario.category.cost'
  | 'scenario.category.supply-chain'
  | 'scenario.category.export'
  | 'scenario.category.equipment'
  | 'scenario.category.data-asset'
  | 'workbench.page.title'
  | 'workbench.page.tagline'
  | 'workbench.searchPlaceholder'
  | 'workbench.searchAction'
  | 'workbench.resultSummary'
  | 'workbench.searchEmpty'
  | 'workbench.goChat'
  | 'workbench.sample1'
  | 'workbench.sample2'
  | 'workbench.sample3'
  | 'result.carryToChat'
  | 'result.carryDraft'
  | 'result.expand'
  | 'result.collapse'
  | 'ingest.dialogTitle'
  | 'ingest.tabUpload'
  | 'ingest.tabUrl'
  | 'ingest.tabFile'
  | 'ingest.uploadPick'
  | 'ingest.uploadHint'
  | 'ingest.uploadRowBusy'
  | 'ingest.uploadRowDone'
  | 'ingest.uploadRowDoneLake'
  | 'ingest.uploadRowFailed'
  | 'ingest.uploadTooLarge'
  | 'ingest.urlPlaceholder'
  | 'ingest.fileHint'
  | 'ingest.directoryLabel'
  | 'ingest.fileNameLabel'
  | 'ingest.fileNamePlaceholder'
  | 'ingest.action'
  | 'ingest.busy'
  | 'ingest.done'
  | 'ingest.doneReplaced'
  | 'ingest.doneLake'
  | 'ingest.doneLakeReplaced'
  | 'ingest.close'
  | 'ingest.pathMissing'
  | 'ingest.urlUnreachable'
  | 'ingest.failed'
  | 'ingest.hostUnavailable'
  | 'docs.title'
  | 'docs.addDocument'
  | 'docs.sessionNote'
  | 'docs.total'
  | 'docs.ready'
  | 'docs.chunksUnit'
  | 'docs.empty.title'
  | 'docs.empty.body'
  | 'error.unavailable'
  | 'error.searchFailed'
  | 'error.retry'

/** Chinese copy (the workbench's primary language). */
export const zh: Record<KbKey, string> = {
  'entry.label': '知识库',
  'entry.documentsBadge': '知识库文档数',
  'view.kb': '知识库',
  'view.scenarios': '场景',
  'scenarios.page.title': '场景中心',
  'scenarios.page.tagline': '三十个食品产业 AI 场景 · 一键配置专属智能体',
  'settings.nav': '知识库',
  'tool.searchTitle': '知识库检索',
  'tool.sourcesUnit': '{n} 条来源',
  'tool.ingestTitle': '文档入库',
  'tool.ingestUrlTitle': '网页入库',
  'tool.statsTitle': '知识库用量查询',
  'tool.discoverTitle': '连接器数据集发现',
  'tool.datasetsUnit': '{n} 个数据集',
  'tool.orderCreateTitle': '专家服务下单',
  'tool.orderStatusTitle': '订单状态查询',
  'tool.orderViewOrder': '查看订单',
  'hero.title': '食品产业知识库问答',
  'hero.tagline': '检索企业文档 · 带编号引用回答 · 覆盖合规/工艺/成本/供应链',
  'hero.sample1': '酱油中山梨酸钾的最大使用量？',
  'hero.sample2': 'GB 14881 车间虫控要求？',
  'hero.empty': '知识库还没有文档',
  'hero.emptyAction': '试试检索',
  'hero.recent': '最近检索',
  'hero.recentEmpty': '还没有检索记录——试试上方的示例问题',
  'hero.recentClear': '清空',
  'usage.title': '累计用量',
  'usage.chipDocuments': '文档 {n}',
  'usage.chipSearches': '检索 {n} 次',
  'usage.chipScenarios': '{n} 个场景',
  'usage.documents': '知识库文档',
  'usage.searches': '检索次数',
  'usage.ingested': '入库文档',
  'usage.firstSearch': '开始第一次检索',
  'scenario.title': '场景',
  'scenario.railCount': '{n} 个场景 · 分类浏览',
  'scenario.featuredTitle': '精选场景',
  'scenario.browseTitle': '按分类浏览',
  'scenario.searchLabel': '搜索场景',
  'scenario.searchPlaceholder': '搜索场景，如：食安 / 出口 / 成本',
  'scenario.searchResultCount': '匹配 {n} / {total} 个场景',
  'scenario.searchEmpty': '没有匹配的场景 — 换个关键词试试',
  'scenario.start': '开始会话',
  'scenario.cancel': '取消',
  'scenario.probeLabel': '示例问题',
  'scenario.probeColon': '：',
  'scenario.failed': '场景切换失败，请重试',
  'overview.loading': '加载中…',
  'overview.title': '经营概览',
  'overview.kpiError': '暂不可用',
  'overview.pinned': '钉选场景',
  'overview.pinnedEmpty': '在场景卡上点 ★ 钉选高频场景，随时从这里直达。',
  'overview.deliverables': '最近交付物',
  'overview.deliverablesEmpty': '暂无交付物。',
  'overview.unavailable': '概览数据暂不可用',
  'scenario.pin': '钉选场景',
  'scenario.unpin': '取消钉选',
  'scenario.category.market': '市场洞察',
  'scenario.category.process': '工艺',
  'scenario.category.food-safety': '食品安全',
  'scenario.category.cost': '成本',
  'scenario.category.supply-chain': '供应链',
  'scenario.category.export': '出海',
  'scenario.category.equipment': '设备',
  'scenario.category.data-asset': '数据资产',
  'workbench.page.title': '知识库工作台',
  'workbench.page.tagline': '检索 · 文档 · 用量 —— 企业知识资产运行面板',
  'workbench.searchPlaceholder': '检索知识库，如：山梨酸 酱油 限量',
  'workbench.searchAction': '检索',
  'workbench.resultSummary': '约 {hits} 条结果 · 来自 {docs} 份文档',
  'workbench.searchEmpty': '没有找到相关内容 — 换个关键词，或直接在对话里提问',
  'workbench.goChat': '去对话提问',
  'workbench.sample1': '山梨酸 酱油',
  'workbench.sample2': '车间虫控',
  'workbench.sample3': '供应商 准时率',
  'result.carryToChat': '引用并提问',
  'result.carryDraft': '关于「{label}」：{query}，请结合上下文进一步说明',
  'result.expand': '展开全文',
  'result.collapse': '收起',
  'ingest.dialogTitle': '添加文档',
  'ingest.tabUpload': '上传本地文件',
  'ingest.tabUrl': '网页链接',
  'ingest.tabFile': '服务器文件',
  'ingest.uploadPick': '选择文件（可多选）',
  'ingest.uploadHint': '支持 md / txt / pdf / docx 入知识库，csv / xlsx / json 入数据湖，单文件最大 64 MiB',
  'ingest.uploadRowBusy': '上传中…',
  'ingest.uploadRowDone': '已入库 · {chunks} 个片段',
  'ingest.uploadRowDoneLake': '已入数据湖 · {table} · {rows} 行',
  'ingest.uploadRowFailed': '入库失败',
  'ingest.uploadTooLarge': '文件超过 64 MiB 上限',
  'ingest.urlPlaceholder': 'https://…',
  'ingest.fileHint': '支持工作区内的 md / txt / pdf / docx 文件与网页链接',
  'ingest.directoryLabel': '所在目录',
  'ingest.fileNameLabel': '文件名（.md / .txt / .pdf / .docx）',
  'ingest.fileNamePlaceholder': '如：gb2760-excerpt.md',
  'ingest.action': '入库',
  'ingest.busy': '入库中…',
  'ingest.done': '已入库：{name} · {chunks} 个片段',
  'ingest.doneReplaced': '已替换同名文档：{name} · {chunks} 个片段',
  'ingest.doneLake': '已入数据湖：{table} · {rows} 行',
  'ingest.doneLakeReplaced': '已替换同名数据表：{table} · {rows} 行',
  'ingest.close': '关闭',
  'ingest.pathMissing': '找不到这份文件，请重新选择',
  'ingest.urlUnreachable': '网页无法访问，请检查链接',
  'ingest.failed': '入库失败，请稍后重试',
  'ingest.hostUnavailable': '服务器文件浏览暂不可用——可改用「上传本地文件」或「网页链接」；需要服务器文件时请联系管理员放置到工作区',
  'docs.title': '文档',
  'docs.addDocument': '添加文档',
  'docs.sessionNote': '本次会话的入库与检索记录',
  'docs.total': '共 {n} 份文档',
  'docs.ready': '就绪',
  'docs.chunksUnit': '{n} 个片段',
  'docs.empty.title': '知识库还没有文档',
  'docs.empty.body': '支持上传本地文件、网页链接与服务器文件',
  'error.unavailable': '知识库服务不可用，请联系管理员',
  'error.searchFailed': '检索失败，请稍后重试',
  'error.retry': '重试',
}

/** English mirror. */
export const en: Record<KbKey, string> = {
  'entry.label': 'Knowledge base',
  'entry.documentsBadge': 'Knowledge-base documents',
  'view.kb': 'Knowledge base',
  'view.scenarios': 'Scenarios',
  'scenarios.page.title': 'Scenario center',
  'scenarios.page.tagline': 'Thirty food-industry AI scenarios — one click composes the dedicated agent',
  'settings.nav': 'Knowledge base',
  'tool.searchTitle': 'Knowledge search',
  'tool.sourcesUnit': '{n} sources',
  'tool.ingestTitle': 'Add document',
  'tool.ingestUrlTitle': 'Add web page',
  'tool.statsTitle': 'Knowledge-base usage',
  'tool.discoverTitle': 'Connector discovery',
  'tool.orderCreateTitle': 'Expert service order',
  'tool.orderStatusTitle': 'Order status',
  'tool.orderViewOrder': 'View order',
  'tool.datasetsUnit': '{n} datasets',
  'hero.title': 'Food-industry knowledge Q&A',
  'hero.tagline': 'Search your documents · cited answers across compliance, process, cost and supply',
  'hero.sample1': 'What is the max sorbate level in soy sauce?',
  'hero.sample2': 'What does GB 14881 say on pest control?',
  'hero.empty': 'No documents yet',
  'hero.emptyAction': 'Try a search',
  'hero.recent': 'Recent searches',
  'hero.recentEmpty': 'No searches yet — try a sample above',
  'hero.recentClear': 'Clear',
  'usage.title': 'Total usage',
  'usage.chipDocuments': '{n} documents',
  'usage.chipSearches': '{n} searches',
  'usage.chipScenarios': '{n} scenarios',
  'usage.documents': 'Documents',
  'usage.searches': 'Searches',
  'usage.ingested': 'Ingested',
  'usage.firstSearch': 'Run your first search',
  'scenario.title': 'Scenarios',
  'scenario.railCount': '{n} scenarios · browse by category',
  'scenario.featuredTitle': 'Featured scenarios',
  'scenario.browseTitle': 'Browse by category',
  'scenario.searchLabel': 'Search scenarios',
  'scenario.searchPlaceholder': 'Search scenarios, e.g. food safety / export / cost',
  'scenario.searchResultCount': '{n} of {total} scenarios match',
  'scenario.searchEmpty': 'No matching scenarios — try other terms',
  'scenario.start': 'Start session',
  'scenario.cancel': 'Cancel',
  'scenario.probeLabel': 'Example question',
  'scenario.probeColon': ': ',
  'scenario.failed': 'Could not switch scenario; try again',
  'overview.loading': 'Loading…',
  'overview.title': 'Business overview',
  'overview.kpiError': 'unavailable',
  'overview.pinned': 'Pinned scenarios',
  'overview.pinnedEmpty': 'Pin frequent scenarios with ★ on their cards; they land here.',
  'overview.deliverables': 'Recent deliverables',
  'overview.deliverablesEmpty': 'No deliverables yet.',
  'overview.unavailable': 'Overview figures are unavailable',
  'scenario.pin': 'Pin scenario',
  'scenario.unpin': 'Unpin scenario',
  'scenario.category.market': 'Market insight',
  'scenario.category.process': 'Process',
  'scenario.category.food-safety': 'Food safety',
  'scenario.category.cost': 'Cost',
  'scenario.category.supply-chain': 'Supply chain',
  'scenario.category.export': 'Export',
  'scenario.category.equipment': 'Equipment',
  'scenario.category.data-asset': 'Data assets',
  'workbench.page.title': 'Knowledge workbench',
  'workbench.page.tagline': 'Search, documents, and usage — the knowledge asset panel',
  'workbench.searchPlaceholder': 'Search the knowledge base, e.g. sorbate soy sauce limit',
  'workbench.searchAction': 'Search',
  'workbench.resultSummary': 'About {hits} results · from {docs} documents',
  'workbench.searchEmpty': 'No matches — try other terms or ask in chat',
  'workbench.goChat': 'Ask in chat',
  'workbench.sample1': 'sorbate soy sauce',
  'workbench.sample2': 'workshop pest control',
  'workbench.sample3': 'supplier on-time rate',
  'result.carryToChat': 'Cite & ask',
  'result.carryDraft': 'About "{label}": {query} — please elaborate with the retrieved context',
  'result.expand': 'Show more',
  'result.collapse': 'Show less',
  'ingest.dialogTitle': 'Add documents',
  'ingest.tabUpload': 'Upload files',
  'ingest.tabUrl': 'Web link',
  'ingest.tabFile': 'Server file',
  'ingest.uploadPick': 'Choose files (multiple allowed)',
  'ingest.uploadHint': 'md / txt / pdf / docx land in the knowledge base; csv / xlsx / json land in the lakehouse; up to 64 MiB each',
  'ingest.uploadRowBusy': 'Uploading…',
  'ingest.uploadRowDone': 'Ingested · {chunks} passages',
  'ingest.uploadRowDoneLake': 'Loaded to lakehouse · {table} · {rows} rows',
  'ingest.uploadRowFailed': 'Ingest failed',
  'ingest.uploadTooLarge': 'File exceeds the 64 MiB limit',
  'ingest.urlPlaceholder': 'https://…',
  'ingest.fileHint': 'Supports md / txt / pdf / docx files inside the workspace and web links',
  'ingest.directoryLabel': 'Containing folder',
  'ingest.fileNameLabel': 'File name (.md / .txt / .pdf / .docx)',
  'ingest.fileNamePlaceholder': 'e.g. gb2760-excerpt.md',
  'ingest.action': 'Add',
  'ingest.busy': 'Adding…',
  'ingest.done': 'Ingested: {name} · {chunks} passages',
  'ingest.doneReplaced': 'Replaced the existing document: {name} · {chunks} passages',
  'ingest.doneLake': 'Loaded to lakehouse: {table} · {rows} rows',
  'ingest.doneLakeReplaced': 'Replaced the existing table: {table} · {rows} rows',
  'ingest.close': 'Close',
  'ingest.pathMissing': 'Cannot find that file; pick again',
  'ingest.urlUnreachable': 'That page is unreachable; check the link',
  'ingest.failed': 'Ingest failed; try again shortly',
  'ingest.hostUnavailable': 'Server-file browsing is unavailable — use Upload files or a web link instead; ask your admin to place files in the workspace when needed',
  'docs.title': 'Documents',
  'docs.addDocument': 'Add documents',
  'docs.sessionNote': 'Recorded this session',
  'docs.total': '{n} documents in total',
  'docs.ready': 'Ready',
  'docs.chunksUnit': '{n} passages',
  'docs.empty.title': 'No documents yet',
  'docs.empty.body': 'Upload local files, web links, or server files',
  'error.unavailable': 'Knowledge base unavailable; contact your admin',
  'error.searchFailed': 'Search failed; try again shortly',
  'error.retry': 'Retry',
}
