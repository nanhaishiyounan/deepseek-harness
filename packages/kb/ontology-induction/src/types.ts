/**
 * The induction model: draft classes/relations with the constraint quartet,
 * the corpus document face, the merged draft, the JSON-LD document types,
 * and the gate's structured vocabulary.
 * @module @deepseek-ai/dsh-ontology-induction/types
 */

/** Datatypes the induced property quartet understands (registry-v5 set). */
export type InducedDatatype = 'string' | 'number' | 'boolean' | 'date' | 'json'

/** One induced property definition (the constraint quartet's carrier). */
export interface InducedPropDef {
  readonly key: string
  readonly datatype: InducedDatatype
  readonly required?: boolean
  readonly isArray?: boolean
  readonly enumValues?: readonly string[]
  readonly pattern?: string
  readonly description?: string
}

/** One induced class candidate. */
export interface InducedClassDef {
  /** lowerCamelCase English registry id. */
  readonly id: string
  /** zh display label. */
  readonly label: string
  readonly description?: string
  /** Parent class id (subClassOf semantics); omitted = top anchor. */
  readonly extends?: string
  readonly props: readonly InducedPropDef[]
  /** Natural-key property name (the idempotent merge anchor). */
  readonly naturalKey?: string
  readonly aliases?: readonly string[]
  /** Corpus citation the candidate was induced from. */
  readonly evidence?: string
}

/** One legal (domain, range) pair with optional cardinality bounds. */
export interface InducedConstraint {
  readonly domain: string
  readonly range: string
  readonly cardinality?: { readonly min?: number; readonly max?: number }
}

/** One induced relation candidate. */
export interface InducedRelationDef {
  readonly id: string
  readonly label: string
  readonly description?: string
  readonly constraints: readonly InducedConstraint[]
  readonly kind: 'object' | 'hierarchical'
  readonly evidence?: string
}

/** One corpus document fed to induction (name + text). */
export interface InductionCorpusDoc {
  readonly name: string
  readonly text: string
}

/** The merged induction output before the gate decides admission. */
export interface OntologyDraft {
  readonly name: string
  readonly classes: readonly InducedClassDef[]
  readonly relations: readonly InducedRelationDef[]
  /** Per-document chunk accounting (the provenance footer). */
  readonly corpus: readonly { readonly doc: string; readonly chars: number }[]
  readonly inducedAt: string
}

/** One JSON-LD graph node (the serialized document's atom). */
export interface JsonLdGraphNode {
  readonly '@id': string
  readonly '@type': string
  /** Term slots stay writable: serializers assemble nodes incrementally. */
  [term: string]: unknown
}

/** The serialized ontology document: one @context plus a sorted @graph. */
export interface OntologyJsonLdDocument {
  readonly '@context': Readonly<Record<string, string>>
  readonly '@graph': readonly JsonLdGraphNode[]
}

/** Structured violation codes the ontology gate reports. */
export type OntologyGateCode =
  | 'GATE_EMPTY_ONTOLOGY'
  | 'GATE_DUPLICATE_CLASS'
  | 'GATE_DUPLICATE_RELATION'
  | 'GATE_DUPLICATE_PROP'
  | 'GATE_UNKNOWN_PARENT'
  | 'GATE_PARENT_CYCLE'
  | 'GATE_SELF_EXTENDS'
  | 'GATE_UNKNOWN_DOMAIN'
  | 'GATE_UNKNOWN_RANGE'
  | 'GATE_BAD_CARDINALITY'
  | 'GATE_BAD_NATURAL_KEY'
  | 'GATE_BAD_ENUM'
  | 'GATE_BAD_PATTERN'
  | 'GATE_BAD_ID'

/** One gate violation (SHACL ValidationResult shape: focus + path + message). */
export interface OntologyGateViolation {
  readonly code: OntologyGateCode
  /** The offending element's id (the SHACL focus node). */
  readonly focus: string
  /** The offending field when narrower than the whole element. */
  readonly path?: string
  readonly message: string
}

/** The gate's decision for one draft. */
export interface OntologyGateReport {
  readonly conforms: boolean
  readonly violations: readonly OntologyGateViolation[]
}
