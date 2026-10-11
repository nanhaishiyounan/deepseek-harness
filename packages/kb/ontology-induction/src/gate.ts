/**
 * The ontology SHACL gate: schema-level validation of one induction draft
 * before anything is stored or materialized. Referential integrity (parents,
 * relation endpoints), uniqueness, cardinality sanity, natural-key
 * membership, and the enum/pattern arms of the constraint quartet are all
 * decided here; violations come back as structured SHACL-Result-shaped rows
 * (focus + path + message) the induction repair loop re-feeds to the model.
 * @module @deepseek-ai/dsh-ontology-induction/gate
 */

import type {
  OntologyDraft, OntologyGateCode, OntologyGateReport, OntologyGateViolation,
} from './types.ts'

/** Registry-id shape the gate requires (lowerCamelCase English). */
const ID_PATTERN = /^[a-z][A-Za-z0-9]*$/u

/**
 * Validate one ontology draft. Pure and side-effect free; the caller decides
 * what a refusing report means (induction repairs, manual review queue).
 * @param draft - the merged induction draft.
 * @returns the gate's decision with one violation row per finding.
 */
export function gateOntologyDraft(draft: OntologyDraft): OntologyGateReport {
  const violations: OntologyGateViolation[] = []
  const classIds = new Set<string>()
  for (const klass of draft.classes) {
    if (!ID_PATTERN.test(klass.id)) {
      violations.push(violation('GATE_BAD_ID', klass.id, 'id',
        `class id "${klass.id}" must be lowerCamelCase English`))
    }
    if (classIds.has(klass.id)) {
      violations.push(violation('GATE_DUPLICATE_CLASS', klass.id, 'id', 'two classes share this id'))
    }
    classIds.add(klass.id)
  }
  // Parent referential integrity and cycle detection (second pass: the graph
  // is complete only after every id is known).
  const parentOf = new Map<string, string>()
  for (const klass of draft.classes) {
    if (klass.extends !== undefined) {
      if (klass.extends === klass.id) {
        violations.push(violation('GATE_SELF_EXTENDS', klass.id, 'extends', 'a class extends itself'))
      } else if (!classIds.has(klass.extends)) {
        violations.push(violation('GATE_UNKNOWN_PARENT', klass.id, 'extends',
          `parent class "${klass.extends}" is not declared in this draft`))
      } else {
        parentOf.set(klass.id, klass.extends)
      }
    }
  }
  for (const start of parentOf.keys()) {
    let cursor: string | undefined = parentOf.get(start)
    const seen = new Set<string>([start])
    while (cursor !== undefined) {
      if (seen.has(cursor)) {
        violations.push(violation('GATE_PARENT_CYCLE', start, 'extends',
          `the extends chain from "${start}" reaches a cycle at "${cursor}"`))
        break
      }
      seen.add(cursor)
      cursor = parentOf.get(cursor)
    }
  }
  // Per-class property shape: duplicate keys, natural-key membership, enum
  // and pattern arms.
  for (const klass of draft.classes) {
    const propKeys = new Set<string>()
    for (const prop of klass.props) {
      if (propKeys.has(prop.key)) {
        violations.push(violation('GATE_DUPLICATE_PROP', klass.id, prop.key,
          'two properties on this class share a key'))
      }
      propKeys.add(prop.key)
      if (prop.enumValues !== undefined && prop.enumValues.length === 0) {
        violations.push(violation('GATE_BAD_ENUM', klass.id, prop.key,
          'enumValues is present but empty'))
      }
      if (prop.pattern !== undefined) {
        try {
          new RegExp(prop.pattern, 'u')
        } catch {
          violations.push(violation('GATE_BAD_PATTERN', klass.id, prop.key,
            `pattern "${prop.pattern}" is not a valid regular expression`))
        }
      }
    }
    if (klass.naturalKey !== undefined && !propKeys.has(klass.naturalKey)) {
      violations.push(violation('GATE_BAD_NATURAL_KEY', klass.id, 'naturalKey',
        `naturalKey "${klass.naturalKey}" is not one of the class's declared properties`))
    }
  }
  // Relation referential integrity and cardinality sanity.
  const relationIds = new Set<string>()
  for (const relation of draft.relations) {
    if (!ID_PATTERN.test(relation.id)) {
      violations.push(violation('GATE_BAD_ID', relation.id, 'id',
        `relation id "${relation.id}" must be lowerCamelCase English`))
    }
    if (relationIds.has(relation.id)) {
      violations.push(violation('GATE_DUPLICATE_RELATION', relation.id, 'id',
        'two relations share this id'))
    }
    relationIds.add(relation.id)
    for (const [index, constraint] of relation.constraints.entries()) {
      if (!classIds.has(constraint.domain)) {
        violations.push(violation('GATE_UNKNOWN_DOMAIN', relation.id, `constraints[${index}].domain`,
          `domain class "${constraint.domain}" is not declared in this draft`))
      }
      if (!classIds.has(constraint.range)) {
        violations.push(violation('GATE_UNKNOWN_RANGE', relation.id, `constraints[${index}].range`,
          `range class "${constraint.range}" is not declared in this draft`))
      }
      const cardinality = constraint.cardinality
      if (cardinality !== undefined) {
        const min = cardinality.min ?? 0
        const max = cardinality.max ?? Number.POSITIVE_INFINITY
        if (min < 0 || max < 0 || min > max) {
          violations.push(violation('GATE_BAD_CARDINALITY', relation.id, `constraints[${index}].cardinality`,
            `cardinality bounds are not sane (min=${String(cardinality.min)}, max=${String(cardinality.max)})`))
        }
      }
    }
  }
  if (draft.classes.length === 0) {
    violations.push(violation('GATE_EMPTY_ONTOLOGY', draft.name, 'classes',
      'the draft declares no classes'))
  }
  return { conforms: violations.length === 0, violations }
}

/**
 * Render one gate report as the feedback string the induction repair loop
 * re-feeds to the model (and operators read in transcripts).
 * @param report - the gate's decision.
 * @returns the human-readable violation list, empty when the report conforms.
 */
export function formatGateFeedback(report: OntologyGateReport): string {
  if (report.conforms) return ''
  return report.violations
    .map(entry => `- [${entry.code}] ${entry.focus}${entry.path === undefined ? '' : ` (${entry.path})`}: ${entry.message}`)
    .join('\n')
}

/**
 * Mint one violation row.
 * @param code - the structured violation code.
 * @param focus - the offending element's id.
 * @param path - the offending field when narrower than the element.
 * @param message - the operator-facing reason.
 * @returns the violation row.
 */
function violation(
  code: OntologyGateCode, focus: string, path: string | undefined, message: string,
): OntologyGateViolation {
  return { code, focus, ...(path === undefined ? {} : { path }), message }
}
