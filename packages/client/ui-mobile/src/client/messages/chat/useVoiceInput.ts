/**
 * The composer's voice lane (W11-B2): one hook owning the Web Speech API
 * three-state feature-detect and the start/stop lifecycle. The detect ladder
 * is ordered cheapest-refusal-first — an insecure context or a missing
 * constructor both land on `no` without touching the engine (the WeChat
 * webview never exposes the constructor, so its composers render no voice
 * tile at all), a constructor that throws lands on `broken`, and a start
 * that errors mid-session degrades to a toast and stops (never a stuck
 * listening card). Recognition text only ever leaves through the callbacks —
 * the hook never touches the draft store or the send lane itself.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

/** The wired subset of SpeechRecognition this lane uses. */
interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

/** The result event's iterable result list, narrowed to the fields read. */
interface SpeechRecognitionEventLike {
  readonly resultIndex: number
  readonly results: {
    readonly length: number
    // Sparse by construction: the engine fills slots as recognition streams,
    // so an in-range index may still read undefined between events.
    [index: number]: {
      readonly isFinal: boolean
      readonly 0: { readonly transcript: string } | undefined
    } | undefined
  }
}

/** The engine constructor as exposed (unprefixed or webkit-) on window. */
type RecognitionCtor = new () => RecognitionLike

/** One useVoiceInput option set; the callbacks drive the caller's draft. */
export interface VoiceInputOptions {
  /** The recognition language; the product surface is zh-CN. */
  readonly lang: string
  /** Each interim repaint (the listening card's live text). */
  readonly onInterim: (text: string) => void
  /** One finalized segment, appended into the draft at the caret. */
  readonly onFinal: (text: string) => void
  /** A mid-session failure the user must hear about (permission, service). */
  readonly onError?: (message: string) => void
}

/** One useVoiceInput state face. */
export interface VoiceInputState {
  /** `no` hides the tile; `broken` renders it inert with a hint; `yes` runs. */
  readonly supported: 'yes' | 'no' | 'broken'
  readonly listening: boolean
  /** The live interim text the listening card paints. */
  readonly interim: string
  /** Start or stop the current recognition. */
  readonly toggle: () => void
}

/** The recognition errors worth a human sentence; anything else is generic. */
const ERROR_HINTS: Readonly<Record<string, string>> = {
  'not-allowed': '麦克风权限被拒绝，请在系统设置中允许',
  'service-not-allowed': '当前环境不允许语音服务，试试打字或拍照',
  'audio-capture': '未检测到麦克风设备',
  network: '语音服务网络异常，请稍后再试',
}

/**
 * Detect the environment's speech recognition support.
 * @returns 'no' outside a secure context or without the constructor, 'broken'
 * when constructing throws, 'yes' otherwise.
 */
function detectSupport(): 'yes' | 'no' | 'broken' {
  if (typeof window === 'undefined' || !window.isSecureContext) return 'no'
  const holder = window as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
  const ctor = (holder.SpeechRecognition ?? holder.webkitSpeechRecognition) as RecognitionCtor | undefined
  if (ctor === undefined) return 'no'
  try {
    void new ctor()
  } catch {
    return 'broken'
  }
  return 'yes'
}

/**
 * The voice lane's lifecycle hook. One recognition instance per listening
 * stretch; the instance is rebuilt on every start (the engine's one-shot
 * semantics differ per browser, a fresh instance sidesteps them all).
 * @param options - the language plus the interim/final/error sinks.
 * @returns the three-state support flag, the listening flag, the live
 * interim text, and the toggle.
 */
export function useVoiceInput(options: VoiceInputOptions): VoiceInputState {
  const { lang, onError } = options
  // The callbacks travel through a ref: a caller re-render must not restart
  // the running recognition (the engine has no rebind).
  const sinks = useRef(options)
  sinks.current = options
  const [supported] = useState<'yes' | 'no' | 'broken'>(() => detectSupport())
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const recognition = useRef<RecognitionLike | undefined>(undefined)

  useEffect(() => () => {
    // Leaving the page or the composer mid-listen stops the mic.
    recognition.current?.abort()
    recognition.current = undefined
  }, [])

  const toggle = useCallback(() => {
    if (supported !== 'yes') {
      if (supported === 'broken') onError?.('当前环境不支持语音，试试拍照或打字')
      return
    }
    if (recognition.current !== undefined) {
      recognition.current.stop()
      return
    }
    const holder = window as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
    const Ctor = (holder.SpeechRecognition ?? holder.webkitSpeechRecognition) as RecognitionCtor
    let engine: RecognitionLike
    try {
      engine = new Ctor()
    } catch {
      onError?.('当前环境不支持语音，试试拍照或打字')
      return
    }
    engine.lang = lang
    engine.continuous = true
    engine.interimResults = true
    let finalSoFar = ''
    engine.onresult = (event) => {
      let live = ''
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index]
        if (result === undefined) continue
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) {
          finalSoFar += text
          sinks.current.onFinal(text)
        } else {
          live += text
        }
      }
      setInterim(live)
      sinks.current.onInterim(finalSoFar + live)
    }
    engine.onerror = (event) => {
      onError?.(ERROR_HINTS[event.error] ?? `语音识别出错（${event.error}）`)
    }
    engine.onend = () => {
      recognition.current = undefined
      setListening(false)
      setInterim('')
    }
    recognition.current = engine
    setListening(true)
    try {
      engine.start()
    } catch {
      // A double-start or an engine that refuses synchronously: no mic is
      // open, so unwinding the state is the whole cleanup.
      recognition.current = undefined
      setListening(false)
      onError?.('语音启动失败，请重试')
    }
  }, [lang, onError, supported])

  return { supported, listening, interim, toggle }
}
