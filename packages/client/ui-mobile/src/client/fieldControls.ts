/**
 * Draft-card field controls: the mapping from a NocoBase collection field
 * (nocobase.listMeta's projection) to the antd-mobile edit widget the draft
 * card mounts — text→Input, enum→Picker, date→DatePicker, bool→Switch,
 * number→Stepper, relation→Picker over the target table's rows. The enum
 * vocabularies the wire does not carry ride a local table measured from the
 * business schema; unknown fields fall back to plain text.
 */

import type { NocobaseFieldView } from '@deepseek-ai/dsh-host-apiproxy/api'

/** The widget kinds a draft field can render as. */
export type FieldControlKind = 'text' | 'textarea' | 'number' | 'date' | 'bool' | 'enum' | 'relation'

/** One draft field's resolved widget spec. */
export interface FieldControlSpec {
  readonly kind: FieldControlKind
  /** Field name as the draft carries it (the collection's column name). */
  readonly name: string
  /** Display label (meta title, else the name). */
  readonly label: string
  /** Enum options (enum only; empty when the vocabulary is unknown). */
  readonly options: readonly string[]
  /** Relation target collection (relation only). */
  readonly target: string | undefined
}

/**
 * The SRM supplier lifecycle's closed value domain (h4's LIFECYCLE options;
 * the admission flow transitions among the first four). Exported because the
 * display-side word table derives its lifecycle entries from this list
 * (W24-R1): a state added here cannot silently miss its people-language
 * mapping on the render side.
 */
export const SUPPLIER_LIFECYCLE_STATES: readonly string[] = [
  'potential', 'reviewing', 'qualified', 'preferred', 'restricted', 'frozen', 'rejected', 'eliminated',
]

/**
 * Enum vocabularies the schema read does not project (select-field options),
 * measured from the deployed business tables.
 */
const KNOWN_ENUMS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  hub_po_purchase_orders: {
    status: ['draft', 'sent', 'received', 'cancelled'],
  },
  hub_po_suppliers: {
    status: ['待审核', 'active', 'inactive'],
  },
  srm_suppliers: {
    lifecycle_status: SUPPLIER_LIFECYCLE_STATES,
  },
  srm_capas: {
    status: ['initiated', 'verifying', 'replied', 'closed'],
  },
}

/**
 * The display label of one field.
 * @param field - the schema field (undefined when the meta read missed it).
 * @param name - the draft's field name.
 * @returns the meta title when present, else the raw name.
 */
export function fieldLabelOf(field: NocobaseFieldView | undefined, name: string): string {
  return field?.title !== undefined && field.title !== '' ? field.title : name
}

/**
 * The meta lookup for one draft field: a model-declared name the meta table
 * keys by its association column (`supplier_id` vs `supplier`) retries once
 * with the `_id` suffix stripped, so the relation still resolves its target
 * instead of degrading to the bare-input fallback.
 * @param meta - the collection's field table when the read carried one.
 * @param name - the draft's field name.
 * @returns the schema field under the raw name, the stripped one, or undefined.
 */
export function metaFieldOf(
  meta: ReadonlyMap<string, NocobaseFieldView> | undefined,
  name: string,
): NocobaseFieldView | undefined {
  const direct = meta?.get(name)
  if (direct !== undefined) return direct
  return name.endsWith('_id') ? meta?.get(name.slice(0, -3)) : undefined
}

/**
 * Resolve one draft field's widget spec.
 * @param collection - the draft's target collection.
 * @param name - the field name.
 * @param field - the schema field when listMeta carried one.
 * @returns the widget spec the draft card renders.
 */
export function fieldControlOf(
  collection: string,
  name: string,
  field: NocobaseFieldView | undefined,
): FieldControlSpec {
  const base = { name, label: fieldLabelOf(field, name) }
  const type = field?.type
  if (type === 'boolean') return { ...base, kind: 'bool', options: [], target: undefined }
  if (type === 'integer' || type === 'float' || type === 'bigInt' || type === 'double') {
    return { ...base, kind: 'number', options: [], target: undefined }
  }
  if (type === 'dateOnly' || type === 'date') return { ...base, kind: 'date', options: [], target: undefined }
  if (type === 'text' || type === 'textarea') return { ...base, kind: 'textarea', options: [], target: undefined }
  if (type === 'belongsTo') {
    // The owner column resolves against users; picking a user is not a
    // business decision, so it stays read-only text on the card.
    if (field?.target === 'users') return { ...base, kind: 'text', options: [], target: undefined }
    return { ...base, kind: 'relation', options: [], target: field?.target }
  }
  const options = KNOWN_ENUMS[collection]?.[name]
  if (options !== undefined) return { ...base, kind: 'enum', options, target: undefined }
  return { ...base, kind: 'text', options: [], target: undefined }
}

/**
 * The candidate display column of a relation target's rows (Picker labels).
 * @param target - the relation target collection name.
 * @returns the column to label options with.
 */
export function relationLabelColumn(target: string): string {
  return target === 'users' ? 'nickname' : 'name'
}
