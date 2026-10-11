/**
 * Deterministic JSON-LD serialization for induced ontologies: drafts become
 * `@context` + sorted `@graph` documents carrying rdfs:Class / owl property
 * nodes and sh:NodeShape shapes, and documents parse back into drafts. The
 * LLM never writes syntax — it emits JSON candidates, code serializes RDF.
 * Round-trip equality is asserted by tests.
 * @module @deepseek-ai/dsh-ontology-induction/jsonld
 */

import type {
  InducedClassDef, InducedConstraint, InducedDatatype, InducedPropDef,
  InducedRelationDef, JsonLdGraphNode, OntologyDraft, OntologyJsonLdDocument,
} from './types.ts'

/** Prefix map every serialized document carries. */
const CONTEXT: Readonly<Record<string, string>> = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  owl: 'http://www.w3.org/2002/07/owl#',
  sh: 'http://www.w3.org/ns/shacl#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  dcterms: 'http://purl.org/dc/terms/',
}

/** The xsd datatype IRI each induced datatype maps to. */
const DATATYPE_IRI: Readonly<Record<InducedDatatype, string>> = {
  string: 'http://www.w3.org/2001/XMLSchema#string',
  number: 'http://www.w3.org/2001/XMLSchema#double',
  boolean: 'http://www.w3.org/2001/XMLSchema#boolean',
  date: 'http://www.w3.org/2001/XMLSchema#date',
  json: 'http://www.w3.org/2001/XMLSchema#anyType',
}

/**
 * The document IRI for one ontology name (the @graph member base).
 * @param name - the ontology draft name.
 * @returns the base IRI (no trailing #).
 */
export function ontologyBaseIri(name: string): string {
  return `https://dsh.local/ontology/${encodeURIComponent(name)}`
}

/**
 * The class node IRI inside one ontology document.
 * @param name - the ontology draft name.
 * @param classId - the class registry id.
 * @returns the class term IRI.
 */
export function classIri(name: string, classId: string): string {
  return `${ontologyBaseIri(name)}#Class_${classId}`
}

/**
 * The relation node IRI inside one ontology document.
 * @param name - the ontology draft name.
 * @param relationId - the relation registry id.
 * @returns the property term IRI.
 */
export function relationIri(name: string, relationId: string): string {
  return `${ontologyBaseIri(name)}#Relation_${relationId}`
}

/** The node shape IRI inside one ontology document. */
function shapeIri(name: string, classId: string): string {
  return `${ontologyBaseIri(name)}#Shape_${classId}`
}

/**
 * Serialize one induced class into its @graph members (the rdfs:Class node,
 * its owl property declarations, and the sh:NodeShape with per-property
 * property shapes).
 * @param name - the ontology draft name.
 * @param klass - the class candidate.
 * @returns the class's graph nodes in document order.
 */
function serializeClass(name: string, klass: InducedClassDef): JsonLdGraphNode[] {
  const nodes: JsonLdGraphNode[] = []
  const classNode: JsonLdGraphNode = {
    '@id': classIri(name, klass.id),
    '@type': 'rdfs:Class',
    'rdfs:label': klass.label,
  }
  if (klass.description !== undefined) classNode['rdfs:comment'] = klass.description
  if (klass.extends !== undefined) classNode['rdfs:subClassOf'] = { '@id': classIri(name, klass.extends) }
  if (klass.aliases !== undefined && klass.aliases.length > 0) classNode['skos:altLabel'] = [...klass.aliases]
  if (klass.naturalKey !== undefined) classNode['https://dsh.local/terms/naturalKey'] = klass.naturalKey
  if (klass.evidence !== undefined) classNode['dcterms:source'] = klass.evidence
  nodes.push(classNode)
  const propertyShapes: Record<string, unknown>[] = []
  for (const prop of klass.props) {
    nodes.push(serializePropDecl(name, klass.id, prop))
    propertyShapes.push(serializePropertyShape(name, klass.id, prop))
  }
  nodes.push({
    '@id': shapeIri(name, klass.id),
    '@type': 'sh:NodeShape',
    'sh:targetClass': { '@id': classIri(name, klass.id) },
    // The closed-world arm: no property outside the declared shape is legal.
    'sh:closed': true,
    'sh:property': propertyShapes,
  })
  return nodes
}

/**
 * Serialize one property declaration (owl:DatatypeProperty node).
 * @param name - the ontology draft name.
 * @param classId - the owning class id.
 * @param prop - the property definition.
 * @returns the declaration node.
 */
function serializePropDecl(name: string, classId: string, prop: InducedPropDef): JsonLdGraphNode {
  const node: JsonLdGraphNode = {
    '@id': `${ontologyBaseIri(name)}#Prop_${classId}_${prop.key}`,
    '@type': 'owl:DatatypeProperty',
    'rdfs:label': prop.key,
    'rdfs:domain': { '@id': classIri(name, classId) },
    'sh:datatype': { '@id': DATATYPE_IRI[prop.datatype] },
  }
  if (prop.description !== undefined) node['rdfs:comment'] = prop.description
  return node
}

