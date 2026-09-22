/**
 * Mobile application entry: thin bootstrap over the mobile shell library.
 * Everything — the identity gate, the four-tab shell, the /api data paths —
 * lives in @deepseek-ai/dsh-client-ui-mobile; this file only finds the mount
 * point. Unlike the PC shell this page reads no boot manifest: it is a
 * self-contained Vite bundle talking to the same gateway over fetch.
 */
import { AppMobileEntry } from '@deepseek-ai/dsh-client-ui-mobile'

const el = document.getElementById('mobile-root')
if (el === null) throw new Error('mobile app: missing #mobile-root')
new AppMobileEntry(el).run()
