# kb-agent closed loop (text-only degraded mode)

## kb_ingest
- workspace/data/meetings/2026-08-27-project-kickoff.md: Ingested workspace/data/meetings/2026-08-27-project-kickoff.md into tenant "demo-food-co": document 1, 6 chunks, stored text-only (no embed provider available). Re-ingesting the same path replaces the prior document.
- workspace/data/meetings/2026-08-20-supplier-visit-hongfa.md: Ingested workspace/data/meetings/2026-08-20-supplier-visit-hongfa.md into tenant "demo-food-co": document 2, 6 chunks, stored text-only (no embed provider available). Re-ingesting the same path replaces the prior document.
- workspace/data/profiles/hongfa-food.md: Ingested workspace/data/profiles/hongfa-food.md into tenant "demo-food-co": document 3, 7 chunks, stored text-only (no embed provider available). Re-ingesting the same path replaces the prior document.
- workspace/data/profiles/lvyuan-ingredients.md: Ingested workspace/data/profiles/lvyuan-ingredients.md into tenant "demo-food-co": document 4, 6 chunks, stored text-only (no embed provider available). Re-ingesting the same path replaces the prior document.
- workspace/data/regulations/gb2760-excerpt.md: Ingested workspace/data/regulations/gb2760-excerpt.md into tenant "demo-food-co": document 5, 6 chunks, stored text-only (no embed provider available). Re-ingesting the same path replaces the prior document.
- workspace/data/regulations/gb14881-excerpt.md: Ingested workspace/data/regulations/gb14881-excerpt.md into tenant "demo-food-co": document 6, 7 chunks, stored text-only (no embed provider available). Re-ingesting the same path replaces the prior document.

## kb_stats
Knowledge base for tenant "demo-food-co": 6 documents, 38 chunks (0 embedded), text-only retrieval (no embed provider available). Cumulative usage: 0 searches, 6 documents ingested (38 chunks), 0 embed texts.

## kb_search
### 调味品企业的食品添加剂合规要点
(text-only mode: no embed provider is available; results come from full-text search alone)

[1] workspace/data/regulations/gb2760-excerpt.md — GB 2760《食品安全国家标准 食品添加剂使用标准》要点摘录>一、标准定位 — regulation — chunk 1
  - 文档性质：国家标准要点转述（供知识库检索的教学性摘录，非官方文本）
- 归集日期：2026-08-25
- 适用对象：调味品、饮料、烘焙等食品生产企业

GB 2760 规定食品添加剂的使用原则、允许使用的品种、使用范围与最大使用量（或残留量）。凡在中华人民共和国境内生产的预包装与散装食品，其添加剂使用均应符合本标准。
[2] workspace/data/regulations/gb2760-excerpt.md — GB 2760《食品安全国家标准 食品添加剂使用标准》要点摘录>二、使用基本原则 — regulation — chunk 2
  GB 2760 规定食品添加剂的使用原则、允许使用的品种、使用范围与最大使用量（或残留量）。凡在中华人民共和国境内生产的预包装与散装食品，其添加剂使用均应符合本标准。

1. 不应对人体产生任何健康危害；不应掩盖食品腐败变质；不应掩盖质量缺陷或以掺杂、掺假、伪造为目的。
2. 在达到预期效果的前提下尽可能降低使用量。
3. 由配料带入的添加剂应符合带入原则：配料中的添加剂含量不应超过允许在终产品中的最大残留量，且带入量不应超过由配料按正常使用量折算的水平。
[3] workspace/data/meetings/2026-08-20-supplier-visit-hongfa.md — 宏发食品走访纪要（调味品事业部）>三、食品安全合规要点（品控主管口述整理） — meeting — chunk 3
  高盐稀态酱油发酵周期 90–120 天，车间采用日晒夜露工艺。品控主管强调：发酵车间温度控制在 15–30 摄氏度区间，超出区间会显著影响蛋白酶活性。复合调味料炒制工序的受热均匀度是批次稳定性的关键，企业已上线炒制温度在线监测。

1. 食品添加剂使用严格执行 GB 2760，复配添加剂按带入原则核算，成品标签须逐一列明。
2. 生产卫生规范执行 GB 14881，微生物监测按生产班次采样，大肠菌群、菌落总数为必检项。
3. 每年一次第三方体系审核（HACCP 为主），客户飞检重点查添加剂台账与留样记录。
4. 标签合规由品控与法务双审，营养成分表检测报告有效期内的检测机构出具。

Cite the sources above as [n] — document name and heading path — in your answer.

### 成本测算的原材料口径
(text-only mode: no embed provider is available; results come from full-text search alone)

[1] workspace/data/profiles/hongfa-food.md — 宏发食品企业档案>六、数字化现状 — profile — chunk 6
  原材料占比约 62%（其中白糖、豆粕合计约 27%，包装材料约 18%）；能耗与人工合计约 21%；损耗按投入产出倒轧核算，包装环节损耗单列。企业认可"采购到厂价 + 运杂费"的原材料成本口径。

ERP 与 MES 已上线五年，财务与生产数据可对接；无统一数据中台；对"行情 → 成本 → 定价"联动分析有明确付费意愿。
[2] workspace/data/profiles/hongfa-food.md — 宏发食品企业档案>五、成本结构特征（走访口径） — profile — chunk 5
  添加剂管理执行 GB 2760 与复配带入原则；生产卫生执行 GB 14881；微生物监测按班次采样（大肠菌群、菌落总数必检）；留样记录与添加剂台账为客户飞检重点。

