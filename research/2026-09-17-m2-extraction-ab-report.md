# M2 抽取协议 A/B 门禁报告（2026-09-17）

语料：`examples/kb-agent/workspace/data/supply/2026-08-supply-packaging.md`（首 3500 字符，单 chunk）；LLM：MiniMax-M3（真实 API）；注册表快照含 53 类型 / 26 关系。

| 协议 | entities | relations | degraded(UNCLASSIFIED) | dropped(闭集拒绝) | quarantined(SHACL) | shaclRounds |
|---|---|---|---|---|---|---|
| legacy | 13 | 4 | 0 | 4 | 0 | 0 |
| instruct-kgc | 8 | 3 | 0 | 0 | 0 | 1 |

判定：instruct-kgc 的 relations=3 vs legacy=4；
degraded=0 vs 0；dropped=0 vs 4。
门禁规则（计划 P0-3）：新协议 relations 不低于旧协议、degraded+dropped 不高于旧协议 → 通过后才把默认协议切为 instruct-kgc；否则默认保持 legacy（两协议均已在 config 可选）。
## kg_query L0+PPR 检索对比（2026-09-17 实跑）

| 种子 | 1-hop 基线 gold 召回 | PPR 子图 gold 召回 | PPR top5 |
|---|---|---|---|
| 张红喜 | 3/3 | 3/3 | 张红喜、食品、海外仓风险应对咨询、中亚、ICC 2020 不可抗力条款 |
| 宏发食品 | 2/3 | 2/3 | 宏发食品、食品、海外仓风险应对咨询、中亚、ICC 2020 不可抗力条款 |
| 酱油 | 1/2 | 1/2 | 酱油、食品、海外仓风险应对咨询、中亚、ICC 2020 不可抗力条款 |
