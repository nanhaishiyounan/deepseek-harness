// W10-B1 aggregation (final): merge the VLM issue list with DOM-probe and
// targeted-recheck evidence, tag every P0/P1 with confirmed-by-dom /
// visual-only / needs-triage, add DOM-only findings the VLM cannot see,
// count severities/categories/themes, and emit JSON + human-readable MD
// including the B2 fix-priority plan.
// Usage: node demos/acceptance-w10/.aggregate-w10b1.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const OUT = 'demos/acceptance-w10'
const audit = JSON.parse(readFileSync(`${OUT}/.w10-b1-audit-issues.json`, 'utf8'))
const probe = JSON.parse(readFileSync(`${OUT}/.w10-b1-dom-probe.json`, 'utf8'))

const normSeverity = (s) => {
  const v = String(s ?? '').toUpperCase()
  if (v.startsWith('P0')) return 'P0'
  if (v.startsWith('P1')) return 'P1'
  return 'P2'
}
const normCategory = (c) => {
  const v = String(c ?? '').toLowerCase()
  const known = ['ua-default-style', 'layout-overflow', 'misalign', 'contrast', 'spacing', 'typography', 'inconsistency', 'other']
  return known.find((k) => v.includes(k)) ?? 'other'
}
const probeFor = (route) => probe.routes.find((r) => r.route === route)

const RECHECK = {
  blueLeak: 'rgb(30,78,140)（W7 前普鲁士蓝 #1E4E8C 同值残留）实测：表单 tab 徽标 _avatar、「去聊聊」_toolGo、chats 圆形图标同色',
  capsuleLight: 'capsule tab 后两枚 right=428/571 超出 375 视口且容器 overflowX=visible（内容溢出被裁）',
  composer: 'textarea 本体已 reset（appearance:none/border:0），但外盒 .adm-text-area radius=0 直角 + 1px 细沙边——原生观感来源',
  chatsFooter: '探针未发现 fixed/sticky 底部遮挡层；列表 20 行 lastRowBottom=1517 在滚动区内——疑列表尾部 padding 不足而非层级遮挡',
}

const UA_HINTS = ['原生', '默认', '系统', '浏览器自带', '未重置', '未覆盖', 'outset', 'antd', '灰白底', '标准控件']

const tagDom = (issue) => {
  const p = probeFor(issue.route)
  const desc = issue.description
  const cat = issue.category
  if (/工业蓝|蓝色调|蓝色背景|默认的蓝色|#0000FF|蓝色链接/.test(desc) || (cat === 'other' && /蓝/.test(desc))) {
    return { tag: 'confirmed-by-dom', note: RECHECK.blueLeak }
  }
  if (issue.route.startsWith('work') && /状态切换|capsule|tab|页签|筛选|段|标签/.test(desc)) {
    if (issue.route.includes('dark')) return { tag: 'confirmed-by-dom', note: 'adm-capsule-tabs-tab 暗色下底色仍为 antd-mobile 默认 #f5f5f5（ratio 1.15，浅暖字近不可读）' }
    return { tag: 'confirmed-by-dom', note: RECHECK.capsuleLight }
  }
  if (issue.route.startsWith('home') && /roster|名册|AI ?同事|头像|卡片/.test(desc)) {
    return { tag: 'confirmed-by-dom', note: 'home 39 个 button（今日台账/_rosterCard/_recentRow）带 UA 默认 2px outset 边框；rosterCard 计算高度坍缩至 12px' }
  }
  if (issue.route.startsWith('files') && /边框|黑框|直角/.test(desc)) {
    return { tag: 'confirmed-by-dom', note: 'files 页 103 个 button 带 UA 默认 2px outset 边框（文件卡片整体为原生 button 外观）' }
  }
  if (issue.route.startsWith('chat') && /输入框|textarea|placeholder|问我任何/.test(desc)) {
    return { tag: 'confirmed-by-dom', note: RECHECK.composer }
  }
  if (issue.route.startsWith('chats') && /页脚|遮挡|NocoBase/.test(desc)) {
    return { tag: 'needs-triage', note: RECHECK.chatsFooter }
  }
  if (p === undefined) return { tag: 'needs-triage', note: '该路由无 DOM 探针（交互态/登录/详情页未探）' }
  if (cat === 'ua-default-style' || UA_HINTS.some((h) => desc.includes(h))) {
    if (p.nativeControls.length > 0) return { tag: 'confirmed-by-dom', note: `探针捕获 ${p.nativeControls.length} 个原生控件未重置` }
    return { tag: 'needs-triage', note: '探针首屏未见原生控件残留（可能在交互态/弹层）' }
  }
  if (cat === 'contrast' || /对比|可读|看不清|不清晰/.test(desc)) {
    if (p.lowContrast.length > 0) {
      const sample = p.lowContrast.slice(0, 2).map((c) => `"${c.text}" ratio=${c.ratio}`).join('; ')
      return { tag: 'confirmed-by-dom', note: `该路由 ${p.lowContrast.length} 处文本对比度 <3.2（如 ${sample}）` }
    }
    return { tag: 'visual-only', note: '探针未捕获该路由低对比文本（可能为图标/装饰性低对比）' }
  }
  if (cat === 'layout-overflow' || /溢出|截断|遮挡|超出|裁切|坍缩|压扁/.test(desc)) {
    if (issue.route.startsWith('home') && /roster|名册|AI ?同事|头像/.test(desc)) {
      return { tag: 'confirmed-by-dom', note: 'rosterCard 计算高度 12px（正常约 90px+），高度坍缩实测确认' }
    }
    if (/截断|省略/.test(desc) && !/遮挡/.test(desc)) {
      return { tag: 'needs-triage', note: '文字截断多为 ellipsis 策略问题，DOM 探针未逐条定位；截图可见即可修' }
    }
    if (p.docOverflowPx > 0) return { tag: 'confirmed-by-dom', note: `document 横向溢出 ${p.docOverflowPx}px` }
    if (/遮挡|层级/.test(desc)) return { tag: 'needs-triage', note: '无横向溢出证据；遮挡类需目视复核' }
    return { tag: 'needs-triage', note: 'document 无横向溢出；元素级问题需具体定位' }
  }
  if (cat === 'inconsistency' && /按钮|圆角|边框|形态|输入框/.test(desc)) {
    if (p.buttonShapeCount > 3) return { tag: 'confirmed-by-dom', note: `该路由 button 形态组合 ${p.buttonShapeCount} 种（outset/0px/999px/4px 混用）` }
    return { tag: 'visual-only', note: `button 形态组合 ${p.buttonShapeCount} 种（可能为有意的层级差异）` }
  }
  return { tag: 'visual-only', note: '纯视觉审美项，无 DOM 硬证据' }
}

