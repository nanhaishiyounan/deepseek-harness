/**
 * The form-loop task cards (v2): the editable DraftCard (draft), the human
 * review ReviewCard (pending/rejected, with the AI-vs-final diff and the
 * 确认提交/驳回 double action), and the ReceiptCard (submitted, with the
 * landing-row read-back). All three are chat-embedded white cards driven by
 * the phase the card-state derivation replays from the durable log.
 */

import { useEffect, useMemo, useState, type JSX } from 'react'
import type { NocobaseFieldView } from '@deepseek-ai/dsh-host-apiproxy/api'
import { Button, Dialog, Steps } from 'antd-mobile'
import { CheckCircle2, CircleX, FilePenLine } from 'lucide-react'
import { portalContainer } from '../portal.ts'
import type { FormDraft, PushReceipt } from '../form-draft.ts'
import { fieldControlOf, type FieldControlSpec } from '../fieldControls.ts'
import { rpc } from '../rpc.ts'
import { Badge } from '../ui.tsx'
import { useRelationLabel } from './relation-label.ts'
import { FieldWidget } from './FieldWidget.tsx'
import css from './task-cards.module.css'

/** One collection's field map (name → schema field). */
export type CollectionFieldMeta = ReadonlyMap<string, NocobaseFieldView>
/** Every collection's field map (collection → fields). */
export type FieldMetas = ReadonlyMap<string, CollectionFieldMeta>

/** Draft-card props: the AI draft, the meta, the edits, and the review handoff. */
export interface DraftCardProps {
  readonly draft: FormDraft
  readonly meta: CollectionFieldMeta
  readonly values: Readonly<Record<string, string>>
  readonly onEdit: (name: string, value: string) => void
  readonly onSubmitReview: () => void
  readonly disabled: boolean
}

/**
 * The editable draft card: typed widgets per field, AI-prefill badge, and
 * the single「提交审核」primary action.
 * @param props - the draft, meta, current edits, edit sink, review sink, busy gate.
 * @returns the draft card.
 */
export function DraftCard({ draft, meta, values, onEdit, onSubmitReview, disabled }: DraftCardProps): JSX.Element {
  const specs = useMemo(
    () => Object.keys(draft.fields).map(name => fieldControlOf(draft.collection, name, meta.get(name))),
    [draft, meta],
  )
  return (
    <section className={css.card} data-testid="draft-card" aria-label="AI 填表草稿卡">
      <header className={css.header}>
        <span className={css.titleRow}>
          <FilePenLine size={14} aria-hidden="true" className={css.titleIcon} />
          <span className={css.title}>{draft.title}</span>
        </span>
        <Badge tone="primary">AI 预填 · 可编辑</Badge>
      </header>
      <p className={css.collection}>目标业务表 {draft.collection}</p>
      <div className={css.fields}>
        {specs.map(spec => (
          <FieldWidget
            key={spec.name}
            spec={spec}
            value={values[spec.name] ?? ''}
            locked={false}
            onChange={(value) => { onEdit(spec.name, value) }}
          />
        ))}
      </div>
      <footer className={css.actions}>
        <Button
          block
          color="primary"
          size="small"
          disabled={disabled}
          onClick={onSubmitReview}
          className={css.primaryButton}
        >
          提交审核
        </Button>
      </footer>
    </section>
  )
}

/** Review-card props: the draft, final values, and the confirm/reject sinks. */
export interface ReviewCardProps {
  readonly draft: FormDraft
  readonly meta: CollectionFieldMeta
  readonly confirmedFields: Readonly<Record<string, string>>
  readonly onConfirm: () => void
  readonly onReject: () => void
  readonly disabled: boolean
}

/**
 * The human-review card: locked fields with the AI-vs-final diff highlight
 * and the「确认提交/驳回」double action behind a confirmation dialog.
 * @param props - the draft, meta, locked finals, action sinks, busy gate.
 * @returns the review card.
 */
