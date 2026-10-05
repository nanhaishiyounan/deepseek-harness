// @vitest-environment jsdom
/**
 * The voice lane's three-state detect and lifecycle (W11-B2): an insecure
 * context or a missing constructor lands on `no` (the WeChat webview's
 * steady state — the panel hides the tile), a constructor that throws lands
 * on `broken` (the tile stays but answers with the hint toast), and a live
 * constructor toggles a listening stretch whose interim/final results reach
 * the sinks and whose stop unwinds to idle. The engine is a hand-rolled
 * mock — jsdom ships no speech recognition, and the headless Chromium
 * verdict is recorded in the delivery notes, not asserted here.
 */

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVoiceInput } from '../src/client/messages/chat/useVoiceInput.ts'

/** The wired subset the hook touches (mirrors the hook's internal face). */
interface MockRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: unknown) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

let engine: MockRecognition | undefined
let constructCount: number
let throwing: boolean

beforeEach(() => {
  engine = undefined
  constructCount = 0
  throwing = false
})

afterEach(() => {
  // The installed constructors leak across tests otherwise (defineProperty
  // outlives the hook), flipping later no-constructor arms to yes.
  delete (window as { SpeechRecognition?: unknown }).SpeechRecognition
  delete (window as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
  vi.restoreAllMocks()
  cleanup()
})

/** Install the constructor under the given key with the given body. */
function installCtor(key: 'SpeechRecognition' | 'webkitSpeechRecognition', body: new () => MockRecognition): void {
  Object.defineProperty(window, key, { configurable: true, writable: true, value: body })
}

/** The default mock engine: records itself and answers start() cleanly. */
function makeCtor(): new () => MockRecognition {
  return class {
    lang = ''
    continuous = false
    interimResults = false
    onresult: ((event: unknown) => void) | null = null
    onerror: ((event: { error: string }) => void) | null = null
    onend: (() => void) | null = null
    start(): void {}
    stop(): void {}
    abort(): void {}
    constructor() {
      constructCount += 1
      if (throwing) throw new Error('engine broken')
      // Capturing the fresh instance through the outer variable is the mock's
      // whole purpose; the hook only ever reads it through that variable.
      engine = this satisfies MockRecognition
    }
  }
}

/** jsdom's own secure-context flag is pinned per test. */
function setSecureContext(value: boolean): void {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, get: () => value })
}

/** One result event frame the mock engine can fire. */
function resultFrame(entries: readonly { text: string; final: boolean }[]): unknown {
  return {
    resultIndex: 0,
    results: {
      length: entries.length,
      ...Object.fromEntries(entries.map((entry, index) => [String(index), {
        isFinal: entry.final,
        0: { transcript: entry.text },
      }])),
    },
  }
}

describe('useVoiceInput — detect ladder', () => {
  it('lands on no outside a secure context even when the constructor exists', () => {
    setSecureContext(false)
    installCtor('SpeechRecognition', makeCtor())
    const { result } = renderHook(() => useVoiceInput({ lang: 'zh-CN', onInterim: () => {}, onFinal: () => {} }))
    expect(result.current.supported).toBe('no')
    expect(constructCount).toBe(0)
  })

  it('lands on no without any constructor (the WeChat webview steady state)', () => {
    setSecureContext(true)
    const { result } = renderHook(() => useVoiceInput({ lang: 'zh-CN', onInterim: () => {}, onFinal: () => {} }))
    expect(result.current.supported).toBe('no')
  })

  it('lands on broken when constructing throws, and toggle answers with the hint', () => {
    setSecureContext(true)
    throwing = true
    installCtor('webkitSpeechRecognition', makeCtor())
    const onError = vi.fn()
    const { result } = renderHook(() => useVoiceInput({ lang: 'zh-CN', onInterim: () => {}, onFinal: () => {}, onError }))
    expect(result.current.supported).toBe('broken')
    act(() => { result.current.toggle() })
    expect(result.current.listening).toBe(false)
    expect(onError).toHaveBeenCalledWith('当前环境不支持语音，试试拍照或打字')
  })
})

describe('useVoiceInput — listening lifecycle', () => {
  beforeEach(() => {
    setSecureContext(true)
    installCtor('SpeechRecognition', makeCtor())
  })

  it('starts on toggle, streams interim and final results to the sinks, and stops back to idle', () => {
    const finals: string[] = []
    const interims: string[] = []
    const { result } = renderHook(() => useVoiceInput({
      lang: 'zh-CN',
      onInterim: (text) => { interims.push(text) },
      onFinal: (text) => { finals.push(text) },
    }))
    act(() => { result.current.toggle() })
    expect(result.current.listening).toBe(true)
    expect(engine?.lang).toBe('zh-CN')
    expect(engine?.continuous).toBe(true)
    expect(engine?.interimResults).toBe(true)
    act(() => { engine?.onresult?.(resultFrame([{ text: '库存还有', final: false }])) })
    expect(result.current.interim).toBe('库存还有')
    expect(interims.at(-1)).toBe('库存还有')
    act(() => { engine?.onresult?.(resultFrame([{ text: '库存还有多少', final: true }])) })
    expect(finals).toEqual(['库存还有多少'])
    expect(result.current.listening).toBe(true)
    // The second toggle stops; the engine's onend unwinds the card.
    act(() => { result.current.toggle() })
    act(() => { engine?.onend?.() })
    expect(result.current.listening).toBe(false)
    expect(result.current.interim).toBe('')
  })

  it('surfaces a mid-session permission error through onError and still unwinds on end', () => {
    const onError = vi.fn()
    const { result } = renderHook(() => useVoiceInput({ lang: 'zh-CN', onInterim: () => {}, onFinal: () => {}, onError }))
    act(() => { result.current.toggle() })
    act(() => { engine?.onerror?.({ error: 'not-allowed' }) })
    expect(onError).toHaveBeenCalledWith('麦克风权限被拒绝，请在系统设置中允许')
    act(() => { engine?.onend?.() })
    expect(result.current.listening).toBe(false)
  })

  it('unmount aborts the running engine (leaving the composer stops the mic)', () => {
    const { result, unmount } = renderHook(() => useVoiceInput({ lang: 'zh-CN', onInterim: () => {}, onFinal: () => {} }))
    act(() => { result.current.toggle() })
    const stopSpy = vi.spyOn(engine as MockRecognition, 'abort')
    unmount()
    expect(stopSpy).toHaveBeenCalled()
  })
})
