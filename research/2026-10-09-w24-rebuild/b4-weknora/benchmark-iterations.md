# W24-B4 基准迭代记录

## Run 1 — match_count=5（主运行）

`{"total":20,"hit_at_1":16,"hit_at_3":18,"hit_at_1_rate":0.8,"hit_at_3_rate":0.9}`

miss 2 条：
1. 「大豆酱油酿造工艺的主要工序是什么」gold=`2026-08-process-soy-sauce.md`——top5 内未命中 gold（`2026-08-20-supplier-visit-hongfa.md` 排前，该参观纪要亦讨论酱油产线，语义近邻干扰）。
2. 「配置目录 config-catalog 覆盖哪些可配置项」gold=`config-catalog.zh.md`——完全 miss（该 gold 是自动生成的目录索引文档，正文为表格清单，对「覆盖哪些」类概括性问句的向量/关键词匹配弱于 `architecture.zh.md` 的配置叙述段）。

## Run 2 — match_count=10（召回加深对照）

`{"total":20,"hit_at_1":16,"hit_at_3":18,...}` 与 Run 1 完全一致——两条 miss 并非召回深度不足，而是排序层面的语义近邻/gold 内容形态问题，放宽 match_count 无收益。

## 结论

hit@3 = 90% ≥ 80% 达标线，两条 miss 归因为 gold 文档内容形态（生成式目录文档、近邻参观纪要）而非检索参数，不做进一步调参。若后续需要 100%：可将 `config-catalog.zh.md` 增加概述段落、或为参观纪要与工艺文档引入 tag 隔离。
