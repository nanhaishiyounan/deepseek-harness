/**
 * The mobile login page (W6-B0, re-skinned W9-B6): the brand 酱印 (the double
 * ring seal with the vertical word and the day's batch code — the hero seal's
 * login twin) over the warm-paper canvas, the account + password card, and
 * the one solid persimmon capsule CTA. The handshake rides `nocobase.signIn`
 * (the gateway proxies NocoBase's basic authenticator): wrong credentials
 * surface the server's refusal verbatim, success persists the profile as the
 * page identity that every session prompt re-carries. This page owns the
 * visuals only.
 */

import { useState, type JSX } from 'react'
import { Input, Toast } from 'antd-mobile'
import { Eye, EyeOff } from 'lucide-react'
import { saveIdentity, type MobileIdentity } from '../auth.ts'
import { batchOf } from '../home/HomeView.tsx'
import { rpc } from '../rpc.ts'
import css from './login.module.css'

/** Login props: identity sink after a successful login. */
export interface LoginViewProps {
  readonly onLoggedIn: (identity: MobileIdentity) => void
}

/** The login page. */
export function LoginView({ onLoggedIn }: LoginViewProps): JSX.Element {
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const submit = (): void => {
    if (busy) return
    if (account.trim() === '' || password === '') {
      Toast.show({ content: '请输入账号和密码' })
      return
    }
    setBusy(true)
    setError(undefined)
    void (async () => {
      try {
        const profile = await rpc('nocobase.signIn', { account: account.trim(), password })
        const identity: MobileIdentity = {
          username: profile.username,
          nickname: profile.nickname,
          token: profile.token,
          loggedAt: Date.now(),
        }
        saveIdentity(identity)
        onLoggedIn(identity)
      } catch (error_) {
        // rpc() throws Error with the server's refusal message (or transport text).
        /* v8 ignore next 2 -- rpc() never throws a non-Error value. */
        setError(error_ instanceof Error ? error_.message : String(error_))
        setBusy(false)
      }
    })()
  }

  return (
    <div className={css.page}>
      <div className={css.brand}>
        <span className={css.stampLogo} aria-label="品牌酱印">
          <span className={css.stampGlyph} aria-hidden="true">食链</span>
          <span className={css.stampBatch} aria-hidden="true">{batchOf(new Date())}</span>
        </span>
        <h1 className={css.brandTitle}>食链通 · AI 员工</h1>
        <p className={css.brandSubtitle}>食品企业移动端 · 单据与问答</p>
      </div>
      <div className={css.card}>
        <label className={css.field}>
          <span className={css.fieldLabel}>账号</span>
          <Input
            autoComplete="username"
            className={css.input}
            value={account}
            placeholder="业务账号（如 buyer）"
            onChange={(next) => { setAccount(next); setError(undefined) }}
          />
        </label>
        <label className={css.field}>
          <span className={css.fieldLabel}>密码</span>
          <div className={css.secretRow}>
            <Input
              autoComplete="current-password"
              type={showPassword ? 'text' : 'password'}
              className={css.input}
              value={password}
              placeholder="业务账号密码"
              onChange={(next) => { setPassword(next); setError(undefined) }}
            />
            <button
              type="button"
              className={css.secretToggle}
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
              aria-pressed={showPassword}
              onClick={() => { setShowPassword(current => !current) }}
            >
              {showPassword
                ? <EyeOff size={20} strokeWidth={1.8} aria-hidden="true" />
                : <Eye size={20} strokeWidth={1.8} aria-hidden="true" />}
            </button>
          </div>
        </label>
        {error !== undefined && <p className={css.error} role="alert">{error}</p>}
        <button
          type="button"
          className={`dshm-seal-cta ${css.submit}`}
          disabled={busy}
          onClick={submit}
        >
          {busy ? '登录中…' : '登录'}
        </button>
      </div>
      <p className={css.footer}>企业账号登录 · 提交与审批以登录身份记录</p>
    </div>
  )
}
