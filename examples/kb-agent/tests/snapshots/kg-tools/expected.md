# kb-agent kg tools (keyless)

## tool surface — v1 graph tools stay off by default
- tools: kb_ingest, kb_ingest_url, kb_search, kb_stats, kg_query, kg_schema, kg_subgraph
## kg_schema() — before the build (builtin ontology only)
ontology_version: 1.2.0
entity_types:
  - id: "Customer" | label: "客户" | layer: domain | extends: Object
  - id: "Supplier" | label: "供应商" | layer: domain | extends: Object
  - id: "Product" | label: "商品" | layer: domain | extends: Object
  - id: "ProductCategory" | label: "商品分类" | layer: domain | extends: Concept
  - id: "Order" | label: "订单" | layer: domain | extends: Process
  - id: "OrderItem" | label: "订单明细" | layer: domain | extends: Object
  - id: "Shipment" | label: "物流单" | layer: domain | extends: Process
  - id: "Carrier" | label: "承运商" | layer: domain | extends: Role
  - id: "Warehouse" | label: "仓库" | layer: domain | extends: Object
  - id: "StockLevel" | label: "库存水位" | layer: domain | extends: Object
  - id: "Expert" | label: "专家" | layer: domain | extends: Object
  - id: "ExpertService" | label: "专家服务" | layer: domain | extends: Object
  - id: "Service" | label: "服务" | layer: domain | extends: Object
  - id: "Deliverable" | label: "交付物" | layer: domain | extends: Object
  - id: "Dataset" | label: "数据集" | layer: domain | extends: Object
  - id: "Connector" | label: "连接器" | layer: domain | extends: Object
  - id: "Region" | label: "地区" | layer: domain | extends: Concept
  - id: "Address" | label: "地址" | layer: domain | extends: Object
  - id: "Ingredient" | label: "配料" | layer: domain | extends: Object
  - id: "company" | label: "企业" | layer: domain | extends: Object
  - id: "product" | label: "食品产品" | layer: domain | extends: Product
  - id: "ingredient" | label: "食品配料" | layer: domain | extends: Ingredient
  - id: "additive" | label: "食品添加剂" | layer: domain | extends: Object
  - id: "standard" | label: "标准" | layer: domain | extends: Concept
  - id: "process" | label: "工艺" | layer: domain | extends: Process
  - id: "risk" | label: "风险" | layer: domain | extends: Concept
  - id: "packaging" | label: "包材" | layer: domain | extends: Object
relations:
  - id: "produces" | label: "生产" | kind: object | company→product / Service→Deliverable
  - id: "uses" | label: "使用" | kind: object | product→ingredient / product→additive
  - id: "contains" | label: "含有" | kind: object | product→additive / Product→Ingredient
  - id: "complies_with" | label: "符合" | kind: object | product→standard / process→standard
  - id: "follows" | label: "执行" | kind: object | company→process
  - id: "flags" | label: "标记" | kind: object | standard→risk / process→risk
  - id: "supplies" | label: "供应" | kind: object | company→ingredient / Supplier→Product
  - id: "broader" | label: "广义" | kind: hierarchical | 任意方向
  - id: "related" | label: "相关" | kind: hierarchical | 任意方向
  - id: "corefers_with" | label: "共指" | kind: object | 任意方向
  - id: "places" | label: "下单" | kind: object | Customer→Order
  - id: "located_in" | label: "位于" | kind: object | Customer→Region / Warehouse→Region
  - id: "fulfills" | label: "履约" | kind: object | Supplier→OrderItem
  - id: "belongs_to" | label: "归属于" | kind: object | Product→ProductCategory
  - id: "placed_by" | label: "由…下单" | kind: object | Order→Customer
  - id: "includes" | label: "包含" | kind: object | Order→OrderItem
  - id: "shipped_to" | label: "发货至" | kind: object | Order→Address
  - id: "carries" | label: "运载" | kind: object | Shipment→OrderItem
  - id: "departs_from" | label: "发自" | kind: object | Shipment→Warehouse
  - id: "stores" | label: "存储" | kind: object | Warehouse→Product
  - id: "offers" | label: "提供" | kind: object | Expert→ExpertService
  - id: "certified_for" | label: "认证于" | kind: object | Expert→Concept
  - id: "derived_from" | label: "衍生自" | kind: object | Dataset→Dataset
  - id: "sourced_via" | label: "经…接入" | kind: object | Dataset→Connector

