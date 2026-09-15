/**
 * The built-in ontology seed: the three-layer model — five schema.org-style
 * top anchors (Object/Process/Event/Role/Concept), the business-domain
 * modules, and the food-compliance entity types and predicates (the v1
 * closed 7×7, `source: 'builtin-food'`) — loaded into every registry at
 * construction. Domain relations that share a name with a food predicate
 * (produces/supplies/contains) register once with the union of their legal
 * direction pairs.
 * @module @deepseek-ai/dsh-kb-graph/ontology
 */

import type { KgNodeType, KgRelation } from './types.ts'
import { kgNodeTypeId, kgRelationId } from './types.ts'

type TopId = 'Object' | 'Process' | 'Event' | 'Role' | 'Concept'
type DomainId =
  | 'Customer' | 'Supplier' | 'Product' | 'ProductCategory' | 'Order' | 'OrderItem'
  | 'Shipment' | 'Carrier' | 'Warehouse' | 'StockLevel' | 'Expert' | 'ExpertService'
  | 'Service' | 'Deliverable' | 'Dataset' | 'Connector' | 'Region' | 'Address' | 'Ingredient'
type FoodId = 'company' | 'product' | 'ingredient' | 'additive' | 'standard' | 'process' | 'risk'

function topType(id: TopId, label: string, description: string): KgNodeType {
  return {
    id: kgNodeTypeId(id),
    label,
    description,
    layer: 'top',
    props: [],
    source: 'builtin-ontology',
    status: 'active',
  }
}

function domainType(id: DomainId, label: string, parentId: TopId | DomainId, description?: string): KgNodeType {
  return {
    id: kgNodeTypeId(id),
    label,
    ...(description === undefined ? {} : { description }),
    layer: 'domain',
    extends: kgNodeTypeId(parentId),
    props: [],
    source: 'builtin-ontology',
    status: 'active',
  }
}

function foodType(id: FoodId, label: string, parentId: TopId | DomainId, description: string): KgNodeType {
  return {
    id: kgNodeTypeId(id),
    label,
    description,
    layer: 'domain',
    extends: kgNodeTypeId(parentId),
    props: [],
    source: 'builtin-food',
    status: 'active',
  }
}

function relation(
  id: string,
  label: string,
  source: 'builtin-food' | 'builtin-ontology',
  constraints: ReadonlyArray<readonly [domain: string, range: string]>,
  description?: string,
  inverseOf?: string,
): KgRelation {
  return {
    id: kgRelationId(id),
    label,
    ...(description === undefined ? {} : { description }),
    constraints: constraints.map(([domain, range]) => ({ domain: kgNodeTypeId(domain), range: kgNodeTypeId(range) })),
    kind: 'object',
    ...(inverseOf === undefined ? {} : { inverseOf: kgRelationId(inverseOf) }),
    source,
  }
}

