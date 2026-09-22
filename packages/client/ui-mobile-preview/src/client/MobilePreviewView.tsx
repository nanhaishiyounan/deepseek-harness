/**
 * The mobile-preview conversation view: a scaled 390×844 phone bezel holding
 * a same-origin iframe over `/mobile`. The iframe is fully interactive — the
 * demo path is switching to this view inside a PC session and completing a
 * task-card flow in the embedded page. Scale keeps the whole device visible
 * in the conversation body; pointer events pass through the transform.
 */

import { useEffect, useRef, useState, type JSX } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './preview.module.css'

/** Full props: the conversation-view runtime share plus the locale seat. */
export type MobilePreviewViewProps = ConvViewProps & PropsLocale<'mobilePreview'>

/** Device metrics the bezel draws around the iframe. */
const DEVICE_WIDTH = 390
const DEVICE_HEIGHT = 844

/** The preview view component. */
export function MobilePreviewView({ t }: MobilePreviewViewProps): JSX.Element {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const element = frameRef.current
    /* v8 ignore next -- React attaches refs before effects run; the guard only narrows the type. */
    if (element === null) return
    const observer = new ResizeObserver(() => {
      const width = element.clientWidth
      const height = element.clientHeight
      // Fit the whole device with a little bezel margin; never upscale past 1.
      const next = Math.min(1, (width - 24) / DEVICE_WIDTH, (height - 24) / DEVICE_HEIGHT)
      setScale(next > 0 ? next : 1)
    })
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [])

  return (
    <div className={css.stage} ref={frameRef}>
      <p className={css.hint}>{t('view.hint')}</p>
      <div
        className={css.device}
        style={{
          width: `${String(DEVICE_WIDTH)}px`,
          height: `${String(DEVICE_HEIGHT)}px`,
          transform: `scale(${String(scale)})`,
        }}
      >
        <iframe
          className={css.screen}
          src="/mobile"
          title={t('view.label')}
        />
      </div>
    </div>
  )
}