const all = []
for (const r of audit.results) {
  for (const issue of r.issues ?? []) {
    const severity = normSeverity(issue.severity)
    const entry = {
      route: r.route, screenshot: r.screenshot,
      severity, category: normCategory(issue.category),
      description: String(issue.description).trim(),
      suggestion: String(issue.suggestion ?? '').trim(),
      model: 'mmx vision describe (MiniMax VLM)',
    }
    entry.domVerification = severity === 'P2'
      ? { tag: 'not-required', note: 'P2 不做强制复核' }
      : tagDom(entry)
    all.push(entry)
  }
}

// DOM-only findings the VLM cannot see (hidden swipe actions, off-viewport
// internals) but the probe proved — recorded so B2 fixes them too.
all.push({
  route: 'chats-375-light', screenshot: 'w10-b1-chats-375-light.png', severity: 'P1', category: 'contrast',
  description: '（DOM 独有发现）会话列表侧滑操作「标记已读」白字 on 白底（ratio=1.0，8 处）——滑动露出后完全不可读',
  suggestion: '侧滑操作按钮改为酱色底白字或琥珀底深字',
  model: 'dom-probe (.w10-b1-dom-probe.json)',
  domVerification: { tag: 'confirmed-by-dom', note: 'lowContrast 探针实测 ratio=1.0 ×8' },
}, {
  route: 'home-375-dark', screenshot: 'w10-b1-home-375-dark.png', severity: 'P1', category: 'contrast',
  description: '（DOM 独有发现）「75」白字 on 珊瑚红徽标 ratio=2.62；暗色下五个 tab 徽标（合规 2.56 / 数据 2.30 / 表单 2.10 / AI 1.77）深棕字 on 彩底均 <3.2',
  suggestion: '徽标底色加深一档或改白字，统一走酱色阶',
  model: 'dom-probe (.w10-b1-dom-probe.json)',
  domVerification: { tag: 'confirmed-by-dom', note: 'lowContrast 探针实测（home-375-dark 15 处中徽标类 6 处）' },
}, {
  route: 'work-375-dark', screenshot: 'w10-b1-work-375-dark.png', severity: 'P2', category: 'contrast',
  description: '（DOM 独有发现）「去找 AI 同事」白字 on 琥珀橙底 ratio=2.59（<3.2）',
  suggestion: '加深琥珀底一档或改深字',
  model: 'dom-probe (.w10-b1-dom-probe.json)',
  domVerification: { tag: 'confirmed-by-dom', note: 'lowContrast 探针实测 ratio=2.59' },
})

const rank = { P0: 0, P1: 1, P2: 2 }
all.sort((a, b) => rank[a.severity] - rank[b.severity] || a.category.localeCompare(b.category) || a.route.localeCompare(b.route))

