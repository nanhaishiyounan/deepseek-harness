/**
 * The business page's copy, Chinese-first with an English mirror. Business
 * language only: collections, records, fields — never REST paths, filter
 * operators, or wire codes.
 * @module @deepseek-ai/dsh-client-ui-business/client/locales
 */

/** The business page dictionary's keys. */
export type BusinessKey =
  | 'view.business'
  | 'entry.label'
  | 'entry.collectionsBadge'
  | 'page.title'
  | 'page.tagline'
  | 'roster.title'
  | 'roster.loading'
  | 'roster.empty'
  | 'roster.emptyHint'
  | 'roster.askPlaceholder'
  | 'roster.askAction'
  | 'cards.title'
  | 'cards.newRecord'
  | 'cards.empty'
  | 'cards.emptyHint'
  | 'cards.ask'
  | 'cards.edit'
  | 'cards.editPromptPrefix'
  | 'cards.newPromptPrefix'
  | 'cards.askPromptPrefix'
  | 'table.title'
  | 'table.showAsTable'
  | 'table.showAsCards'
  | 'table.more'
  | 'table.end'
  | 'embed.title'
  | 'embed.open'
  | 'embed.openHint'
  | 'error.unavailable'
  | 'error.retry'

/** Chinese copy (the business page's primary language). */
export const zh: Record<BusinessKey, string> = {
  'view.business': '业务管理',
  'entry.label': '业务管理',
  'entry.collectionsBadge': '业务对象数量',
  'page.title': '业务管理',
  'page.tagline': '客户、订单、专家与业务表的对话式管理：看数据在卡片，改数据在对话',
  'roster.title': '业务对象',
  'roster.loading': '业务对象清单加载中…',
  'roster.empty': '还没有可见的业务对象',
  'roster.emptyHint': '启动 NocoBase 业务后台并启用业务读面后，这里会列出全部业务对象',
  'roster.askPlaceholder': '问业务数据：上月 pending 的订单有多少',
  'roster.askAction': '问数',
  'cards.title': '记录',
  'cards.newRecord': '新建（对话）',
  'cards.empty': '这个对象还没有记录',
  'cards.emptyHint': '点「新建（对话）」让助手帮你补齐字段并确认后创建',
  'cards.ask': '问此记录',
  'cards.edit': '编辑（对话）',
  'cards.editPromptPrefix': '帮我修改这条',
  'cards.newPromptPrefix': '帮我新建一条',
  'cards.askPromptPrefix': '关于这条记录',
  'table.title': '表格视图',
  'table.showAsTable': '表格视图',
  'table.showAsCards': '卡片视图',
  'table.more': '加载更多',
  'table.end': '已全部加载',
  'embed.title': '高级配置（业务后台）',
  'embed.open': '在新窗口打开业务后台',
  'embed.openHint': '低频管理辅助：页面编辑器与角色权限细配在业务后台完成，日常读写走对话；将在新浏览器窗口打开（同源入口，无需额外地址），打开后需登录（初始管理员账号见 QUICKSTART「NocoBase 业务后台」）',
  'error.unavailable': '业务管理页暂不可用',
  'error.retry': '重试',
}

/** English mirror. */
export const en: Record<BusinessKey, string> = {
  'view.business': 'Business',
  'entry.label': 'Business',
  'entry.collectionsBadge': 'business-object count',
  'page.title': 'Business management',
  'page.tagline': 'Conversation-first management of customers, orders, experts, and business tables — browse on cards, change in chat',
  'roster.title': 'Business objects',
  'roster.loading': 'Loading the object roster…',
  'roster.empty': 'No visible business objects yet',
  'roster.emptyHint': 'Start the NocoBase backend and enable the business reads, and every object lists here',
  'roster.askPlaceholder': 'Ask about business data',
  'roster.askAction': 'Ask',
  'cards.title': 'Records',
  'cards.newRecord': 'New (in chat)',
  'cards.empty': 'No records in this object yet',
  'cards.emptyHint': 'Use "New (in chat)" — the assistant fills the fields, confirms, and creates',
  'cards.ask': 'Ask about this',
  'cards.edit': 'Edit (in chat)',
  'cards.editPromptPrefix': 'Help me update this record:',
  'cards.newPromptPrefix': 'Help me create a new record:',
  'cards.askPromptPrefix': 'About this record:',
  'table.title': 'Table view',
  'table.showAsTable': 'Table view',
  'table.showAsCards': 'Card view',
  'table.more': 'Load more',
  'table.end': 'All loaded',
  'embed.title': 'Advanced configuration (business backend)',
  'embed.open': 'Open the business backend in a new window',
  'embed.openHint': 'Low-frequency admin aid: the page editor and fine-grained role ACL live in the backend; daily reads and writes stay in chat — opens in a new browser window (same-origin entry, no extra address needed), sign in after opening (the initial admin account is in the QUICKSTART "NocoBase 业务后台" section)',
  'error.unavailable': 'The business page is unavailable',
  'error.retry': 'Retry',
}
