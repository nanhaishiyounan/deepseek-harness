/**
 * The graph page's cross-entry view-navigation bridge (the ui-kb pattern): a
 * session-header action entry owns the session's `setView` and publishes it
 * here while mounted; the sidebar entry, the kg_subgraph tool-row handoff,
 * and the view itself request view switches through {@link KgViewBridge.request}
 * and simply no-op while no publisher is mounted. Seed injection rides a
 * pending slot the view consumes on mount (the "view in graph" handoff).
 * @module @deepseek-ai/dsh-client-ui-kg/client/kgBridge
 */

/** The cross-entry view-navigation bridge handle. */
export interface KgViewBridge {
  /** Publish the live view switch; returns the revoker. */
  provide(setView: (view: string) => void): () => void
  /** Request a view switch; a no-op while no publisher is mounted. */
  request(view: string): void
}

/**
 * Create the view-navigation bridge for apply to share across entries.
 * @returns the bridge handle.
 */
export function createKgViewBridge(): KgViewBridge {
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
