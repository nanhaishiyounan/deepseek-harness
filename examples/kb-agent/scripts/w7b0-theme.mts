/**
 * W7-B0 theme landing: the「W7 铸造 · Forge」theme row (themeConfig uid
 * `w7-forge`, default) written from the W7 design-language spec
 * (plans/plan-w7.zh.md §3). The previous default (`mfg-standard`, antd
 * out-of-the-box blue #1677FF) is demoted to default=false and stays
 * user-optional, so the rollback face keeps the whole W5 row.
 *
 * Layer 1 is the antd seed-token map (brand Prussian blue #1E4E8C, Fiori
 * semantic five-state colors, warm-gray neutrals); layer 2 is the globalStyle
 * string: the `--w7-*` design-token set (JSBlock pages and later batches read
 * these) plus whole-console component bases (table header 13/600, zebra rows,
 * digit-aligned figures, soft preset tags, card radius+shadow, pill tags).
 *
 * The client applies a default theme to every user who has not picked one
 * (plugin-theme-editor InitializeTheme / find(item => item.default)), so one
 * row write restyles the whole console. Scope is the NocoBase admin console
 * (:13000) only — the 3080 PC app keeps its own styling.
 *
 * B1 precondition debt fixes (2026-10-03): the rollback snapshot merges with
 * a standing record instead of overwriting it (a repeated --apply used to
 * drop previousDefaultId and degrade rollback into a no-restore); the user
 * pinning sweep (users.systemSettings.themeId pinned to any non-w7-forge row
 * outranks the default switch) is part of apply/assert/rollback instead of a
 * one-off manual pass; assert fails on any pinned residue, not just on theme
 * rows.
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w7b0-theme.mts --apply
 *   node --import tsx/esm examples/kb-agent/scripts/w7b0-theme.mts --assert
 *   node --import tsx/esm examples/kb-agent/scripts/w7b0-theme.mts --rollback
 */
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { call, dataOf, signInWithRetry } from './nocobase-flow-page-lib.mts'

const RESEARCH_DIR = new URL('../../../research/2026-10-03-w7-rework/b0/', import.meta.url).pathname
const ROLLBACK_PATH = `${RESEARCH_DIR}w7-b0-theme-rollback.json`
const USER_PIN_PATH = `${RESEARCH_DIR}w7-b0-user-themeid-rollback.json`
const THEME_UID = 'w7-forge'
/** The W5 row that owns the default slot before this script runs. */
const PREVIOUS_UID = 'mfg-standard'

/**
 * The globalStyle CSS string: the W7 design-token base (plan §3.7 layer 2).
 * One string, whole-console effect. Kept to a base layer — page-level fixes
 * belong to layer 3 (schema heal / JSBlock rewrites).
 */
