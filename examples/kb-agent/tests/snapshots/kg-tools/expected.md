# kb-agent kg tools (keyless)

## tool surface — v1 graph tools stay off by default
- tools: kb_ingest, kb_ingest_url, kb_search, kb_stats, kg_query, kg_schema, kg_subgraph
## kg_schema() — the builtin ontology
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

## kg_subgraph({seeds:["张红喜"]}) — the expert-service answer
entities:
  - id: "seed:experts/1" | type: Expert | name: "张红喜" | depth: 0
      offers: "中亚货运动线方案", "海外仓风险应对咨询"
  - id: "seed:expert_services/1" | type: ExpertService | name: "中亚货运动线方案" | depth: 1
  - id: "seed:expert_services/2" | type: ExpertService | name: "海外仓风险应对咨询" | depth: 1
sources: "kb:kg-tools-seed"
truncated: false

## kg_subgraph({seeds:["漯河宏发食品有限公司"]}) — the customer-order answer
entities:
  - id: "seed:customers/1" | type: Customer | name: "漯河宏发食品有限公司" | depth: 0
      places: "ORD-11"
  - id: "seed:orders/11" | type: Order | name: "ORD-11" | depth: 1
sources: "kb:kg-tools-seed"
truncated: false

## kg_query(备份启用流程是什么) — the miss names every supported shape
Error: kg_query: no template matches this phrase; supported shapes: 张红喜的供货链 / 张红喜的订单 / 含山梨酸钾的产品 / 宏发食品供货的所有产品 / 宏发食品生产的产品 / 酱油使用的原料 / 酱油的合规信息 / 酱油的原料来自哪些供应商 / 20260911批次流向哪些客户 / 蚝油由哪些原料制成 / 宏发食品的供应商 / 宏发食品的客户 / 宏发食品相关的2跳关系 / 宏发食品和张红喜的关系 — fall back to kg_schema + kg_subgraph for anything else
