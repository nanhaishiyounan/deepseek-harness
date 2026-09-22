/**
 * The mobile login page (v3, 03 §4.9): the stamp-form logo (the 表 seal with
 * the AI ring) over the mist background, the phone + code card with the
 * 60-second countdown, and the demo-auth disclosure. The demo handshake logic
 * (any six-digit code) rides the same NocoBase JWT channel as before; this
 * page owns the visuals only.
 */

import { useEffect, useRef, useState, type JSX } from 'react'
import { Button, Input } from 'antd-mobile'
import { saveIdentity, verifyCode, type MobileIdentity } from '../auth.ts'
import css from './login.module.css'

/** Login props: identity sink after a successful login. */
export interface LoginViewProps {
  readonly onLoggedIn: (identity: MobileIdentity) => void
}

/** The login page. */
export function LoginView({ onLoggedIn }: LoginViewProps): JSX.Element {
  const [phone, setPhone] = useState('13800138000')
  const [code, setCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState<string | undefined>(undefined)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => {
    if (timer.current !== undefined) window.clearInterval(timer.current)
  }, [])

  const startCountdown = (): void => {
    // The button is disabled while the countdown runs, so a second click cannot arrive here.
    /* v8 ignore next -- the disabled button gates the re-entry. */
    if (countdown > 0) return
    setCountdown(60)
    timer.current = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(timer.current)
          return 0
        }
        return current - 1
      })
    }, 1000)
  }

  const submit = (): void => {
    try {
      const identity = verifyCode(phone.trim(), code.trim())
      saveIdentity(identity)
      onLoggedIn(identity)
    } catch (error_) {
      // verifyCode only throws Error.
      /* v8 ignore next -- verifyCode never throws a non-Error value. */
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }

  return (
    <div className={css.page}>
      <div className={css.brand}>
        <span className={css.stampLogo} aria-hidden="true">
          <span className={css.stampRing} />
          <span className={css.stampGlyph}>表</span>
        </span>
        <h1 className={css.brandTitle}>食链通 · AI 员工</h1>
        <p className={css.brandSubtitle}>食品企业移动端 · 单据与问答</p>
      </div>
      <div className={css.card}>
        <label className={css.field}>
          <span className={css.fieldLabel}>手机号/账号</span>
          <Input
            inputMode="tel"
            maxLength={11}
            className={css.input}
            value={phone}
            placeholder="手机号"
            onChange={(next) => { setPhone(next); setError(undefined) }}
          />
        </label>
        <label className={css.field}>
          <span className={css.fieldLabel}>密码/验证码</span>
          <span className={css.codeRow}>
            <Input
              inputMode="numeric"
              maxLength={6}
              className={css.input}
              value={code}
              placeholder="6 位验证码"
              onChange={(next) => { setCode(next); setError(undefined) }}
            />
            <button
              type="button"
              className={css.codeButton}
              disabled={countdown > 0}
              onClick={startCountdown}
            >
              {countdown > 0 ? `${String(countdown)}s` : '获取'}
            </button>
          </span>
        </label>
        {error !== undefined && <p className={css.error} role="alert">{error}</p>}
        <Button
          block
          color="primary"
          size="large"
          className={css.submit}
          disabled={phone.trim() === '' || code.trim() === ''}
          onClick={submit}
        >
          登录
        </Button>
        <p className={css.demo}>演示环境 · 数据仅限内测</p>
      </div>
      <p className={css.footer}>DeepSeek Harness · 移动端 v3</p>
    </div>
  )
}
