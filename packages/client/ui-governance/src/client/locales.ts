/**
 * Governance panel dictionaries (zh default, en mirror).
 * @module @deepseek-ai/dsh-client-ui-governance/client/locales
 */

/** Dictionary keys the panel renders. */
export type GovernanceKey =
  | 'view.governance'
  | 'panel.title'
  | 'tab.catalog'
  | 'tab.lineage'
  | 'tab.quality'
  | 'tab.alerts'
  | 'catalog.search'
  | 'catalog.source'
  | 'catalog.asset'
  | 'catalog.count'
  | 'catalog.empty'
  | 'lineage.source'
  | 'lineage.target'
  | 'lineage.transform'
  | 'lineage.empty'
  | 'quality.rule'
  | 'quality.kind'
  | 'quality.table'
  | 'quality.threshold'
  | 'quality.status'
  | 'quality.measured'
  | 'quality.run'
  | 'quality.running'
  | 'quality.pass'
  | 'quality.fail'
  | 'quality.empty'
  | 'alerts.at'
  | 'alerts.level'
  | 'alerts.title'
  | 'alerts.webhookTest'
  | 'alerts.empty'

/** Chinese dictionary. */
export const zh: Record<GovernanceKey, string> = {
  'view.governance': '数据治理',
  'panel.title': '数据治理面板',
  'tab.catalog': '目录',
  'tab.lineage': '血缘',
  'tab.quality': '质量',
  'tab.alerts': '告警',
  'catalog.search': '搜索资产（跨湖仓/知识库/图谱/业务）',
  'catalog.source': '来源',
  'catalog.asset': '资产',
  'catalog.count': '数量',
  'catalog.empty': '没有匹配的资产',
  'lineage.source': '上游',
  'lineage.target': '下游',
  'lineage.transform': '变换',
  'lineage.empty': '暂无血缘记录',
  'quality.rule': '规则',
  'quality.kind': '类型',
  'quality.table': '表',
  'quality.threshold': '阈值',
  'quality.status': '状态',
  'quality.measured': '实测值',
  'quality.run': '运行评估',
  'quality.running': '评估中…',
  'quality.pass': '通过',
  'quality.fail': '未通过',
  'quality.empty': '暂无质量规则',
  'alerts.at': '时间',
  'alerts.level': '级别',
  'alerts.title': '事件',
  'alerts.webhookTest': '测试 Webhook',
  'alerts.empty': '暂无告警事件',
}

/** English dictionary. */
export const en: Record<GovernanceKey, string> = {
  'view.governance': 'Governance',
  'panel.title': 'Data Governance',
  'tab.catalog': 'Catalog',
  'tab.lineage': 'Lineage',
  'tab.quality': 'Quality',
  'tab.alerts': 'Alerts',
  'catalog.search': 'Search assets (lakehouse / KB / graph / business)',
  'catalog.source': 'Source',
  'catalog.asset': 'Asset',
  'catalog.count': 'Count',
  'catalog.empty': 'No matching assets',
  'lineage.source': 'Upstream',
  'lineage.target': 'Downstream',
  'lineage.transform': 'Transform',
  'lineage.empty': 'No lineage recorded',
  'quality.rule': 'Rule',
  'quality.kind': 'Kind',
  'quality.table': 'Table',
  'quality.threshold': 'Threshold',
  'quality.status': 'Status',
  'quality.measured': 'Measured',
  'quality.run': 'Run evaluation',
  'quality.running': 'Evaluating…',
  'quality.pass': 'Pass',
  'quality.fail': 'Fail',
  'quality.empty': 'No quality rules',
  'alerts.at': 'At',
  'alerts.level': 'Level',
  'alerts.title': 'Event',
  'alerts.webhookTest': 'Test webhook',
  'alerts.empty': 'No alert events',
}
