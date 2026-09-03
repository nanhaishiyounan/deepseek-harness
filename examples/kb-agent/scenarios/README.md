# kb-agent scenario set (P2-2F)

English | [中文](README.zh.md)

One scenario = one role preset + dedicated desensitized corpus + SKILL + runnable check. Layout:

```
scenarios/<scenario-id>/
  preset.yml          # 展示元数据（name/description/order/probe）
  agent.cordis.yml    # 角色预设组合（persona + scoped tool-kb；kb 栈在 host 组合）
  SKILL.md            # 教模型何时检索、引用格式、何时用图谱工具
  data/corpus.md      # 场景专用脱敏语料（入库后供 kb_search）
```

Adding a scenario is pure content: copy any existing scenario directory and rewrite the preset/agent/SKILL/corpus files — `tests/scenarios.spec.ts` picks it up automatically (complete structure, preset mounts through the real Loader, corpus is retrievable).

## Scenario roster (30/30 complete)

All 8 categories are covered (categories align with the five meeting-note needs plus the overseas/equipment/data-asset rows of the 18-agent research matrix):

| # | Scenario id | Role | Category |
|---|-------------|------|----------|
| 1 | [market-insight](market-insight/) | AI 营销洞察主管 | Market insight |
| 2 | [consumer-insight](consumer-insight/) | 消费者洞察主管 | Market insight |
| 3 | [process-quality](process-quality/) | 智能品控主管 | Process |
| 4 | [product-rd](product-rd/) | AI 新品研发助手 | Process |
| 5 | [food-safety-service](food-safety-service/) | AI 食安服务主管 | Food safety |
| 6 | [food-safety-inspection](food-safety-inspection/) | AI 食安巡检员 | Food safety |
| 7 | [cost-pricing](cost-pricing/) | AI 库存与定价管家 | Cost |
| 8 | [supply-risk](supply-risk/) | 供应商风险评估员 | Supply chain |
| 9 | [export-tax](export-tax/) | AI 退税管家 | Export |
| 10 | [equipment-maintenance](equipment-maintenance/) | AI 设备维护主管 | Equipment |
| 11 | [data-asset](data-asset/) | 数据资产入表顾问 | Data assets |
| 12 | [procurement-sales](procurement-sales/) | AI 采销主管 | Supply chain |
| 13 | [overseas-insight](overseas-insight/) | AI 海外市场洞察官 | Export |
| 14 | [export-compliance](export-compliance/) | AI 出海合规官 | Export |
| 15 | [customs-logistics](customs-logistics/) | AI 报关物流官 | Export |
| 16 | [supply-chain-finance](supply-chain-finance/) | AI 供应链金融官 | Supply chain / export |
| 17 | [channel-matching](channel-matching/) | AI 渠道匹配官 | Market insight |
| 18 | [export-pm](export-pm/) | AI 出海项目经理 | Export |
| 19 | [product-development](product-development/) | AI 产品研发官 | Process |
| 20 | [private-label](private-label/) | AI 自有品牌顾问 | Market insight |
| 21 | [food-compliance](food-compliance/) | AI 食安合规官 | Food safety |
| 22 | [enterprise-data](enterprise-data/) | 企业数据助手 | Cost / cross-domain |
| 23 | [inspection-scheduling](inspection-scheduling/) | AI 巡检排产员 | Process |
| 24 | [commodity-analysis](commodity-analysis/) | AI 原料行情分析师 | Supply chain |
| 25 | [quality-cost](quality-cost/) | AI 质量成本分析师 | Cost |
| 26 | [cold-chain](cold-chain/) | AI 冷链管理主管 | Supply chain |
| 27 | [label-review](label-review/) | AI 标签合规审查员 | Food safety |
| 28 | [supplier-development](supplier-development/) | AI 供应商开发专员 | Supply chain |
| 29 | [ecommerce-ops](ecommerce-ops/) | AI 电商运营主管 | Market insight |
| 30 | [esg-report](esg-report/) | AI ESG 报告助理 | Data assets |

## Run the check

```sh
pnpm vitest run examples/kb-agent/tests/scenarios.spec.ts
```

Real runs (retrieval composition + preset mounting) are documented in `examples/kb-agent/README.md`.
