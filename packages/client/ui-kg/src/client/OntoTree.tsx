/**
 * The ontology tree editor: the registry's class hierarchy (subClassOf) as a
 * collapsible tree with FoodOn anchors, constraint summaries, and manual
 * CRUD through the KGCL op vocabulary — every edit is one confirm-previewed
 * `kg.ontologyEdit` call (the server validates, persists, journals the
 * ontology revision, and books the human-edit episode). No tree library:
 * the hierarchy is a two-level `<ul>` recursion the legend already owns.
 * @module @deepseek-ai/dsh-client-ui-kg/client/OntoTree
 */

import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { Button, ErrorStrip } from '@deepseek-ai/dsh-client-ui-primitives'
import { semanticColorOf, semanticRootOf } from './presentation.ts'
import type { KgNodeTypeRow, KgOntologyEditResultRow, KgOntologyOpRow, KgRelationRow } from './kgTypes.ts'
import css from './kg.module.css'

/** One tree node: the registry row plus its resolved children. */
interface OntoTreeNode {
  readonly type: KgNodeTypeRow
  readonly children: readonly OntoTreeNode[]
}

/** The inline editor kinds one row can open (one at a time). */
type EditorKind = 'add' | 'rename' | 'move' | 'deprecate'

/** Full component props (plain data + callbacks; the view owns the wiring). */
export interface OntoTreeProps {
  /** The registry rows (kg.schema legend). */
  types: readonly KgNodeTypeRow[]
  /** The registered relations (the cardinality editor's pair source). */
  relations: readonly KgRelationRow[]
  /** The newest ontology-revision audit rows (the edit trail footer). */
  revisions: readonly { readonly id: number; readonly summary: string; readonly created_at: string }[]
  /** Apply one KGCL op set; resolves with the receipt or rejects with the refusal. */
  onEdit: (ops: readonly KgOntologyOpRow[]) => Promise<KgOntologyEditResultRow>
  /** Locale lookup. */
  t: (key: 'onto.title' | 'onto.hint' | 'onto.addChild' | 'onto.rename' | 'onto.move' | 'onto.deprecate'
    | 'onto.apply' | 'onto.cancel' | 'onto.idPlaceholder' | 'onto.labelPlaceholder' | 'onto.parentPlaceholder'
    | 'onto.replacePlaceholder' | 'onto.revisions' | 'onto.empty'
    | 'onto.propsCount' | 'onto.cardinality', params?: Record<string, string>) => string
}

/** Which editing kind a row opened, keyed by class id. */
type OpenEditor = { readonly kind: EditorKind; readonly id: string } | undefined

/**
 * Build the class tree: roots are rows without a resolvable parent; a row
 * whose `extends` dangles (a stale registry edge) also roots, so the tree
 * never drops classes.
 * @param types - the registry rows.
 * @returns the roots, children sorted by label then id.
 */
export function buildOntoTree(types: readonly KgNodeTypeRow[]): readonly OntoTreeNode[] {
  const byId = new Map(types.map(type => [type.id, type]))
  const childrenOf = new Map<string, KgNodeTypeRow[]>()
  const roots: KgNodeTypeRow[] = []
  for (const type of types) {
    const parentId = type.extends
    const parent = parentId === undefined ? undefined : byId.get(parentId)
    if (parentId === undefined || parent === undefined || parent.id === type.id) roots.push(type)
    else {
      const bucket = childrenOf.get(parentId)
      if (bucket === undefined) childrenOf.set(parentId, [type])
      else bucket.push(type)
    }
  }
  const sortRows = (rows: readonly KgNodeTypeRow[]): KgNodeTypeRow[] =>
    [...rows].sort((a, b) => a.label.localeCompare(b.label, 'zh') || a.id.localeCompare(b.id))
  const build = (type: KgNodeTypeRow): OntoTreeNode => ({
    type,
    children: sortRows(childrenOf.get(type.id) ?? []).map(build),
  })
  return sortRows(roots).map(build)
}

/**
 * Render the ontology tree editor.
 * @param props - the registry rows, the relations, the revision trail, and the edit callback.
 * @returns the tree column.
 */
