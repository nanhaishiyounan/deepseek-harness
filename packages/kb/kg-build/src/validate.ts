/**
 * The SHACL validation gate over extraction: compiles the registry snapshot
 * into shapes, validates candidate entities and relations, and runs the
 * explanatory feedback loop (≤3 rounds,「仅重出被点名条目」hard rule, then
 * the quarantine — still-violating entries never reach the store; the
 * survivors do). This module owns the loop's policy; the shapes IR and the
 * report vocabulary live in `@deepseek-ai/dsh-kb-graph/shacl`.
 * @module @deepseek-ai/dsh-kg-build/validate
 */

import { compileShaclShapes, formatShaclFeedback, kgNodeTypeId, kgRelationId, validateShaclCandidates } from '@deepseek-ai/dsh-kb-graph'
import type { ShaclReport, ShaclShapes } from '@deepseek-ai/dsh-kb-graph'
import {
  adjudicateShaped, buildExtractionPrompt, buildInstructKgcPrompt, extractChunkProtocol, parseExtractionAnswer,
} from './extract.ts'
import type { ExtractionLlm, ExtractionProtocol, OntologyView } from './extract.ts'
import type { DroppedRelation, ExtractedEntity, ExtractedRelation, ExtractionOutcome } from './types.ts'

/** The feedback-retry ceiling: after this many corrective rounds, leftovers quarantine. */
export const SHACL_MAX_FEEDBACK_ROUNDS = 3

/** One validated extraction run's verdict. */
export interface ValidatedExtraction {
  /** The survivors (what may land). */
  readonly outcome: ExtractionOutcome
  /** How many feedback rounds ran (0 = first pass conformed). */
  readonly rounds: number
  /** Entities still violating after the ceiling — quarantined, never landing. */
  readonly quarantinedEntities: readonly ExtractedEntity[]
  /** Relations still violating after the ceiling — quarantined, never landing. */
  readonly quarantinedRelations: readonly ExtractedRelation[]
  /** The final report (undefined when the first pass conformed). */
  readonly finalReport: ShaclReport | undefined
}

/** Compile one registry snapshot into the shapes IR. */
function shapesOf(view: OntologyView): ShaclShapes {
  return compileShaclShapes({
    nodeTypes: view.entityTypes.map(type => ({
      id: kgNodeTypeId(type.id),
      label: type.label,
      layer: 'domain' as const,
      props: type.props ?? [],
      source: 'builtin-ontology' as const,
      status: 'active' as const,
    })),
    relations: view.relations.map(relation => ({
      id: kgRelationId(relation.id),
      label: relation.label,
      constraints: relation.constraints.map(pair => ({
        domain: kgNodeTypeId(pair.domain),
        range: kgNodeTypeId(pair.range),
        ...(pair.cardinality === undefined ? {} : { cardinality: pair.cardinality }),
      })),
      kind: 'object' as const,
      source: 'builtin-ontology' as const,
    })),
  })
}

/**
 * Validate one adjudicated outcome against the registry's shapes. The
 * endpoint types for relation checks come from the entities the outcome
 * itself declares (the same map adjudication used).
 * @param view - the registry snapshot.
 * @param outcome - the adjudicated extraction outcome.
 * @returns the SHACL report.
 */
export function validateExtractionOutcome(view: OntologyView, outcome: ExtractionOutcome): ShaclReport {
  const shapes = shapesOf(view)
  const typeOfName = new Map(outcome.entities.map(entity => [entity.name, String(entity.resolvedType)]))
  return validateShaclCandidates(
    shapes,
    outcome.entities.map(entity => ({
      name: entity.name,
      typeId: String(entity.resolvedType),
      ...(entity.props === undefined ? {} : { props: entity.props }),
    })),
    outcome.relations.map(relation => ({
      relationId: String(relation.relation),
      srcName: relation.subjectName,
      srcTypeId: typeOfName.get(relation.subjectName) ?? '',
      dstName: relation.objectName,
      dstTypeId: typeOfName.get(relation.objectName) ?? '',
    })),
  )
}

/** Split a report into the named entity names and relation keys it convicts. */
function namedViolators(report: ShaclReport): { entityNames: Set<string>; relationKeys: Set<string> } {
  const entityNames = new Set<string>()
  const relationKeys = new Set<string>()
  for (const result of report.results) {
    if (result.focusNode.includes('—[')) relationKeys.add(result.focusNode)
    else entityNames.add(result.focusNode)
  }
  return { entityNames, relationKeys }
}

/** The relation focus-node key format shacl composes; mirrored for survivor filtering. */
function relationKeyOf(relation: ExtractedRelation): string {
  return `${relation.subjectName} —[${String(relation.relation)}]→ ${relation.objectName}`
}

/**
 * Run the full gated extraction: extract under the protocol, validate, and
 * on violations re-prompt with the explanatory feedback up to
 * {@link SHACL_MAX_FEEDBACK_ROUNDS} times. Survivors return in `outcome`;
 * still-violating entries quarantine.
 * @param llm - the LLM face.
 * @param view - the registry snapshot.
 * @param chunkText - the chunk handed to the model.
 * @param protocol - the extraction protocol.
 * @param options - `maxRounds` override for tests.
 * @returns the validated extraction verdict.
 */
export async function extractValidated(
  llm: ExtractionLlm,
  view: OntologyView,
  chunkText: string,
  protocol: ExtractionProtocol,
  options: { readonly maxRounds?: number } = {},
): Promise<ValidatedExtraction> {
  const maxRounds = options.maxRounds ?? SHACL_MAX_FEEDBACK_ROUNDS
  const system = protocol === 'instruct-kgc' ? buildInstructKgcPrompt(view) : buildExtractionPrompt(view)
  let outcome = await extractChunkProtocol(llm, view, chunkText, protocol)
  let report = validateExtractionOutcome(view, outcome)
  let rounds = 0
  while (!report.conforms && rounds < maxRounds) {
    rounds += 1
    const answer = await llm.complete(
      `${system}\n\n${formatShaclFeedback(report)}`,
      chunkText,
    )
    const shaped = parseExtractionAnswer(answer)
    if ('badJson' in shaped || 'badShape' in shaped) break
    outcome = { ...adjudicateShaped(shaped, view), retried: true }
    report = validateExtractionOutcome(view, outcome)
  }
  if (report.conforms) {
    return { outcome, rounds, quarantinedEntities: [], quarantinedRelations: [], finalReport: undefined }
  }
  const { entityNames, relationKeys } = namedViolators(report)
  const survivors: ExtractionOutcome = {
    entities: outcome.entities.filter(entity => !entityNames.has(entity.name)),
    relations: outcome.relations.filter(relation => !relationKeys.has(relationKeyOf(relation))),
    dropped: outcome.dropped,
    retried: outcome.retried,
  }
  return {
    outcome: survivors,
    rounds,
    quarantinedEntities: outcome.entities.filter(entity => entityNames.has(entity.name)),
    quarantinedRelations: outcome.relations.filter(relation => relationKeys.has(relationKeyOf(relation))),
    finalReport: report,
  }
}

/** Re-export for callers that need the formatter (the demo script's log). */
export { formatShaclFeedback }

/** The dropped-relations type alias import used above; keeps the module's face stable. */
export type { DroppedRelation }
