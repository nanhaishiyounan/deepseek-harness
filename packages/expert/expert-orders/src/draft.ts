/**
 * The drafting pipeline's pure stages: prompt framing for the model stream,
 * strict-JSON response parsing with loud shape errors (a repair layer first
 * absorbs the noise the live stream produced — prose prefixes, trailing
 * commas, truncated tails — and what it cannot repair still fails loud),
 * the cited-section projection, and the keyless template DraftSpec whose
 * degradation names itself. No I/O — the runtime owns the kb retrieval, the
 * model call, and the file landing.
 * @module @deepseek-ai/dsh-expert-orders/draft
 */

import type { DraftSection, DraftSpec } from '@deepseek-ai/dsh-expert-pdf'

/** The ordered service snapshot the drafter frames. */
export interface DraftServiceInput {
  readonly serviceId: string
  readonly name: string
  readonly price?: string
  readonly summary?: string
}

/** The expert byline the drafter frames. */
export interface DraftExpertInput {
  readonly name: string
  readonly org?: string
}

/** Everything one drafting run needs, already resolved (no I/O here). */
export interface DraftingInput {
  readonly brief: string
  readonly clientName?: string
  readonly service: DraftServiceInput
  readonly expert: DraftExpertInput
  /** kb citation lines (`title → heading path`) retrieved for the brief. */
  readonly refs: readonly string[]
}

/** The model-facing messages for one drafting run. */
export interface DraftMessages {
  readonly system: string
  readonly user: string
}

/** A validated drafting response body. */
export interface DraftResponseBody {
  readonly title: string
  readonly sections: readonly DraftSection[]
}

/**
 * Frame the drafting prompt: the system half fixes the strict-JSON output
 * contract and the chapter template; the user half carries the brief, the
 * service and expert snapshot, and every retrieved reference line.
 * @param input - the resolved drafting input.
 * @returns the model-facing messages.
 */
export function buildDraftMessages(input: DraftingInput): DraftMessages {
  const system = [
    '你是资深食品出海顾问，负责为客户起草一份可执行的专家方案。',
    '只输出一个 JSON 对象，不要 markdown 代码围栏、不要解释文字。结构：',
    '{"title": "方案标题", "sections": [{"heading": "章节标题", "paragraphs": ["段落…"], "refs": ["引用来源行"]}]}',
    '章节必须依次覆盖：背景与问题、风险分析、解决方案（货运动线、仓储网络、合规单证都要落到具体动作）、实施路线图；每个章节 1-4 个段落，每段 80-200 字，给出可执行的具体措施（口岸、仓点、时限、单证名）。',
    'refs 只引用提供的参考材料行；没有参考材料时 refs 为空数组。语言与客户需求一致（中文）。',
  ].join('\n')
  const lines = [
    `客户需求：${input.brief}`,
    `客户名称：${input.clientName ?? '未提供'}`,
    `订购服务：${input.service.name}${input.service.price === undefined ? '' : `（${input.service.price}）`}`,
    ...(input.service.summary === undefined ? [] : [`服务说明：${input.service.summary}`]),
    `署名专家：${input.expert.name}${input.expert.org === undefined ? '' : `（${input.expert.org}）`}`,
  ]
  if (input.refs.length > 0) {
    lines.push('参考材料：')
    for (const ref of input.refs) lines.push(`- ${ref}`)
  } else {
    lines.push('参考材料：无（按行业通识起草，refs 留空）。')
  }
  return { system, user: lines.join('\n') }
}

