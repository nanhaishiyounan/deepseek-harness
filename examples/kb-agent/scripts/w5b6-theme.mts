/**
 * W5-B6 theme landing: the manufacturing-standard theme row (themeConfig
 * uid `mfg-standard`, default) written from the W5 UIUX research token map
 * (report.md §4.1 A) plus the globalStyle CSS that documents the nine-state
 * status palette as CSS variables and keeps numeric columns tabular. The
 * previous default (Compact, fontSize 16) is demoted to default=false; the
 * four built-in themes stay user-optional so Dark/Compact remain available.
 *
 * The client applies a default theme to every user who has not picked one
 * (plugin-theme-editor InitializeTheme / themeApi find(item => item.default)),
 * so one row write restyles the whole console.
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w5b6-theme.mts --apply
 *   node --import tsx/esm examples/kb-agent/scripts/w5b6-theme.mts --assert
 *   node --import tsx/esm examples/kb-agent/scripts/w5b6-theme.mts --rollback
 */
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { call, dataOf, signInWithRetry } from './nocobase-flow-page-lib.mts'

const RESEARCH_DIR = new URL('../../../research/2026-09-29-w5-rework/', import.meta.url).pathname
const ROLLBACK_PATH = `${RESEARCH_DIR}w5-b6-theme-rollback.json`
const THEME_UID = 'mfg-standard'

/**
 * The globalStyle CSS string. CSS variables declare the nine-state palette
 * (report §4.3 — antd preset names render these exact fg/bg pairs) so any
 * future custom block reads status colors from one place; `tabular-nums`
 * keeps money columns digit-aligned (report §4.1 C density table).
 */
const GLOBAL_STYLE = `
/* W5-B6 nine-state palette (antd preset name -> exact fg/bg the Tag renders) */
:root {
  --w5-status-draft-fg: #595959;        --w5-status-draft-bg: #fafafa;
  --w5-status-pending-fg: #D46B08;      --w5-status-pending-bg: #fff7e6;
  --w5-status-reviewing-fg: #1677FF;    --w5-status-reviewing-bg: #e6f4ff;
  --w5-status-approved-fg: #389E0D;     --w5-status-approved-bg: #f6ffed;
  --w5-status-rejected-fg: #CF1322;     --w5-status-rejected-bg: #fff1f0;
  --w5-status-inprogress-fg: #1677FF;
  --w5-status-completed-fg: #08979C;    --w5-status-completed-bg: #e6fffb;
  --w5-status-cancelled-fg: #8C8C8C;    --w5-status-cancelled-bg: #fafafa;
  --w5-status-void-fg: #A8071A;         --w5-status-void-bg: #fff1f0;
}
/* money/qty/date columns: digit-aligned figures end to end */
.ant-table td, .ant-table th { font-variant-numeric: tabular-nums; }
/* object-header Tags one size up inside drawers (Fiori: small tag in tables, large on object pages) */
.ant-drawer-content .ant-tag { font-size: 14px; line-height: 22px; padding: 0 8px; }
`

/**
 * The mfg-standard theme config, the report §4.1 A token map. Only tokens
 * that differ from antd5 defaults are stated (colorPrimary is restated as
 * the documented brand anchor). colorBgSider takes the deep-navy sidebar
 * (Odoo Apps/ERPNext resident-sidebar convention, same hue family as the
 * brand blue).
 */
