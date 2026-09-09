# kb-agent data routing (keyless)

## data.upload
- customs-export.csv → lakehouse table customs_export (6 rows, replaced=false)
- visit-note.md → kb document 1 (1 chunks, embedded=false)

## lakehouse_tables
customs_export — 6 rows, parquet (updated <ts>)
  region TEXT
  month TEXT
  amount_t DOUBLE

Write lakehouse_query SQL against these tables; quote identifiers with double quotes when a column name needs it.

## lakehouse_query
| region | total_amount |
| --- | --- |
| 东南亚 | 595.75 |
| 中亚 | 218.75 |
| 欧盟 | 790.5 |

Data source: lakehouse table customs_export

Answer from the rows above; name the source table(s) in your answer.

## kb_search
(text-only mode: no embed provider is available; results come from full-text search alone)

[1] workspace/data/uploads/visit-note.md — 宏发食品八月走访纪要 — other — chunk 0
  宏发食品八月出口以中亚方向为主，琥珀麦芽与烘焙配料两条产线满产；
东南亚订单因雨季物流延迟，交付周期拉长约两周。

Cite the sources above as [n] — document name and heading path — in your answer.
