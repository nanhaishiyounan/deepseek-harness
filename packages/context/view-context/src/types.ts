/**
 * Wire-safe view-state types, free of cordis/service imports so the apiproxy
 * api layer and the browser connection client can consume them without
 * loading this package's Context augmentation.
 * @module @deepseek-ai/dsh-view-context/types
 */

/** Scalar snapshot values one business view may report. */
export type ViewSnapshotValue = string | number | boolean | null | readonly string[]

/**
 * Display-ready flat projection of one business view's state. Keys are the
 * model-facing field names (Chinese display labels in this deployment); the
 * injector renders `key=value` pairs verbatim and adds no per-view knowledge.
 */
export type ViewSnapshot = Readonly<Record<string, ViewSnapshotValue>>

/**
 * The per-view action catalog riding every report: registered executor names
 * keyed by view id. `switch_view` is host-built-in and need not be listed.
 */
export type ViewActionCatalog = Readonly<Record<string, readonly string[]>>

/** One browser view-state report for a session. */
export interface ViewReport {
  /** Active conversation view id (`chat` for the plain conversation view). */
  view: string
  /** Optional display label for the view (rendered as `label(view)`). */
  label?: string
  /** The active view's flat state projection. */
  snapshot: ViewSnapshot
  /** Registered action names per view, used to validate `view_apply` targets. */
  actions: ViewActionCatalog
}

/** Cached report plus its arrival time. */
export interface ViewStateEntry extends ViewReport {
  /** `Date.now()` at report time. */
  reportedAt: number
}
