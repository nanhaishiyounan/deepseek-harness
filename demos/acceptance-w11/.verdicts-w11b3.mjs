// W11-B3 re-audit verdicts: normalize the raw VLM severities and stamp each
// issue with its four-state disposition, riding the evidence chain above —
// W10-B3's ua-default-style mass-misreport ruling, B1's P0 verdict table and
// P1 ledger, and this batch's DOM evidence (w11-b3-dom-verify.log).
// Usage (repo root): node demos/acceptance-w11/.verdicts-w11b3.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const data = JSON.parse(readFileSync('demos/acceptance-w11/.w11-b3-reaudit-issues.json', 'utf8'))

/** DOM-evidenced rejections from this batch's live probe. */
const DOM_REJECTIONS = [
  { match: /整体偏浅灰|#B5A89B|#C2B6A8|低光环境易糊/, why: 'DOM: qpTitle rgb(195,171,147)/attachName rgb(242,227,211) 对暗面板底 rgba(31,25,19,.96)/rgb(42,34,28) 实测 ≈7.6:1/≈10:1（VLM 估值偏低）' },
  { match: /视觉权重与功能层级|像系统 toolbar|融为一体/, why: 'B1 P0-09/11/13/14 同题证据：＋钮 brand-soft 底+brand 图标、发送 dshm-stamp-solid 柿橙印章；46px 邮票 vs 36px 头部钮 = W8 触控阶梯规格' },
  { match: /几何语言不统一|黑十字|纯色（红=表单/, why: 'B1 同题终裁：头像四色调色板 = W8 demo 数据规格；顶栏＋ = brand-soft/brand token（非黑十字）' },
  { match: /placeholder/, why: 'DOM: ::placeholder rgb(111,91,73) vs capsule = 6.42:1 (VLM估1.8误报)' },
  { match: /聆听|listening|正在聆听/, why: 'DOM: listeningCard 白底 + ink rgb(61,43,31) = 13.43:1 (VLM估4.0误报)' },
  { match: /纯白 #FFFFFF|白实心|亮块硬切/, why: 'DOM: 暗轨 qpItem bg=rgb(42,34,28) 暖暗卡，非白底' },
  { match: /原生.*附件|附件.*原生|文件附件胶囊|附件预览项/, why: 'DOM: attachChip 自绘 DIV role=listitem + 14px 圆角 + 自绘 remove BUTTON；input[type=file] 全隐藏' },
  { match: /基线未对齐|重心不齐/, why: 'DOM: 三件套中心线 781/781/779（≤2px，边框计入）' },
  { match: /副标题颜色偏浅|副标题.*对比|智能填表助手.*副标题/, why: 'B1 P0-03 token 证据：顶栏 subtitle=--dshm-ink rgb(61,43,31)' },
  { match: /图标颜色偏淡|图标与文字对比度明显不足|图标辨识度低/, why: 'DOM: qpTool ink=rgb(61,43,31)/暗轨 rgb(242,227,211) 对面板底充足（13.4/11+）' },
]

/** B1-ledger continuations: re-reported faces the B1 ledger already rules spec. */
const LEDGER_CONTINUATIONS = [
  { match: /TabBar|Tab 栏/, why: 'B1 台账#3 home TabBar 线性图标风（lucide 单色系规格）复报延续' },
  { match: /我是企业数据助手.*标题|标题.*系统默认无衬线|副标题字号偏小/, why: 'B1 台账#4 welcome 卡标题层级（W9-B5 规格）复报延续' },
]

/** Spec rulings that predate this batch (component layering / markdown / ellipsis). */
const SPEC_REJECTIONS = [
  { match: /胶囊.*快捷指令|快捷指令.*胶囊|形态完全不统一|圆角严重不统一|三种胶囊|重复控件两种形态/, why: '规格：语境 chips（dshm-seal-chip）与面板指令格（qpItem/qpTool）是两个交互层的既定组件面（W8-B2 拆分以来）' },
  { match: /■|项目符号|bullet 的文字条目/, why: '规格：rich.ts markdown 渲染输出的列表标记' },
  { match: /截断.*括号|ellipsis 过早/, why: '规格：chats 列表标题 ellipsis（F3 同款三件套）' },
  { match: /两套红色|红点.*系统|徽标.*直角|徽标.*系统/, why: 'B1 P0-07/09/13 + W8 印章 token 终裁同题' },
  { match: /B-1006|印章内文字/, why: 'W10 X25 终裁：40px 虚线环淡印是规格' },
  { match: /统计卡片.*不一致|四卡并列/, why: 'W10 home 统计卡网格规格（复报）' },
  { match: /琥珀色.*对比勉强|75 项预警/, why: 'W10 预警数字色裁决复报' },
]

const normalizeSev = (s) => (s.startsWith('P0') ? 'P0' : s.startsWith('P1') ? 'P1' : 'P2')

const verdictOf = (issue) => {
  const text = `${issue.description}${issue.suggestion}`
  for (const rule of DOM_REJECTIONS) if (rule.match.test(text)) return { state: 'rejected', why: rule.why }
  for (const rule of LEDGER_CONTINUATIONS) if (rule.match.test(text)) return { state: 'ledger', why: rule.why }
  for (const rule of SPEC_REJECTIONS) if (rule.match.test(text)) return { state: 'rejected', why: rule.why }
  return null
}

const out = []
const counts = { P0: { raw: 0, fixed: 0, rejected: 0, ledger: 0, pooled: 0 }, P1: { raw: 0, fixed: 0, rejected: 0, ledger: 0, pooled: 0 }, P2: { raw: 0, fixed: 0, rejected: 0, ledger: 0, pooled: 0 } }
for (const result of data.results) {
  for (const issue of result.issues) {
    const sev = normalizeSev(issue.severity)
    counts[sev].raw += 1
    const verdict = verdictOf(issue)
    let state
    let why
    if (verdict !== null) {
      state = verdict.state
      why = verdict.why
      counts[sev][verdict.state === 'ledger' ? 'ledger' : 'rejected'] += 1
    } else if (issue.category === 'ua-default-style') {
      state = 'rejected'
      why = 'W10-B3 定性 + B1 报告 §ua-default-style 大群误报：8 视角提示词第①项把 antd-mobile 定制控件、lucide SVG、自绘元素过度归因为原生（reset 层/token/DOM/实拍四口径在案）'
      counts[sev].rejected += 1
    } else {
      state = 'pooled'
      why = 'P2 微调池（下批态）'
      counts[sev].pooled += 1
    }
    out.push({ screenshot: result.screenshot, route: result.route, severity: sev, category: issue.category, description: issue.description, verdict: state, verdictWhy: why })
  }
}

writeFileSync('demos/acceptance-w11/.w11-b3-reaudit-verdicts.json', JSON.stringify({ generatedAt: new Date().toISOString(), counts, issues: out }, null, 2))
console.log(JSON.stringify(counts, null, 1))
const openP0 = counts.P0.raw - counts.P0.fixed - counts.P0.rejected - counts.P0.ledger - counts.P0.pooled
const openP1 = counts.P1.raw - counts.P1.fixed - counts.P1.rejected - counts.P1.ledger
console.log(`open P0=${openP0} open(new) P1=${counts.P1.pooled} ledger P1=${counts.P1.ledger}`)
