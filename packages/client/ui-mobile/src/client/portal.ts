/**
 * The shell-scoped portal host: antd-mobile layers (Popup/Picker/DatePicker/
 * Dialog/Modal) default to `document.body`, which escapes the 430px phone
 * shell and its token scope. The shell mounts one host node inside
 * `.dshm-root`; components pass {@link portalContainer} as `getContainer` so
 * the layers render inside the shell (on desktop the root's translateZ makes
 * it their fixed-position containing block). The host is a `display: contents`
 * node — no box, no pointer events, no layout.
 */

/** The live host node inside the shell; undefined before the shell mounts. */
let portalHost: HTMLElement | undefined

/**
 * Record the shell's portal host node (ref callback; null on unmount).
 * @param node - the host element reported by the ref, or null.
 */
export function setPortalHost(node: HTMLElement | null): void {
  portalHost = node ?? undefined
}

/**
 * Resolve the mount point for antd-mobile portals.
 * @returns the shell portal host, or `document.body` before the shell mounts.
 */
export function portalContainer(): HTMLElement {
  return portalHost ?? document.body
}
