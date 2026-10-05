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

/** One starter chip: what the user sees and what picking it fills the draft with (W9-B1). */
export interface WelcomeStarter {
  readonly label: string
  readonly send: string
}

/** The welcome metadata a new session's empty state renders (never on the wire as a message). */
export interface Welcome {
  /** One-line identity (the welcome card's title). */
  readonly greeting: string
  /** Capability lines (2-5). */
  readonly capabilities: readonly string[]
  /** Starter chips; picking one fills the composer draft (W9-B1). */
  readonly starters: readonly WelcomeStarter[]
}

/**
 * The roster page's three capability groups (v6 roster IA, the design's
 * GROUPS semantics mapped onto the real presets). An empty group renders no
 * heading; presets the table leaves ungrouped collect under 更多 AI 同事.
 */
export type ColleagueGroup = '内容与创意' | '数据与技术' | '职能与效率'

/** The render order of the roster groups (the trailing catch-all is separate). */
export const COLLEAGUE_GROUPS: readonly ColleagueGroup[] = ['内容与创意', '数据与技术', '职能与效率']

/** The roster presence chip (v6): AI colleagues have no offline hours. */
export type ColleagueStatus = 'online' | 'busy' | 'meeting'

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
  /** The roster page's capability group (v6); absent collects under 更多 AI 同事. */
  readonly group?: ColleagueGroup
  /** The roster page's skill pills (v6): short capability words off the duty. */
  readonly skills: readonly string[]
  /** The roster presence chip (v6); the AI presence is always 在线. */
  readonly status: ColleagueStatus
}

/**
 * The presence chip's label.
 * @param status - the presence kind.
 * @returns the chip text (在线/忙碌/会议中).
 */
export function statusLabelOf(status: ColleagueStatus): string {
  if (status === 'busy') return '忙碌'
  if (status === 'meeting') return '会议中'
  return '在线'
}

/** The starters projected from the registry (three cross-form picks). */
function registryStarters(): WelcomeStarter[] {
  const picks = [FORM_REGISTRY[0], FORM_REGISTRY[1], FORM_REGISTRY[4]]
    .filter((entry): entry is FormRegistryEntry => entry !== undefined)
  return picks.map(entry => ({ label: `登记一条${entry.bizName}`, send: `帮我登记一条${entry.bizName}` }))
}

/**
 * The fill assistant's welcome, projected from the form registry. The
 * capability lines mirror the published preset.yml welcome block verbatim
 * (that block wins on the wire; this fallback serves local sessions).
 */
function fillAssistantWelcome(): Welcome {
  return {
    greeting: '我是智能填表助手',
    capabilities: [
      registryCapabilityLine(),
      '表单类型我来判断，拿不准会先问你',
      '日期、编号、合计这些我推导，你只定关键项',
      '风险、汇总、对比类问题我会给结构化报告卡，可一键变成任务跟进',
      '查库存、看补货预警、报盘点实盘，一句话出报告卡',
    ],
    starters: registryStarters(),
  }
}

/**
 * The avatar stamp palette (W7-M1, audit 04 §03·08): four equidistant deep
 * hues (blue 212° / teal 177° / green 122° / ochre 28°) at one shared
 * lightness band (L≈28-35%, white-acronym contrast ≥6:1) — one palette
 * logic instead of the candy-color mix, anchored on the brand blue.
 */