原材料占比约 62%（其中白糖、豆粕合计约 27%，包装材料约 18%）；能耗与人工合计约 21%；损耗按投入产出倒轧核算，包装环节损耗单列。企业认可"采购到厂价 + 运杂费"的原材料成本口径。
[3] workspace/data/meetings/2026-08-27-project-kickoff.md — 食品产业知识库项目启动会纪要>二、数据采集进展 — meeting — chunk 2
  本项目基于 DeepSeek Harness 搭建食品产业最小化产品验证：先跑通"走访食品企业 → 数据入库 → agent 基于知识库产出带引用的真实结果"的闭环，再沿可信数据空间蓝图演进。外部 AI 厂商仅为辅助力量，主导权在己方。

集团内部已完成 7 家子公司走访调研。下一步转向外部食品企业采集，重点覆盖市场洞察、工艺、食品安全、成本测算、原材料供应链五类主题。资产管理项目前期开发的收数与存储底层逻辑与本项目一致，开发成果直接复用。
[4] workspace/data/meetings/2026-08-27-project-kickoff.md — 食品产业知识库项目启动会纪要>三、场景与交付 — meeting — chunk 3
  集团内部已完成 7 家子公司走访调研。下一步转向外部食品企业采集，重点覆盖市场洞察、工艺、食品安全、成本测算、原材料供应链五类主题。资产管理项目前期开发的收数与存储底层逻辑与本项目一致，开发成果直接复用。

围绕统计、建议类需求匹配场景功能。参考案例：某乳企联合云厂商建成 436 个生产端智能体、24 万活跃用户。首批 Agent 原型（企业数据助手、食品安全 Agent、退税管家 Agent）计划 9 月底联合演示，验收线为意图识别大于 85%、RAG 召回大于 80%。
[5] workspace/data/meetings/2026-08-27-project-kickoff.md — 食品产业知识库项目启动会纪要>四、成本测算口径（会议决议） — meeting — chunk 4
  围绕统计、建议类需求匹配场景功能。参考案例：某乳企联合云厂商建成 436 个生产端智能体、24 万活跃用户。首批 Agent 原型（企业数据助手、食品安全 Agent、退税管家 Agent）计划 9 月底联合演示，验收线为意图识别大于 85%、RAG 召回大于 80%。

走访企业的成本测算统一按以下口径归集，写入知识库供 agent 引用：

1. 原材料成本按"采购到厂价 + 运杂费"计，行情波动以月度均价平滑，不做期货对冲调整。
2. 能耗与人工按车间分摊，分摊基数取当月实际产量，不为产能利用率做修正。
3. 损耗率按"投入产出倒轧"核算，包装环节损耗单列，不计入原料损耗。
4. 跨期对比一律剔除税率变动影响。

Cite the sources above as [n] — document name and heading path — in your answer.

### 微生物监测必检项目
(text-only mode: no embed provider is available; results come from full-text search alone)

[1] workspace/data/profiles/hongfa-food.md — 宏发食品企业档案>四、食安管理要点 — profile — chunk 4
  - 食品生产许可证（调味品品类齐全）。
- HACCP 体系认证，每年一次第三方审核。
- 出口备案（蚝油小批量出口东南亚）。

添加剂管理执行 GB 2760 与复配带入原则；生产卫生执行 GB 14881；微生物监测按班次采样（大肠菌群、菌落总数必检）；留样记录与添加剂台账为客户飞检重点。
[2] workspace/data/profiles/hongfa-food.md — 宏发食品企业档案>五、成本结构特征（走访口径） — profile — chunk 5
  添加剂管理执行 GB 2760 与复配带入原则；生产卫生执行 GB 14881；微生物监测按班次采样（大肠菌群、菌落总数必检）；留样记录与添加剂台账为客户飞检重点。

原材料占比约 62%（其中白糖、豆粕合计约 27%，包装材料约 18%）；能耗与人工合计约 21%；损耗按投入产出倒轧核算，包装环节损耗单列。企业认可"采购到厂价 + 运杂费"的原材料成本口径。
[3] workspace/data/meetings/2026-08-20-supplier-visit-hongfa.md — 宏发食品走访纪要（调味品事业部）>三、食品安全合规要点（品控主管口述整理） — meeting — chunk 3
  高盐稀态酱油发酵周期 90–120 天，车间采用日晒夜露工艺。品控主管强调：发酵车间温度控制在 15–30 摄氏度区间，超出区间会显著影响蛋白酶活性。复合调味料炒制工序的受热均匀度是批次稳定性的关键，企业已上线炒制温度在线监测。

1. 食品添加剂使用严格执行 GB 2760，复配添加剂按带入原则核算，成品标签须逐一列明。
2. 生产卫生规范执行 GB 14881，微生物监测按生产班次采样，大肠菌群、菌落总数为必检项。
3. 每年一次第三方体系审核（HACCP 为主），客户飞检重点查添加剂台账与留样记录。
4. 标签合规由品控与法务双审，营养成分表检测报告有效期内的检测机构出具。

Cite the sources above as [n] — document name and heading path — in your answer.