const GLOBAL_STYLE = `
/* ===== W7 铸造 · Forge — design tokens (plans/plan-w7.zh.md §3) ===== */
:root {
  /* brand: Prussian blue, hover/active steps */
  --w7-primary: #1E4E8C;  --w7-primary-hover: #2A5FA6;  --w7-primary-active: #173D70;
  --w7-primary-soft: #E8F0F9;
  /* semantic five states (Fiori Morning Horizon fg/bg pairs) */
  --w7-positive-fg: #256F3A;       --w7-positive-bg: #F5FAE5;
  --w7-critical-fg: #E76500;       --w7-critical-bg: #FFF8D6;
  --w7-negative-fg: #AA0808;       --w7-negative-bg: #FFEAF4;
  --w7-neutral-fg: #788FA6;        --w7-neutral-bg: #EFF1F2;
  --w7-informational-fg: #0070F2;  --w7-informational-bg: #E1F4FF;
  /* neutral scale: warm-gray editorial */
  --w7-canvas: #F6F6F4;  --w7-surface: #FFFFFF;  --w7-surface-2: #FAFAF9;
  --w7-border: #E8E8E6;  --w7-border-strong: #D8D8D5;
  --w7-text: #1F2630;  --w7-text-secondary: #55606E;  --w7-text-weak: #8A94A0;
  /* chart series: same-hue blue ramp + neutral; heat ramp = semantic trio */
  --w7-chart-1: #1E4E8C;  --w7-chart-2: #3A69A4;  --w7-chart-3: #5783BC;
  --w7-chart-4: #7B9DD1;  --w7-chart-5: #A3BCE2;  --w7-chart-6: #CBDCF0;
  --w7-chart-neutral: #B8BFC8;
  /* geometry */
  --w7-radius-card: 8px;  --w7-radius-control: 6px;  --w7-radius-tag: 999px;  --w7-radius-badge: 4px;
  /* elevation: diffuse same-tone shadows, never plain black */
  --w7-shadow-card: 0 1px 2px rgba(31,38,48,.04), 0 8px 24px rgba(31,38,48,.06);
  --w7-shadow-raised: 0 4px 12px rgba(31,38,48,.10);
  /* type ramp */
  --w7-fs-caption: 12px;  --w7-fs-body: 13px;  --w7-fs-subtitle: 15px;  --w7-fs-title: 18px;  --w7-fs-kpi: 28px;
  /* motion */
  --w7-dur-fast: 160ms;  --w7-ease: cubic-bezier(0.16,1,0.3,1);
}

/* ===== table base: header 13/600 on surface-2, zebra, hover tint, tnum ===== */
.ant-table-thead > tr > th, .ant-table-thead > tr > td {
  font-size: var(--w7-fs-body); font-weight: 600;
  color: var(--w7-text-secondary); background: var(--w7-surface-2);
  padding-block: 12px;
}
.ant-table-tbody > tr > td { font-size: var(--w7-fs-body); padding-block: 14px; padding-inline: 12px; }
.ant-table-tbody > tr > td:not(:last-child) { border-bottom: 1px solid #EFEFEF; }
.ant-table-tbody > tr:nth-child(even) > td:not(.ant-table-cell-row-selected) { background: var(--w7-surface-2); }
.ant-table-tbody > tr:hover > td:not(.ant-table-cell-row-selected) { background: #F0F6FC; }
.ant-table td, .ant-table th { font-variant-numeric: tabular-nums; }

/* ===== tags: pill form + preset classes remapped to W7 semantic soft pairs ===== */
.ant-tag { border-radius: var(--w7-radius-tag) !important; font-size: var(--w7-fs-caption); }
.ant-tag-blue, .ant-tag-geekblue { color: #0070F2 !important; background: #E1F4FF !important; border-color: #B3DCFF !important; }
.ant-tag-green, .ant-tag-lime { color: #256F3A !important; background: #F5FAE5 !important; border-color: #CDE5B0 !important; }
.ant-tag-red, .ant-tag-volcano { color: #AA0808 !important; background: #FFEAF4 !important; border-color: #F3B8C8 !important; }
.ant-tag-orange, .ant-tag-gold { color: #E76500 !important; background: #FFF8D6 !important; border-color: #F2D98C !important; }
.ant-tag-cyan { color: #0E7490 !important; background: #E0F5F7 !important; border-color: #B3E3E8 !important; }
.ant-tag-purple, .ant-tag-magenta { color: #788FA6 !important; background: #EFF1F2 !important; border-color: #D5DBE2 !important; }
/* object-header Tags one size up inside drawers (W5 rule kept) */
.ant-drawer-content .ant-tag { font-size: 14px; line-height: 22px; padding: 0 8px; }

/* ===== badges: preset status dots remapped to the same W7 semantic pairs =====
   (the tag remap above does not reach antd Badge; antd's CSS-in-JS paints the
   dot through a compound selector at specificity (0,3,0), so the remap rides
   an equal-or-higher compound plus !important to settle load-order too) */
.ant-badge .ant-badge-status-dot.ant-badge-color-blue, .ant-badge .ant-badge-status-dot.ant-badge-color-geekblue { background: #1E4E8C !important; color: #1E4E8C !important; border-color: #1E4E8C !important; }
.ant-badge .ant-badge-status-dot.ant-badge-color-green, .ant-badge .ant-badge-status-dot.ant-badge-color-lime { background: #256F3A !important; color: #256F3A !important; border-color: #256F3A !important; }
.ant-badge .ant-badge-status-dot.ant-badge-color-red, .ant-badge .ant-badge-status-dot.ant-badge-color-volcano { background: #AA0808 !important; color: #AA0808 !important; border-color: #AA0808 !important; }
.ant-badge .ant-badge-status-dot.ant-badge-color-orange, .ant-badge .ant-badge-status-dot.ant-badge-color-gold, .ant-badge .ant-badge-status-dot.ant-badge-color-yellow { background: #E76500 !important; color: #E76500 !important; border-color: #E76500 !important; }
.ant-badge .ant-badge-status-dot.ant-badge-color-cyan { background: #0E7490 !important; color: #0E7490 !important; border-color: #0E7490 !important; }
.ant-badge .ant-badge-status-dot.ant-badge-color-purple, .ant-badge .ant-badge-status-dot.ant-badge-color-magenta, .ant-badge .ant-badge-status-dot.ant-badge-color-pink { background: #788FA6 !important; color: #788FA6 !important; border-color: #788FA6 !important; }
.ant-badge .ant-badge-status-text.ant-badge-color-blue, .ant-badge .ant-badge-status-text.ant-badge-color-geekblue { color: #1E4E8C !important; }
.ant-badge .ant-badge-status-text.ant-badge-color-green, .ant-badge .ant-badge-status-text.ant-badge-color-lime { color: #256F3A !important; }
.ant-badge .ant-badge-status-text.ant-badge-color-red, .ant-badge .ant-badge-status-text.ant-badge-color-volcano { color: #AA0808 !important; }
.ant-badge .ant-badge-status-text.ant-badge-color-orange, .ant-badge .ant-badge-status-text.ant-badge-color-gold, .ant-badge .ant-badge-status-text.ant-badge-color-yellow { color: #E76500 !important; }
.ant-badge .ant-badge-status-text.ant-badge-color-cyan { color: #0E7490 !important; }
.ant-badge .ant-badge-status-text.ant-badge-color-purple, .ant-badge .ant-badge-status-text.ant-badge-color-magenta, .ant-badge .ant-badge-status-text.ant-badge-color-pink { color: #788FA6 !important; }

/* ===== cards: one radius, 1px border + diffuse shadow ===== */
.ant-card {
  border-radius: var(--w7-radius-card);
  border: 1px solid var(--w7-border);
  box-shadow: var(--w7-shadow-card);
}

/* ===== buttons: pressed feedback, brand focus ring ===== */
.ant-btn { transition: color var(--w7-dur-fast) var(--w7-ease), background-color var(--w7-dur-fast) var(--w7-ease), border-color var(--w7-dur-fast) var(--w7-ease), box-shadow var(--w7-dur-fast) var(--w7-ease), transform var(--w7-dur-fast) var(--w7-ease); }
.ant-btn:active { transform: scale(0.98); }
.ant-btn:focus-visible { outline: 2px solid rgba(30,78,140,.35); outline-offset: 1px; }

/* ===== W7-B4 v1 gantt 定向包覆（排产甘特 96yet9a0x45 / 任务甘特 zs3oqvlgqq0；
       v1 老技术栈无 flowModels，按 plan-w7 B4 章节维持组件不重写，仅 CSS 精修：
       竖向网格线锚定、行分隔、今天列红线描边、条外标签基线对齐、选中态描边。
       SVG presentation attributes 的优先级低于 CSS 规则，故无需 !important） ===== */
svg .gridTick { stroke: #E8E8E6; stroke-width: 1; }
svg .gridRowLine { stroke: #EFEFEF; stroke-width: 1; }
svg .today rect { fill: rgba(231, 101, 0, 0.06); stroke: #E76500; stroke-width: 1.5; }
svg .barLabelOutside { dominant-baseline: middle; fill: #55606E; }
svg .bar.active rect, svg .bar.selected rect { stroke: #1E4E8C; stroke-width: 2; }

/* ===== scrollbar + global focus + motion preference ===== */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb { background: var(--w7-border-strong); border-radius: var(--w7-radius-badge); }
::-webkit-scrollbar-thumb:hover { background: #C0C0BC; }
::-webkit-scrollbar-track { background: transparent; }
:focus-visible { outline: 2px solid rgba(30,78,140,.35); outline-offset: 1px; }
@media (prefers-reduced-motion: reduce) {
  .ant-btn, .ant-card { transition: none !important; }
  .ant-btn:active { transform: none; }
}
`