export const MFG_STANDARD_THEME: Record<string, unknown> = {
  name: '制造业标准',
  token: {
    colorPrimary: '#1677FF',
    colorSuccess: '#52C41A',
    colorWarning: '#FAAD14',
    colorError: '#FF4D4F',
    colorInfo: '#1677FF',
    borderRadius: 6,
    fontSize: 14,
    sizeStep: 4,
    sizeUnit: 4,
    colorBgSider: '#001529',
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
  mfgRowBefore: ThemeRow | null
}

function loadRollback(): RollbackRecord | null {
  try {
    return JSON.parse(readFileSync(ROLLBACK_PATH, 'utf8')) as RollbackRecord
  } catch {
    return null
  }
}

async function apply(token: string): Promise<void> {
  const themes = await listThemes(token)
  const mfg = themes.find(row => row.uid === THEME_UID) ?? null
  const previousDefault = themes.find(row => row.default === true && row.uid !== THEME_UID) ?? null
  writeFileSync(ROLLBACK_PATH, `${JSON.stringify({
    created: mfg === null,
    previousDefaultId: previousDefault?.id ?? null,
    previousDefaultDefault: previousDefault?.default ?? null,
    mfgRowBefore: mfg,
  } satisfies RollbackRecord, null, 2)}\n`)
  // demote the standing default (Compact) — exactly one default row survives
  if (previousDefault !== null) {
    await call(token, 'POST', `/api/themeConfig:update?filterByTk=${previousDefault.id}`, { default: false })
    console.log(`demoted default: uid=${previousDefault.uid} id=${previousDefault.id}`)
  }
  const values = { config: MFG_STANDARD_THEME, optional: true, isBuiltIn: false, default: true }
  if (mfg === null) {
    await call(token, 'POST', '/api/themeConfig:create', { uid: THEME_UID, ...values })
    console.log(`created themeConfig uid=${THEME_UID} (default)`)
  } else {
    await call(token, 'POST', `/api/themeConfig:update?filterByTk=${mfg.id}`, values)
    console.log(`updated themeConfig uid=${THEME_UID} id=${mfg.id} (default)`)
  }
}

async function assertThemes(token: string): Promise<void> {
  const themes = await listThemes(token)
  const failures: string[] = []
  const mfg = themes.find(row => row.uid === THEME_UID) ?? null
  if (mfg === null) failures.push('mfg-standard theme row missing')
  else {
    if (mfg.default !== true) failures.push('mfg-standard is not the default theme')
    if (mfg.optional !== true) failures.push('mfg-standard is not user-optional')
    const tokenMap = (mfg.config?.token ?? {}) as Record<string, unknown>
    for (const [key, expected] of Object.entries((MFG_STANDARD_THEME.token as Record<string, unknown>))) {
      const actual = tokenMap[key]
      if (key === 'globalStyle') {
        if (typeof actual !== 'string' || !actual.includes('--w5-status-approved-fg')) failures.push('globalStyle CSS variables missing')
        continue
      }
      if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(`token ${key}: ${String(actual)} != ${String(expected)}`)
    }
    if (mfg.config?.name !== MFG_STANDARD_THEME.name) failures.push('theme name mismatch')
  }
  const defaults = themes.filter(row => row.default === true)
  if (defaults.length !== 1) failures.push(`expected exactly one default theme, found ${defaults.length}`)
  const builtIns = themes.filter(row => row.isBuiltIn === true)
  if (builtIns.length < 4) failures.push(`built-in themes dropped: ${builtIns.length} < 4`)
  console.log(`w5b6-theme assert: themes=${themes.length} defaults=${defaults.map(row => row.uid).join(',')}`)
  if (failures.length > 0) {
    console.error(`w5b6-theme assert: FAILED\n  - ${failures.join('\n  - ')}`)
    process.exitCode = 1
    return
  }
  console.log('w5b6-theme assert: OK')
}

async function rollback(token: string): Promise<void> {
  const record = loadRollback()
  if (record === null) {
    console.error('no rollback record; nothing to undo')
    process.exitCode = 2
    return
  }
  const themes = await listThemes(token)
  if (record.created) {
    const mfg = themes.find(row => row.uid === THEME_UID)
    if (mfg !== undefined) await call(token, 'POST', `/api/themeConfig:destroy?filterByTk=${mfg.id}`)
    console.log(`destroyed themeConfig uid=${THEME_UID}`)
  } else if (record.mfgRowBefore !== null) {
    await call(token, 'POST', `/api/themeConfig:update?filterByTk=${record.mfgRowBefore.id}`, {
      config: record.mfgRowBefore.config ?? {},
      optional: record.mfgRowBefore.optional ?? true,
      isBuiltIn: record.mfgRowBefore.isBuiltIn ?? false,
      default: record.mfgRowBefore.default ?? false,
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
    console.error('usage: w5b6-theme.mts --apply|--assert|--rollback')
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
