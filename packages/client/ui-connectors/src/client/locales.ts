/**
 * The connector page's copy, Chinese-first with an English mirror. Business
 * language only: data sources, delivery, rows, health — never provider ids,
 * capabilities, or destination enums (the rows show human-facing labels).
 * @module @deepseek-ai/dsh-client-ui-connectors/client/locales
 */

/** The connector page dictionary's keys. */
export type ConnectorsKey =
  | 'view.connectors'
  | 'entry.label'
  | 'entry.providersBadge'
  | 'page.title'
  | 'page.tagline'
  | 'catalog.title'
  | 'catalog.connectNew'
  | 'catalog.available'
  | 'catalog.unavailable'
  | 'catalog.unavailableHint'
  | 'catalog.noProviders'
  | 'catalog.noProvidersHint'
  | 'delivery.title'
  | 'delivery.empty'
  | 'delivery.emptyHint'
  | 'delivery.transfers'
  | 'delivery.rows'
  | 'delivery.lastAt'
  | 'delivery.never'
  | 'timeline.title'
  | 'timeline.destination.lakehouse'
  | 'timeline.destination.kb'
  | 'wizard.title'
  | 'wizard.body'
  | 'wizard.action'
  | 'wizard.prompt'
  | 'error.unavailable'
  | 'error.retry'

/** Chinese copy (the connector page's primary language). */
export const zh: Record<ConnectorsKey, string> = {
  'view.connectors': '连接器',
  'entry.label': '连接器',
  'entry.providersBadge': '数据源数量',
  'page.title': '连接器与交付',
  'page.tagline': '数据源接入与交付跟踪：谁在供数、供了多少、最近一次交付',
  'catalog.title': '数据源目录',
  'catalog.connectNew': '接入新数据源',
  'catalog.available': '正常',
  'catalog.unavailable': '缺凭据',
  'catalog.unavailableHint': '该数据源缺少访问凭据，补齐后即可发现数据',
  'catalog.noProviders': '还没有可用的数据源',
  'catalog.noProvidersHint': '在组合里挂载连接器与数据源提供方后，这里会列出全部数据源',
  'delivery.title': '交付跟踪',
  'delivery.empty': '还没有交付记录',
  'delivery.emptyHint': '从市场下单或让助手搬运数据集后，交付会记录在这里',
  'delivery.transfers': '次交付',
  'delivery.rows': '行',
  'delivery.lastAt': '最近交付',
  'delivery.never': '—',
  'timeline.title': '运行记录',
  'timeline.destination.lakehouse': '入数据湖',
  'timeline.destination.kb': '入知识库',
  'wizard.title': '接入新数据源',
  'wizard.body': '描述你的数据源和要取的数据，助手会推荐连接方式、补齐参数并测试连接',
  'wizard.action': '去对话接入',
  'wizard.prompt': '帮我接入一个新数据源：',
  'error.unavailable': '连接器页暂不可用',
  'error.retry': '重试',
}

/** English mirror. */
export const en: Record<ConnectorsKey, string> = {
  'view.connectors': 'Connectors',
  'entry.label': 'Connectors',
  'entry.providersBadge': 'data-source count',
  'page.title': 'Connectors & delivery',
  'page.tagline': 'Data-source onboarding and delivery tracking — who feeds data, how much, and the latest landing',
  'catalog.title': 'Data sources',
  'catalog.connectNew': 'Connect a new source',
  'catalog.available': 'Healthy',
  'catalog.unavailable': 'Missing credentials',
  'catalog.unavailableHint': 'This source lacks its access credential; supply it to start discovering data',
  'catalog.noProviders': 'No data sources yet',
  'catalog.noProvidersHint': 'Mount the connector seam and providers in the composition, and every source lists here',
  'delivery.title': 'Delivery tracking',
  'delivery.empty': 'No deliveries yet',
  'delivery.emptyHint': 'Order from the market or let the assistant land a dataset, and deliveries record here',
  'delivery.transfers': 'deliveries',
  'delivery.rows': 'rows',
  'delivery.lastAt': 'Last delivery',
  'delivery.never': '—',
  'timeline.title': 'Run history',
  'timeline.destination.lakehouse': '→ data lake',
  'timeline.destination.kb': '→ knowledge base',
  'wizard.title': 'Connect a new data source',
  'wizard.body': 'Describe the source and the data you need; the assistant recommends the connector, fills parameters, and tests the connection',
  'wizard.action': 'Connect in chat',
  'wizard.prompt': 'Help me connect a new data source: ',
  'error.unavailable': 'The connector page is unavailable',
  'error.retry': 'Retry',
}