/**
 * The w7-forge theme config (plan §3.7 layer 1): the antd v5 seed-token map
 * for the whole console. colorBgSider takes the deep Prussian sidebar
 * (#16304F, same hue family as the brand); colorBgLayout the warm-gray canvas.
 */
export const W7_FORGE_THEME: Record<string, unknown> = {
  name: 'W7 铸造',
  token: {
    colorPrimary: '#1E4E8C',
    colorPrimaryHover: '#2A5FA6',
    colorPrimaryActive: '#173D70',
    colorSuccess: '#256F3A',
    colorWarning: '#E76500',
    colorError: '#AA0808',
    colorInfo: '#0070F2',
    colorLink: '#1E4E8C',
    colorLinkHover: '#2A5FA6',
    colorLinkActive: '#173D70',
    colorText: '#1F2630',
    colorTextSecondary: '#55606E',
    colorTextTertiary: '#8A94A0',
    colorBorder: '#D8D8D5',
    colorBorderSecondary: '#E8E8E6',
    colorBgLayout: '#F6F6F4',
    colorBgContainer: '#FFFFFF',
    colorBgSider: '#16304F',
    borderRadius: 6,
    fontSize: 14,
    sizeStep: 4,
    sizeUnit: 4,
    fontFamily: "'PingFang SC', 'HarmonyOS Sans SC', 'Microsoft YaHei', system-ui, sans-serif",
    globalStyle: GLOBAL_STYLE,
  },
}

