/**
 * The workbench portal's static scenario catalog: id, category, and bilingual
 * display copy for the thirty food-industry scenarios. Kept in sync with
 * `examples/kb-agent/scenarios/<id>/preset.yml` (name/description/probe are
 * the source of truth there; category and the English mirror live only here)
 * by the `scripts/scenario-catalog-sync.spec.ts` gate, which fails when the
 * directory set and this table's ids drift. The roster itself comes from
 * `agentPresets.list` at runtime — this table drives grouping and display
 * only, never selection semantics.
 * @module @deepseek-ai/dsh-client-ui-kb/client/hero/scenarios
 */

/** One browsable scenario card's static display data. */
export interface KbScenario {
  /** Roster id (the preset directory name under examples/kb-agent/scenarios). */
  readonly id: string
  /** Grouping category id; labels resolve through the `kb` locale namespace. */
  readonly category: KbScenarioCategory
  /** Chinese display name (mirrors preset.yml `name`). */
  readonly nameZh: string
  /** English display name. */
  readonly nameEn: string
  /** Chinese one-line description (mirrors preset.yml `description`). */
  readonly descriptionZh: string
  /** English one-line description. */
  readonly descriptionEn: string
  /** Chinese example question filled into the composer when the card starts a session. */
  readonly probeZh: string
  /** English example question. */
  readonly probeEn: string
  /**
   * Portal-picked front card: the blank hero's featured row shows these
   * before anything else while every other scenario folds behind its
   * category. Presentation-only; never affects roster or selection.
   */
  readonly featured?: true
}

/** The eight grouping categories, ordered as the portal rail shows them. */
export const KB_SCENARIO_CATEGORIES = [
  'market', 'process', 'food-safety', 'cost', 'supply-chain', 'export', 'equipment', 'data-asset',
] as const

/** Category id union. */
export type KbScenarioCategory = typeof KB_SCENARIO_CATEGORIES[number]

