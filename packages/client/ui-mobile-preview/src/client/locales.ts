/**
 * The preview view's locale dictionaries (zh source of truth; en mirrors the
 * same keys — the locale-parity gate checks the pair).
 */

/** Dictionary key type (both locales share it). */
export type MobilePreviewKey = keyof typeof zh

/** Chinese copy. */
export const zh = {
  'view.label': '移动端预览',
  'view.hint': '同源 iframe · 390×844 · 与本工作台共享会话与数据',
  'view.unavailable': '/mobile 未启用：部署需在 web-runtime 配置 mobileEnabled',
} as const

/** English mirror. */
export const en: Record<MobilePreviewKey, string> = {
  'view.label': 'Mobile preview',
  'view.hint': 'Same-origin iframe · 390×844 · shares sessions and data with this workbench',
  'view.unavailable': '/mobile is not enabled: the deployment must set mobileEnabled on web-runtime',
}