type ThemeRow = {
  id: number
  uid?: string
  config?: Record<string, unknown>
  optional?: boolean
  isBuiltIn?: boolean
  default?: boolean
}

async function listThemes(token: string): Promise<ThemeRow[]> {
  const rows = await dataOf(token, 'GET', '/api/themeConfig:list?paginate=false&sort=id') as ThemeRow[] | null
  if (rows === null) throw new Error('themeConfig:list returned no data')
  return rows
}

type RollbackRecord = {
  created: boolean
  previousDefaultId: number | null
  previousDefaultDefault: boolean | null
  w7RowBefore: ThemeRow | null
}

function loadRollback(): RollbackRecord | null {
  try {
    return JSON.parse(readFileSync(ROLLBACK_PATH, 'utf8')) as RollbackRecord
  } catch {
    return null
  }
}

/** users.systemSettings.themeId journal — a pin outranks the default switch, so the sweep must be undoable. */
type UserPinRecord = {
  cleared: Array<{ id: number, username: string, removedThemeId: number }>
  before: Record<string, { username: string, systemSettings: Record<string, unknown> }>
}

function loadUserPins(): UserPinRecord {
  try {
    const parsed = JSON.parse(readFileSync(USER_PIN_PATH, 'utf8')) as Partial<UserPinRecord>
    return { cleared: Array.isArray(parsed.cleared) ? parsed.cleared : [], before: parsed.before ?? {} }
  } catch {
    return { cleared: [], before: {} }
  }
}

type UserRow = { id: number, username?: string, systemSettings?: Record<string, unknown> | null }

async function listUsers(token: string): Promise<UserRow[]> {
  const rows = await dataOf(token, 'GET', '/api/users:list?paginate=false&sort=id') as UserRow[] | null
  if (rows === null) throw new Error('users:list returned no data')
  return rows
}

/** Users pinned to any row other than w7-forge; a pin equal to the live default is harmless. */
async function pinnedUsers(token: string, w7Id: number): Promise<Array<{ row: UserRow, themeId: number }>> {
  const pinned: Array<{ row: UserRow, themeId: number }> = []
  for (const row of await listUsers(token)) {
    const themeId = row.systemSettings?.themeId
    if (typeof themeId === 'number' && themeId !== w7Id) pinned.push({ row, themeId })
  }
  return pinned
}

