-- W6-B0 对账 SQL（PO-2026-1052 = pur_orders#43）--
== 1 业务表终态 ==
43|PO-2026-1052|5|7500|approved|chenliqun
== 2 wfl 全审计链（submit by buyer → approve by chenliqun）==
submit|buyer|draft|pending|engine|2026-10-01
approve|chenliqun|pending|approved|engine|2026-10-01
== 3 送审幂等（submit 记录数恒=1，重复 submit 被状态机拒绝）==
1
== 4 待办终态（open=0，曾路由 chenliqun=采购部 owner）==
0
== 5 越权负例落库核验（keeper 无 open 待办）==
0
== 6 主管链路由（待办历史行）==
chenliqun|pending|completed
