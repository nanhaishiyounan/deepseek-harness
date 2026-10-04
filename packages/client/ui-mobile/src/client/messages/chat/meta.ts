/**
 * The draft cards' collection field metadata read (split from ChatView,
 * W8-B2): one nocobase.listMeta read mapped to per-collection field tables.
 * A failed read degrades to the raw-name fallback at the consumers.
 */

import type { NocobaseFieldView } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { FieldMetas } from '../../forms/task-cards.tsx'
import { rpc } from '../../rpc.ts'

/**
 * Read every collection's field metadata for the draft cards.
 * @returns the field tables keyed by collection name.
 */
export async function readCollectionMeta(): Promise<FieldMetas> {
  const value = await rpc('nocobase.listMeta', {})
  const metas = new Map<string, Map<string, NocobaseFieldView>>()
  for (const collection of value.collections) {
    const fields = new Map<string, NocobaseFieldView>()
    for (const field of collection.fields) fields.set(field.name, field)
    metas.set(collection.name, fields)
  }
  return metas
}
