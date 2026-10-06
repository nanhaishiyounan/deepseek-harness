// @vitest-environment jsdom
/**
 * The chat surface's one toast anchor (W11-R5): `hoistToast` is the only
 * place the chat input face calls `Toast.show` — every notice that can
 * appear while the composer band sits on screen (the uploading-blocked
 * send, the voice lane's errors, the pick guards, the batch and
 * send-failure toasts) rides the same lifted bottom mask. The runtime half
 * pins the anchor options; the static half walks the chat input face's
 * source files and proves no call site bypasses the helper.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Toast } from 'antd-mobile'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hoistToast } from '../src/client/messages/chat/toast.ts'

afterEach(() => { vi.restoreAllMocks() })

describe('hoistToast (the chat surface\'s one anchor)', () => {
  it('shows on the bottom position with the toastLift mask class', () => {
    const show = vi.spyOn(Toast, 'show').mockImplementation(() => ({ close: () => {} }))
    hoistToast({ content: '附件还在处理中，稍候再发送' })
    expect(show).toHaveBeenCalledTimes(1)
    const config = show.mock.calls[0]![0]
    expect(typeof config === 'string' ? undefined : config?.content).toBe('附件还在处理中，稍候再发送')
    expect(typeof config === 'string' ? undefined : config?.position).toBe('bottom')
    const mask = typeof config === 'string' ? undefined : config?.maskClassName
    expect(mask).toBeTypeOf('string')
    expect(mask !== '').toBe(true)
  })
})

describe('the chat input face routes every toast through hoistToast', () => {
  it('has no Toast.show call outside the helper itself', () => {
    const chatDir = join(import.meta.dirname, '..', 'src', 'client', 'messages', 'chat')
    const files = [
      join(chatDir, '..', 'ChatView.tsx'),
      ...readdirSync(chatDir).filter(name => /\.(ts|tsx)$/.test(name)).map(name => join(chatDir, name)),
    ]
    for (const file of files) {
      const calls = readFileSync(file, 'utf8').match(/Toast\.show\(/g)?.length ?? 0
      // The helper's own file carries exactly one call; every other file on
      // the chat input face carries none.
      expect(calls, file).toBe(file.endsWith(join('chat', 'toast.ts')) ? 1 : 0)
    }
  })
})
