/**
 * The mobile application tree: identity-free direct entry (NocoBase 退役后
 * 无登录门) → four-tab shell with the hash router and the persisted theme.
 * Route rendering stays in the shell so every view module stays pure
 * presentation over its own data hooks; the root also mirrors the theme onto
 * the host html and body — html carries the token twin antd-mobile body
 * portals read, body carries the desk color behind the 430px shell.
 */

import { useEffect, useState, type JSX } from 'react'
import { clearIdentity, loadIdentity, type MobileIdentity } from './auth.ts'
import { clearOutbox } from './outboxStore.ts'
import { sweepSessionKeys } from './localKeys.ts'
import { MobileShell } from './shell/MobileShell.tsx'

/** localStorage key of the theme choice. */
const THEME_KEY = 'dsh-mobile-theme'

/** The persisted theme ('dark' when stored, light otherwise). */
function loadTheme(): boolean {
  return localStorage.getItem(THEME_KEY) === 'dark'
}

/** Root component: the four-tab shell with the local identity. */
export function App(): JSX.Element {
  const [identity, setIdentity] = useState<MobileIdentity>(() => loadIdentity())
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
  return (
    <div className="dshm-root" data-theme={dark ? 'dark' : 'light'}>
      <MobileShell
        identity={identity}
        dark={dark}
        onDarkChange={applyDark}
        onReset={() => {
          // The local reset clears the parked outbox queues and every
          // session-scoped key (draft edits, attachment strips, outbox
          // residue) from one shared prefix list, then returns to the
          // visitor identity.
          clearOutbox()
          clearIdentity()
          const swept = sweepSessionKeys()
          console.info(JSON.stringify({ type: 'session-keys.swept', count: swept.length, keys: swept, at: new Date().toISOString() }))
          setIdentity(loadIdentity())
        }}
      />
    </div>
  )
}
