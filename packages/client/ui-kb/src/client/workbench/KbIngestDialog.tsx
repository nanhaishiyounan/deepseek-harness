/**
 * The ingest wizard: a modal with an upload tab (pick browser files through
 * a multiple `input[type=file]`; each file gets its own progress/result row),
 * a web-link tab (paste a URL), and a workspace-file tab (browse directories
 * through `host.listDirectory`, then name the file — the listing API serves
 * directories only, so the file name stays typed while its folder is picked
 * visually). Failures translate to business language; success reports the
 * document name and passage count.
 * @module @deepseek-ai/dsh-client-ui-kb/client/workbench/KbIngestDialog
 */

import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import clsx from 'clsx'
import type { DirectoryListing } from '@deepseek-ai/dsh-client-runtime/client'
import { Button, IconChevronRightOutline14, IconFolderClose16, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './workbench.module.css'

/** One ingest receipt as the wizard reports it. */
export interface IngestReceipt {
  /** Display name (file base name or the link's host). */
  readonly name: string
  /** Stored passage count. */
  readonly chunks: number
}

/** Props of the ingest wizard. */
export interface KbIngestDialogProps extends PropsLocale<'kb'> {
  /** Whether the modal shows. */
  readonly open: boolean
  /** Close the modal (Escape, mask, cancel, or after success). */
  readonly onClose: () => void
  /** Upload one browser file; rejects with a message. */
  readonly uploadFile: (file: File) => Promise<IngestReceipt>
  /** Ingest one workspace file under the browsed directory; rejects with a message. */
  readonly ingestFile: (directory: string, fileName: string) => Promise<IngestReceipt>
  /** Ingest one public web page; rejects with a message. */
  readonly ingestUrl: (url: string) => Promise<IngestReceipt>
  /** List one directory level (absent path = host home); rejects when browsing is unavailable. */
  readonly listDirectory: (path?: string) => Promise<DirectoryListing>
  /** Report a completed ingest (drives the toast and the document list). */
  readonly onDone: (receipt: IngestReceipt) => void
  /** Report a failed ingest (the owner reloads the shared document counts). */
  readonly onFailed: () => void
}

/** Human-readability classes for raw ingest failures. */
export type IngestFailureKind = 'tooLarge' | 'pathMissing' | 'urlUnreachable' | 'server'

/**
 * Classify a raw ingest failure message for the wizard's inline error strip.
 * @param message - the transport or refusal message.
 * @returns the failure kind the copy table keys on.
 */
export function classifyIngestFailure(message: string): IngestFailureKind {
  const lower = message.toLowerCase()
  if (lower.includes('exceeds the workbench limit')) return 'tooLarge'
  if (lower.includes('not found') || lower.includes('no such') || lower.includes('enoent')) return 'pathMissing'
  if (lower.includes('unreachable') || lower.includes('fetch') || lower.includes('timeout')
    || lower.includes('enotfound') || lower.includes('econnrefused')) return 'urlUnreachable'
  // Everything else — the gateway's kb-ingest-failed refusals, embed faults,
  // and raw transport rejections — reads as the generic server-failure copy;
  // raw transport text never reaches the wizard's error strip.
  return 'server'
}

/** One uploaded file's row state, from pick through done or failure. */
type UploadRow =
  | { readonly name: string; readonly status: 'busy' }
  | { readonly name: string; readonly status: 'done'; readonly chunks: number }
  | { readonly name: string; readonly status: 'failed'; readonly failure: IngestFailureKind }

/**
 * Render the ingest wizard modal.
 * @param props - see {@link KbIngestDialogProps}.
 * @returns the modal tree (null while closed).
 */
export function KbIngestDialog({
  open, onClose, uploadFile, ingestFile, ingestUrl, listDirectory, onDone, onFailed, t,
}: KbIngestDialogProps): JSX.Element {
  const [tab, setTab] = useState<'upload' | 'url' | 'file'>('upload')
  const [url, setUrl] = useState('')
  // The browsed level: `path` is the load key (undefined = home not yet
  // loaded), `listing` the arrived data (undefined = that load in flight).
  const [dirPath, setDirPath] = useState<string | undefined>(undefined)
  const [listing, setListing] = useState<DirectoryListing | undefined>(undefined)
  const [browseFailed, setBrowseFailed] = useState(false)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  // The picked files' rows, one per browser file in pick order.
  const [rows, setRows] = useState<UploadRow[]>([])
  // Browse race guard: the sequence token drops a response that a newer
  // browse superseded (a StrictMode double mount dispatches twice; so may
  // any future concurrent dispatch). While one runs, the level rows are
  // replaced by the skeleton — that replacement is the in-flight disable.
  const browseSeq = useRef(0)
  // Upload-batch race guard: the sequence token drops row updates from a
  // batch a reopen or later pick superseded (closed-dialog completions stay
  // silent instead of polluting the fresh rows).
  const uploadSeq = useRef(0)

  /** Load one level; any failure lands on the unavailable copy. */
  const browse = (path?: string): (void) => {
    const seq = ++browseSeq.current
    setListing(undefined)
    listDirectory(path).then((next) => {
      if (seq !== browseSeq.current) return
      setListing(next)
      setDirPath(next.path)
    }).catch(() => {
      if (seq !== browseSeq.current) return
      // The browse capability is missing (or the listing failed): the file
      // tab stays usable only through its hint, never a broken browser.
      setBrowseFailed(true)
    })
  }

  useEffect(() => {
    if (!open || dirPath !== undefined || browseFailed) return
    // Mount-once per open: later navigations call browse() directly.
    browse()
  }, [open, dirPath, browseFailed])

  /** Pick a batch of browser files and upload them one by one, row by row. */
  const pick = (files: FileList | null): void => {
    if (files === null || files.length === 0) return
    const seq = ++uploadSeq.current
    // Snapshot before the first await: the input's change handler clears
    // `value` right after this call, and a FileList is live — iterating it
    // later would see zero entries.
    const list = Array.from(files)
    const batch: UploadRow[] = list.map(file => ({ name: file.name, status: 'busy' }))
    setRows(previous => [...previous, ...batch])
    void (async () => {
      let failures = 0
      for (const file of list) {
        try {
          const receipt = await uploadFile(file)
          if (seq !== uploadSeq.current) return
          setRows(previous => previous.map(row => row.name === file.name && row.status === 'busy'
            ? { name: receipt.name, status: 'done' as const, chunks: receipt.chunks }
            : row))
          onDone(receipt)
        } catch (error: unknown) {
          if (seq !== uploadSeq.current) return
          failures += 1
          const message = error instanceof Error ? error.message : String(error)
          setRows(previous => previous.map(row => row.name === file.name && row.status === 'busy'
            ? { name: file.name, status: 'failed' as const, failure: classifyIngestFailure(message) }
            : row))
        }
      }
      // Any failure reloads the shared counters once per batch (the
      // server-side state is authoritative).
      if (failures > 0 && seq === uploadSeq.current) onFailed()
    })()
  }

  useEffect(() => {
    if (!open) {
      setTab('upload')
      setUrl('')
      setFileName('')
      setRows([])
      // A closed dialog's still-in-flight batch must not touch the next open's rows.
      uploadSeq.current += 1
      setFailure(undefined)
      setBusy(false)
    }
  }, [open])

  /** Submit the active tab; success closes after reporting the receipt. */
  const submit = (): (void) => {
    /* v8 ignore next -- the action button is disabled while busy, so the
       guard only covers a dispatch outside the rendered chrome. */
    if (busy) return
    const trimmedUrl = url.trim()
    const trimmedFile = fileName.trim()
    const call = tab === 'url'
      ? trimmedUrl.length === 0 ? undefined : ingestUrl(trimmedUrl)
      : listing === undefined || trimmedFile.length === 0
        ? undefined
        : ingestFile(listing.path, trimmedFile)
    if (call === undefined) return
    setFailure(undefined)
    setBusy(true)
    call.then((receipt) => {
      onDone(receipt)
      onClose()
    }).catch((error: unknown) => {
      setFailure(error instanceof Error ? error.message : String(error))
      onFailed()
    }).finally(() => {
      setBusy(false)
    })
  }

  const failureText = failure === undefined
    ? undefined
    : classifyIngestFailure(failure) === 'pathMissing'
      ? t('ingest.pathMissing')
      : classifyIngestFailure(failure) === 'urlUnreachable'
        ? t('ingest.urlUnreachable')
        : t('ingest.failed')

  return (
    <Modal open={open} onClose={onClose} title={t('ingest.dialogTitle')} closeLabel={t('ingest.close')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('scenario.cancel')}</Button>
          {tab !== 'upload' && (
            <Button variant="primary" disabled={busy} onClick={submit}>
              {busy ? t('ingest.busy') : t('ingest.action')}
            </Button>
          )}
        </>
      }
    >
      <div className={css.wizard}>
        <div className={css.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'upload'}
            className={clsx(css.tab, tab === 'upload' && css.tabActive)}
            onClick={() => { setTab('upload'); setFailure(undefined) }}
          >
            {t('ingest.tabUpload')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'url'}
            className={clsx(css.tab, tab === 'url' && css.tabActive)}
            onClick={() => { setTab('url'); setFailure(undefined) }}
          >
            {t('ingest.tabUrl')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'file'}
            className={clsx(css.tab, tab === 'file' && css.tabActive)}
            onClick={() => { setTab('file'); setFailure(undefined) }}
          >
            {t('ingest.tabFile')}
          </button>
        </div>

        {tab === 'upload'
          ? (
            <div className={css.uploadTab}>
              <label className={css.uploadPick}>
                <input
                  className={css.uploadInput}
                  type="file"
                  multiple
                  accept=".md,.txt,.pdf,.docx"
                  onChange={(event) => {
                    pick(event.target.files)
                    // Reset so picking the same file again re-fires onChange.
                    event.target.value = ''
                  }}
                />
                {t('ingest.uploadPick')}
              </label>
              <p className={css.fileHint}>{t('ingest.uploadHint')}</p>
              {rows.length > 0 && (
                <ul className={css.uploadRows} role="list">
                  {rows.map((row, index) => (
                    <li key={`${row.name}-${index}`} className={css.uploadRow}>
                      <span className={css.uploadRowName}>{row.name}</span>
                      {row.status === 'busy' && <span className={css.uploadRowState}>{t('ingest.uploadRowBusy')}</span>}
                      {row.status === 'done' && (
                        <span className={css.uploadRowState}>
                          {t('ingest.uploadRowDone', { chunks: row.chunks })}
                        </span>
                      )}
                      {row.status === 'failed' && (
                        <span className={css.uploadRowFailed} role="alert">
                          {t(row.failure === 'tooLarge' ? 'ingest.uploadTooLarge' : 'ingest.uploadRowFailed')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
          : tab === 'url'
            ? (
              <input
                className={css.wizardInput}
                type="url"
                value={url}
                placeholder={t('ingest.urlPlaceholder')}
                onChange={(event) => { setUrl(event.target.value) }}
                onKeyDown={(event) => { if (event.key === 'Enter') submit() }}
              />
            )
            : (
              <div className={css.fileTab}>
                <p className={css.fileHint}>{t('ingest.fileHint')}</p>
                {browseFailed
                  ? <p className={css.fileHint}>{t('ingest.hostUnavailable')}</p>
                  : listing === undefined
                    ? <span className={css.hitSkeleton} aria-busy="true" />
                    : (
                      <>
                        <span className={css.fileLabel}>{t('ingest.directoryLabel')}</span>
                        <nav className={css.crumbs} aria-label={t('ingest.directoryLabel')}>
                          {listing.crumbs.map(crumb => (
                            <button
                              key={crumb.path}
                              type="button"
                              className={css.crumb}
                              onClick={() => { browse(crumb.path) }}
                            >
                              {crumb.name}
                            </button>
                          ))}
                        </nav>
                        <div className={css.folderList} role="list">
                          {listing.entries.map(entry => (
                            <button
                              key={entry.path}
                              type="button"
                              role="listitem"
                              className={css.folderRow}
                              onClick={() => { browse(entry.path) }}
                            >
                              <IconFolderClose16 size={14} />
                              <span className={css.folderName}>{entry.name}</span>
                              <IconChevronRightOutline14 size={12} />
                            </button>
                          ))}
                        </div>
                        <label className={css.fileLabel}>
                          {t('ingest.fileNameLabel')}
                          <input
                            className={css.wizardInput}
                            type="text"
                            value={fileName}
                            placeholder={t('ingest.fileNamePlaceholder')}
                            onChange={(event) => { setFileName(event.target.value) }}
                            onKeyDown={(event) => { if (event.key === 'Enter') submit() }}
                          />
                        </label>
                      </>
                    )}
              </div>
            )}

        {failureText !== undefined && <p className={css.wizardError} role="alert">{failureText}</p>}
      </div>
    </Modal>
  )
}