/**
 * Serialize one property shape (the constraint quartet as SHACL arms).
 * @param name - the ontology draft name.
 * @param classId - the owning class id.
 * @param prop - the property definition.
 * @returns the property-shape object nested under the node shape.
 */
function serializePropertyShape(name: string, classId: string, prop: InducedPropDef): Record<string, unknown> {
  const shape: Record<string, unknown> = {
    '@id': `${ontologyBaseIri(name)}#PropShape_${classId}_${prop.key}`,
    'sh:path': { '@id': `${ontologyBaseIri(name)}#Prop_${classId}_${prop.key}` },
    'sh:datatype': { '@id': DATATYPE_IRI[prop.datatype] },
  }
  if (prop.required === true) {
    shape['sh:minCount'] = 1
    if (prop.isArray !== true) shape['sh:maxCount'] = 1
  }
  if (prop.enumValues !== undefined && prop.enumValues.length > 0) {
    shape['sh:in'] = { '@list': [...prop.enumValues] }
  }
  if (prop.pattern !== undefined) shape['sh:pattern'] = prop.pattern
  return shape
}

/**
 * Serialize one induced relation into its @graph member (an owl object
 * property with one rdfs:domain/rdfs:range pair per legal constraint).
 * @param name - the ontology draft name.
 * @param relation - the relation candidate.
 * @returns the relation node.
 */
function serializeRelation(name: string, relation: InducedRelationDef): JsonLdGraphNode {
  const node: JsonLdGraphNode = {
    '@id': relationIri(name, relation.id),
    '@type': 'owl:ObjectProperty',
    'rdfs:label': relation.label,
    'https://dsh.local/terms/kind': relation.kind,
  }
  if (relation.description !== undefined) node['rdfs:comment'] = relation.description
  const first = relation.constraints[0]
  if (first !== undefined) {
    node['rdfs:domain'] = { '@id': classIri(name, first.domain) }
    node['rdfs:range'] = { '@id': classIri(name, first.range) }
    if (relation.constraints.length > 1) {
      node['https://dsh.local/terms/constraints'] = relation.constraints.map(constraintOf)
    }
  }
  if (relation.evidence !== undefined) node['dcterms:source'] = relation.evidence
  return node
}

/**
 * Serialize one (domain, range, cardinality) constraint triple.
 * @param constraint - the legal pair.
 * @returns the plain JSON constraint object.
 */
function constraintOf(constraint: InducedConstraint): Record<string, unknown> {
  const out: Record<string, unknown> = { domain: constraint.domain, range: constraint.range }
  if (constraint.cardinality !== undefined) out['cardinality'] = { ...constraint.cardinality }
  return out
}

/**
 * Serialize one ontology draft into its JSON-LD document. Deterministic: the
 * @graph is sorted by @id so two serializations of one draft are byte-equal.
 * @param draft - the merged induction draft.
 * @returns the JSON-LD document.
 */
export function serializeOntologyDraft(draft: OntologyDraft): OntologyJsonLdDocument {
  const nodes: JsonLdGraphNode[] = [
    {
      '@id': ontologyBaseIri(draft.name),
      '@type': 'owl:Ontology',
      'rdfs:label': draft.name,
      'dcterms:created': draft.inducedAt,
    },
  ]
  for (const klass of draft.classes) nodes.push(...serializeClass(draft.name, klass))
  for (const relation of draft.relations) nodes.push(serializeRelation(draft.name, relation))
  const graph = [...nodes].sort((a, b) => (a['@id'] < b['@id'] ? -1 : a['@id'] > b['@id'] ? 1 : 0))
  return { '@context': { ...CONTEXT }, '@graph': graph }
}

/** The local-name tail of one IRI (after the last `#` or `/`). */
function localName(iri: string): string {
  const hash = iri.lastIndexOf('#')
  return hash === -1 ? iri.slice(iri.lastIndexOf('/') + 1) : iri.slice(hash + 1)
}

/**
 * Parse one JSON-LD document back into the draft model (the serializer's
 * inverse for the model's seats: ids, labels, hierarchy, props, constraints).
 * @param doc - the serialized document.
 * @returns the parsed ontology draft.
 */