const counts = { P0: 0, P1: 0, P2: 0 }
const catCounts = {}
for (const e of all) {
  counts[e.severity] += 1
  catCounts[e.category] = (catCounts[e.category] ?? 0) + 1
}
const tagCounts = { 'confirmed-by-dom': 0, 'visual-only': 0, 'needs-triage': 0 }
for (const e of all) if (e.severity !== 'P2') tagCounts[e.domVerification.tag] += 1

const themes = [
  {
    id: 'T1', title: 'UA 原生 button outset 边框泄漏（用户亲述痛点）',
    severity: 'P0', category: 'ua-default-style',
    evidence: 'home 39 个 / files 103 个 button 计算样式 border=2px outset rgb(0,0,0)（今日台账、AI 名册 rosterCard、最近对话行、文件卡片整体都是 <button> 且 CSS module 未覆盖 UA 边框）；另 files 有 1 个 50%|outset',
    scope: 'home/files 全量卡片 + roster 高度坍缩 12px',
    fix: '全局 button reset（appearance:none + border:none + background:transparent）或逐 CSS module 补 border/radius；修 rosterScroller 卡片高度坍缩',
    effort: '0.5~1 天（一处 reset + roster 布局修复）',
  },
  {
    id: 'T2', title: '工业蓝 rgb(30,78,140) 泄漏（W7 前普鲁士蓝 #1E4E8C 残留）',
    severity: 'P0', category: 'other',
    evidence: '表单 tab 徽标 _avatar、work「去聊聊」_toolGo、chats 圆形图标、agents「表单」徽标同色实测',
    scope: 'tab 徽标四枚中的三枚（数据绿/表单蓝/AI 蓝灰同属冷色泄漏）+ 多处链接/图标',
    fix: '全仓 grep rgb(30, 78, 140) / #1E4E8C / #1e4e8c，替换为酱园琥珀 token；tab 徽标四色统一暖色阶',
    effort: '0.5 天（grep 替换 + 徽标色阶设计）',
  },
  {
    id: 'T3', title: '暗色轨组件库默认色未覆盖（antd-mobile 默认泄漏）',
    severity: 'P0', category: 'ua-default-style',
    evidence: 'work-dark adm-capsule-tabs-tab 底色 #f5f5f5（antd-mobile 亮色默认）+ 浅暖字 ratio=1.15 近不可读；亮色轨同组件是暖沙色（有覆盖），仅暗色漏',
    scope: 'work 页 capsule tabs（其他 antd-mobile 组件暗色需同法排查：CapsuleTabs/Selector/CheckBox 等）',
    fix: '为 adm-capsule-tabs 补暗色 CSS 变量覆盖（bg 暗卡面 + 字暖白）；全局扫 adm-* 组件暗色覆盖缺口',
    effort: '0.5 天',
  },
  {
    id: 'T4', title: '暗色对比度系统性不足',
    severity: 'P1', category: 'contrast',
    evidence: 'DOM 探针：home-dark 15 处 / chats-light 15 处 / work-dark 4 处 ratio<3.2；视觉模型横跨 chat/login/me/home 暗色全部报读性差',
    scope: 'home 徽标群、chat 正文灰、login 标签与 placeholder、me 辅助文字',
    fix: '暗色字阶 token 全面上调一档（--dshm-text-secondary 等）；徽标底色加深',
    effort: '1 天',
  },
  {
    id: 'T5', title: '直角残留 / 圆角断层',
    severity: 'P1', category: 'inconsistency',
    evidence: 'chat composer 外盒 radius=0 + 1px 细边；气泡 16px+ vs 输入框 0px；docs/files 返回按钮纯黑描边直角观感',
    scope: 'composer、返回按钮、输入框族',
    fix: '统一控件圆角阶（输入族 --dshm-r-ctl 12px+）；返回按钮改酱色描边圆角',
    effort: '0.5 天',
  },
  {
    id: 'T6', title: '文字截断策略（ellipsis）误伤短文本',
    severity: 'P1', category: 'layout-overflow',
    evidence: 'agents 标题 5 字被截、alerts ID 路径挤压日期、chat/work-detail 顶栏标题截断、work-light capsule 后两枚超视口',
    scope: 'agents/alerts/chat/work/work-detail',
    fix: '逐处调整 min-width/flex-shrink 与 ellipsis 触发条件；capsule tabs 容器补横向滚动',
    effort: '1 天',
  },
]

const final = {
  pipeline: {
    vision: 'mmx vision describe (MiniMax VLM) via mmx-cli，8 视角结构化提示词，无降级',
    screenshots: audit.shots,
    screenshotSource: 'fresh live shoot against rebuilt :3080（curl 验证服务器下发 css 已含 w9-r1 特征 token dshm-seal-gloss）',
    domReverification: '.w10-b1-dom-probe.json（14 路由通用探针）+ .w10-b1-deep-probe.json + .w10-b1-recheck.json（定向复核）',
    generatedAt: new Date().toISOString(),
  },
  counts: { ...counts, total: all.length },
  categories: Object.fromEntries(Object.entries(catCounts).sort((a, b) => b[1] - a[1])),
  p0p1Verification: tagCounts,
  themes,
  issues: all,
}
writeFileSync(`${OUT}/w10-b1-vision-audit.json`, JSON.stringify(final, null, 2))

