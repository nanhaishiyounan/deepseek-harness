// @vitest-environment jsdom
/** The v3 rich pipeline: markdown render + sanitize, the metric-line trigger, block splitting. */

import { describe, expect, it } from 'vitest'
import { parseMetricLine, renderMarkdown, sanitizeBizText, splitRichBlocks } from '../src/client/messages/rich.ts'

describe('renderMarkdown', () => {
  it('renders paragraphs, bold, and single-newline breaks', () => {
    const html = renderMarkdown('第一行\n第二行 **采购单**')
    expect(html).toContain('第一行')
    expect(html).toContain('<br')
    expect(html).toContain('<strong>采购单</strong>')
  })

  it('renders lists and tables', () => {
    const list = renderMarkdown('- 甲\n- 乙')
    expect(list).toContain('<ul>')
    const table = renderMarkdown('| 字段 | 值 |\n| --- | --- |\n| 单号 | PO-1 |')
    expect(table).toContain('<table>')
  })

  it('strips script payloads through the sanitizer', () => {
    const dirty = renderMarkdown('<script>alert(1)</script>正文')
    expect(dirty).not.toContain('<script')
    expect(dirty).toContain('正文')
  })
})

describe('parseMetricLine', () => {
  it('promotes the canonical conclusion line', () => {
    expect(parseMetricLine('本月采购额 ¥182,400')).toEqual({ label: '本月采购额', value: '¥182,400' })
  })

  it('promotes a density-qualified line and absorbs the unit token', () => {
    expect(parseMetricLine('合计 ¥16,000 元')).toEqual({ label: '合计', value: '¥16,000 元' })
  })

  it('promotes a line that starts with the number itself', () => {
    expect(parseMetricLine('¥16,000 合计')).toEqual({ label: '合计', value: '¥16,000' })
  })

  it('rejects long lines', () => {
    expect(parseMetricLine('本月采购额超出了十六个字符的上限 ¥182,400')).toBeUndefined()
  })

  it('rejects markdown structure lines', () => {
    expect(parseMetricLine('- 3 个待办')).toBeUndefined()
    expect(parseMetricLine('1. 第一件事')).toBeUndefined()
  })

  it('rejects prose with a sparse digit', () => {
    expect(parseMetricLine('这批冷链箱一共200箱今天送到')).toBeUndefined()
    expect(parseMetricLine('入库数量很多有待确认')).toBeUndefined()
  })

  it('rejects a bare number without a label and blank lines', () => {
    expect(parseMetricLine('1042')).toBeUndefined()
    expect(parseMetricLine('')).toBeUndefined()
    expect(parseMetricLine('   ')).toBeUndefined()
  })

  it('rejects a punctuation-dense line with no numeric token', () => {
    expect(parseMetricLine(',,,,,,,')).toBeUndefined()
  })
})

describe('splitRichBlocks', () => {
  it('gathers adjacent metric lines and keeps prose blocks', () => {
    const blocks = splitRichBlocks('结论如下：\n\n本月采购额 ¥182,400\n¥6,400 本月回款\n\n说明文字。')
    expect(blocks).toEqual([
      { kind: 'text', text: '结论如下：' },
      {
        kind: 'metric',
        metrics: [
          { label: '本月采购额', value: '¥182,400' },
          { label: '本月回款', value: '¥6,400' },
        ],
      },
      { kind: 'text', text: '说明文字。' },
    ])
  })

  it('splits a metric run out of the middle of a paragraph', () => {
    const blocks = splitRichBlocks('前文\n本月采购额 ¥182,400\n后文')
    expect(blocks).toEqual([
      { kind: 'text', text: '前文' },
      { kind: 'metric', metrics: [{ label: '本月采购额', value: '¥182,400' }] },
      { kind: 'text', text: '后文' },
    ])
  })

  it('returns one text block for pure prose', () => {
    expect(splitRichBlocks('一句话。')).toEqual([{ kind: 'text', text: '一句话。' }])
  })

  it('returns empty for an empty narrative', () => {
    expect(splitRichBlocks('')).toEqual([])
  })
})

describe('sanitizeBizText', () => {
  it('maps leaked collection and field identifiers onto business terms', () => {
    expect(sanitizeBizText('已在 hub_po_purchase_orders 登记一条采购单')).toBe('已在 采购单 登记一条采购单')
    expect(sanitizeBizText('明细 hub_po_items（product_name/qty/unit_price）已核对')).toBe('明细 采购明细（品名/数量/单价）已核对')
    expect(sanitizeBizText('匹配到 supplier_id=7')).toBe('匹配到 供应商=7')
  })

  it('degrades unmapped hub_ names to 业务记录 and drops leaky paren groups whole', () => {
    expect(sanitizeBizText('写入 hub_custom_registry 完成')).toBe('写入 业务记录 完成')
    expect(sanitizeBizText('已核对（含 reference_code 与备注）')).toBe('已核对')
  })

  it('keeps people-language text untouched', () => {
    expect(sanitizeBizText('好的，登记一张采购单。')).toBe('好的，登记一张采购单。')
    expect(sanitizeBizText('合计 ¥16,000（含税）')).toBe('合计 ¥16,000（含税）')
  })
})
