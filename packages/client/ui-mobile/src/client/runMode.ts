/**
 * Live/demo run mode for the mobile surface: the explicit localStorage
 * switch (`dsh-mobile-runmode`, the ProfileView AI-preference toggle) wins;
 * with no explicit value, one `llm.models` probe decides — a catalog holding
 * at least one servable model means live, everything else falls safe to demo
 * (a demo must never pose as the real thing). The probe result caches at
 * module level; explicit switches and probe outcomes both broadcast to the
 * subscribers. No React imports.
 */

import { rpc } from './rpc.ts'
import type { ResponseValue } from '@deepseek-ai/dsh-host-apiproxy/api'

/** The deployment's run mode. */
export type RunMode = 'live' | 'demo'

const RUNMODE_KEY = 'dsh-mobile-runmode'

/** Module-level listeners; explicit switches and probe outcomes broadcast. */
const listeners = new Set<() => void>()

/** The cached probe outcome (undefined until the first probe settles). */
let probed: RunMode | undefined

/** Whether the model catalog answers with at least one servable model. */
function catalogLive(value: ResponseValue<'llm.models'>): boolean {
  return value.groups.some(group => group.models.length > 0)
}

/** Probe the gateway once; any failure falls safe to demo. */
async function probeRunMode(): Promise<RunMode> {
  try {
    return catalogLive(await rpc('llm.models', {})) ? 'live' : 'demo'
  } catch {
    // The gateway refused or the network failed — never let a demo pose as live.
    return 'demo'
  }
}

/** The explicit switch's value, or undefined when unset or unrecognized. */
function explicitRunMode(): RunMode | undefined {
  const value = localStorage.getItem(RUNMODE_KEY)
  return value === 'live' || value === 'demo' ? value : undefined
}

function notify(): void {
  for (const listener of listeners) listener()
}

/**
 * The current run mode: the explicit switch first; with none set, the cached
 * probe outcome — probing on the first call — and any failure falls safe to
 * demo.
 * @returns the resolved mode.
 */
export async function currentRunMode(): Promise<RunMode> {
  const explicit = explicitRunMode()
  if (explicit !== undefined) return explicit
  if (probed === undefined) {
    probed = await probeRunMode()
    notify()
  }
  return probed
}

/**
 * Set the explicit run-mode switch (the ProfileView toggle).
 * @param mode - the mode to pin.
 */
export function setRunMode(mode: RunMode): void {
  localStorage.setItem(RUNMODE_KEY, mode)
  notify()
}

/**
 * Subscribe to run-mode changes.
 * @param listener - called after every switch or probe outcome.
 * @returns the unsubscribe function.
 */
export function subscribeRunMode(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
