/**
 * The files secondary page (02 §2.7, 03 §6.8, the B3 complementary ruling):
 * three sections — 最近文件 (every artifact from the last 7 days, the full
 * recent window, each row badged with its origin), AI 生成 (the recent
 * window's AI-origin subset — every v5 artifact today, so the two sections
 * read as complementary views instead of 02 §2.7's literal dedup that left
 * the subset empty by construction), and 收藏 (the pinned artifacts with the
 * amber star toggle, a pure local state write). A row tap routes back to its
 * source (the chat anchor, else the work detail); v5 files are AI-generated
 * report artifacts only — no file system is invented.
 */

import { useMemo, useState, useSyncExternalStore, type JSX } from 'react'
import { Button, Tag } from 'antd-mobile'
import { FileClock, Star } from 'lucide-react'
import { goBackOr, navigate } from '../router.ts'
import { EmptyState } from '../ui.tsx'
import { PageNav } from '../PageNav.tsx'
import type { ReportPayload } from '../protocol.ts'
import { fileProjections, subscribeWork, updateWorkItem, workOf, workSnapshot, type FileCardRow } from '../workStore.ts'
import { ReportCard } from '../messages/ReportCard.tsx'
import css from './files.module.css'

/** One rendered row: the projection plus the preview's artifact payload. */
interface RenderRow extends FileCardRow {
  readonly artifact: ReportPayload | undefined
}

/**
 * The files page.
 * @returns the page tree.
 */
export function FilesView(): JSX.Element {
  const store = useSyncExternalStore(subscribeWork, workSnapshot)
  const [previewId, setPreviewId] = useState<string | undefined>(undefined)
  const projections = useMemo(() => fileProjections(store.items), [store.items])
  const rows = useMemo<RenderRow[]>(() => projections.map(row => ({
    ...row,
    artifact: workOf(store.items, row.id)?.artifact,
  })), [projections, store.items])
  // The B3 complementary ruling: the recent window is the superset (7 days),
  // AI 生成 is its origin-filtered subset view.
  const recent = useMemo(() => rows.filter(row => row.createdAt >= Date.now() - 7 * 86_400_000), [rows])
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- origin widens with future file sources.
  const generated = useMemo(() => recent.filter(row => row.origin === 'ai'), [recent])
  const pinned = useMemo(() => rows.filter(row => row.pinned), [rows])

  const togglePin = (row: FileCardRow, next: boolean): void => {
    updateWorkItem(row.id, { pinned: next })
  }

  const openSource = (row: FileCardRow): void => {
    if (row.sourceSessionId !== undefined) navigate(`#/chat/${row.sourceSessionId}`)
    else navigate(`#/work/${row.id}`)
  }

  const renderRow = (row: RenderRow, star: boolean, section: string): JSX.Element => (
    <div key={`${section}:${row.id}`} className={css.fileRow} data-testid="file-row">
      <div className={css.fileTop}>
        <button
          type="button"
          className={css.fileTopMain}
          aria-label={`打开 ${row.title}`}
          onClick={() => { openSource(row) }}
        >
          <Tag
            className={css.typeBadge as string}
            style={{ '--background-color': 'var(--dshm-primary-soft)', '--text-color': 'var(--dshm-on-soft)', '--border-color': 'transparent' }}
            aria-hidden="true"
          >
            报
          </Tag>
          {/* oxlint-disable-next-line typescript/no-unnecessary-condition -- the origin union widens with future file sources. */}
          {row.origin === 'ai' && (
            <Tag
              className={css.originBadge as string}
              style={{ '--background-color': 'var(--dshm-primary-10)', '--text-color': 'var(--dshm-on-soft)', '--border-color': 'transparent' }}
              aria-hidden="true"
            >
              AI
            </Tag>
          )}
          <span className={css.fileName}>{row.title}</span>
          {row.demo && (
            <Tag
              className={css.demoTag as string}
              style={{ '--background-color': 'transparent', '--text-color': 'var(--dshm-muted-foreground)', '--border-color': 'var(--dshm-border)' }}
            >
              示例
            </Tag>
          )}
        </button>
        {star && (
          <span
            role="button"
            tabIndex={0}
            aria-label={row.pinned ? '取消收藏' : '收藏'}
            className={`${css.star} ${row.pinned ? css.starActive : ''}`}
            onClick={() => { togglePin(row, !row.pinned) }}
            onKeyDown={(event) => { if (event.key === 'Enter') togglePin(row, !row.pinned) }}
          >
            <Star size={20} fill={row.pinned ? 'currentColor' : 'none'} aria-hidden="true" />
          </span>
        )}
      </div>
      <span className={css.fileMeta}>
        {row.subtitle !== undefined && <span>{row.subtitle}</span>}
        <span>{new Date(row.createdAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</span>
        {row.sourceSessionId !== undefined && (
          <Button type="button" color="primary" fill="none" size="mini" className={css.fileMetaLink} onClick={() => { openSource(row) }}>
            去源对话
          </Button>
        )}
      </span>
      {row.artifact !== undefined && (
        <>
          <Button
            type="button"
            color="primary"
            fill="none"
            size="mini"
            className={css.fileMetaLink}
            onClick={() => { setPreviewId(current => current === `${section}:${row.id}` ? undefined : `${section}:${row.id}`) }}
          >
            {previewId === `${section}:${row.id}` ? '收起报告' : '查看报告'}
          </Button>
          {previewId === `${section}:${row.id}` && (
            <div className={css.preview}>
              <ReportCard payload={row.artifact} />
            </div>
          )}
        </>
      )}
    </div>
  )

  return (
    <div className={css.page}>
      <PageNav title="文件" onBack={() => { goBackOr('#/work') }} />
      <section className={css.list} aria-label="文件">
        <h2 className={css.sectionTitle}>AI 生成</h2>
        {generated.length === 0
          ? (
            <div className={css.sectionCard}>
              <EmptyState
                variant="section"
                icon={<FileClock size={20} strokeWidth={1.8} />}
                title="近 7 天还没有 AI 生成的报告"
                description="对话中的报告卡会归档到这里"
              />
            </div>
          )
          : <div className={css.sectionCard}>{generated.map(row => renderRow(row, true, 'generated'))}</div>}

        <h2 className={css.sectionTitle}>最近文件</h2>
        {recent.length === 0
          ? (
            <div className={css.sectionCard}>
              <EmptyState
                variant="section"
                icon={<FileClock size={20} strokeWidth={1.8} />}
                title="近 7 天没有新文件"
                description="报告与登记回执会归档到这里"
              />
            </div>
          )
          : <div className={css.sectionCard}>{recent.map(row => renderRow(row, true, 'recent'))}</div>}

        <h2 className={css.sectionTitle}>收藏</h2>
        {pinned.length === 0
          ? (
            <div className={css.sectionCard}>
              <EmptyState
                variant="section"
                icon={<Star size={20} strokeWidth={1.8} />}
                title="还没有收藏"
                description="点亮星标收进这里"
              />
            </div>
          )
          : <div className={css.sectionCard}>{pinned.map(row => renderRow(row, true, 'pinned'))}</div>}
      </section>
    </div>
  )
}
