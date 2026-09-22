/**
 * Mobile application entry: mounts the React root, gates on the demo-grade
 * local identity, and renders the two-tab shell. The shell is the only thing
 * this entry owns — every data path lives in the views over the shared /api
 * gateway; antd-mobile's global base and default theme load here with the
 * brand overrides riding the .dshm-root container tokens.
 */

import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { App } from './App.tsx'
import 'antd-mobile/es/global'
import 'antd-mobile/es/global/theme-default.css'
import './tokens.css'

/** Browser boot entry consumed by `apps/web`'s mobile page. */
export class AppMobileEntry {
  private readonly container: HTMLElement
  private root: Root | undefined

  /**
   * Hold the mount point.
   * @param container - the mobile application mount point (#mobile-root).
   */
  constructor(container: HTMLElement) {
    this.container = container
  }

  /**
   * Render the application.
   */
  run(): void {
    this.root = createRoot(this.container)
    this.root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  }

  /** Unmount the application. */
  dispose(): void {
    this.root?.unmount()
    this.root = undefined
  }
}