export function parseOntologyJsonLd(doc: OntologyJsonLdDocument): OntologyDraft {
  const ontologyNode = doc['@graph'].find(node => node['@type'] === 'owl:Ontology')
  const name = ontologyNode !== undefined && typeof ontologyNode['rdfs:label'] === 'string'
    ? ontologyNode['rdfs:label']
    : 'unnamed'
  const inducedAt = ontologyNode !== undefined && typeof ontologyNode['dcterms:created'] === 'string'
    ? ontologyNode['dcterms:created']
    : ''
  const classes: InducedClassDef[] = []
  const relations: InducedRelationDef[] = []
  // Pass 1: property declarations keyed by their node ids, plus each node
  // shape's declared property order (the round-trip's declaration-order
  // carrier — the sorted @graph alone cannot preserve it).
  const propsById = new Map<string, InducedPropDef>()
  const propOrderOfClass = new Map<string, string[]>()
  for (const node of doc['@graph']) {
    if (node['@type'] === 'owl:DatatypeProperty') {
      const id = localName(node['@id'])
      const datatypeIri = node['sh:datatype']
      const datatypeEntry = datatypeIri !== null && typeof datatypeIri === 'object' && '@id' in datatypeIri
        ? Object.entries(DATATYPE_IRI).find(([, iri]) => iri === String((datatypeIri as { '@id': string })['@id']))
        : undefined
      propsById.set(node['@id'], {
        key: typeof node['rdfs:label'] === 'string' ? node['rdfs:label'] : id,
        datatype: datatypeEntry === undefined ? 'string' : (datatypeEntry[0] as InducedDatatype),
        ...(typeof node['rdfs:comment'] === 'string' ? { description: node['rdfs:comment'] } : {}),
      })
    } else if (node['@type'] === 'sh:NodeShape') {
      const target = node['sh:targetClass']
      const properties = node['sh:property']
      if (target !== null && typeof target === 'object' && '@id' in target && Array.isArray(properties)) {
        const order: string[] = []
        for (const shape of properties) {
          if (shape !== null && typeof shape === 'object') {
            const path = (shape as Record<string, unknown>)['sh:path']
            if (path !== null && typeof path === 'object' && '@id' in path) {
              order.push(String((path as { '@id': string })['@id']))
            }
          }
        }
        propOrderOfClass.set(String((target as { '@id': string })['@id']), order)
      }
    }
  }
  /** A class's props in declaration order: shape order first, stragglers after. */
  const propsOfClass = (classId: string): InducedPropDef[] => {
    const order = propOrderOfClass.get(classId) ?? []
    const ordered: InducedPropDef[] = []
    for (const propId of order) {
      const prop = propsById.get(propId)
      if (prop !== undefined) ordered.push(prop)
    }
    const orderedIds = new Set(order)
    for (const [propId, prop] of propsById) {
      if (!orderedIds.has(propId) && propId.startsWith(`${classId}#Prop_`)) ordered.push(prop)
    }
    return ordered
  }
  for (const node of doc['@graph']) {
    if (node['@type'] === 'rdfs:Class') {
      const id = localName(node['@id']).replace(/^Class_/, '')
      const subClassOf = node['rdfs:subClassOf']
      classes.push({
        id,
        label: typeof node['rdfs:label'] === 'string' ? node['rdfs:label'] : id,
        ...(typeof node['rdfs:comment'] === 'string' ? { description: node['rdfs:comment'] } : {}),
        ...(subClassOf !== null && typeof subClassOf === 'object' && '@id' in subClassOf
          ? { extends: localName(String((subClassOf as { '@id': string })['@id'])).replace(/^Class_/, '') }
          : {}),
        props: propsOfClass(`${classIri(name, id)}`),
        ...(typeof node['https://dsh.local/terms/naturalKey'] === 'string'
          ? { naturalKey: node['https://dsh.local/terms/naturalKey'] }
          : {}),
        ...(typeof node['dcterms:source'] === 'string' ? { evidence: node['dcterms:source'] } : {}),
      })
    } else if (node['@type'] === 'owl:ObjectProperty') {
      const id = localName(node['@id']).replace(/^Relation_/, '')
      const extra = node['https://dsh.local/terms/constraints']
      const firstDomain = node['rdfs:domain']
      const firstRange = node['rdfs:range']
      const constraints: InducedConstraint[] = []
      const fromList = Array.isArray(extra)
        ? extra.filter((entry): entry is Record<string, unknown> =>
          entry !== null && typeof entry === 'object' && 'domain' in entry && 'range' in entry)
        : []
      if (fromList.length > 0) {
        // The complete constraint list is authoritative when present; the
        // domain/range pair is its first member serialized separately.
        for (const entry of fromList) {
          constraints.push({ domain: String(entry['domain']), range: String(entry['range']) })
        }
      } else if (firstDomain !== null && typeof firstDomain === 'object' && '@id' in firstDomain
        && firstRange !== null && typeof firstRange === 'object' && '@id' in firstRange) {
        constraints.push({
          domain: localName(String((firstDomain as { '@id': string })['@id'])).replace(/^Class_/, ''),
          range: localName(String((firstRange as { '@id': string })['@id'])).replace(/^Class_/, ''),
        })
      }
      relations.push({
        id,
        label: typeof node['rdfs:label'] === 'string' ? node['rdfs:label'] : id,
        ...(typeof node['rdfs:comment'] === 'string' ? { description: node['rdfs:comment'] } : {}),
        constraints,
        kind: node['https://dsh.local/terms/kind'] === 'hierarchical' ? 'hierarchical' : 'object',
        ...(typeof node['dcterms:source'] === 'string' ? { evidence: node['dcterms:source'] } : {}),
      })
    }
  }
  return {
    name,
    classes: classes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    relations: relations.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    corpus: [],
    inducedAt,
  }
}
