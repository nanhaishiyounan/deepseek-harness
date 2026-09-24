// @vitest-environment jsdom
/** draftStore: edit persistence keyed by draft content, pending marks, read watermarks. */

import { beforeEach, describe, expect, it } from 'vitest'
import type { FormDraft } from '../src/client/form-draft.ts'
import {
  clearDraftEdits, clearPendingReview, loadDraftEdits, markPendingReview, markSessionRead,
  pendingReviewSessions, pinSession, pinnedSessions, readWatermarkOf, saveDraftEdits, unpinSession,
} from '../src/client/draftStore.ts'

const DRAFT: FormDraft = { collection: 'hub_po_orders', title: '采购单', fields: { po_number: 'PO-1', total: '100' } }
const CHANGED: FormDraft = { collection: 'hub_po_orders', title: '采购单', fields: { po_number: 'PO-2', total: '100' } }

beforeEach(() => {
  localStorage.clear()
})

describe('draft edits', () => {
  it('round-trips edits for the same draft', () => {
    saveDraftEdits('s1', DRAFT, { po_number: 'PO-1', total: '800' })
    expect(loadDraftEdits('s1', DRAFT)).toEqual({ po_number: 'PO-1', total: '800' })
  })

  it('drops stale edits when the draft content changes', () => {
    saveDraftEdits('s1', DRAFT, { po_number: 'PO-1', total: '800' })
    expect(loadDraftEdits('s1', CHANGED)).toBeUndefined()
  })

  it('scoping is per session and clearing removes the row', () => {
    saveDraftEdits('s1', DRAFT, { po_number: 'PO-1', total: '800' })
    expect(loadDraftEdits('s2', DRAFT)).toBeUndefined()
    clearDraftEdits('s1', DRAFT)
    expect(loadDraftEdits('s1', DRAFT)).toBeUndefined()
  })

  it('pins, unpins, and ignores an unpin of an unpinned session', () => {
    expect(pinnedSessions().size).toBe(0)
    pinSession('s1')
    pinSession('s2')
    expect(pinnedSessions().has('s1')).toBe(true)
    unpinSession('s1')
    expect(pinnedSessions().has('s1')).toBe(false)
    // Unpinning a session that never pinned stays a no-op.
    unpinSession('never-pinned')
    expect(pinnedSessions().has('never-pinned')).toBe(false)
    unpinSession('s2')
  })

  it('tolerates corrupted storage', () => {
    const raw = localStorage.getItem(saveProbe('s1', DRAFT))
    expect(raw).not.toBeNull()
    localStorage.setItem(saveProbe('s1', DRAFT), '{not json')
    expect(loadDraftEdits('s1', DRAFT)).toBeUndefined()
    localStorage.setItem(saveProbe('s1', DRAFT), '[1,2]')
    expect(loadDraftEdits('s1', DRAFT)).toBeUndefined()
    localStorage.setItem(saveProbe('s1', DRAFT), '{"po_number":42}')
    expect(loadDraftEdits('s1', DRAFT)).toEqual({})
  })
})

/** Reveal the storage key of one draft (the corruption tests write through it). */
function saveProbe(sessionId: string, draft: FormDraft): string {
  localStorage.clear()
  saveDraftEdits(sessionId, draft, {})
  const [key] = Object.keys(localStorage)
  if (key === undefined) throw new Error('no storage key appeared')
  return key
}

describe('pending-review marks', () => {
  it('marks, reads, and clears the pending session set', () => {
    expect(pendingReviewSessions().size).toBe(0)
    markPendingReview('s1')
    markPendingReview('s2')
    expect(pendingReviewSessions().has('s1')).toBe(true)
    expect(pendingReviewSessions().has('s2')).toBe(true)
    clearPendingReview('s1')
    expect(pendingReviewSessions().has('s1')).toBe(false)
    expect(pendingReviewSessions().has('s2')).toBe(true)
    clearPendingReview('s1')
    expect(pendingReviewSessions().has('s2')).toBe(true)
  })

  it('tolerates corrupted set storage', () => {
    localStorage.setItem('dsh-mobile-pending', 'nope')
    expect(pendingReviewSessions().size).toBe(0)
    localStorage.setItem('dsh-mobile-pending', '{"s1":1}')
    expect(pendingReviewSessions().size).toBe(0)
  })
})

describe('read watermarks', () => {
  it('defaults to zero and records the seen updatedAt', () => {
    expect(readWatermarkOf('s1')).toBe(0)
    markSessionRead('s1', 500)
    expect(readWatermarkOf('s1')).toBe(500)
    markSessionRead('s1', 300)
    expect(readWatermarkOf('s1')).toBe(300)
  })

  it('tolerates corrupted watermark storage', () => {
    localStorage.setItem('dsh-mobile-read', 'bad')
    expect(readWatermarkOf('s1')).toBe(0)
    localStorage.setItem('dsh-mobile-read', '{"s1":"x"}')
    expect(readWatermarkOf('s1')).toBe(0)
    localStorage.setItem('dsh-mobile-read', '[1]')
    expect(readWatermarkOf('s1')).toBe(0)
  })

  it('overwrites corrupted and non-object watermarks when marking a read', () => {
    localStorage.setItem('dsh-mobile-read', 'bad')
    markSessionRead('s1', 100)
    expect(readWatermarkOf('s1')).toBe(100)
    localStorage.setItem('dsh-mobile-read', '"just-a-string"')
    markSessionRead('s2', 200)
    expect(readWatermarkOf('s2')).toBe(200)
    expect(readWatermarkOf('s1')).toBe(0)
  })
})
