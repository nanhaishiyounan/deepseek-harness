/**
 * Viewport anchor for a `position: fixed` popover panel (the sidebar clips
 * overflow, so the panel hugs its trigger through a measured offset instead
 * of document flow).
 */
import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'

/**
 * Measure the fixed-panel anchor from the trigger element while the panel is
 * open; re-measure on viewport resize.
 * @param root - element containing both the trigger and the open surface.
 * @param open - whether the surface is showing; false stops measuring.
 * @returns the viewport offsets while open, `undefined` before the first
 *   measurement (the caller renders the panel only once anchored).
 */
export function useFixedPanelAnchor(
  root: RefObject<HTMLElement | null>,
  open: boolean,
): { left: number; bottom: number } | undefined {
  const [anchor, setAnchor] = useState<{ left: number; bottom: number }>()

  useLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      const rect = root.current?.getBoundingClientRect()
      /* v8 ignore next 2 -- the layout effect runs after mount, so the ref is bound. */
      if (rect !== undefined) {
        setAnchor({ left: rect.left, bottom: window.innerHeight - rect.top + 8 })
      }
    }
    place()
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('resize', place)
    }
  }, [root, open])

  return anchor
}