## kgBuild.run() — full build report
  experts: rows=1 nodes=1 edges=0 newRows=1 tombstoned=0 skipped=false watermark=1
  expert_services: rows=2 nodes=2 edges=2 newRows=2 tombstoned=0 skipped=false watermark=2
  orders: rows=1 nodes=1 edges=1 newRows=1 tombstoned=0 skipped=false watermark=11
  corpus: docs=1 calls=1 entities=4 degraded=1 dropped=1 merged=1

## kg_schema() — after the build (nocobase-derived types live)
ontology_version: 1.2.0
entity_types:
  - id: "Object" | label: "业务对象" | layer: top
  - id: "Process" | label: "业务过程" | layer: top
  - id: "Event" | label: "时点事件" | layer: top
  - id: "Role" | label: "角色" | layer: top
  - id: "Concept" | label: "概念" | layer: top
  - id: "Customer" | label: "客户" | layer: domain | extends: Object
  - id: "Supplier" | label: "供应商" | layer: domain | extends: Object
  - id: "Product" | label: "商品" | layer: domain | extends: Object
  - id: "ProductCategory" | label: "商品分类" | layer: domain | extends: Concept
  - id: "Order" | label: "订单" | layer: domain | extends: Process
  - id: "OrderItem" | label: "订单明细" | layer: domain | extends: Object
  - id: "Shipment" | label: "物流单" | layer: domain | extends: Process
  - id: "Carrier" | label: "承运商" | layer: domain | extends: Role
  - id: "Warehouse" | label: "仓库" | layer: domain | extends: Object
  - id: "StockLevel" | label: "库存水位" | layer: domain | extends: Object
  - id: "Expert" | label: "专家" | layer: domain | extends: Object
  - id: "ExpertService" | label: "专家服务" | layer: domain | extends: Object
  - id: "Service" | label: "服务" | layer: domain | extends: Object
  - id: "Deliverable" | label: "交付物" | layer: domain | extends: Object
  - id: "Dataset" | label: "数据集" | layer: domain | extends: Object
  - id: "Connector" | label: "连接器" | layer: domain | extends: Object
  - id: "Region" | label: "地区" | layer: domain | extends: Concept
  - id: "Address" | label: "地址" | layer: domain | extends: Object
  - id: "Ingredient" | label: "配料" | layer: domain | extends: Object
  - id: "company" | label: "企业" | layer: domain | extends: Object
  - id: "product" | label: "食品产品" | layer: domain | extends: Product
  - id: "ingredient" | label: "食品配料" | layer: domain | extends: Ingredient
  - id: "additive" | label: "食品添加剂" | layer: domain | extends: Object
  - id: "standard" | label: "标准" | layer: domain | extends: Concept
  - id: "process" | label: "工艺" | layer: domain | extends: Process
  - id: "risk" | label: "风险" | layer: domain | extends: Concept
  - id: "packaging" | label: "包材" | layer: domain | extends: Object
  - id: "foodon:00001002" | label: "食品产品" | layer: domain | extends: product
  - id: "foodon:00001015" | label: "植物性食品" | layer: domain | extends: foodon:00001002
  - id: "foodon:00001264" | label: "豆类食品" | layer: domain | extends: foodon:00001015
  - id: "foodon:00001635" | label: "豆（菜豆）类食品" | layer: domain | extends: foodon:00001264
  - id: "foodon:00002153" | label: "植物种子类蔬菜食品" | layer: domain | extends: foodon:00001635
  - id: "foodon:00002265" | label: "大豆种子（田间）食品" | layer: domain | extends: foodon:00002153
  - id: "foodon:00002266" | label: "大豆食品" | layer: domain | extends: foodon:00002265
  - id: "foodon:03301415" | label: "大豆" | layer: domain | extends: foodon:00002266
  - id: "foodon:00004697" | label: "豆腐" | layer: domain | extends: foodon:03301415
  - id: "foodon:03420116" | label: "生物体材料" | layer: domain | extends: ingredient
  - id: "foodon:00004331" | label: "植物材料" | layer: domain | extends: foodon:03420116
  - id: "foodon:00002753" | label: "菜豆" | layer: domain | extends: foodon:00004331
  - id: "foodon:00002451" | label: "食品转化工艺" | layer: domain | extends: process
  - id: "foodon:00003368" | label: "食品接触材料" | layer: domain | extends: packaging
  - id: "foodon:00004277" | label: "受监管食品材料" | layer: domain | extends: standard
  - id: "experts" | label: "专家" | layer: domain | extends: Expert | status: draft | natural_key: id | props: name, org
  - id: "expert_services" | label: "专家服务" | layer: domain | extends: ExpertService | status: draft | natural_key: id | props: expertId, name
  - id: "orders" | label: "专家服务订单" | layer: domain | extends: Order | status: draft | natural_key: id | props: orderNo, serviceId, clientName
