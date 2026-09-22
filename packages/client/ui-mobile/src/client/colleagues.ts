/**
 * AI-colleague visual metadata: the local enrichment layer over the
 * agentPreset roster — the avatar presentation (v3: the flat stamp-color
 * block; the v2 gradient identity system is retired), the duty tag, and the
 * welcome metadata (greeting, capabilities, starter chips) a new session's
 * empty state renders locally. v3 collapses the form domain into the single
 * 智能填表助手 (welcome capabilities projected from the form registry); the
 * read-only 经营参谋 stays its own colleague. agentPreset.list stays the
 * source of truth for presence; preset.yml's welcome block overrides the
 * local table when the deployment publishes one.
 */

import { FORM_REGISTRY, registryCapabilityLine, type FormRegistryEntry } from './formRegistry.ts'

/** One starter chip: what the user sees and what picking it sends. */
export interface WelcomeStarter {
  readonly label: string
  readonly send: string
}

/** The welcome metadata a new session's empty state renders (never on the wire as a message). */
export interface Welcome {
  /** One-line identity (the welcome card's title). */
  readonly greeting: string
  /** Capability lines (2-4). */
  readonly capabilities: readonly string[]
  /** Starter chips; picking one sends it as the user's own message. */
  readonly starters: readonly WelcomeStarter[]
}

/** One colleague's presentation metadata (avatar color, duty, welcome). */
export interface ColleagueVisual {
  /** The avatar stamp color (the flat deep block behind the white acronym). */
  readonly color: string
  /** Two-character avatar acronym (the stamp initial block). */
  readonly acronym: string
  /** Duty tag shown under the name (roster description wins when present). */
  readonly duty: string
  /** The new-session welcome metadata. */
  readonly welcome: Welcome
}

/** The starters projected from the registry (three cross-form picks). */
function registryStarters(): WelcomeStarter[] {
  const picks = [FORM_REGISTRY[0], FORM_REGISTRY[1], FORM_REGISTRY[4]]
    .filter((entry): entry is FormRegistryEntry => entry !== undefined)
  return picks.map(entry => ({ label: `登记一条${entry.bizName}`, send: `帮我登记一条${entry.bizName}` }))
}

/** The fill assistant's welcome, projected from the form registry. */
function fillAssistantWelcome(): Welcome {
  return {
    greeting: '我是智能填表助手',
    capabilities: [
      registryCapabilityLine(),
      '表单类型我来判断，拿不准会先问你',
      '日期、编号、合计这些我推导，你只定关键项',
    ],
    starters: registryStarters(),
  }
}

/** The preset-id → visual table (unknown presets take the fallback). */
const COLLEAGUES: Readonly<Record<string, ColleagueVisual>> = {
  'mobile-form-assistant': {
    color: '#0b5d56',
    acronym: '表单',
    duty: '一句话登记六类业务单据',
    welcome: fillAssistantWelcome(),
  },
  'business-advisor': {
    color: '#5c716d',
    acronym: '参谋',
    duty: '经营洞察问答（只读）',
    welcome: {
      greeting: '我是经营参谋',
      capabilities: ['问经营数据、风险提示、供应商与采购洞察', '只读不改：结论都注明数据来源'],
      starters: [
        { label: '问经营', send: '本月经营概览和风险提示' },
        { label: '问采购', send: '本月采购额按供应商拆开看' },
      ],
    },
  },
}

/** The fallback visual for presets the table does not name. */
const FALLBACK: ColleagueVisual = {
  color: '#1c2b29',
  acronym: 'AI',
  duty: 'AI 同事',
  welcome: {
    greeting: '你好，我是 AI 同事',
    capabilities: ['有什么需要帮忙的直接说'],
    starters: [],
  },
}

/**
 * Visual metadata of one preset id.
 * @param presetId - the agentPreset id (undefined for local sessions).
 * @returns the named visual, or the teal-ink fallback.
 */
export function colleagueOf(presetId: string | undefined): ColleagueVisual {
  if (presetId === undefined) return FALLBACK
  return COLLEAGUES[presetId] ?? FALLBACK
}

/**
 * The welcome metadata of one preset: the deployment's preset.yml block
 * (delivered through agentPreset.list) wins, the local table falls back.
 * @param presetId - the agentPreset id (undefined for local sessions).
 * @param wireWelcome - the preset.yml welcome block when the roster carried one.
 * @returns the welcome the empty state renders.
 */
export function welcomeOf(presetId: string | undefined, wireWelcome: Welcome | undefined): Welcome {
  if (wireWelcome !== undefined) return wireWelcome
  return colleagueOf(presetId).welcome
}

/**
 * The avatar stamp color of one preset (the flat block behind the acronym).
 * @param presetId - the agentPreset id.
 * @returns the CSS color for the avatar block.
 */
export function colleagueColor(presetId: string | undefined): string {
  return colleagueOf(presetId).color
}