/** The thirty scenarios in roster order (preset.yml `order` values). */
export const KB_SCENARIOS: readonly KbScenario[] = [
  {
    id: 'market-insight',
    category: 'market',
    nameZh: 'AI 营销洞察主管',
    nameEn: 'AI Marketing Insight Lead',
    descriptionZh: '检索市场洞察类语料，按“品类规模—渠道结构—机会点”三段输出，引用采集日期。',
    descriptionEn: 'Retrieves market corpus; outputs category size, channel mix, and opportunities with cited dates.',
    probeZh: '电商渠道 GMV',
    probeEn: 'e-commerce channel GMV',
    featured: true,
  },
  {
    id: 'consumer-insight',
    category: 'market',
    nameZh: '消费者洞察主管',
    nameEn: 'Consumer Insight Lead',
    descriptionZh: '检索消费者调研语料，输出人群—偏好—未满足需求三段，引用样本量与调研日期。',
    descriptionEn: 'Retrieves consumer-research corpus; outputs audience, preference, and unmet-need findings with sample sizes.',
    probeZh: '辣味偏好 挤挤装',
    probeEn: 'spicy preference squeeze-pack',
  },
  {
    id: 'process-quality',
    category: 'process',
    nameZh: '智能品控主管',
    nameEn: 'Smart Quality Control Lead',
    descriptionZh: '检索工艺规程与质检语料，按“标准参数—判定限—异常处置”输出，引用文件名与章节。',
    descriptionEn: 'Retrieves process and QC corpus; outputs standard parameters, limits, and exception handling with citations.',
    probeZh: 'UHT 137 保温试验',
    probeEn: 'UHT 137 hold test',
  },
  {
    id: 'product-rd',
    category: 'process',
    nameZh: 'AI 新品研发助手',
    nameEn: 'AI Product R&D Assistant',
    descriptionZh: '检索配方/原料/竞品语料，输出配方方向—合规检查—成本预估，引用标准号。',
    descriptionEn: 'Retrieves recipe, ingredient, and competitor corpus; outputs directions, compliance checks, and cost estimates.',
    probeZh: '三氯蔗糖 赤藓糖醇',
    probeEn: 'sucralose erythritol',
  },
  {
    id: 'food-safety-service',
    category: 'food-safety',
    nameZh: 'AI 食安服务主管',
    nameEn: 'AI Food-safety Service Lead',
    descriptionZh: '检索法规与体系语料，按“依据条款—现状判断—整改动作—验证方式”输出，引用标准号。',
    descriptionEn: 'Retrieves regulation and system corpus; outputs clause basis, assessment, corrective actions, and verification.',
    probeZh: '金属探测 CCP 限值',
    probeEn: 'metal-detection CCP limit',
    featured: true,
  },
  {
    id: 'food-safety-inspection',
    category: 'food-safety',
    nameZh: 'AI 食安巡检员',
    nameEn: 'AI Food-safety Inspector',
    descriptionZh: '检索巡检检查表语料，按“区域—检查项—判定标准—证据要求”输出，引用检查表编号。',
    descriptionEn: 'Retrieves inspection-checklist corpus; outputs zone, check item, criteria, and evidence requirements.',
    probeZh: '飞虫监控灯 地漏',
    probeEn: 'fly lamp floor drain',
  },
  {
    id: 'cost-pricing',
    category: 'cost',
    nameZh: 'AI 库存与定价管家',
    nameEn: 'AI Inventory & Pricing Steward',
    descriptionZh: '检索成本/库存/行情语料，按“口径—测算—建议—风险”输出，价格数据注明时点。',
    descriptionEn: 'Retrieves cost, inventory, and market corpus; outputs basis, calculation, advice, and risks with price dates.',
    probeZh: '蚝油 完全成本 毛利率',
    probeEn: 'oyster-sauce full cost margin',
    featured: true,
  },
  {
    id: 'supply-risk',
    category: 'supply-chain',
    nameZh: '供应商风险评估员',
    nameEn: 'Supplier Risk Assessor',
    descriptionZh: '检索供应商档案与交付语料，按“绩效数据—风险识别—等级判定—缓释动作”输出。',
    descriptionEn: 'Retrieves supplier and delivery corpus; outputs performance, risks, rating, and mitigation actions.',
    probeZh: '宏达塑业 金晟印铁 准时率',
    probeEn: 'Hongda Jinsheng on-time rate',
  },
  {
    id: 'export-tax',
    category: 'export',
    nameZh: 'AI 退税管家',
    nameEn: 'AI Export-tax Steward',
    descriptionZh: '检索出口退税语料，按“适用条件—单证清单—流程时限—风险提示”输出，引用文件依据。',
    descriptionEn: 'Retrieves export-tax-refund corpus; outputs eligibility, documents, deadlines, and risk notes with citations.',
    probeZh: '退税 报关单 申报',
    probeEn: 'tax refund customs declaration',
  },
  {
    id: 'equipment-maintenance',
    category: 'equipment',
    nameZh: 'AI 设备维护主管',
    nameEn: 'AI Equipment Maintenance Lead',
    descriptionZh: '检索设备手册与工单语料，按“故障现象—可能原因—排查步骤—安全提示”输出，引用手册页码。',
    descriptionEn: 'Retrieves equipment-manual and work-order corpus; outputs symptoms, causes, checks, and safety notes.',
    probeZh: '杀菌机 蒸汽调节阀 LOTO',
    probeEn: 'sterilizer steam-control valve LOTO',
  },
  {
    id: 'data-asset',
    category: 'data-asset',
    nameZh: '数据资产入表顾问',
    nameEn: 'Data-asset Accounting Advisor',
    descriptionZh: '检索数据资产政策语料，按“政策依据—入表条件—成本归集—风险”输出，引用文号。',
    descriptionEn: 'Retrieves data-asset policy corpus; outputs policy basis, capitalization conditions, cost pooling, and risks.',
    probeZh: '财会 2023 11 入表',
    probeEn: 'data-asset capitalization rules',
  },
  {
    id: 'procurement-sales',
    category: 'supply-chain',
    nameZh: 'AI 采销主管',
    nameEn: 'AI Procurement & Sales Lead',
    descriptionZh: '检索采销联动语料，按“采购动作—库存水位—销售联动”输出，引用数据月份。',
    descriptionEn: 'Retrieves procurement-sales corpus; outputs purchase actions, inventory levels, and sales linkage with cited data months.',
    probeZh: '面粉锁价 库销比',
    probeEn: 'flour price lock inventory-sales ratio',
  },
  {
    id: 'overseas-insight',
    category: 'export',
    nameZh: 'AI 海外市场洞察官',
    nameEn: 'AI Overseas-market Insight Officer',
    descriptionZh: '检索海外市场报告语料，按“市场规模—渠道结构—进入建议”输出，引用数据年份。',
    descriptionEn: 'Retrieves overseas-market corpus; outputs market size, channel mix, and entry advice with cited data years.',
    probeZh: '东南亚 辣酱零售额',
    probeEn: 'Southeast Asia chili-sauce retail sales',
  },
  {
    id: 'export-compliance',
    category: 'export',
    nameZh: 'AI 出海合规官',
    nameEn: 'AI Export-compliance Officer',
    descriptionZh: '检索出口合规要点语料，按“法规要求—企业义务—落地动作”输出，引用法规条款。',
    descriptionEn: 'Retrieves export-compliance corpus; outputs regulatory requirements, obligations, and implementation actions with cited clauses.',
    probeZh: 'FDA 设施注册 FSVP',
    probeEn: 'FDA facility registration FSVP',
    featured: true,
  },
  {
    id: 'customs-logistics',
    category: 'export',
    nameZh: 'AI 报关物流官',
    nameEn: 'AI Customs & Logistics Officer',
    descriptionZh: '检索报关物流操作语料，按“单证—归类—运输方式”输出，引用操作条款。',
    descriptionEn: 'Retrieves customs-logistics corpus; outputs document sets, HS classification, and transport modes with cited clauses.',
    probeZh: 'HS 归类 预裁定',
    probeEn: 'HS classification advance ruling',
  },
  {
    id: 'supply-chain-finance',
    category: 'supply-chain',
    nameZh: 'AI 供应链金融官',
    nameEn: 'AI Supply-chain Finance Officer',
    descriptionZh: '检索供应链金融产品语料，按“产品要素—成本—适用场景”输出，引用产品编号。',
    descriptionEn: 'Retrieves supply-chain-finance corpus; outputs product terms, costs, and applicable scenarios with cited product ids.',
    probeZh: '信用证 保理贴现',
    probeEn: 'letter of credit factoring discount',
    featured: true,
  },
  {
    id: 'channel-matching',
    category: 'market',
    nameZh: 'AI 渠道匹配官',
    nameEn: 'AI Channel-matching Officer',
    descriptionZh: '检索渠道匹配分析语料，按“渠道特征—匹配维度—考核指标”输出，引用渠道编号。',
    descriptionEn: 'Retrieves channel-matching corpus; outputs channel traits, fit dimensions, and assessment KPIs with cited channel ids.',
    probeZh: '经销商 辅销 协销',
    probeEn: 'distributor assist-sales co-sales',
  },
  {
    id: 'export-pm',
    category: 'export',
    nameZh: 'AI 出海项目经理',
    nameEn: 'AI Export Program Manager',
    descriptionZh: '检索出海项目计划语料，按“里程碑—交付物—风险应对”输出，引用里程碑编号。',
    descriptionEn: 'Retrieves export-program corpus; outputs milestones, deliverables, and risk responses with cited milestone ids.',
    probeZh: 'HALAL 认证 上市里程碑',
    probeEn: 'HALAL certification launch milestone',
  },
  {
    id: 'product-development',
    category: 'process',
    nameZh: 'AI 产品研发官',
    nameEn: 'AI Product Development Lead',
    descriptionZh: '检索新品研发流程语料，按“阶段门—试验方法—放行标准”输出，引用阶段编号。',
    descriptionEn: 'Retrieves product-development corpus; outputs stage gates, test methods, and release criteria with cited stage ids.',
    probeZh: '加速货架试验 中试',
    probeEn: 'accelerated shelf-life test pilot run',
  },
  {
    id: 'private-label',
    category: 'market',
    nameZh: 'AI 自有品牌顾问',
    nameEn: 'AI Private-label Advisor',
    descriptionZh: '检索自有品牌合作语料，按“客户需求—合作模式—商务条款”输出，引用案例编号。',
    descriptionEn: 'Retrieves private-label corpus; outputs client needs, cooperation modes, and commercial terms with cited case ids.',
    probeZh: '自有品牌 贴牌 毛利',
    probeEn: 'private label OEM margin',
  },
  {
    id: 'food-compliance',
    category: 'food-safety',
    nameZh: 'AI 食安合规官',
    nameEn: 'AI Food-compliance Officer',
    descriptionZh: '检索法规审核要点语料，依据 GB 2760/GB 14881 等标准输出合规审核要点清单，编号引用原文条款。',
    descriptionEn: 'Retrieves regulation-review corpus; outputs compliance checklists against GB 2760/GB 14881 with clause-level citations.',
    probeZh: '脱氢乙酸钠 黄油',
    probeEn: 'sodium dehydroacetate butter',
  },
  {
    id: 'enterprise-data',
    category: 'cost',
    nameZh: '企业数据助手',
    nameEn: 'Enterprise Data Assistant',
    descriptionZh: '覆盖市场、工艺、食安、成本、供应链五类问答，检索企业数据档案语料，输出结构化统计与对标建议。',
    descriptionEn: 'Covers market, process, food-safety, cost, and supply-chain Q&A; retrieves enterprise-data archives for structured statistics and benchmarking advice.',
    probeZh: '水电气 单耗',
    probeEn: 'utilities unit consumption',
  },
  {
    id: 'inspection-scheduling',
    category: 'process',
    nameZh: 'AI 巡检排产员',
    nameEn: 'AI Inspection Scheduling Planner',
    descriptionZh: '检索排产巡检语料，按“排产规则—换产清洗—达成率考核”输出，引用工序编号。',
    descriptionEn: 'Retrieves scheduling-inspection corpus; outputs scheduling rules, changeover cleaning, and attainment KPIs with cited process ids.',
    probeZh: '换产 CIP 计划达成率',
    probeEn: 'changeover CIP schedule attainment',
  },
  {
    id: 'commodity-analysis',
    category: 'supply-chain',
    nameZh: 'AI 原料行情分析师',
    nameEn: 'AI Commodity Market Analyst',
    descriptionZh: '检索原料行情语料，按“行情走势—成本影响—采购建议”输出，引用报告周期。',
    descriptionEn: 'Retrieves commodity-market corpus; outputs price trends, cost impact, and purchasing advice with cited report periods.',
    probeZh: '豆粕 卖出套保',
    probeEn: 'soybean meal short hedge',
  },
  {
    id: 'quality-cost',
    category: 'cost',
    nameZh: 'AI 质量成本分析师',
    nameEn: 'AI Quality-cost Analyst',
    descriptionZh: '检索质量成本分析语料，按“PAF 分层—构成占比—改进优先级”输出，引用核算期间。',
    descriptionEn: 'Retrieves quality-cost corpus; outputs PAF layers, composition shares, and improvement priorities with cited accounting periods.',
    probeZh: '质量成本 PAF 报废',
    probeEn: 'quality cost PAF scrap',
  },
  {
    id: 'cold-chain',
    category: 'supply-chain',
    nameZh: 'AI 冷链管理主管',
    nameEn: 'AI Cold-chain Management Lead',
    descriptionZh: '检索冷链管理语料，按“温控标准—监控要求—异常处置”输出，引用规程编号。',
    descriptionEn: 'Retrieves cold-chain corpus; outputs temperature standards, monitoring requirements, and exception handling with cited procedure ids.',
    probeZh: '冷链 断链处置',
    probeEn: 'cold chain break response',
    featured: true,
  },
  {
    id: 'label-review',
    category: 'food-safety',
    nameZh: 'AI 标签合规审查员',
    nameEn: 'AI Label-compliance Reviewer',
    descriptionZh: '检索标签审查语料，依据 GB 28050 等标准核查标示与声称，输出审查清单与整改建议，编号引用条款。',
    descriptionEn: 'Retrieves label-review corpus; checks labeling and claims against GB 28050 and outputs review checklists with cited clauses.',
    probeZh: '营养标签 修约规则',
    probeEn: 'nutrition labeling rounding rules',
  },
  {
    id: 'supplier-development',
    category: 'supply-chain',
    nameZh: 'AI 供应商开发专员',
    nameEn: 'AI Supplier Development Specialist',
    descriptionZh: '检索供应商开发语料，按“准入门槛—审核评分—辅导与淘汰”输出，引用流程编号。',
    descriptionEn: 'Retrieves supplier-development corpus; outputs admission thresholds, audit scoring, and coaching or exit actions with cited process ids.',
    probeZh: '准入 现场审核 二方',
    probeEn: 'admission on-site audit second-party',
  },
  {
    id: 'ecommerce-ops',
    category: 'market',
    nameZh: 'AI 电商运营主管',
    nameEn: 'AI E-commerce Operations Lead',
    descriptionZh: '检索电商运营语料，按“平台表现—直播运营—大促复盘”输出，引用数据周期。',
    descriptionEn: 'Retrieves e-commerce corpus; outputs platform performance, livestream operations, and campaign reviews with cited data periods.',
    probeZh: '直播间平均停留时长',
    probeEn: 'livestream average watch time',
  },
  {
    id: 'esg-report',
    category: 'data-asset',
    nameZh: 'AI ESG 报告助理',
    nameEn: 'AI ESG Reporting Assistant',
    descriptionZh: '检索 ESG 报告素材语料，按“议题—数据口径—披露建议”输出，引用数据期间。',
    descriptionEn: 'Retrieves ESG-report corpus; outputs topics, data definitions, and disclosure advice with cited data periods.',
    probeZh: '碳排放 范围二 披露',
    probeEn: 'carbon emissions scope-2 disclosure',
  },
]