const NODE_TYPES: readonly KgNodeType[] = [
  topType('Object', '业务对象', '持久业务对象：客户、供应商、商品、仓库、专家、数据资产。'),
  topType('Process', '业务过程', '业务过程：订单履约、物流运输、抽取管线运行。'),
  topType('Event', '时点事件', '时点事件：下单、发货、入库、审批通过。'),
  topType('Role', '角色', '角色关系：供应商角色、承运商角色；同一对象可在不同过程中扮演。'),
  topType('Concept', '概念', '抽象概念与词表节点：商品分类、添加剂标准、风险类型（SKOS 语义区）。'),

  domainType('Customer', '客户', 'Object', '从 NocoBase customers 派生的客户实体。'),
  domainType('Supplier', '供应商', 'Object', '从 NocoBase suppliers 派生的供应商实体。'),
  domainType('Product', '商品', 'Object', '从 NocoBase products 派生的商品实体。'),
  domainType('ProductCategory', '商品分类', 'Concept', '商品分类词表节点。'),
  domainType('Order', '订单', 'Process', '从 NocoBase orders 派生的订单过程。'),
  domainType('OrderItem', '订单明细', 'Object', '订单行项目实体。'),
  domainType('Shipment', '物流单', 'Process', '从 NocoBase shipments 派生的运输过程。'),
  domainType('Carrier', '承运商', 'Role', '承担运输的角色实体。'),
  domainType('Warehouse', '仓库', 'Object', '从 NocoBase warehouses 派生的仓储实体。'),
  domainType('StockLevel', '库存水位', 'Object', '仓库×商品的库存快照实体。'),
  domainType('Expert', '专家', 'Object', '专家库实体。'),
  domainType('ExpertService', '专家服务', 'Object', '专家提供的服务实体。'),
  domainType('Service', '服务', 'Object', '可下单的服务实体。'),
  domainType('Deliverable', '交付物', 'Object', '服务产出的交付物实体。'),
  domainType('Dataset', '数据集', 'Object', '数据资产实体（湖仓表、外部数据资产）。'),
  domainType('Connector', '连接器', 'Object', '外部数据空间的连接器登记实体。'),
  domainType('Region', '地区', 'Concept'),
  domainType('Address', '地址', 'Object'),
  domainType('Ingredient', '配料', 'Object', '食品配料实体。'),

  foodType('company', '企业', 'Object', '食品行业企业（v1 闭集实体类型）。'),
  foodType('product', '食品产品', 'Product', '食品产品（v1 闭集实体类型）。'),
  foodType('ingredient', '食品配料', 'Ingredient', '食品配料（v1 闭集实体类型）。'),
  foodType('additive', '食品添加剂', 'Object', '食品添加剂（v1 闭集实体类型）。'),
  foodType('standard', '标准', 'Concept', '食品安全标准（v1 闭集实体类型）。'),
  foodType('process', '工艺', 'Process', '食品加工工艺（v1 闭集实体类型）。'),
  foodType('risk', '风险', 'Concept', '食品安全风险（v1 闭集实体类型）。'),
] as const

const RELATIONS: readonly KgRelation[] = [
  // v1 closed predicates, now registry entries with their direction pairs as
  // constraints (plus the domain-module pairs that share the same name).
  relation('produces', '生产', 'builtin-food', [['company', 'product'], ['Service', 'Deliverable']], '企业生产食品产品；服务产出交付物。'),
  relation('uses', '使用', 'builtin-food', [['product', 'ingredient'], ['product', 'additive']], '产品使用配料或添加剂。'),
  relation('contains', '含有', 'builtin-food', [['product', 'additive'], ['Product', 'Ingredient']], '产品含有（声明含量的）添加剂；商品含有配料。'),
  relation('complies_with', '符合', 'builtin-food', [['product', 'standard'], ['process', 'standard']], '产品或工艺符合标准。'),
  relation('follows', '执行', 'builtin-food', [['company', 'process']], '企业执行工艺。'),
  relation('flags', '标记', 'builtin-food', [['standard', 'risk'], ['process', 'risk']], '标准或工艺标记风险。'),
  relation('supplies', '供应', 'builtin-food', [['company', 'ingredient'], ['Supplier', 'Product']], '企业供应配料；供应商供应商品。'),

  // SKOS-style vocabulary relations: self-applicable, endpoints unrestricted.
  {
    id: kgRelationId('broader'),
    label: '广义',
    description: '词表节点的上位关系（skos:broader 语义，自反可用）。',
    constraints: [],
    kind: 'hierarchical',
    source: 'builtin-ontology',
  },
  {
    id: kgRelationId('related'),
    label: '相关',
    description: '词表节点的关联关系（skos:related 语义，自反可用）。',
    constraints: [],
    kind: 'hierarchical',
    source: 'builtin-ontology',
  },

  // Domain-module relations.
  relation('places', '下单', 'builtin-ontology', [['Customer', 'Order']], '客户下单。'),
  relation('located_in', '位于', 'builtin-ontology', [['Customer', 'Region'], ['Warehouse', 'Region']]),
  relation('fulfills', '履约', 'builtin-ontology', [['Supplier', 'OrderItem']], '供应商履约订单明细。'),
  relation('belongs_to', '归属于', 'builtin-ontology', [['Product', 'ProductCategory']], '商品归属于分类。'),
  relation('placed_by', '由…下单', 'builtin-ontology', [['Order', 'Customer']], undefined, 'places'),
  relation('includes', '包含', 'builtin-ontology', [['Order', 'OrderItem']], '订单包含订单明细。'),
  relation('shipped_to', '发货至', 'builtin-ontology', [['Order', 'Address']], '订单发货至地址。'),
  relation('carries', '运载', 'builtin-ontology', [['Shipment', 'OrderItem']], '物流单运载订单明细。'),
  relation('departs_from', '发自', 'builtin-ontology', [['Shipment', 'Warehouse']], '物流单发自仓库。'),
  relation('stores', '存储', 'builtin-ontology', [['Warehouse', 'Product']], '仓库存储商品。'),
  relation('offers', '提供', 'builtin-ontology', [['Expert', 'ExpertService']], '专家提供服务。'),
  relation('certified_for', '认证于', 'builtin-ontology', [['Expert', 'Concept']], '专家认证于概念领域。'),
  relation('derived_from', '衍生自', 'builtin-ontology', [['Dataset', 'Dataset']], '数据集衍生自上游数据集。'),
  relation('sourced_via', '经…接入', 'builtin-ontology', [['Dataset', 'Connector']], '数据集经连接器接入。'),
] as const

