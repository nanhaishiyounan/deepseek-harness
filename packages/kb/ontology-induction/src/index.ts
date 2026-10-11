/**
 * The ontology induction library (pure; no plugin body): schema induction
 * over corpus documents with the SHACL gate and deterministic JSON-LD
 * serialization. Consumers compose this with the LLM capability and the
 * Neo4j graph store (the kb-agent scripts are the reference assembly).
 * @module @deepseek-ai/dsh-ontology-induction
 */

export { formatGateFeedback, gateOntologyDraft } from './gate.ts'
export { classIri, ontologyBaseIri, parseOntologyJsonLd, relationIri, serializeOntologyDraft } from './jsonld.ts'
export {
  buildInductionPrompt, buildRepairPrompt, chunkCorpus, decodeCandidates, mergeCandidates, runInduction,
} from './induction.ts'
export type {
  ChunkCandidates, CorpusChunk, InductionLlm, InductionOptions, InductionRunResult, InductionTranscriptEntry,
} from './induction.ts'
export type {
  InducedClassDef, InducedConstraint, InducedDatatype, InducedPropDef, InducedRelationDef, InductionCorpusDoc,
  JsonLdGraphNode, OntologyDraft, OntologyGateCode, OntologyGateReport, OntologyGateViolation, OntologyJsonLdDocument,
} from './types.ts'