export function ReviewCard(
  { draft, meta, confirmedFields, onConfirm, onReject, disabled }: ReviewCardProps,
): JSX.Element {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const rows = useMemo(() => {
    return Object.entries(confirmedFields).map(([name, value]) => ({
      name,
      value,
      original: draft.fields[name],
      spec: fieldControlOf(draft.collection, name, meta.get(name)),
    }))
  }, [draft, meta, confirmedFields])
  return (
    <section className={css.card} data-testid="review-card" aria-label="提交确认卡">
      <header className={css.header}>
        <CardTitle className={css.title} draft={draft} meta={meta} values={confirmedFields} />
        <Badge tone="warning">待人工审核</Badge>
      </header>
      <p className={css.collection}>确认后写入业务表 {draft.collection}</p>
      <div className={css.fields}>
        {rows.map(row => (
          <div key={row.name} className={css.diffRow}>
            <span className={css.label}>{row.spec.label}</span>
            <span className={css.diffValues}>
              {row.original !== undefined && row.original !== row.value && (
                <del className={css.diffOld}>
                  <RelationLabelValue spec={row.spec} value={row.original} />
                </del>
              )}
              <span className={row.original !== undefined && row.original !== row.value ? css.diffNew : css.diffSame}>
                <RelationLabelValue spec={row.spec} value={row.value} />
              </span>
            </span>
          </div>
        ))}
      </div>
      <footer className={css.actionsPair}>
        <Button block size="small" disabled={disabled} onClick={onReject} className={css.ghostButton}>
          驳回
        </Button>
        <Button
          block
          color="primary"
          size="small"
          disabled={disabled}
          onClick={() => { setConfirmOpen(true) }}
          className={css.primaryButton}
        >
          确认提交
        </Button>
      </footer>
      <Dialog
        visible={confirmOpen}
        getContainer={portalContainer}
        title="确认提交"
        content={`即将写入业务表 ${draft.collection}，提交后由 AI 同事执行落库并回传行号。`}
        closeOnMaskClick
        // The dialog's close path rides the mask layer, which the jsdom
        // coverage lane never mounts.
        /* v8 ignore next -- mask-layer close is jsdom-untestable. */
        onClose={() => { setConfirmOpen(false) }}
        actions={[
          { key: 'cancel', text: '再想想' },
          {
            key: 'ok',
            text: '确认写入',
            bold: true,
            danger: false,
            onClick: () => {
              setConfirmOpen(false)
              onConfirm()
            },
          },
        ]}
      />
    </section>
  )
}

/** Rejected-card props: the draft and the re-edit handoff. */
export interface RejectedCardProps {
  readonly draft: FormDraft
  readonly onRedraft: () => void
  readonly disabled: boolean
}

/**
 * The rejected card: destructive state with the「重新编辑」return to draft.
 * @param props - the draft, the re-edit sink, and the busy gate.
 * @returns the rejected card.
 */
export function RejectedCard({ draft, onRedraft, disabled }: RejectedCardProps): JSX.Element {
  return (
    <section className={`${css.card} ${css.cardRejected}`} data-testid="rejected-card" aria-label="已驳回草稿卡">
      <header className={css.header}>
        <span className={css.title}>{draft.title}</span>
        <Badge tone="destructive">已驳回</Badge>
      </header>
      <p className={css.rejectedNote}>
        <CircleX size={14} aria-hidden="true" className={css.titleIcon} />
        草稿已作废，未写库。可以重新编辑后再提交。
      </p>
      <footer className={css.actions}>
        <Button block size="small" disabled={disabled} onClick={onRedraft} className={css.ghostButton}>
          重新编辑
        </Button>
      </footer>
    </section>
  )
}

/** Receipt-card props: the draft, the meta, the confirmed finals, and the receipt. */
export interface ReceiptCardProps {
  readonly draft: FormDraft
  readonly meta: CollectionFieldMeta
  /** Final field values the confirm-push locked in (the landed row's sources). */
  readonly finalFields: Readonly<Record<string, string>>
  readonly receipt: PushReceipt
}

/**
 * The landing receipt card: the submitted state, the row anchor, the
 * 补槽→人审→落库 step bar, and the live row read back from the business
 * surface (the persisted record, not the agent's claim).
 * @param props - the draft, the meta, the confirmed finals, and the parsed push receipt.
 * @returns the receipt card.
 */
export function ReceiptCard({ draft, meta, finalFields, receipt }: ReceiptCardProps): JSX.Element {
  const row = useReceiptRow(receipt)
  return (
    <section className={css.card} data-testid="receipt-card" aria-label="落库回执卡">
      <header className={css.header}>
        <span className={css.titleRow}>
          <CheckCircle2 size={14} aria-hidden="true" className={css.successIcon} />
          <CardTitle className={css.title} draft={draft} meta={meta} values={finalFields} suffix=" · 已落库" />
        </span>
        <Badge tone="success">已提交</Badge>
      </header>
      <div className={css.steps}>
        <Steps direction="horizontal" current={2}>
          <Steps.Step title="对话补槽" />
          <Steps.Step title="人工审核" />
          <Steps.Step title="写入业务表" />
        </Steps>
      </div>
      <p className={css.collection}>
        业务表 {receipt.collection} · 行 id={String(receipt.rowId)}
      </p>
      <div className={css.receiptBody} data-testid="receipt-row">
        {row === undefined
          ? <span className={css.receiptHint}>正在实查业务表行…</span>
          : <pre className={css.receiptPre}>{JSON.stringify(row, null, 2)}</pre>}
      </div>
    </section>
  )
}

