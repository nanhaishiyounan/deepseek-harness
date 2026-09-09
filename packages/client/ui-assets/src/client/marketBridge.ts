/**
 * The market's cross-entry view-navigation bridge (the ui-kb pattern): a
 * session-header action entry owns the session's `setView` and publishes it
 * here while mounted; the sidebar entry and the market view request view
 * switches through {@link MarketViewBridge.request} and simply no-op while no
 * publisher is mounted.
 * @module @deepseek-ai/dsh-client-ui-assets/client/marketBridge
 */

/** The cross-entry view-navigation bridge handle. */
export interface MarketViewBridge {
  /** Publish the live view switch; returns the revoker. */
  provide(setView: (view: string) => void): () => void
  /** Request a view switch; a no-op while no publisher is mounted. */
  request(view: string): void
}

/**
 * Create the view-navigation bridge for apply to share across entries.
 * @returns the bridge handle.
 */
export function createMarketViewBridge(): MarketViewBridge {
  let setView: ((view: string) => void) | undefined
  return {
    provide(next): () => void {
      setView = next
      return () => {
        if (setView === next) setView = undefined
      }
    },
    request(view): void {
      setView?.(view)
    },
  }
}
