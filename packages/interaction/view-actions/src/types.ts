/**
 * Wire-safe view-action types, free of cordis/service imports so the apiproxy
 * api layer and the browser runtime can consume them without loading this
 * package's Context augmentation.
 * @module @deepseek-ai/dsh-view-actions/types
 */

/** Free-form action arguments; executors validate their own fields. */
export type ViewActionArgs = Readonly<Record<string, unknown>>

/** One view-action request: the target view, the action name, and its arguments. */
export interface ViewActionRequest {
  /** Conversation view id the action targets (`conversation.view` entry id). */
  view: string
  /** Registered action name within that view (or the built-in `switch_view`). */
  action: string
  /** Action arguments as the model supplied them. */
  args: ViewActionArgs
}

/** The executor's result: a model-readable summary of the view's new state. */
export interface ViewActionResult {
  /** One-line human-readable account of what the view now shows. */
  summary: string
}

/** UI-side provider for view actions. */
export interface ViewActionProvider {
  apply(request: ViewActionRequest): Promise<ViewActionResult>
}
