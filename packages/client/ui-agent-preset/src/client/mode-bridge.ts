/**
 * Cross-package preset-mode helper (optional service convention): the one
 * call every surface shares when it cannot swap the CURRENT session's
 * composition — the host's agent-preset lock stands — and opens a new session
 * on the pick instead. The composer mode selector's started-session path and
 * the scenario portal's fallback both ride it, so the "stage then start a
 * session" sequence has one home. Provided while the conversation flow is
 * mounted; `ctx.get('agentPresetMode')` reads undefined otherwise.
 *
 * @module @deepseek-ai/dsh-client-ui-agent-preset/client/mode-bridge
 */

/** The `ctx.agentPresetMode` handle. */
export interface AgentPresetModeBridge {
  /**
   * Stage one preset and open a new session on it.
   * @param presetId - the preset the new session runs.
   */
  startSessionOn(presetId: string): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * Preset-mode helper (optional service, provided while the conversation
     * flow is mounted); reach via `ctx.get` — absent reads as unavailable.
     */
    agentPresetMode?: AgentPresetModeBridge
  }
}
