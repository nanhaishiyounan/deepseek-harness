/**
 * The form contract (W22-R1): a deployment may pin the set of collections
 * the model may draft against (the whitelist — the machine-readable view of
 * the persona's form registry) plus, per collection, the minimal
 * required-field floor. The floor states which fields must APPEAR on the
 * draft card so the user can correct them later; values may stay prefilled
 * or null. Both checks fail closed with a pathed Chinese error the model
 * corrects in one retry; an empty configuration enforces nothing (generic
 * deployments keep the tool's contract-free behavior).
 *
 * @module @deepseek-ai/dsh-tool-present-card/form-contract
 */

import z from '@deepseek-ai/schemastery'
import type { PresentCardPayload } from './index.ts'

/** One required-field floor entry: any listed column name satisfies it. */
export interface RequiredFieldGroup {
  /** Synonym column names (`quantity`/`qty`, `product_name`/`product_id`). */
  readonly names: readonly string[]
  /** The business noun the error message shows (`数量`, `品名`). */
  readonly label: string
}

/** One registered collection: its card label and optional required floor. */
export interface FormCollectionSpec {
  /** The collection's business label (采购单), reserved for diagnostics. */
  readonly label: string
  /** Absent or empty means whitelisted only — no required-field floor. */
  readonly requiredFields?: readonly RequiredFieldGroup[]
}

/** The whole machine-readable form registry a deployment configures. */
export type FormCollections = Readonly<Record<string, FormCollectionSpec>>

/**
 * Plugin config: the form registry above. `formCollections` defaults to an
 * empty object, which disables both the whitelist and the floor.
 */
export interface Config {
  /** Collections the model may draft against, keyed by collection name. */
  formCollections?: FormCollections
}

// The `as unknown as z<Config>` bridge follows the llm-pi-ai precedent: the
// schemastery dict inference (every member optional-plus-null) cannot meet
// `exactOptionalPropertyTypes`, so the schema carries the runtime validation
// and the interface owns the static face.
export const Config = z.object({
  formCollections: z.dict(z.object({
    label: z.string(),
    requiredFields: z.array(z.object({
      names: z.array(z.string()),
      label: z.string(),
    })).default([]),
  })).default({}),
}) as unknown as z<Config>

/**
 * Enforce the form contract on one resolved payload: non-`form_draft`
 * payloads pass (submit_receipt and the other branches never draft), an
 * unregistered collection rejects wholesale with the legal candidates, and a
 * registered collection's required floor rejects per missing field with the
 * synonym names and business label so one retry lands the field on the card.
 * @param payload - the resolved (post-widget-rewrite) payload union member.
 * @param formCollections - the deployment's form registry; empty enforces
 * nothing.
 * @returns violation messages; empty when the contract holds.
 */
export function enforceFormContract(payload: PresentCardPayload, formCollections: FormCollections): string[] {
  if (payload.type !== 'form_draft') return []
  // An empty registry means "not configured", never "everything forbidden" —
  // a deployment with zero collections must not brick every form_draft.
  if (Object.keys(formCollections).length === 0) return []
  // `form` is optional in the shared schema (submit_receipt reuses the ref);
  // a form_draft without it fails the whitelist as the empty collection.
  const collection = payload.form?.collection ?? ''
  const spec = formCollections[collection]
  if (spec === undefined) {
    const legal = Object.keys(formCollections).sort().join('/')
    return [
      `payload.form.collection "${collection}" 不在表单注册表内（合法集合：${legal}）`
        + '——禁止漂移到未注册表或自造集合，请改用注册表内的表单类型重新出卡',
    ]
  }
  if (spec.requiredFields === undefined || spec.requiredFields.length === 0) return []
  return spec.requiredFields
    .filter(group => !payload.fields.some(field => group.names.includes(field.name)))
    .map(group =>
      `payload.fields缺少必答字段 ${group.names.join('/')}（${group.label}）`
      + '——必答字段必须出现在卡片上，值可预填（value 可为 null 或预填值）')
}
