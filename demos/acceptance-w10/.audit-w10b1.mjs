// W10-B1 vision audit batch: run every fresh screenshot through the MiniMax
// VLM (mmx vision describe) with the 8-lens review prompt, parse the fenced
// JSON each call returns, attach route metadata, and persist both the raw
// per-shot responses and the aggregated issue list for DOM re-verification.
// Usage (repo root): node demos/acceptance-w10/.audit-w10b1.mjs
import { writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const OUT = 'demos/acceptance-w10'
const RAW_DIR = `${OUT}/.audit-raw`
mkdirSync(RAW_DIR, { recursive: true })

const shots = readdirSync(OUT)
  .filter((f) => f.startsWith('w10-b1-') && f.endsWith('.png'))
  .sort()

const prompt = (file) => {
  const route = file.replace(/^w10-b1-/, '').replace(/\.png$/, '')
  const dark = route.includes('dark')
  const wide = route.includes('390')
  return [
    `你是资深移动端 UI 视觉审查员。这是「食链通」企业移动端 ${wide ? 390 : 375}px 截图，路由/状态=${route}。`,
    `设计语言「酱园琥珀」：暖纸底、酱色（深棕红）主色、琥珀点缀、圆角卡片、印章元素、克制阴影。当前为${dark ? '暗色模式' : '亮色模式'}。`,
    '请按以下 8 个视角逐项审查，重点扫第①项：',
    '①浏览器原生控件默认样式残留：select 下拉、button、input、textarea、checkbox/radio、滚动条、日期/时间选择器、progress 等呈现操作系统原生外观（系统蓝、默认灰边框、直角、原生聚焦环、系统字体），与设计语言冲突——逐控件扫，这是用户亲述痛点。',
    '②布局溢出/截断/遮挡：文字溢出容器、元素被裁切、层级遮挡、意外横向滚动、内容顶出安全区。',
    '③对齐与间距失序：元素不对齐、间距忽大忽小、卡片内边距不一致、留白失衡。',
    '④对比度与可读性：文字与背景对比不足、浅字浅底、灰字过淡、图标辨识度低。',
    '⑤字体节奏异常：字号层级混乱、行高过挤或过松、同层级字号不一、加粗滥用。',
    '⑥组件形态不一致：同类按钮/标签/卡片/输入框的圆角、边框、底色、尺寸不统一。',
    dark ? '⑦暗色轨缺陷：黑底黑卡融为一体、暗色下对比崩坏、残留亮色硬块、阴影消失导致层级丢失。' : '⑦暗色轨缺陷：本图为亮色，跳过（除非发现明显无法适配暗色的硬编码亮色依赖）。',
    '⑧设计语言走样：蓝灰工业色回退、直角残留、与暖纸+酱色+琥珀语言冲突的元素、Windows/浏览器默认观感。',
    '输出严格 JSON 数组，每条：{"severity":"P0毁容级|P1明显|P2瑕疵","category":"ua-default-style|layout-overflow|misalign|contrast|spacing|typography|inconsistency|other","description":"具体到元素与位置（引用可见文字）","suggestion":"修复方向"}。宁可多报不要漏报，但每条必须具体可定位。无问题输出 []。只输出 JSON，不要其他文字。',
  ].join('\n')
}

const parseIssues = (content) => {
  if (typeof content !== 'string' || content.trim() === '') throw new Error('empty content')
  let body = content.trim()
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) body = fenced[1].trim()
  const start = body.indexOf('[')
  const end = body.lastIndexOf(']')
  if (start === -1 || end === -1) throw new Error('no JSON array found')
  const arr = JSON.parse(body.slice(start, end + 1))
  if (!Array.isArray(arr)) throw new Error('not an array')
  return arr
}

const runVision = (file) => {
  const raw = execFileSync('mmx', [
    'vision', 'describe',
    '--image', `${OUT}/${file}`,
    '--prompt', prompt(file),
    '--output', 'json', '--quiet', '--non-interactive',
  ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 180_000 })
  return JSON.parse(raw)
}

const aggregate = []
const report = []
for (const file of shots) {
  const route = file.replace(/^w10-b1-/, '').replace(/\.png$/, '')
  let response = null
  let issues = null
  let error = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      response = await runVision(file)
      issues = parseIssues(response.content)
      break
    } catch (err) {
      error = err
      if (attempt === 1) await new Promise((r) => setTimeout(r, 4000))
    }
  }
  if (issues === null) {
    report.push(`FAIL ${file} — ${error?.message}`)
    aggregate.push({ screenshot: file, route, ok: false, error: error?.message, issues: [] })
    continue
  }
  writeFileSync(`${RAW_DIR}/${file}.json`, JSON.stringify(response, null, 2))
  const tagged = issues.map((issue) => ({
    screenshot: file,
    route,
    severity: issue.severity ?? 'P2',
    category: issue.category ?? 'other',
    description: issue.description ?? '',
    suggestion: issue.suggestion ?? '',
  }))
  aggregate.push({ screenshot: file, route, ok: true, issues: tagged })
  report.push(`PASS ${file} — ${tagged.length} 条`)
  console.log(report.at(-1))
}

writeFileSync(`${OUT}/.w10-b1-audit-issues.json`, JSON.stringify({
  pipeline: 'mmx vision describe (MiniMax VLM)',
  promptLenses: 8,
  shots: shots.length,
  generatedAt: new Date().toISOString(),
  results: aggregate,
}, null, 2))
writeFileSync(`${OUT}/w10-b1-audit-run.log`, `${report.join('\n')}\n`)
const failed = report.filter((l) => l.startsWith('FAIL')).length
console.log(`\n完成: ${shots.length - failed}/${shots.length} 张成功`)
process.exitCode = failed > 0 ? 1 : 0
