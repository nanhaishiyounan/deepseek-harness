/**
 * The market's copy, Chinese-first with an English mirror. Business language
 * only: data assets and providers — never connector, dataset id, or provider
 * id (the detail panel's source line shows the human-facing provider label).
 * @module @deepseek-ai/dsh-client-ui-assets/client/locales
 */

/** The market dictionary's keys. */
export type MarketKey =
  | 'view.market'
  | 'entry.label'
  | 'entry.productsBadge'
  | 'hero.title'
  | 'hero.tagline'
  | 'hero.products'
  | 'hero.providers'
  | 'hero.featured'
  | 'catalog.title'
  | 'catalog.searchPlaceholder'
  | 'catalog.searchAction'
  | 'catalog.kind.all'
  | 'catalog.kind.service'
  | 'catalog.kind.tabular'
  | 'catalog.kind.document'
  | 'catalog.kind.expert-profile'
  | 'catalog.kind.file'
  | 'catalog.showing'
  | 'catalog.more'
  | 'catalog.empty'
  | 'catalog.emptyHint'
  | 'detail.source'
  | 'detail.updated'
  | 'detail.price'
  | 'detail.deliverable'
  | 'detail.summary'
  | 'detail.org'
  | 'detail.domains'
  | 'detail.ask'
  | 'detail.cite'
  | 'detail.back'
  | 'error.unavailable'
  | 'error.retry'
  | 'ask.prefix'

/** Chinese copy (the market's primary language). */
export const zh: Record<MarketKey, string> = {
  'view.market': '数据资产',
  'entry.label': '数据资产',
  'entry.productsBadge': '数据资产数',
  'hero.title': '数据资产市场',
  'hero.tagline': '公共数据与专家服务，可查看、可引用、可提问',
  'hero.products': '数据产品',
  'hero.providers': '供方',
  'hero.featured': '典型产品',
  'catalog.title': '资产目录',
  'catalog.searchPlaceholder': '搜索资产，如：中亚 合规 出海',
  'catalog.searchAction': '搜索',
  'catalog.kind.all': '全部',
  'catalog.kind.service': '专家服务',
  'catalog.kind.tabular': '数据表',
  'catalog.kind.document': '文档',
  'catalog.kind.expert-profile': '专家',
  'catalog.kind.file': '文件',
  'catalog.showing': '共 {shown} / {total} 项',
  'catalog.more': '展开更多（还有 {count} 项）',
  'catalog.empty': '市场上还没有资产',
  'catalog.emptyHint': '把数据集接入连接器，或让专家发布可服务项后，这里会自动上架',
  'detail.source': '来源',
  'detail.updated': '更新于',
  'detail.price': '价格',
  'detail.deliverable': '交付物',
  'detail.summary': '服务内容',
  'detail.org': '所属机构',
  'detail.domains': '领域',
  'detail.ask': '问数',
  'detail.cite': '引用并提问',
  'detail.back': '返回目录',
  'error.unavailable': '市场暂不可用',
  'error.retry': '重试',
  'ask.prefix': '关于「{title}」：',
}

/** English mirror. */
export const en: Record<MarketKey, string> = {
  'view.market': 'Data assets',
  'entry.label': 'Data assets',
  'entry.productsBadge': 'data-asset count',
  'hero.title': 'Data asset market',
  'hero.tagline': 'Public data and expert services — browse, cite, ask',
  'hero.products': 'products',
  'hero.providers': 'providers',
  'hero.featured': 'Featured',
  'catalog.title': 'Catalog',
  'catalog.searchPlaceholder': 'Search assets, e.g. central-asia compliance export',
  'catalog.searchAction': 'Search',
  'catalog.kind.all': 'All',
  'catalog.kind.service': 'Services',
  'catalog.kind.tabular': 'Tables',
  'catalog.kind.document': 'Documents',
  'catalog.kind.expert-profile': 'Experts',
  'catalog.kind.file': 'Files',
  'catalog.showing': '{shown} of {total} shown',
  'catalog.more': 'Show more ({count} left)',
  'catalog.empty': 'No assets on the market yet',
  'catalog.emptyHint': 'Connect datasets through connectors, or let experts publish services — they list here automatically',
  'detail.source': 'Source',
  'detail.updated': 'Updated',
  'detail.price': 'Price',
  'detail.deliverable': 'Deliverable',
  'detail.summary': 'Covers',
  'detail.org': 'Affiliation',
  'detail.domains': 'Domains',
  'detail.ask': 'Ask',
  'detail.cite': 'Cite & ask',
  'detail.back': 'Back to catalog',
  'error.unavailable': 'The market is unavailable',
  'error.retry': 'Retry',
  'ask.prefix': 'About “{title}”: ',
}
