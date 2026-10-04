/**
 * The mobile application tree: identity gate → four-tab shell with the hash
 * router and the persisted theme. Route rendering stays in the shell so every
 * view module stays pure presentation over its own data hooks; the root also
 * mirrors the theme onto the host html and body — html carries the token
 * twin antd-mobile body portals read, body carries the desk color behind the
 * 430px shell.
 */

import { useEffect, useState, type JSX } from 'react'
import { clearIdentity, loadIdentity, type MobileIdentity } from './auth.ts'
import { clearOutbox } from './outboxStore.ts'
import { LoginView } from './login/LoginView.tsx'
import { MobileShell } from './shell/MobileShell.tsx'

/** localStorage key of the theme choice. */
const THEME_KEY = 'dsh-mobile-theme'

/** The persisted theme ('dark' when stored, light otherwise). */
function loadTheme(): boolean {
  return localStorage.getItem(THEME_KEY) === 'dark'
}

/** Root component: login gate plus the four-tab shell. */
export function App(): JSX.Element {
  const [identity, setIdentity] = useState<MobileIdentity | undefined>(() => loadIdentity())
  const [dark, setDark] = useState<boolean>(() => loadTheme())
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.body.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])
  const applyDark = (next: boolean): void => {
    setDark(next)
    if (next) {
      localStorage.setItem(THEME_KEY, 'dark')
    } else {
      localStorage.removeItem(THEME_KEY)
    }
  }
  if (identity === undefined) {
    return (
      <div className="dshm-root" data-theme={dark ? 'dark' : 'light'}>
        <LoginView
          onLoggedIn={(next) => { setIdentity(next) }}
        />
      </div>
    )
  }
  return (
    <div className="dshm-root" data-theme={dark ? 'dark' : 'light'}>
      <MobileShell
        identity={identity}
        dark={dark}
        onDarkChange={applyDark}
        onLogout={() => {
          // The departed account's parked outbox messages must never send
          // under the next login: the queue and its retry timer die here.
          clearOutbox()
          clearIdentity()
          setIdentity(undefined)
        }}
      />
    </div>
  )
}