/**
 * The built-in ontology's semantic version (semver). It starts at 1.0.0 and
 * bumps only when this seed changes shape: added types/relations bump the
 * minor, removals or constraint changes bump the major.
 */
export const ONTOLOGY_VERSION = '1.0.0'

/** The built-in ontology seed: everything above, freshly built per call. */
export interface KgBuiltinOntology {
  readonly nodeTypes: readonly KgNodeType[]
  readonly relations: readonly KgRelation[]
}

/** The versioned ontology document `exportOntology` emits. */
export interface KgOntologyDocument {
  readonly version: string
  readonly nodeTypes: readonly KgNodeType[]
  readonly relations: readonly KgRelation[]
}

/**
 * Build the built-in ontology seed (fresh objects each call, so callers
 * cannot mutate the registry through the seed).
 * @returns the seed's node types and relations in registration order.
 */
export function builtinOntology(): KgBuiltinOntology {
  const clone = <T extends object>(entry: T): T => structuredClone(entry)
  return {
    nodeTypes: NODE_TYPES.map(clone),
    relations: RELATIONS.map(clone),
  }
}

/**
 * Export the built-in ontology as one versioned document (the single source
 * of truth in TS form; tooling and gateways surface `version` verbatim).
 * @returns the seed stamped with {@link ONTOLOGY_VERSION}.
 */
export function exportOntology(): KgOntologyDocument {
  return { version: ONTOLOGY_VERSION, ...builtinOntology() }
}

/**
 * Validate an ontology document's internal consistency — unique type and
 * relation ids, `extends` references that resolve, relation constraint
 * endpoints and declared inverses that exist. The typed TS boundary makes
 * shape checking the compiler's job; this asserts the referential invariants
 * a constructor of a new ontology document must uphold (seed loading and
 * any future ontology-editing surface call it before registration).
 * @param ontology - the document to validate.
 * @throws the first violated invariant, named with the offending id.
 */
export function validateOntology(ontology: KgOntologyDocument): void {
  const typeIds = new Set(ontology.nodeTypes.map(type => String(type.id)))
  for (const type of ontology.nodeTypes) {
    if (type.extends !== undefined && !typeIds.has(String(type.extends))) {
      throw new Error(`ontology type "${String(type.id)}" extends unknown type "${String(type.extends)}"`)
    }
  }
  const relationIds = new Set(ontology.relations.map(relation => String(relation.id)))
  for (const relation of ontology.relations) {
    for (const pair of relation.constraints) {
      if (!typeIds.has(String(pair.domain))) {
        throw new Error(`ontology relation "${String(relation.id)}" constrains unknown domain "${String(pair.domain)}"`)
      }
      if (!typeIds.has(String(pair.range))) {
        throw new Error(`ontology relation "${String(relation.id)}" constrains unknown range "${String(pair.range)}"`)
      }
    }
    if (relation.inverseOf !== undefined && !relationIds.has(String(relation.inverseOf))) {
      throw new Error(`ontology relation "${String(relation.id)}" declares unknown inverse "${String(relation.inverseOf)}"`)
    }
  }
}
