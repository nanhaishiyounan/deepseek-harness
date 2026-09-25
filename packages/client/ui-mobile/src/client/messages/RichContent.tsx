/**
 * The assistant narrative renderer (v6 rich pipeline): every narrative
 * splits first into fenced-code runs and text runs — the fences leave whole
 * before sanitizeBizText so display-term mapping never rewrites an identifier
 * inside a snippet — then the text blocks render as sanitized markdown (bold
 * at weight 600 with the key-info underline, ink-teal square bullets,
 * label/value tables) with adjacent numeric conclusion lines promoting to the
 * half-width metric cards. Each fenced block renders as the deep code plate
 * with its language label and the copy entry (clipboard, execCommand
 * fallback, a toast either way — copying never touches the session log). The
 * protocol fences were split out upstream — what arrives here is
 * people-language text plus genuine code. An inline image opens the antd
 * ImageViewer fullscreen, mounted through the shell's portal host so the
 * desktop ≥720px mask stays inside the 430px bezel.
 */

import { useMemo, useRef, useState, type JSX } from 'react'
import { Button, ImageViewer, Toast } from 'antd-mobile'
import { Copy } from 'lucide-react'
import { portalContainer } from '../portal.ts'
import { renderMarkdown, sanitizeBizText, splitCodeBlocks, splitRichBlocks } from './rich.ts'
import css from './messages.module.css'

/** Rich-content props: the narrative text. */
export interface RichContentProps {
  readonly text: string
}

/** The image sources of one markdown block, in document order. */
function imagesOf(html: string): string[] {
  const container = document.createElement('div')
  container.innerHTML = html
  return Array.from(container.querySelectorAll('img'), img => img.src).filter(src => src !== '')
}

/** Copy one snippet: the async clipboard API, the execCommand fallback, a toast either way. */
function copyCode(code: string): void {
  const done = (): void => { Toast.show({ content: '已复制' }) }
  const fallback = (): void => {
    const area = document.createElement('textarea')
    area.value = code
    area.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(area)
    area.select()
    try {
      // execCommand is the only copy lane on insecure-context WebViews; the
      // modern API stays primary and this arm only runs where it is absent.
      // oxlint-disable-next-line no-deprecated
      document.execCommand('copy')
      done()
    } catch {
      // The copy itself failed silently through both lanes; nothing else can run.
      Toast.show({ content: '复制失败，请长按选择复制' })
    }
    area.remove()
  }
  // The lib types name the member always-present; insecure contexts and the
  // embedded jsdom host omit it, so a synchronous miss falls through to the
  // legacy lane.
  try {
    void navigator.clipboard.writeText(code).then(done, fallback)
  } catch {
    fallback()
  }
}

/** One fenced code block: the deep plate, the language label, the copy entry. */
function CodePlate({ lang, code }: { readonly lang: string; readonly code: string }): JSX.Element {
  return (
    <div className={css.codeBox} data-testid="code-box">
      <div className={css.codeHead}>
        <span className={css.codeLang}>{lang}</span>
        <Button
          type="button"
          size="mini"
          fill="none"
          className={css.copyBtn}
          aria-label="复制代码"
          onClick={() => { copyCode(code) }}
        >
          <Copy size={13} strokeWidth={1.8} aria-hidden="true" />
          复制
        </Button>
      </div>
      <pre className={css.codeBody}>{code}</pre>
    </div>
  )
}

/**
 * Render one assistant narrative run.
 * @param props - the narrative text.
 * @returns the rendered content block.
 */
export function RichContent({ text }: RichContentProps): JSX.Element {
  const runs = useMemo(() => splitCodeBlocks(text), [text])
  const [viewer, setViewer] = useState<{ readonly images: string[]; readonly index: number } | undefined>(undefined)
  /** The viewer's close arm: the slide engine needs real layout, so jsdom never mounts the viewer to close it. */
  /* v8 ignore next 2 -- the fullscreen slide engine never mounts under jsdom. */
  const closeViewer = (): void => { setViewer(undefined) }
  const containerRef = useRef<HTMLDivElement>(null)
  return (
    <div className={css.richContent} ref={containerRef}>
      {runs.map((run, runIndex) => {
        if (run.kind === 'code') return <CodePlate key={`code:${String(runIndex)}`} lang={run.lang} code={run.code} />
        const blocks = splitRichBlocks(sanitizeBizText(run.text))
        return blocks.map((block, index) =>
          block.kind === 'metric'
            ? (
              <div className={css.metricPair} key={`${String(runIndex)}:${String(index)}`}>
                {block.metrics.map(metric => (
                  <span key={`${metric.label}:${metric.value}`} className={css.metricMini}>
                    <span className={css.metricMiniValue}>{metric.value}</span>
                    <span className={css.metricMiniLabel}>{metric.label}</span>
                  </span>
                ))}
              </div>
            )
            : (
              <div
                key={`${String(runIndex)}:${String(index)}`}
                className={css.richText}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(block.text) }}
                onClick={(event) => {
                  const image = (event.target as HTMLElement).closest('img')
                  if (image === null) return
                  /* v8 ignore next -- the click arrives from inside the mounted container, so current is never null. */
                  const images = imagesOf(containerRef.current?.innerHTML ?? '')
                  const at = images.indexOf(image.src)
                  setViewer({ images, index: Math.max(at, 0) })
                }}
              />
            ),
        )
      })}
      {viewer !== undefined && (
        <ImageViewer.Multi
          images={viewer.images}
          defaultIndex={viewer.index}
          getContainer={portalContainer}
          onClose={closeViewer}
        />
      )}
    </div>
  )
}
