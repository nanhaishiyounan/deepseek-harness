/**
 * The W23-R4 case-normalization live probe: variant in → people-language out,
 * through the exact module the render sites consume. Run with:
 *   npx tsx demos/acceptance-w23/r4/r4-case-probe.ts
 */
import { PROTOCOL_BLACKLIST, sanitizeBody, sanitizeSubtitle } from '../../../packages/client/ui-mobile/src/client/sanitize.ts'

const cases: ReadonlyArray<[string, string, string]> = [
  ['body', 'WFL_Approval_Todos', '待办表 WFL_Approval_Todos 已清空'],
  ['body', 'wfl_APPROVAL_todos', '待办表 wfl_APPROVAL_todos 已清空'],
  ['body', 'Ask_Field + SUGGESTIONS', '先走 Ask_Field，字段来自 SUGGESTIONS'],
  ['body', 'suggestions 英文正文保留', 'Here are our Suggestions for next quarter'],
  ['subtitle', 'NB_LIST + KG_QUERY', '近30天 · NB_LIST 直查 · KG_QUERY 走查'],
  ['subtitle', '大写整族剥空', 'WFL_APPROVAL_TODOS'],
]

for (const [layer, label, input] of cases) {
  const out = layer === 'body' ? sanitizeBody(input) : sanitizeSubtitle(input)
  console.log(`[${layer}] ${label}\n  in : ${input}\n  out: ${out}`)
}
console.log(`PROTOCOL_BLACKLIST = ${JSON.stringify(PROTOCOL_BLACKLIST)}`)