/** Clear every non-w7-forge pin; first-seen originals are journaled once (the B0 manual-pass entries merge in). */
async function sweepPins(token: string, w7Id: number): Promise<number> {
  const record = loadUserPins()
  let swept = 0
  for (const { row, themeId } of await pinnedUsers(token, w7Id)) {
    if (record.before[String(row.id)] === undefined) {
      record.before[String(row.id)] = { username: String(row.username ?? ''), systemSettings: { ...(row.systemSettings ?? {}) } }
      record.cleared.push({ id: row.id, username: String(row.username ?? ''), removedThemeId: themeId })
    }
    await call(token, 'POST', `/api/users:update?filterByTk=${row.id}`, { systemSettings: { ...(row.systemSettings ?? {}), themeId: null } })
    swept++
  }
  if (swept > 0) {
    writeFileSync(USER_PIN_PATH, `${JSON.stringify(record, null, 2)}\n`)
    console.log(`swept themeId pins on ${swept} user(s)`)
  }
  return swept
}

/** Put back every journaled pin (first-seen value); runs before the theme-row restore in --rollback. */
async function restorePins(token: string): Promise<number> {
  const record = loadUserPins()
  for (const entry of record.cleared) {
    await call(token, 'POST', `/api/users:update?filterByTk=${entry.id}`, { systemSettings: { themeId: entry.removedThemeId } })
  }
  if (record.cleared.length > 0) console.log(`restored themeId pins on ${record.cleared.length} user(s)`)
  return record.cleared.length
}

async function apply(token: string): Promise<void> {
  const themes = await listThemes(token)
  const w7 = themes.find(row => row.uid === THEME_UID) ?? null
  const previousDefault = themes.find(row => row.default === true && row.uid !== THEME_UID) ?? null
  if (previousDefault !== null && previousDefault.uid !== PREVIOUS_UID) {
    console.log(`note: standing default is uid=${previousDefault.uid} (expected ${PREVIOUS_UID}); demoting it anyway`)
  }
  // Merge with the standing snapshot: a repeated --apply with w7-forge
  // already default must not overwrite previousDefaultId with null (rollback
  // would then skip the mfg-standard restore) nor created with false. A
  // snapshot already degraded by the pre-fix overwrite self-heals: the
  // restore target is re-derived from the PREVIOUS_UID row.
  const standing = loadRollback()
  const healedPreviousId = standing?.previousDefaultId ?? themes.find(row => row.uid === PREVIOUS_UID)?.id ?? null
  writeFileSync(ROLLBACK_PATH, `${JSON.stringify({
    created: standing !== null ? standing.created : w7 === null,
    previousDefaultId: previousDefault?.id ?? healedPreviousId,
    previousDefaultDefault: previousDefault?.default ?? (healedPreviousId === null ? null : false),
    w7RowBefore: standing?.w7RowBefore ?? w7,
  } satisfies RollbackRecord, null, 2)}\n`)
  // demote the standing default (mfg-standard) — exactly one default row survives
  if (previousDefault !== null) {
    await call(token, 'POST', `/api/themeConfig:update?filterByTk=${previousDefault.id}`, { default: false })
    console.log(`demoted default: uid=${previousDefault.uid} id=${previousDefault.id}`)
  }
  const values = { config: W7_FORGE_THEME, optional: true, isBuiltIn: false, default: true }
  if (w7 === null) {
    await call(token, 'POST', '/api/themeConfig:create', { uid: THEME_UID, ...values })
    console.log(`created themeConfig uid=${THEME_UID} (default)`)
  } else {
    await call(token, 'POST', `/api/themeConfig:update?filterByTk=${w7.id}`, values)
    console.log(`updated themeConfig uid=${THEME_UID} id=${w7.id} (default)`)
  }
  const w7Id = w7?.id ?? (await listThemes(token)).find(row => row.uid === THEME_UID)?.id
  if (w7Id !== undefined) await sweepPins(token, w7Id)
}

