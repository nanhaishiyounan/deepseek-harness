/**
 * The shared LLM completion helper for the kg tool suite: adapts `ctx.llm`
 * to a plain `complete(system, user)` face. One home so `kg_edit` and the
 * `kg_query` L1 fill-parameter layer share the exact same provider
 * resolution and stream assembly.
 * @module @deepseek-ai/dsh-tool-kb/llm-complete
 */

import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Message } from '@deepseek-ai/dsh-llm'

/** Where the completion request is attributed in the message source. */
const PLUGIN_SOURCE = { kind: 'plugin', plugin: 'tool-kb' } as const

/** The resolved provider/model pair a completion runs under. */
export interface ToolLlmOptions {
  readonly provider: string
  readonly model: string
}

/**
 * One completion over a system + user pair through the deployment's llm seam.
 * @param ctx - the tool context (resolves `ctx.get('llm')` per call).
 * @param options - the provider and model to stream with.
 * @param system - the system prompt.
 * @param user - the user text.
 * @returns the model's answer text.
 */
export async function completeViaLlm(
  ctx: Context,
  options: ToolLlmOptions,
  system: string,
  user: string,
): Promise<string> {
  const llm = ctx.get('llm')
  if (llm === undefined) {
    throw new Error('no llm service is composed; this tool needs the llm seam for natural-language planning')
  }
  const assembler = new BlockAssembler()
  const messages: Message[] = [createUserMessage({ content: [{ type: 'text', text: user }], source: PLUGIN_SOURCE })]
  for await (const chunk of llm.stream({ provider: options.provider, model: options.model, messages, system })) {
    assembler.push(chunk)
  }
  const message = assembler.message({ kind: 'model', provider: options.provider, model: options.model })
  return message.content
    .flatMap(block => block.type === 'text' ? [block.text] : [])
    .join('')
}