/**
 * Group a scenario pool into category buckets, keeping each bucket in catalog
 * order.
 * @param pool - the scenarios to bucket (defaults to the whole catalog; the
 *   search-results view passes its filtered subset).
 * @returns one readonly scenario array per category id, categories in rail order.
 */
export function scenariosByCategory(pool: readonly KbScenario[] = KB_SCENARIOS): readonly (readonly KbScenario[])[] {
  return KB_SCENARIO_CATEGORIES.map(category => pool.filter(scenario => scenario.category === category))
}

/**
 * The portal's featured front row.
 * @param pool - the scenarios to pick from (defaults to the whole catalog).
 * @returns the featured-flagged scenarios in catalog order.
 */
export function featuredScenarios(pool: readonly KbScenario[] = KB_SCENARIOS): readonly KbScenario[] {
  return pool.filter(scenario => scenario.featured === true)
}

/**
 * Case-insensitive substring match over every display field of a scenario —
 * both language faces plus the probe questions, so a keyword finds its card
 * whichever copy the user read.
 * @param scenario - one catalog entry.
 * @param needle - the lowercased query fragment.
 * @returns whether any display field contains the fragment.
 */
function scenarioMatches(scenario: KbScenario, needle: string): boolean {
  return [scenario.nameZh, scenario.nameEn, scenario.descriptionZh, scenario.descriptionEn, scenario.probeZh, scenario.probeEn]
    .some(field => field.toLowerCase().includes(needle))
}

/**
 * Filter a scenario pool by the portal search box's live query.
 * @param pool - the scenarios to filter (defaults to the whole catalog).
 * @param query - the raw input value; whitespace-only counts as no query.
 * @returns the matching scenarios in catalog order, or null when the query is
 *   blank (the caller renders the featured + category browse view instead).
 */
export function filterScenarios(pool: readonly KbScenario[] = KB_SCENARIOS, query: string): readonly KbScenario[] | null {
  const needle = query.trim().toLowerCase()
  if (needle === '') return null
  return pool.filter(scenario => scenarioMatches(scenario, needle))
}