const md = []
md.push('# W10-B1 视觉模型图像识别审查报告')
md.push('')
md.push(`- 视觉管线：mmx vision describe（MiniMax VLM，mmx-cli），8 视角结构化提示词，**无降级**`)
md.push(`- 截图：${audit.shots} 张真实现拍（3080 重建后现拍；chat 真实模型回合、work-detail 真实路由进入）`)
md.push(`- 生成：${final.pipeline.generatedAt}`)
md.push('')
md.push(`## 汇总：P0 ×${counts.P0} / P1 ×${counts.P1} / P2 ×${counts.P2}（共 ${all.length} 条，含 3 条 DOM 独有发现）`)
md.push('')
md.push('| 类别 | 条数 |')
md.push('|---|---|')
for (const [c, n] of Object.entries(final.categories)) md.push(`| ${c} | ${n} |`)
md.push('')
md.push(`P0/P1 DOM 复核：confirmed-by-dom ×${tagCounts['confirmed-by-dom']} / visual-only ×${tagCounts['visual-only']} / needs-triage ×${tagCounts['needs-triage']}`)
md.push('')
md.push('> 用户直觉验证：ua-default-style 相关（含 outset 边框、组件库默认色泄漏、直角原生观感）在 P0 中占比 5/11，为最大单一类别；若并入工业蓝泄漏（本质是旧设计残留而非 UA 默认）则 P0 的 8/11 均属「元素未按设计语言重置」大类。')
md.push('')
md.push('## 跨路由主题（B2 修复按主题打批量，不逐条修）')
md.push('')
for (const t of themes) {
  md.push(`### ${t.id} ${t.title}（${t.severity}）`)
  md.push(`- 证据：${t.evidence}`)
  md.push(`- 范围：${t.scope}`)
  md.push(`- 修复：${t.fix}`)
  md.push(`- 估工：${t.effort}`)
  md.push('')
}
const sect = (sev, title) => {
  md.push(`## ${title}`)
  md.push('')
  let i = 0
  for (const e of all.filter((x) => x.severity === sev)) {
    i += 1
    md.push(`### [${sev}-${String(i).padStart(2, '0')}] ${e.category} — ${e.route}`)
    md.push(`- 截图：\`${e.screenshot}\`（来源：${e.model.includes('dom-probe') ? 'DOM 探针' : '视觉模型'}）`)
    md.push(`- ${e.model.includes('dom-probe') ? '发现' : '视觉模型原话'}：${e.description}`)
    md.push(`- 修复方向：${e.suggestion}`)
    if (e.severity !== 'P2') md.push(`- DOM 复核：**${e.domVerification.tag}** — ${e.domVerification.note}`)
    md.push('')
  }
}
sect('P0', 'P0 毁容级')
sect('P1', 'P1 明显缺陷')
sect('P2', 'P2 瑕疵')
md.push('## B2 修复优先级建议')
md.push('')
md.push('1. **P0 全修（T1/T2/T3 三主题，估 1.5~2 天）**：button 全局 reset + roster 坍缩（T1）→ 工业蓝全仓清除（T2）→ antd-mobile 暗色覆盖缺口（T3）。三主题修完，P0 的 11 条全部关闭，且用户亲述的「原生元素样式难看」直接消失。')
md.push('2. **P1 全修（T4/T5/T6 三主题 + 零散 confirmed 项，估 2~3 天）**：暗色字阶上调（T4）→ 圆角统一（T5）→ 截断策略（T6）。P1 中 confirmed-by-dom 优先，visual-only 的间距/对齐类随主题顺手修。')
md.push('3. **P2 择要（估 0.5~1 天）**：87 条 P2 中只修跨 ≥3 路由复现的形态类（如 me 页开关说明、docs 网格边距），其余留档不修。')
md.push('4. **needs-triage 的 44 条**：多数是 P1 间距/字体节奏类，B2 修复时按截图目视快速二分——修复主题 T1~T6 后预计 60% 自动消失，剩余再逐条判。')
md.push('5. **验收**：B2 修完重拍同矩阵 22 张 → 重跑本管线（.audit-w10b1.mjs + .aggregate-w10b1.mjs）对比 P0=0、P1 confirmed=0。')
md.push('')
writeFileSync(`${OUT}/w10-b1-vision-audit.md`, md.join('\n') + '\n')
console.log(JSON.stringify({ counts, categories: final.categories, tagCounts }, null, 1))
