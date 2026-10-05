// W11-B1 verdict tagging: annotate the aggregated audit issues with the
// four-state disposition (fixed / rejected / ledger / pooled) using the
// DOM-verdict keys from w11-b1-dom-verify.log + the fix reshoot, then emit the
// machine-readable ledger. The P0/P1 buckets and counts print to the log.
// Usage (repo root): node demos/acceptance-w11/.verdicts-w11b1.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const OUT = 'demos/acceptance-w11'
const data = JSON.parse(readFileSync(`${OUT}/.w11-b1-audit-issues.json`, 'utf8'))
const norm = (s) => (s.startsWith('P0') ? 'P0' : s.startsWith('P1') ? 'P1' : 'P2')

// Verdict rules over the normalized (route-class, description) space. Each
// entry cites its evidence key; anything unmatched stays P2-pool.
const verdicts = []
const tag = (match, status, why) => verdicts.push({ match, status, why })

// Fixed this batch (F1 filterTabs rim, F3 PageNav ellipsis).
tag((i) => i.sev === 'P0' && i.route === 'chats-375-dark' && /分段|胶囊|Capsule|tab/i.test(i.d), 'fixed', 'F1：暗轨 idle 分段对画布差 ~6RGB，补 1px 焙线描边（w11-b1-fix-chats-375-dark.png + dom 断言）')
tag((i) => i.sev === 'P1' && i.route === 'chats-375-dark' && i.cls === 'contrast' && /分段|胶囊|选中|AI 同事|待审核/.test(i.d), 'fixed', 'F1 同因：idle 底不可见导致的对比问题')
tag((i) => i.sev === 'P1' && i.route === 'work-detail-375-light' && i.cls === 'layout-overflow' && /截断|省略/.test(i.d), 'fixed', 'F3：.pageTitle 三件套（overflow:hidden+ellipsis+nowrap），实测 scrollW588>clientW285 省略在位')
// Rejected with evidence.
tag((i) => i.cls === 'ua-default-style' && /textarea|输入框|发送|语音|FAB|纸飞机/i.test(i.d), 'rejected', 'composer 胶囊+焙线+halo 本批实测在案（radius999/focus brand 对）；antd/lucide 定制控件非 UA 默认')
tag((i) => i.cls === 'ua-default-style' && /Switch|开关/i.test(i.d), 'rejected', 'W10-B3 同题裁决：antd Switch 定制（焙线轨/柿橙选中）')
tag((i) => i.cls === 'ua-default-style' && /🔍|emoji/i.test(i.d), 'rejected', 'lucide SVG 图标（dom-verify：svgIcon=true emojiChar=false）')
tag((i) => i.cls === 'ua-default-style' && /radio|select/i.test(i.d), 'rejected', '自绘分段（dom-verify：radios=0）')
tag((i) => i.cls === 'ua-default-style' && /button|按钮/i.test(i.d) && i.route !== 'chats-375-dark', 'rejected', 'dshm-button-reset 全量 UA reset（dom-verify：uaOutsetButtons=0/18）')
tag((i) => /系统蓝|蓝调|蓝色链接/.test(i.d), 'rejected', 'chat NavBar 取样：back/subtitle rgb(61,43,31) 暖焙墨（工业蓝 W10 已清零）')
tag((i) => /印章|朱印|楷体|衬线|手刻/.test(i.d) && /字体|印章/.test(i.d), 'rejected', 'W10 X22/X25 口径：图标/字体印章化超出本轮章程（设计语言扩展）')
tag((i) => i.sev === 'P0' && /表单.*徽章|徽章.*深红/.test(i.d), 'rejected', '「表单」章 bg rgb(147,56,42)=印章红 token，非默认红（W10-B3 T2 在案）')
tag((i) => i.sev === 'P1' && i.route.startsWith('files') && i.cls === 'misalign', 'rejected', 'dom-verify 实测三行 stamp/texts/action 中心 delta=0（完全对齐）')
tag((i) => /状态栏|Status Bar|安全高度/.test(i.d), 'rejected', '浏览器 chrome 承担状态栏；W8 以来无 standalone 假设')
tag((i) => /悬挂|缩进|项目符号.*■/.test(i.d), 'rejected', 'welcome 卡 markdown 列表渲染规则（W9 规格本身）')
tag((i) => /1px.*分隔线|分隔线.*默认灰/.test(i.d), 'rejected', '分隔线 = --dshm-line 焙线 token（#eadfc9/#453728，非系统灰）')
tag((i) => /冷灰|工业灰|阴影.*灰/.test(i.d), 'rejected', 'tokens shadow-card 基色 rgba(61,43,31) 暖焙墨（W10 X12/X23 同口径）')
tag((i) => i.route.startsWith('todos') && /字号|层级/.test(i.d), 'rejected', '实测 h1=30px vs 空态 title=17px，阶差充足（X24 销账）')
tag((i) => i.sev === 'P1' && i.route === 'home-390-light' && i.cls === 'contrast', 'rejected', 'warning #b35600 tokens 注释 4.95:1（AA）；语义五态 W10 X03 口径')
tag((i) => /rgba\(217|融为一体|层级丢失/.test(i.d) && i.route.includes('dark'), 'rejected', '暗轨分层由 shadow-card 0 8px 24px rgba(0,0,0,.45) + card2 阶承担（W10 X23 台账）')
tag((i) => i.cls === 'contrast' && /描述|说明|副标题|二级/.test(i.d), 'rejected', 'ink-sub 阶对卡 6.4:1 AA 达标（W10 台账「me 二级文本」同口径）')
tag((i) => i.sev === 'P1' && /被输入框|裁切|遮挡/.test(i.d) && i.route === 'ix-kbd-375-light', 'rejected', 'ix-kbd 实拍：最后一行完整可见，flow/composer 同流不覆盖')
tag((i) => i.sev === 'P1' && /查看全部|链接/.test(i.d) && i.route === 'home-390-light', 'rejected', '链接色 = brand-deep（W10 T2 清蓝在案）；交互约定属单点观感')
tag((i) => i.sev === 'P1' && i.route.startsWith('home-390') && i.cls === 'inconsistency', 'rejected', '统计卡数字走语义五态引用型（进行中/待确认/已完成各色），色差是状态语义')
// Ledger (spec-grounded, stays open with rationale).
tag((i) => /已完成.*截断|渐变遮罩|渐隐/.test(i.d) && i.route.startsWith('work'), 'ledger', 'statusTabs 溢出 16px 属可滚场景，渐隐尾缘=W10 T6 滚动可发现性规格')
tag((i) => /TabBar|底部导航.*胶囊|圆角矩形.*胶囊/.test(i.d), 'ledger', 'TabBar 选中槽圆角矩形 vs 胶囊 = W8 TabBar 规格本身')
tag((i) => i.route === 'me-375-dark' && i.cls === 'inconsistency' && /纯文字|无背景/.test(i.d), 'ledger', 'demo 数据区三入口 = W8 小操作规格（次级文字钮）')
tag((i) => /项目符号|字重过粗|黑体/.test(i.d) && i.route.startsWith('ix-'), 'ledger', 'welcome 卡 W9-B5 规格（fs/display 阶与 · 符号默认墨）')
tag((i) => i.sev === 'P1' && i.route.startsWith('files') && /顶距|分组|分区|查看报告.*分组|元信息/.test(i.d), 'ledger', 'files 分区节奏（AI 生成段顶距 16 vs 24）——X15 域，VLM 估值需 DOM 量测，留池下批')

const decide = (issue) => {
  for (const v of verdicts) {
    if (v.match(issue)) return v
  }
  return null
}

const counts = { P0: { fixed: 0, rejected: 0, ledger: 0, pooled: 0 }, P1: { fixed: 0, rejected: 0, ledger: 0, pooled: 0 }, P2: { fixed: 0, rejected: 0, ledger: 0, pooled: 0 } }
const taggedResults = []
for (const r of data.results) {
  const issues = r.issues.map((issue) => {
    const sev = norm(issue.severity)
    const wrapped = { sev, cls: issue.category, d: issue.description, route: r.route }
    const verdict = decide(wrapped)
    const status = verdict?.status ?? 'pooled'
    counts[sev][status] += 1
    return { ...issue, severityNorm: sev, status, verdictWhy: verdict?.why ?? 'P2 池（微调池下批态）' }
  })
  taggedResults.push({ ...r, issues })
}

writeFileSync(`${OUT}/.w11-b1-audit-issues.json`, JSON.stringify({
  ...data,
  verdictsAt: new Date().toISOString(),
  counts,
  results: taggedResults,
}, null, 2))

const lines = [
  `P0: fixed=${counts.P0.fixed} rejected=${counts.P0.rejected} ledger=${counts.P0.ledger} pooled=${counts.P0.pooled}`,
  `P1: fixed=${counts.P1.fixed} rejected=${counts.P1.rejected} ledger=${counts.P1.ledger} pooled=${counts.P1.pooled}`,
  `P2: fixed=${counts.P2.fixed} rejected=${counts.P2.rejected} ledger=${counts.P2.ledger} pooled=${counts.P2.pooled}`,
]
console.log(lines.join('\n'))
writeFileSync(`${OUT}/w11-b1-verdict-counts.log`, `${lines.join('\n')}\n`)