/** The preset-id → visual table (the four roster presets, 04 §6; unknown presets take the fallback). */
const COLLEAGUES: Readonly<Record<string, ColleagueVisual>> = {
  'mobile-form-assistant': {
    color: 'var(--dshm-stamp-avatar-1)',
    acronym: '表单',
    duty: '单据登记与任务执行',
    group: '职能与效率',
    skills: ['单据登记', '字段推导', '报告汇总'],
    status: 'online',
    welcome: fillAssistantWelcome(),
  },
  'business-advisor': {
    color: 'var(--dshm-stamp-avatar-2)',
    acronym: '参谋',
    duty: '经营洞察问答（只读）',
    group: '数据与技术',
    skills: ['经营问答', '风险提示', '采购洞察'],
    status: 'online',
    welcome: {
      greeting: '我是经营参谋',
      capabilities: [
        '问经营数据、风险提示、供应商与采购洞察',
        '只读不改：结论都注明数据来源',
        '风险与对比结论给结构化报告卡',
      ],
      starters: [
        { label: '问经营', send: '本月经营概览和风险提示' },
        { label: '问采购', send: '本月采购额按供应商拆开看' },
      ],
    },
  },
  'enterprise-data-assistant': {
    color: 'var(--dshm-stamp-avatar-3)',
    acronym: '数据',
    duty: '企业数据问答与统计建议',
    group: '数据与技术',
    skills: ['企业档案', '供应链', '统计建议'],
    status: 'online',
    welcome: {
      greeting: '我是企业数据助手',
      capabilities: [
        '问企业档案、走访纪要、市场与供应链数据',
        '统计建议给结构化报告卡',
        '变更记录经确认后落库',
      ],
      starters: [
        { label: '问企业档案', send: '帮我看一下这家企业的档案要点' },
        { label: '问供应链', send: '供应链数据里有什么值得关注的' },
      ],
    },
  },
  'food-compliance-officer': {
    color: 'var(--dshm-stamp-avatar-4)',
    acronym: '合规',
    duty: '食安法规问答与审核要点',
    group: '职能与效率',
    skills: ['法规问答', '编号溯源', '审核清单'],
    status: 'online',
    welcome: {
      greeting: '我是 AI 食安合规官',
      capabilities: [
        'GB 2760/GB 14881 等法规问答',
        '编号引用原文',
        '输出审核要点清单',
      ],
      starters: [
        { label: '查法规', send: 'GB 2760 里防腐剂的限量怎么看' },
        { label: '审要点', send: '给我一份供应商资质审核要点清单' },
      ],
    },
  },
}

/** The fallback visual for presets the table does not name. The face stays a
 * track-constant deep roast (the stamp ink is paper-white on both tracks). */
const FALLBACK: ColleagueVisual = {
  color: '#6b5040',
  acronym: 'AI',
  duty: 'AI 同事',
  skills: ['AI 同事'],
  status: 'online',
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
 * The stamp word shown beside a colleague's full name. Runtime presets carry
 * names with an「AI」prefix (AI 食安合规官); the fallback stamp's own「AI」word
 * then reads twice (the W10 audit's AIAI seam), so the stamp borrows the
 * name's own leading pair instead.
 * @param presetId - the agentPreset id.
 * @param name - the colleague's display name rendered beside the stamp.
 * @returns the stamp acronym to show.
 */
export function stampAcronymOf(presetId: string | undefined, name: string): string {
  const visual = colleagueOf(presetId)
  if (visual.acronym === 'AI' && name.startsWith('AI')) {
    return name.slice(2).trim().slice(0, 2) || 'AI'
  }
  return visual.acronym
}

/**
 * The colleague name the chat header and turn stamps borrow from: the
 * roster row's display name (the roster page's own stamp source), else the
 * visual's duty tag. Session titles (question text / 新会话) never reach
 * the stamps, so one preset's chat seals and roster stamp read the same
 * name for every session.
 * @param presetId - the agentPreset id (undefined for local sessions).
 * @param rosterRow - the roster row when agentPreset.list carries one.
 * @returns the display name the stamp's borrow rule reads.
 */
export function colleagueNameOf(
  presetId: string | undefined,
  rosterRow: { readonly name: string } | undefined,
): string {
  return rosterRow?.name ?? colleagueOf(presetId).duty
}

/**
 * The roster render bands (v6): the three capability groups in order, then
 * the 更多 AI 同事 catch-all for visuals the table left ungrouped. Empty
 * bands drop out (the design's renderRoster: no heading without items).
 * @param entries - the roster rows paired with their visual metadata.
 * @returns the named bands that hold at least one row.
 */
export function rosterBandsOf<T extends { readonly id: string; readonly visual: ColleagueVisual }>(
  entries: readonly T[],
): ReadonlyArray<{ readonly title: string; readonly entries: readonly T[] }> {
  const bands: { title: string; entries: T[] }[] = COLLEAGUE_GROUPS.map(group => ({
    title: group,
    entries: entries.filter(entry => entry.visual.group === group),
  }))
  const grouped = new Set(entries.filter(entry => entry.visual.group !== undefined).map(entry => entry.id))
  const rest = entries.filter(entry => !grouped.has(entry.id))
  if (rest.length > 0) bands.push({ title: '更多 AI 同事', entries: rest })
  return bands.filter(band => band.entries.length > 0)
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
