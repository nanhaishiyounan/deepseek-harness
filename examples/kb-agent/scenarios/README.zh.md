# kb-agent 场景集（P2-2F）

[English](README.md) | 中文

一个场景 = 一个角色预设 + 专用脱敏语料 + SKILL + 可运行校验。目录约定：

```
scenarios/<scenario-id>/
  preset.yml          # 展示元数据（name/description/order/probe）
  agent.cordis.yml    # 角色预设组合（persona + scoped tool-kb；kb 栈在 host 组合）
  SKILL.md            # 教模型何时检索、引用格式、何时用图谱工具
  data/corpus.md      # 场景专用脱敏语料（入库后供 kb_search）
```

新增场景是纯内容填充：复制任一现有场景目录，改写 preset/agent/SKILL/corpus 四个文件即可——`tests/scenarios.spec.ts` 自动把它纳入校验（结构完整、预设可经真实 Loader 挂载、语料可检索）。

## 场景清单（30/30 已完成）

30 个场景覆盖全部 8 个类别（类别对齐会议纪要五类需求 + 研究报告 18 款 Agent 矩阵的出海/设备/数据资产类）：

| # | 场景 id | 角色名 | 类别 |
|---|---------|--------|------|
| 1 | [market-insight](market-insight/) | AI 营销洞察主管 | 市场洞察 |
| 2 | [consumer-insight](consumer-insight/) | 消费者洞察主管 | 市场洞察 |
| 3 | [process-quality](process-quality/) | 智能品控主管 | 工艺 |
| 4 | [product-rd](product-rd/) | AI 新品研发助手 | 工艺 |
| 5 | [food-safety-service](food-safety-service/) | AI 食安服务主管 | 食品安全 |
| 6 | [food-safety-inspection](food-safety-inspection/) | AI 食安巡检员 | 食品安全 |
| 7 | [cost-pricing](cost-pricing/) | AI 库存与定价管家 | 成本测算 |
| 8 | [supply-risk](supply-risk/) | 供应商风险评估员 | 供应链 |
| 9 | [export-tax](export-tax/) | AI 退税管家 | 出海 |
| 10 | [equipment-maintenance](equipment-maintenance/) | AI 设备维护主管 | 设备 |
| 11 | [data-asset](data-asset/) | 数据资产入表顾问 | 数据资产 |
| 12 | [procurement-sales](procurement-sales/) | AI 采销主管 | 供应链 |
| 13 | [overseas-insight](overseas-insight/) | AI 海外市场洞察官 | 出海 |
| 14 | [export-compliance](export-compliance/) | AI 出海合规官 | 出海 |
| 15 | [customs-logistics](customs-logistics/) | AI 报关物流官 | 出海 |
| 16 | [supply-chain-finance](supply-chain-finance/) | AI 供应链金融官 | 供应链/出海 |
| 17 | [channel-matching](channel-matching/) | AI 渠道匹配官 | 市场洞察 |
| 18 | [export-pm](export-pm/) | AI 出海项目经理 | 出海 |
| 19 | [product-development](product-development/) | AI 产品研发官 | 工艺 |
| 20 | [private-label](private-label/) | AI 自有品牌顾问 | 市场洞察 |
| 21 | [food-compliance](food-compliance/) | AI 食安合规官 | 食品安全 |
| 22 | [enterprise-data](enterprise-data/) | 企业数据助手 | 成本测算/综合 |
| 23 | [inspection-scheduling](inspection-scheduling/) | AI 巡检排产员 | 工艺 |
| 24 | [commodity-analysis](commodity-analysis/) | AI 原料行情分析师 | 供应链 |
| 25 | [quality-cost](quality-cost/) | AI 质量成本分析师 | 成本测算 |
| 26 | [cold-chain](cold-chain/) | AI 冷链管理主管 | 供应链 |
| 27 | [label-review](label-review/) | AI 标签合规审查员 | 食品安全 |
| 28 | [supplier-development](supplier-development/) | AI 供应商开发专员 | 供应链 |
| 29 | [ecommerce-ops](ecommerce-ops/) | AI 电商运营主管 | 市场洞察 |
| 30 | [esg-report](esg-report/) | AI ESG 报告助理 | 数据资产 |

## 运行校验

```sh
pnpm vitest run examples/kb-agent/tests/scenarios.spec.ts
```

真实运行（检索专用组合 + 预设挂载）见 `examples/kb-agent/README.zh.md`。
