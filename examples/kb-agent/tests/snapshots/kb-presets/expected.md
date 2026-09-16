# kb-agent role presets (text-only degraded mode)

## roster
- enterprise-data-assistant: name=企业数据助手 order=11
  企业内部数据问答、业务记录读写与统计建议：覆盖市场洞察、工艺、食安、成本测算、供应链五类需求，引用企业档案与走访纪要，输出结构化建议；业务记录变更经对话内逐字段确认后落库，不做静默写。
- food-compliance-officer: name=AI 食安合规官 order=10
  食品安全合规问答：依据知识库中的 GB 2760/GB 14881 等法规标准作答，编号引用原文，输出审核要点清单；仅检索类工具，无破坏性操作。

## food-compliance-officer
- tools: kb_ingest, kb_ingest_url, kb_search, kb_stats, kg_query, kg_schema, kg_subgraph, switch_view, view_apply, view_state_get
- persona: contains "AI 食安合规官"
- kb_search "调味品 防腐剂 使用限量":
  (text-only mode: no embed provider is available; results come from full-text search alone)

  [1] workspace/data/profiles/lvyuan-ingredients.md — 绿源配料企业档案>一、基本情况 — profile — chunk 1
    - 档案编号：PROFILE-2026-0118
  - 归集日期：2026-08-22
  - 数据来源：走访调研（已脱敏）

## enterprise-data-assistant
- tools: assets_browse, connector_discover, connector_fetch, connector_transfer, kb_ingest, kb_ingest_url, kb_search, kb_stats, kg_query, kg_schema, kg_subgraph, lakehouse_query, lakehouse_tables, nb_collections, nb_create, nb_get, nb_list, nb_update, order_create, order_status, switch_view, view_apply, view_state_get
- persona: contains "企业数据助手"
- kb_search "宏发食品 成本测算 原材料":
  (text-only mode: no embed provider is available; results come from full-text search alone)

  [1] workspace/data/meetings/2026-08-27-project-kickoff.md — 食品产业知识库项目启动会纪要>二、数据采集进展 — meeting — chunk 2
    本项目基于 DeepSeek Harness 搭建食品产业最小化产品验证：先跑通"走访食品企业 → 数据入库 → agent 基于知识库产出带引用的真实结果"的闭环，再沿可信数据空间蓝图演进。外部 AI 厂商仅为辅助力量，主导权在己方。

  集团内部已完成 7 家子公司走访调研。下一步转向外部食品企业采集，重点覆盖市场洞察、工艺、食品安全、成本测算、原材料供应链五类主题。资产管理项目前期开发的收数与存储底层逻辑与本项目一致，开发成果直接复用。