/** Strip one markdown code fence wrapper, if present. */
function stripFence(text: string): string {
  const match = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```\s*$/u.exec(text.trim())
  return match?.[1] ?? text.trim()
}

/** Drop prose the model wrote before its JSON body (everything before the first `{`). */
function stripProsePrefix(text: string): string {
  const start = text.indexOf('{')
  return start <= 0 ? text : text.slice(start)
}

/**
 * Repair the noise shapes the live MiniMax stream produced on the real
 * track: trailing commas outside string literals and a tail truncated after
 * a complete value (closed by appending the missing brackets). One scanner
 * pass; commas and brackets inside string literals are never touched.
 */
function repairDraftJson(text: string): string {
  let body = ''
  const stack: string[] = []
  let inString = false
  let escaped = false
  let pendingComma = false
  for (const char of text) {
    if (inString) {
      body += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (pendingComma) {
      if (char === ' ' || char === '\t' || char === '\n' || char === '\r') continue
      pendingComma = false
      // A closer right behind the comma makes it trailing: drop the comma
      // and let the closer flow through the normal branches.
      if (char !== '}' && char !== ']') body += ','
    }
    if (char === '"') {
      inString = true
      body += char
    } else if (char === '{' || char === '[') {
      stack.push(char === '{' ? '}' : ']')
      body += char
    } else if (char === '}' || char === ']') {
      stack.pop()
      body += char
    } else if (char === ',') {
      pendingComma = true
    } else {
      body += char
    }
  }
  // A comma still pending at the truncation point is dropped; the unclosed
  // brackets close the tail.
  return body + stack.reverse().join('')
}

/**
 * Parse the model's drafting response into title and sections. A repair
 * layer absorbs the observed live-stream noise (prose before the JSON,
 * trailing commas, a truncated tail after a complete value); anything it
 * cannot repair fails loud.
 * @param text - the assembled model output.
 * @returns the validated title and sections.
 * @throws {Error} naming the JSON or shape violation (bad JSON, missing or
 * empty title, missing/empty sections, a section without heading or
 * paragraphs, empty paragraphs).
 */
export function parseDraftResponse(text: string): DraftResponseBody {
  const stripped = stripFence(text)
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch (cause) {
    try {
      parsed = JSON.parse(repairDraftJson(stripProsePrefix(stripped)))
    } catch {
      throw new Error(`起草输出不是合法 JSON：${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }
  if (typeof parsed !== 'object' || parsed === null) throw new Error('起草输出必须是 JSON 对象')
  const { title, sections } = parsed as { title?: unknown; sections?: unknown }
  if (typeof title !== 'string' || title.trim().length === 0) throw new Error('起草输出缺少非空 title')
  if (!Array.isArray(sections) || sections.length === 0) throw new Error('起草输出 sections 必须是非空数组')
  const validated: DraftSection[] = []
  for (const raw of sections) {
    if (typeof raw !== 'object' || raw === null) throw new Error('起草输出每个 section 必须是对象')
    const section = raw as { heading?: unknown; paragraphs?: unknown; refs?: unknown }
    if (typeof section.heading !== 'string' || section.heading.trim().length === 0) throw new Error('起草输出每个 section 缺少非空 heading')
    if (!Array.isArray(section.paragraphs) || section.paragraphs.length === 0
      || !section.paragraphs.every((paragraph): paragraph is string => typeof paragraph === 'string' && paragraph.trim().length > 0)) {
      throw new Error('起草输出每个 section 的 paragraphs 必须是非空字符串数组')
    }
    const refs = Array.isArray(section.refs)
      ? section.refs.filter((ref): ref is string => typeof ref === 'string' && ref.length > 0)
      : []
    validated.push({ heading: section.heading, paragraphs: [...section.paragraphs], refs })
  }
  return { title: title.trim(), sections: validated }
}

/** The note recorded on the order row when the template fallback drafted it. */
export const TEMPLATE_FALLBACK_NOTE = '未配置模型服务，按模板生成（非模型起草）'

/**
 * The keyless template DraftSpec: the fixed five-chapter skeleton over the
 * resolved input — the brief restated, the three-tier risk frame, the
 * service's own summary expanded into solution actions, a staged roadmap,
 * and the reference list. Complete and readable on its own; never presented
 * as model-drafted (the note names the fallback).
 * @param input - the resolved drafting input.
 * @param orderNo - the order number for the cover.
 * @param date - the ISO calendar date for the cover.
 * @returns the template DraftSpec.
 */
export function templateDraftSpec(input: DraftingInput, orderNo: string, date: string): DraftSpec {
  const refsSection: DraftSection = input.refs.length > 0
    ? { heading: '参考来源', paragraphs: ['本方案参考以下知识库材料：'], refs: [...input.refs] }
    : { heading: '参考来源', paragraphs: ['本方案未引用知识库材料（未配置检索）。'] }
  return {
    orderNo,
    title: `${input.service.name}（${input.brief.slice(0, 24)}${input.brief.length > 24 ? '…' : ''}）`,
    client: input.clientName ?? '委托客户',
    expert: { name: input.expert.name, ...(input.expert.org === undefined ? {} : { org: input.expert.org }) },
    date,
    sections: [
      {
        heading: '背景与问题',
        paragraphs: [
          `客户需求：${input.brief}`,
          `本方案针对上述需求，围绕${input.service.name}给出风险分析与可执行措施。`,
        ],
      },
      {
        heading: '风险分析',
        paragraphs: [
          '一级风险（局部扰动）：口岸临时关闭、清关延迟 7 日内，可通过备选口岸与加急清关吸收。',
          '二级风险（区域受阻）：单一仓库停摆或班列线路中断 30 日内，需要备份仓网络与替代动线承接。',
          '三级风险（不可抗力）：战争损毁、制裁切断支付或主干物流 90 日以上，需整体动线改道与货权转移安排。',
        ],
        refs: input.refs.length > 0 ? [input.refs[0] as string] : [],
      },
      {
        heading: '解决方案',
        paragraphs: [
          input.service.summary ?? '按订购服务范围给出针对性措施。',
          '货运动线：主口岸与备选口岸（霍尔果斯/阿拉山口/满洲里/二连浩特按方向择二）互备，受阻时切换公路 TIR 或海运改道，舱位与拼柜方案预留 20% 余量。',
          '仓储网络：按「一主两备」布局（主仓 + 两个备份仓），主仓受损 72 小时内启用备仓承接转移库存，分区存放与批次先进先出。',
          '合规单证：商业发票、装箱单、原产地证、动植物检疫证书四件套标准化模板化，认证（EAC/GOST）与标签备案提前完成。',
        ],
        refs: input.refs.length > 1 ? [input.refs[1] as string] : [],
      },
      {
        heading: '实施路线图',
        paragraphs: [
          '第一周：确认现状盘点（库存、在途、单证），锁定备选口岸与备仓协议。',
          '第二至四周：完成保险批改（加保战争险与罢工险）、库存分区与转运排程、客户交期重新承诺。',
          '持续：每月复核动线与仓点风险分级，触发二级以上风险立即启动对应预案。',
        ],
      },
      refsSection,
    ],
  }
}