export function OntoTree({ types, relations, revisions, onEdit, t }: OntoTreeProps): JSX.Element {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [editor, setEditor] = useState<OpenEditor>(undefined)
  const [notice, setNotice] = useState<{ readonly kind: 'ok' | 'error'; readonly text: string } | undefined>(undefined)

  const tree = useMemo(() => buildOntoTree(types), [types])
  const byId = useMemo(() => new Map(types.map(type => [type.id, type])), [types])
  const parentOf = useMemo(
    () => (id: string): string | undefined => byId.get(id)?.extends,
    [byId],
  )
  const movableTargets = useMemo(
    () => types.filter(type => type.status !== 'deprecated'),
    [types],
  )

  /** Toggle one branch's collapse state. */
  const toggle = (id: string): void => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Run one op set through the RPC and surface the receipt or refusal inline. */
  const run = (ops: readonly KgOntologyOpRow[]): void => {
    setNotice(undefined)
    onEdit(ops).then((result) => {
      setEditor(undefined)
      setNotice({ kind: 'ok', text: `revision #${String(result.revision_id)}：${result.applied.join('；')}` })
    }).catch((error: unknown) => {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : String(error) })
    })
  }

  /** Render one row's inline editor by kind. */
  const editorOf = (type: KgNodeTypeRow, kind: EditorKind): JSX.Element => {
    if (kind === 'add') {
      return <InlineAddChild parentId={type.id} disabled={type.status === 'deprecated'} onSubmit={run} onCancel={() => { setEditor(undefined) }} t={t} />
    }
    if (kind === 'rename') {
      return <InlineRename type={type} onSubmit={run} onCancel={() => { setEditor(undefined) }} t={t} />
    }
    if (kind === 'move') {
      return <InlineMove type={type} targets={movableTargets} onSubmit={run} onCancel={() => { setEditor(undefined) }} t={t} />
    }
    return <InlineDeprecate type={type} targets={types} onSubmit={run} onCancel={() => { setEditor(undefined) }} t={t} />
  }

  /** Render one tree node recursively. */
  const rowOf = (node: OntoTreeNode): JSX.Element => {
    const type = node.type
    const open = editor !== undefined && editor.id === type.id ? editor.kind : undefined
    const isCollapsed = collapsed.has(type.id)
    return (
      <li key={type.id} className={css.ontoRow}>
        <div className={css.ontoLine} data-onto-status={type.status}>
          {node.children.length > 0
            ? (
              <button type="button" className={css.ontoToggle} aria-label={isCollapsed ? '+' : '−'} onClick={() => { toggle(type.id) }}>
                {isCollapsed ? '＋' : '−'}
              </button>
            )
            : <span className={css.ontoToggleSpacer} aria-hidden="true" />}
          <span
            className={css.ontoDot}
            style={{ background: semanticColorOf(semanticRootOf(type.id, parentOf)) }}
            aria-hidden="true"
          />
          <span className={css.ontoLabel}>{type.label}</span>
          <code className={css.ontoId}>{type.id}</code>
          {type.status === 'deprecated' && <span className={css.ontoBadge} data-onto-badge="deprecated">{t('onto.deprecate')}</span>}
          {type.status === 'draft' && <span className={css.ontoBadge} data-onto-badge="draft">draft</span>}
          {type.source === 'foodon-imported' && <span className={css.ontoBadge} data-onto-badge="foodon">FoodOn</span>}
          {type.prop_keys.length > 0 && (
            <span className={css.ontoMeta}>{t('onto.propsCount', { n: String(type.prop_keys.length) })}</span>
          )}
          {type.foodon_uri !== undefined && (
            <a className={css.ontoFoodon} href={type.foodon_uri} target="_blank" rel="noreferrer">{type.foodon_id ?? 'FOODON'}</a>
          )}
          <span className={css.ontoActions}>
            <Button variant="ghost" size="sm" onClick={() => { setEditor(open === 'add' ? undefined : { kind: 'add', id: type.id }) }}>{t('onto.addChild')}</Button>
            <Button variant="ghost" size="sm" onClick={() => { setEditor(open === 'rename' ? undefined : { kind: 'rename', id: type.id }) }}>{t('onto.rename')}</Button>
            <Button variant="ghost" size="sm" onClick={() => { setEditor(open === 'move' ? undefined : { kind: 'move', id: type.id }) }}>{t('onto.move')}</Button>
            {type.status !== 'deprecated' && (
              <Button variant="ghost" size="sm" onClick={() => { setEditor(open === 'deprecate' ? undefined : { kind: 'deprecate', id: type.id }) }}>{t('onto.deprecate')}</Button>
            )}
          </span>
        </div>
        {open !== undefined && editorOf(type, open)}
        {node.children.length > 0 && !isCollapsed && (
          <ul className={css.ontoChildren}>{node.children.map(rowOf)}</ul>
        )}
      </li>
    )
  }

  return (
    <section className={css.ontoZone} data-testid="kg-onto-tree">
      <h3 className={css.zoneTitle}>{t('onto.title')}</h3>
      <p className={css.ontoHint}>{t('onto.hint')}</p>
      {notice?.kind === 'error' && <ErrorStrip message={notice.text} />}
      {notice?.kind === 'ok' && <p className={css.ontoNotice} data-testid="kg-onto-notice">{notice.text}</p>}
      {relations.length > 0 && (
        <p className={css.ontoCardinality}>
          {t('onto.cardinality')}
          {relations.map(relation => (
            <code key={relation.id} className={css.ontoRelationId}>{relation.id}</code>
          ))}
        </p>
      )}
      {tree.length === 0
        ? <p className={css.legendLoading}>{t('onto.empty')}</p>
        : <ul className={css.ontoTree}>{tree.map(rowOf)}</ul>}
      {revisions.length > 0 && (
        <div className={css.ontoRevisions} data-testid="kg-onto-revisions">
          <h4 className={css.qualitySubTitle}>{t('onto.revisions')}</h4>
          <ul>
            {revisions.map(revision => (
              <li key={revision.id}>
                <span className={css.ontoRevisionId}>#{String(revision.id)}</span>
                {revision.summary}
                <span className={css.ontoRevisionTime}>{revision.created_at.slice(0, 19).replace('T', ' ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/** Shared submit/cancel plumbing for the inline editors. */
interface InlineProps {
  readonly onSubmit: (ops: readonly KgOntologyOpRow[]) => void
  readonly onCancel: () => void
  readonly t: OntoTreeProps['t']
}

/** The add-child form: class id + label under one parent. */
function InlineAddChild(
  { parentId, disabled, onSubmit, onCancel, t }: InlineProps & { readonly parentId: string; readonly disabled: boolean },
): JSX.Element {
  const [id, setId] = useState('')
  const [label, setLabel] = useState('')
  const valid = /^[A-Za-z][A-Za-z0-9_-]*$/.test(id) && label.trim().length > 0 && !disabled
  return (
    <div className={css.ontoEditor} data-testid="kg-onto-editor-add">
      <input className={css.ontoInput} value={id} placeholder={t('onto.idPlaceholder')} aria-label={t('onto.idPlaceholder')} onChange={(event) => { setId(event.target.value) }} />
      <input className={css.ontoInput} value={label} placeholder={t('onto.labelPlaceholder')} aria-label={t('onto.labelPlaceholder')} onChange={(event) => { setLabel(event.target.value) }} />
      <Button variant="ghost" size="sm" disabled={!valid} onClick={() => { onSubmit([{ op: 'add_node', target_id: id, label: label.trim(), parent_id: parentId }]) }}>{t('onto.apply')}</Button>
      <Button variant="ghost" size="sm" onClick={onCancel}>{t('onto.cancel')}</Button>
    </div>
  )
}

/** The rename form. */
function InlineRename({ type, onSubmit, onCancel, t }: InlineProps & { readonly type: KgNodeTypeRow }): JSX.Element {
  const [label, setLabel] = useState(type.label)
  return (
    <div className={css.ontoEditor} data-testid="kg-onto-editor-rename">
      <input className={css.ontoInput} value={label} placeholder={t('onto.labelPlaceholder')} aria-label={t('onto.labelPlaceholder')} onChange={(event) => { setLabel(event.target.value) }} />
      <Button variant="ghost" size="sm" disabled={label.trim().length === 0 || label.trim() === type.label} onClick={() => { onSubmit([{ op: 'rename_node', target_id: type.id, label: label.trim() }]) }}>{t('onto.apply')}</Button>
      <Button variant="ghost" size="sm" onClick={onCancel}>{t('onto.cancel')}</Button>
    </div>
  )
}

/** The re-parent form (a `<select>` of every non-deprecated class). */
function InlineMove(
  { type, targets, onSubmit, onCancel, t }:
    InlineProps & { readonly type: KgNodeTypeRow; readonly targets: readonly KgNodeTypeRow[] },
): JSX.Element {
  const options = targets.filter(candidate => candidate.id !== type.id && candidate.id !== type.extends)
  return (
    <div className={css.ontoEditor} data-testid="kg-onto-editor-move">
      <select
        className={css.ontoSelect}
        aria-label={t('onto.parentPlaceholder')}
        defaultValue=""
        onChange={(event) => {
          const next = event.target.value
          if (next !== '') onSubmit([{ op: 'set_parent', target_id: type.id, new_parent_id: next }])
        }}
      >
        <option value="">{t('onto.parentPlaceholder')}</option>
        {options.map(option => <option key={option.id} value={option.id}>{`${option.label}（${option.id}）`}</option>)}
      </select>
      <Button variant="ghost" size="sm" onClick={onCancel}>{t('onto.cancel')}</Button>
    </div>
  )
}

/** The deprecate (KGCL NodeObsoletion) form with an optional replacement. */
function InlineDeprecate(
  { type, targets, onSubmit, onCancel, t }:
    InlineProps & { readonly type: KgNodeTypeRow; readonly targets: readonly KgNodeTypeRow[] },
): JSX.Element {
  const options = targets.filter(candidate => candidate.id !== type.id)
  return (
    <div className={css.ontoEditor} data-testid="kg-onto-editor-deprecate">
      <select
        className={css.ontoSelect}
        aria-label={t('onto.replacePlaceholder')}
        defaultValue=""
        onChange={(event) => {
          const replacedBy = event.target.value
          onSubmit([{
            op: 'deprecate_node',
            target_id: type.id,
            ...(replacedBy === '' ? {} : { replaced_by: replacedBy }),
          }])
        }}
      >
        <option value="">{t('onto.replacePlaceholder')}</option>
        {options.map(option => <option key={option.id} value={option.id}>{`${option.label}（${option.id}）`}</option>)}
      </select>
      <Button variant="ghost" size="sm" onClick={onCancel}>{t('onto.cancel')}</Button>
    </div>
  )
}