async function assertThemes(token: string): Promise<void> {
  const themes = await listThemes(token)
  const failures: string[] = []
  const w7 = themes.find(row => row.uid === THEME_UID) ?? null
  if (w7 === null) failures.push('w7-forge theme row missing')
  else {
    if (w7.default !== true) failures.push('w7-forge is not the default theme')
    if (w7.optional !== true) failures.push('w7-forge is not user-optional')
    const tokenMap = (w7.config?.token ?? {}) as Record<string, unknown>
    for (const [key, expected] of Object.entries((W7_FORGE_THEME.token as Record<string, unknown>))) {
      const actual = tokenMap[key]
      if (key === 'globalStyle') {
        if (typeof actual !== 'string' || !actual.includes('--w7-primary: #1E4E8C')) failures.push('globalStyle brand tokens missing')
        if (typeof actual !== 'string' || !actual.includes('--w7-semantic')) {
          // token names use --w7-positive-fg etc.; assert one known member instead
        }
        if (typeof actual !== 'string' || !actual.includes('--w7-negative-fg: #AA0808')) failures.push('globalStyle semantic tokens missing')
        continue
      }
      if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(`token ${key}: ${String(actual)} != ${String(expected)}`)
    }
    if (w7.config?.name !== W7_FORGE_THEME.name) failures.push('theme name mismatch')
  }
  const previous = themes.find(row => row.uid === PREVIOUS_UID) ?? null
  if (previous === null) failures.push(`${PREVIOUS_UID} row dropped (must stay user-optional)`)
  else if (previous.default === true) failures.push(`${PREVIOUS_UID} still default`)
  const defaults = themes.filter(row => row.default === true)
  if (defaults.length !== 1) failures.push(`expected exactly one default theme, found ${defaults.length}`)
  const builtIns = themes.filter(row => row.isBuiltIn === true)
  if (builtIns.length < 4) failures.push(`built-in themes dropped: ${builtIns.length} < 4`)
  // pinning residue: a user pinned to any non-w7-forge row keeps the old skin
  // alive for that account (globalStyle new + seed tokens old split brain).
  if (w7 !== null) {
    const pinned = await pinnedUsers(token, w7.id)
    if (pinned.length > 0) {
      failures.push(`users pinned to a non-w7-forge theme: ${pinned.map(({ row, themeId }) => `${row.username ?? row.id}→${themeId}`).join(', ')}`)
    }
  }
  console.log(`w7b0-theme assert: themes=${themes.length} defaults=${defaults.map(row => row.uid).join(',')}`)
  if (failures.length > 0) {
    console.error(`w7b0-theme assert: FAILED\n  - ${failures.join('\n  - ')}`)
    process.exitCode = 1
    return
  }
  console.log('w7b0-theme assert: OK')
}

async function rollback(token: string): Promise<void> {
  const record = loadRollback()
  if (record === null) {
    console.error('no rollback record; nothing to undo')
    process.exitCode = 2
    return
  }
  await restorePins(token)
  const themes = await listThemes(token)
  if (record.created) {
    const w7 = themes.find(row => row.uid === THEME_UID)
    if (w7 !== undefined) await call(token, 'POST', `/api/themeConfig:destroy?filterByTk=${w7.id}`)
    console.log(`destroyed themeConfig uid=${THEME_UID}`)
  } else if (record.w7RowBefore !== null) {
    await call(token, 'POST', `/api/themeConfig:update?filterByTk=${record.w7RowBefore.id}`, {
      config: record.w7RowBefore.config ?? {},
      optional: record.w7RowBefore.optional ?? true,
      isBuiltIn: record.w7RowBefore.isBuiltIn ?? false,
      default: record.w7RowBefore.default ?? false,
    })
    console.log(`restored themeConfig uid=${THEME_UID} to before-state`)
  }
  if (record.previousDefaultId !== null) {
    await call(token, 'POST', `/api/themeConfig:update?filterByTk=${record.previousDefaultId}`, { default: true })
    console.log(`restored default on id=${record.previousDefaultId}`)
  }
  unlinkSync(ROLLBACK_PATH)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.length !== 1 || !['--apply', '--assert', '--rollback'].includes(args[0] ?? '')) {
    console.error('usage: w7b0-theme.mts --apply|--assert|--rollback')
    process.exitCode = 2
    return
  }
  const token = await signInWithRetry()
  if (args[0] === '--apply') await apply(token)
  else if (args[0] === '--assert') await assertThemes(token)
  else await rollback(token)
}

void main().catch(error => {
  console.error(error)
  process.exit(1)
})
