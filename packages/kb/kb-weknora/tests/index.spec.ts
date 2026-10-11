import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import KbRuntime from '@deepseek-ai/dsh-kb'
import { KbError } from '@deepseek-ai/dsh-kb'
import * as KbWeknora from '@deepseek-ai/dsh-kb-weknora'

let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
})

/** Direct apply() calls bypass the loader's schemastery defaults, covering the option-optional branches. */
describe('kb-weknora apply', () => {
  it('registers and disposes the store on a minimal config', async () => {
    context = new Context()
    await context.plugin(KbRuntime, {})
    await context.plugin(KbWeknora, { baseUrl: 'http://localhost:18081', apiKey: 'k' })
    await expect(context.kb.stats('demo-food-co')).rejects.toMatchObject({ code: 'KB_WEKNORA_UNAVAILABLE' })
    await context.fiber.dispose()
    context = undefined
  })

  it('rejects allowFallback without fallbackPath', async () => {
    context = new Context()
    await context.plugin(KbRuntime, {})
    const failure = await context.plugin(KbWeknora, { baseUrl: 'http://h', apiKey: 'k', allowFallback: true }).then(() => undefined, (cause: unknown) => cause)
    expect(failure).toBeInstanceOf(KbError)
    expect((failure as KbError).message).toContain('allowFallback is set but fallbackPath is missing')
  })

  it('marks the store unavailable without an API key', async () => {
    context = new Context()
    await context.plugin(KbRuntime, {})
    await context.plugin(KbWeknora, { baseUrl: 'http://h', apiKey: '' })
    await expect(context.kb.stats('demo-food-co')).rejects.toMatchObject({ code: 'KB_STORE_UNAVAILABLE' })
  })

  it('treats an absent API key as the empty string', async () => {
    context = new Context()
    await context.plugin(KbRuntime, {})
    await context.plugin(KbWeknora, { baseUrl: 'http://h' })
    await expect(context.kb.stats('demo-food-co')).rejects.toMatchObject({ code: 'KB_STORE_UNAVAILABLE' })
  })
})