/** Read the landing row back from the business surface (实查). */
function useReceiptRow(receipt: PushReceipt): unknown {
  const [row, setRow] = useState<unknown>(undefined)
  useEffect(() => {
    const alive = { current: true }
    void (async () => {
      try {
        const page = await rpc('nocobase.list', {
          collection: receipt.collection,
          filter: [{ field: 'id', op: 'eq', value: receipt.rowId }],
          page: 1,
          page_size: 1,
        })
        if (alive.current && page.rows.length > 0) setRow(page.rows[0])
      } catch {
        // The receipt text still renders; the row read-back is verification.
      }
    })()
    return () => { alive.current = false }
  }, [receipt])
  return row
}

/** The title's relation-name group: the trailing full-width paren group（…）. */
const TITLE_NAME_GROUP = /^(.*)（[^（）]*）$/

/**
 * Map the title's relation-name group to the resolved label. A resolved
 * non-empty label rewrites the group; every unresolved state (read in
 * flight, missed, empty, or degraded to the raw id) shows the `#id`
 * placeholder — the title never keeps the AI-prefilled name the card could
 * not verify.
 * @param title - the draft's static title text.
 * @param label - the relation value's resolved target-row label (undefined while unresolved, the raw id after degradation).
 * @param rawId - the relation slot's current raw value (undefined, empty, or non-numeric when there is no id to stand in).
 * @returns the title with the relation-name group mapped to the label or the raw-id placeholder.
 */
function titleWithRelationName(title: string, label: string | undefined, rawId: string | undefined): string {
  if (rawId === undefined || rawId === '' || !Number.isFinite(Number(rawId))) return title
  if (!TITLE_NAME_GROUP.test(title)) return title
  const open = title.lastIndexOf('（')
  const degraded = String(Number(rawId))
  const resolved = label !== undefined && label !== '' && label !== degraded ? label : `#${rawId}`
  return `${title.slice(0, open)}（${resolved}）`
}

/**
 * The draft's title relation-name slot: the first relation field (draft field
 * order) with the value the card holds, falling back to the draft's prefilled
 * value when the card's map does not carry the field.
 * @param draft - the card's draft (field order and prefill fallback).
 * @param meta - the collection's schema fields.
 * @param values - the field values the card holds (the confirmed finals).
 * @returns the relation field's spec and value, or undefined when the draft has no relation field.
 */
function relationNameSlot(
  draft: FormDraft,
  meta: CollectionFieldMeta,
  values: Readonly<Record<string, string>>,
): { readonly spec: FieldControlSpec; readonly value: string } | undefined {
  for (const [name, prefill] of Object.entries(draft.fields)) {
    const spec = fieldControlOf(draft.collection, name, meta.get(name))
    if (spec.kind !== 'relation') continue
    return { spec, value: values[name] ?? prefill }
  }
  return undefined
}

/** Card-title props: the draft, the meta, the card's field values, the span class, and the suffix. */
interface CardTitleProps {
  readonly draft: FormDraft
  readonly meta: CollectionFieldMeta
  readonly values: Readonly<Record<string, string>>
  /** The title span's css-modules class (undefined when the stylesheet key misses). */
  readonly className: string | undefined
  /** Text appended after the mapped title (the receipt's「 · 已落库」). */
  readonly suffix?: string
}

/**
 * The card title with its relation-name group mapped to the value the card
 * holds: the persona writes the relation row's name into the trailing paren
 * group, and a user re-selection must not leave the AI-prefilled name stale
 * against the landed row. Resolution rides the shared relation-label read
 * (one retry, then the raw id); drafts without a numeric relation slot keep
 * the title verbatim.
 * @param props - the draft, the meta, the card's field values (the confirmed finals), the title span's class, and the trailing suffix.
 * @returns the title span with the relation-name group mapped.
 */
function CardTitle({ draft, meta, values, className, suffix }: CardTitleProps): JSX.Element {
  const slot = useMemo(() => relationNameSlot(draft, meta, values), [draft, meta, values])
  const label = useRelationLabel(slot?.spec, slot?.value)
  return <span className={className}>{titleWithRelationName(draft.title, label, slot?.value)}{suffix}</span>
}

/** A relation value rendered as its target-row label (raw id while unresolved or degraded). */
function RelationLabelValue(
  { spec, value }: { readonly spec: { readonly kind: string; readonly target: string | undefined }; readonly value: string },
): JSX.Element {
  const label = useRelationLabel(spec, value)
  if (spec.kind !== 'relation') return <>{value}</>
  return <>{label ?? value}</>
}
