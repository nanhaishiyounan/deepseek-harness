/**
 * Display metadata is presentation, never capability: every way of getting it
 * wrong degrades to "this preset has no display text" rather than to a
 * preset that cannot be discovered or mounted. It also cannot carry identity
 * — `id` is the directory and `trust` is the root, so neither is readable
 * from the file a user can write.
 */

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { METADATA_FILE, readPresetMetadata, renderPresetMetadata } from '../src/metadata.ts'

/** A preset directory holding exactly the given metadata text. */
async function presetDir(content?: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-preset-meta-'))
  await mkdir(dir, { recursive: true })
  if (content !== undefined) await writeFile(join(dir, METADATA_FILE), content)
  return dir
}

describe('reading display metadata', () => {
  it('reads a name and a description', async () => {
    const dir = await presetDir('name: 标准模式\ndescription: 完整的编码 agent。\n')

    expect(await readPresetMetadata(dir)).toEqual({ name: '标准模式', description: '完整的编码 agent。' })
  })

  it('treats an absent file as no metadata', async () => {
    // The common case: every preset authored by duplicating another starts
    // without one, and a picker simply falls back to the id.
    expect(await readPresetMetadata(await presetDir())).toEqual({})
  })

  it('treats malformed YAML as no metadata', async () => {
    const dir = await presetDir('name: [unclosed\n')

    // Display text is not worth failing discovery over — the composition
    // beside it still mounts.
    expect(await readPresetMetadata(dir)).toEqual({})
  })

  it.each([
    ['a list', '- name: x\n'],
    ['a scalar', 'just a string\n'],
    ['an empty document', ''],
  ])('treats %s as no metadata', async (_label, content) => {
    expect(await readPresetMetadata(await presetDir(content))).toEqual({})
  })

  it('ignores fields that are not text', async () => {
    const dir = await presetDir('name: 42\ndescription:\n  nested: true\n')

    expect(await readPresetMetadata(dir)).toEqual({})
  })

  it('ignores blank text rather than showing an empty name', async () => {
    const dir = await presetDir('name: "   "\ndescription: ""\n')

    expect(await readPresetMetadata(dir)).toEqual({})
  })

  it('trims surrounding whitespace', async () => {
    const dir = await presetDir('name: "  极简模式  "\n')

    expect(await readPresetMetadata(dir)).toEqual({ name: '极简模式' })
  })

  it('reads a declared order', async () => {
    const dir = await presetDir('name: 标准模式\norder: 1\n')

    expect(await readPresetMetadata(dir)).toEqual({ name: '标准模式', order: 1 })
  })

  it('ignores an order that is not a finite number', async () => {
    expect(await readPresetMetadata(await presetDir('order: first\n'))).toEqual({})
    expect(await readPresetMetadata(await presetDir('order: .inf\n'))).toEqual({})
  })

  it('reads the welcome block with its starters', async () => {
    const dir = await presetDir([
      'name: 智能填表助手',
      'welcome:',
      '  greeting: 我是智能填表助手',
      '  capabilities:',
      '    - 说一句话就能登记：采购单、供应商登记',
      '  starters:',
      '    - { label: 登记一条采购单, send: 向宏发食品采购 500kg 面粉 }',
      '    - { label: 建档, send: 给供应商三味食品登个档 }',
    ].join('\n'))

    expect(await readPresetMetadata(dir)).toEqual({
      name: '智能填表助手',
      welcome: {
        greeting: '我是智能填表助手',
        capabilities: ['说一句话就能登记：采购单、供应商登记'],
        starters: [
          { label: '登记一条采购单', send: '向宏发食品采购 500kg 面粉' },
          { label: '建档', send: '给供应商三味食品登个档' },
        ],
      },
    })
  })

  it('drops a welcome block without a greeting or with malformed rows', async () => {
    expect(await readPresetMetadata(await presetDir('welcome:\n  capabilities:\n    - 一条能力\n'))).toEqual({})
    expect(await readPresetMetadata(await presetDir('welcome: not-a-map\n'))).toEqual({})
    const dir = await presetDir([
      'welcome:',
      '  greeting: 我是助手',
      '  starters:',
      '    - { label: 只有标签 }',
    ].join('\n'))
    // The greeting survives; the starter without a send text is dropped.
    expect(await readPresetMetadata(dir)).toEqual({
      welcome: { greeting: '我是助手', capabilities: [], starters: [] },
    })
  })

  it('cannot carry identity or trust', async () => {
    const dir = await presetDir('name: mine\nid: standard\ntrust: system\n')

    // A locally authored preset writing `trust: system` must not become a
    // shipped one; identity comes from the directory and the root it sits in.
    expect(await readPresetMetadata(dir)).toEqual({ name: 'mine' })
  })
})

describe('rendering display metadata', () => {
  it('round-trips through a read', async () => {
    const rendered = renderPresetMetadata({ name: '创造模式', description: '可以改自己的组装。' })
    const dir = await presetDir(rendered)

    expect(await readPresetMetadata(dir)).toEqual({ name: '创造模式', description: '可以改自己的组装。' })
  })

  it('stores a declared order', () => {
    expect(renderPresetMetadata({ name: '标准模式', order: 1 })).toBe('name: 标准模式\norder: 1\n')
  })

  it('omits an absent field rather than writing it blank', () => {
    expect(renderPresetMetadata({ name: '极简模式' })).toBe('name: 极简模式\n')
    // Description without a name is legal too: the picker falls back to the id.
    expect(renderPresetMetadata({ description: '只做检索。' })).toBe('description: 只做检索。\n')
  })

  it('renders nothing when there is nothing to store', () => {
    // Clearing both fields removes the file; an empty document would read as
    // an intentional blank name.
    expect(renderPresetMetadata({})).toBeUndefined()
    expect(renderPresetMetadata({ name: '  ', description: '' })).toBeUndefined()
  })
})
