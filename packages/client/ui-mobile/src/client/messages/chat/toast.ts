/**
 * The chat surface's one toast anchor (W11-R5): every transient notice that
 * can appear while the composer band sits on screen — the uploading-blocked
 * send, the voice lane's errors, the unsupported-environment notice, the
 * pick guards, the batch and send-failure toasts — rides the same lifted
 * bottom mask, so no chat toast lands under the composer strip or the
 * attachment chips.
 */

import type { ReactNode } from 'react'
import { Toast } from 'antd-mobile'
import css from '../chat.module.css'

/**
 * Show a chat toast on the shared lifted bottom anchor.
 * @param opts - the toast's content (antd-mobile renders it verbatim).
 */
export function hoistToast(opts: { readonly content: ReactNode }): void {
  Toast.show({
    content: opts.content,
    position: 'bottom',
    ...(css.toastLift === undefined ? {} : { maskClassName: css.toastLift }),
  })
}
