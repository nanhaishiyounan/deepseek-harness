/**
 * The mobile login page (W6-B0): the stamp-form logo (the 表 seal with the
 * AI ring) over the mist background, the account + password card, and the
 * real-auth note. The handshake rides `nocobase.signIn` (the gateway proxies
 * NocoBase's basic authenticator): wrong credentials surface the server's
 * refusal verbatim, success persists the profile as the page identity that
 * every session prompt re-carries. This page owns the visuals only.
 */

import { useState, type JSX } from 'react'
import { Button, Input, Toast } from 'antd-mobile'
import { saveIdentity, type MobileIdentity } from '../auth.ts'
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
        <span className={css.stampLogo} aria-hidden="true">
          <span className={css.stampRing} />
          <span className={css.stampGlyph}>表</span>
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
          <Input
            autoComplete="current-password"
            type="password"
            className={css.input}
            value={password}
            placeholder="业务账号密码"
            onChange={(next) => { setPassword(next); setError(undefined) }}
          />
        </label>
        {error !== undefined && <p className={css.error} role="alert">{error}</p>}
        <Button
          block
          color="primary"
          size="large"
          className={css.submit}
          loading={busy}
          disabled={busy}
          onClick={submit}
        >
          登录
        </Button>
      </div>
      <p className={css.footer}>企业账号登录 · 提交与审批以登录身份记录</p>
    </div>
  )
}
