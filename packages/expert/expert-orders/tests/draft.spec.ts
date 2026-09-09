/**
 * The drafting pipeline's pure functions: the model-facing prompt framing
 * (system demands strict JSON, user carries brief/service/expert/references),
 * the response parser (fence stripping, JSON errors, section validation),
 * and the keyless template DraftSpec (degradation that names itself).
 */

import { describe, expect, it } from 'vitest'
import { buildDraftMessages, parseDraftResponse, templateDraftSpec } from '../src/draft.ts'
import type { DraftingInput } from '../src/draft.ts'
import type { DraftSpec } from '@deepseek-ai/dsh-expert-pdf'

function input(): DraftingInput {
  return {
    brief: '请安排张会长出一份中亚货运风险应对方案，重点是霍尔果斯口岸受阻后的切换。',
    clientName: '漯河宏发食品有限公司',
    service: { serviceId: 'expert_services/1', name: '中亚货运动线方案', price: '¥8,800/份', summary: '中亚方向铁运/海运动线设计与备选切换方案。' },
    expert: { name: '张红喜', org: '漯河市电子商务协会（会长）' },
    refs: ['俄罗斯·中亚海外仓风险应对手册（专家知识资产） → 二、应急预案要点', '中亚市场准入指南'],
  }
}

describe('buildDraftMessages', () => {
  it('frames a strict-JSON system prompt and a user prompt carrying every input', () => {
    const { system, user } = buildDraftMessages(input())
    expect(system).toContain('JSON')
    expect(system).toContain('sections')
    const combined = `${system}\n${user}`
    for (const expected of ['中亚货运风险应对方案', '霍尔果斯', '中亚货运动线方案', '¥8,800/份', '张红喜', '漯河市电子商务协会（会长）', '海外仓风险应对手册', '中亚市场准入指南', '漯河宏发食品有限公司']) {
      expect(combined).toContain(expected)
    }
  })
})

describe('parseDraftResponse', () => {
  it('parses a strict JSON body into title and sections', () => {
    const body = JSON.stringify({
      title: '中亚货运风险应对方案',
      sections: [
        { heading: '风险分析', paragraphs: ['口岸受阻风险分级评估。'], refs: ['俄罗斯·中亚海外仓风险应对手册'] },
        { heading: '解决方案', paragraphs: ['货运：双口岸互备。', '仓库：一主两备。'] },
      ],
    })
    const parsed = parseDraftResponse(body)
    expect(parsed.title).toBe('中亚货运风险应对方案')
    expect(parsed.sections).toHaveLength(2)
    expect(parsed.sections[0]?.refs).toEqual(['俄罗斯·中亚海外仓风险应对手册'])
    expect(parsed.sections[1]?.refs).toEqual([])
  })

  it('strips one markdown code fence around the JSON body', () => {
    const fenced = '```json\n{"title":"方案","sections":[{"heading":"背景","paragraphs":["一段。"]}]}\n```'
    expect(parseDraftResponse(fenced).title).toBe('方案')
  })

  it('refuses non-JSON bodies, wrong shapes, and empty section lists', () => {
    expect(() => parseDraftResponse('这不是 JSON')).toThrow(/JSON/)
    expect(() => parseDraftResponse('{"title":"方案"}')).toThrow(/sections/)
    expect(() => parseDraftResponse('{"title":"方案","sections":[]}')).toThrow(/sections/)
    expect(() => parseDraftResponse('{"title":"","sections":[{"heading":"背景","paragraphs":["一段。"]}]}')).toThrow(/title/)
    expect(() => parseDraftResponse('{"title":"方案","sections":[{"heading":"背景","paragraphs":[]}]}')).toThrow(/paragraphs/)
  })

  // The noise shapes below are what the live MiniMax-M3 stream actually
  // produced on the real track (the nocobase-track e2e's order-failed runs).
  it('parses a prose-prefixed body (the model chatting before its JSON)', () => {
    const noisy = '好的，以下是方案 JSON：\n{"title":"方案","sections":[{"heading":"背景","paragraphs":["一段。"]}]}'
    expect(parseDraftResponse(noisy).title).toBe('方案')
  })

  it('keeps escaped quotes, in-string brackets, and spaces after commas intact', () => {
    const noisy = '{"title":"带\\"引号\\"和括号[一]的方案" ,  "sections":[{"heading":"背景","paragraphs":["一段",],}]}'
    const parsed = parseDraftResponse(noisy)
    expect(parsed.title).toBe('带"引号"和括号[一]的方案')
    expect(parsed.sections[0]?.paragraphs).toEqual(['一段'])
  })

  it('drops trailing commas outside string literals only', () => {
    const noisy = '{"title":"方案","sections":[{"heading":"背景","paragraphs":["注意逗号，然后结束",],"refs":["来源一",]}],}'
    const parsed = parseDraftResponse(noisy)
    expect(parsed.title).toBe('方案')
    expect(parsed.sections[0]?.paragraphs).toEqual(['注意逗号，然后结束'])
    expect(parsed.sections[0]?.refs).toEqual(['来源一'])
  })

  it('closes a tail truncated after a complete value', () => {
    const truncated = '{"title":"方案","sections":[{"heading":"背景","paragraphs":["一段。"]'
    const parsed = parseDraftResponse(truncated)
    expect(parsed.sections[0]?.paragraphs).toEqual(['一段。'])
  })

  it('still refuses a body with no JSON object at all', () => {
    expect(() => parseDraftResponse('抱歉，我无法完成该请求。')).toThrow(/JSON/)
  })
})

describe('templateDraftSpec', () => {
  it('degrades to a complete fixed-template spec whose note names the fallback', () => {
    const spec: DraftSpec = templateDraftSpec(input(), 'ORD-1', '2026-09-05')
    expect(spec.orderNo).toBe('ORD-1')
    expect(spec.date).toBe('2026-09-05')
    expect(spec.title).toContain('中亚货运动线方案')
    expect(spec.client).toBe('漯河宏发食品有限公司')
    expect(spec.expert.name).toBe('张红喜')
    const headings = spec.sections.map(section => section.heading)
    for (const expected of ['背景与问题', '风险分析', '解决方案', '实施路线图', '参考来源']) {
      expect(headings).toContain(expected)
    }
    const body = spec.sections.flatMap(section => section.paragraphs).join('\n')
    expect(body).toContain('霍尔果斯')
    expect(body).toContain('一主两备')
    const refsSection = spec.sections.find(section => section.heading === '参考来源')
    expect(refsSection?.refs?.join('\n')).toContain('海外仓风险应对手册')
    expect(refsSection?.paragraphs.join('\n')).toContain('知识库材料')
  })
})
