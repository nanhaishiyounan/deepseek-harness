/**
 * The KB workbench view tab: the search zone, the document zone (with the
 * ingest wizard), and the usage card, assembled over the shared client-session
 * store. Registered as the `kb` entry of the conversation view ring; the
 * carry-to-chat actions fill the composer draft and ask the bridge to switch
 * back to the chat tab.
 * @module @deepseek-ai/dsh-client-ui-kb/client/workbench/KbWorkbench
 */

import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { DirectoryListing } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the view seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { KbClientState } from '../kbStore.ts'
import type { KbHitState, KbSearchState } from '../KbTypes.ts'
import { KbDocumentList } from './KbDocumentList.tsx'
import { KbIngestDialog, type IngestReceipt } from './KbIngestDialog.tsx'
import { KbSearch } from './KbSearch.tsx'
import { KbUsageCard } from './KbUsageCard.tsx'
import css from './workbench.module.css'

/** Registration-side business face for the workbench view. */
export interface KbWorkbenchInjected {
  hooks: {
    /** Shared client-session snapshot bound by the renderer as useKb. */
    kb: SnapshotStore<KbClientState>
  }
  /** Publish this tab's mount state to the view bridge's workbench mirror. */
  settleWorkbench: (mounted: boolean) => void
  /** Load or reload the shared stats cache. */
  refresh: () => void
  /** Run one knowledge-base search; rejects with the failure message. */
  search: (query: string) => Promise<KbSearchState>
  /** Fold search hits into the session-local document records. */
  noteSearched: (hits: readonly KbHitState[]) => void
  /** Upload one browser file; rejects with a message. */
  uploadFile: (file: File) => Promise<IngestReceipt>
  /** Ingest one workspace file under a browsed directory; rejects with a message. */
  ingestFile: (directory: string, fileName: string) => Promise<IngestReceipt>
  /** Ingest one public web page; rejects with a message. */
  ingestUrl: (url: string) => Promise<IngestReceipt>
  /** List one directory level (absent path = host home). */
  listDirectory: (path?: string) => Promise<DirectoryListing>
  /** Best-effort view switch through the header bridge. */
  requestView: (view: string) => void
  /** Active display language. */
  language: () => 'zh' | 'en'
}

/** Full component props: the view-seat runtime share plus the inject face and locale seat. */
export type KbWorkbenchProps =
  PropsRuntime<'conversation.view'>
  & PropsLocale<'kb'>
  & InjectFace<KbWorkbenchInjected>

/**
 * Render the workbench view tab.
 * @param props - the standard view kit plus the workbench's inject face.
 * @returns the workbench column.
 */
export function KbWorkbench({
  inputActions, useKb, settleWorkbench, refresh, search, noteSearched, uploadFile, ingestFile, ingestUrl,
  listDirectory, requestView, language, t,
}: KbWorkbenchProps): JSX.Element {
  const state = useKb(snapshot => snapshot)
  const [wizardOpen, setWizardOpen] = useState(false)
  // The shared toast primitive owns its hold-then-fade lifetime; the seq key
  // restarts the cycle when a second receipt arrives within one mount.
  const [toast, setToast] = useState<{ seq: number; text: string } | undefined>(undefined)
  const toastSeq = useRef(0)

  useEffect(() => {
    if (state.stats === undefined) refresh()
  }, [state.stats, refresh])

  // The bridge's workbench mirror lets the blank-session hero portal step
  // aside while this tab is mounted; the tab can mount on a blank session
  // (the shell keeps the view ring reachable before the first message).
  useEffect(() => {
    settleWorkbench(true)
    return () => { settleWorkbench(false) }
  }, [settleWorkbench])

  const show = (text: string): void => {
    toastSeq.current += 1
    setToast({ seq: toastSeq.current, text })
  }

  return (
    <div className={css.workbench}>
      <KbSearch
        t={t}
        search={search}
        noteSearched={noteSearched}
        refresh={refresh}
        setDraft={(text) => { inputActions.setDraft(text) }}
        requestChatView={() => { requestView('chat') }}
      />

      <KbDocumentList
        t={t}
        state={state}
        language={language()}
        onAdd={() => { setWizardOpen(true) }}
      />

      <KbUsageCard
        t={t}
        state={state}
        refresh={refresh}
        requestChatView={() => { requestView('chat') }}
      />

      <KbIngestDialog
        t={t}
        open={wizardOpen}
        onClose={() => { setWizardOpen(false) }}
        uploadFile={uploadFile}
        ingestFile={ingestFile}
        ingestUrl={ingestUrl}
        listDirectory={listDirectory}
        onDone={(receipt) => {
          if (receipt.destination === 'lakehouse') {
            const table = receipt.table ?? receipt.name
            const rows = receipt.rows ?? 0
            show(receipt.replaced === true
              ? t('ingest.doneLakeReplaced', { table, rows })
              : t('ingest.doneLake', { table, rows }))
          } else {
            show(receipt.replaced === true
              ? t('ingest.doneReplaced', { name: receipt.name, chunks: receipt.chunks ?? 0 })
              : t('ingest.done', { name: receipt.name, chunks: receipt.chunks ?? 0 }))
          }
        }}
        onFailed={refresh}
      />

      {toast !== undefined && (
        <Toast key={toast.seq} text={toast.text} onDone={() => { setToast(undefined) }} />
      )}
    </div>
  )
}