relations:
  - id: "produces" | label: "生产" | kind: object | company→product / Service→Deliverable
  - id: "uses" | label: "使用" | kind: object | product→ingredient / product→additive
  - id: "contains" | label: "含有" | kind: object | product→additive / Product→Ingredient
  - id: "complies_with" | label: "符合" | kind: object | product→standard / process→standard
  - id: "follows" | label: "执行" | kind: object | company→process
  - id: "flags" | label: "标记" | kind: object | standard→risk / process→risk
  - id: "supplies" | label: "供应" | kind: object | company→ingredient / Supplier→Product
  - id: "broader" | label: "广义" | kind: hierarchical | 任意方向
  - id: "related" | label: "相关" | kind: hierarchical | 任意方向
  - id: "corefers_with" | label: "共指" | kind: object | 任意方向
  - id: "places" | label: "下单" | kind: object | Customer→Order
  - id: "located_in" | label: "位于" | kind: object | Customer→Region / Warehouse→Region
  - id: "fulfills" | label: "履约" | kind: object | Supplier→OrderItem
  - id: "belongs_to" | label: "归属于" | kind: object | Product→ProductCategory
  - id: "placed_by" | label: "由…下单" | kind: object | Order→Customer
  - id: "includes" | label: "包含" | kind: object | Order→OrderItem
  - id: "shipped_to" | label: "发货至" | kind: object | Order→Address
  - id: "carries" | label: "运载" | kind: object | Shipment→OrderItem
  - id: "departs_from" | label: "发自" | kind: object | Shipment→Warehouse
  - id: "stores" | label: "存储" | kind: object | Warehouse→Product
  - id: "offers" | label: "提供" | kind: object | Expert→ExpertService
  - id: "certified_for" | label: "认证于" | kind: object | Expert→Concept
  - id: "derived_from" | label: "衍生自" | kind: object | Dataset→Dataset
  - id: "sourced_via" | label: "经…接入" | kind: object | Dataset→Connector
  - id: "expert_services.expert" | label: "expert_services.expert" | kind: object | expert_services→experts
  - id: "ordered_service" | label: "ordered_service" | kind: object | orders→expert_services

## kg_subgraph({seeds:["张红喜"]}) — the business-relation answer
entities:
  - id: "nocobase:experts:1" | type: experts | name: "张红喜" | depth: 0
  - id: "nocobase:expert_services:1" | type: expert_services | name: "中亚货运动线方案" | depth: 1
      expert_services.expert: "张红喜"
  - id: "nocobase:expert_services:2" | type: expert_services | name: "海外仓风险应对咨询" | depth: 1
      expert_services.expert: "张红喜"
  - id: "nocobase:orders:11" | type: orders | name: "ORD-11" | depth: 2
      ordered_service: "中亚货运动线方案"
sources: "nocobase:expert_services/1", "nocobase:expert_services/2", "nocobase:orders/11"
truncated: false

## kg_subgraph({seeds:["漯河宏发食品有限公司"]}) — corpus entities with the degraded bucket
entities:
  - id: "kb:supply-note.md#漯河宏发食品有限公司" | type: company | name: "漯河宏发食品有限公司" | depth: 0
      produces: "宏发牌酱油"
  - id: "kb:supply-note.md#宏发牌酱油" | type: product | name: "宏发牌酱油" | depth: 1
sources: "kb:supply-note.md"
truncated: false

## kg_query(备份启用流程是什么) — the miss names every supported shape
Error: kg_query: no template matches this phrase; supported shapes: 张红喜的供货链 / 张红喜的订单 / 含山梨酸钾的产品 / 宏发食品供货的所有产品 / 宏发食品生产的产品 / 酱油使用的原料 / 酱油的合规信息 / 酱油的原料来自哪些供应商 / 20260911批次流向哪些客户 / 蚝油由哪些原料制成 / 宏发食品的供应商 / 宏发食品的客户 / 宏发食品相关的2跳关系 / 宏发食品和张红喜的关系 — fall back to kg_schema + kg_subgraph for anything else

## kgBuild.run() again — the idempotent pass
  experts: rows=1 nodes=0 edges=0 newRows=0 tombstoned=0 skipped=true watermark=1
  expert_services: rows=2 nodes=0 edges=0 newRows=0 tombstoned=0 skipped=true watermark=2
  orders: rows=1 nodes=0 edges=0 newRows=0 tombstoned=0 skipped=true watermark=11
  corpus: docs=1 calls=0 entities=0 degraded=0 dropped=0 merged=0
