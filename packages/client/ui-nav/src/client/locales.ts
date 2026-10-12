/** Nav menu block copy (zh is the product language; en mirrors it). */

const zh = {
  'menu.region': '主导航',
  'menu.chat': '对话',
  'menu.chat.badge': '对话',
} as const

/** English locale rows for the nav surface. */
const en = {
  'menu.region': 'Main navigation',
  'menu.chat': 'Chat',
  'menu.chat.badge': 'Chat',
} as const

/** Dictionary keys of the nav namespace. */
export type NavKey = keyof typeof zh

export { en, zh }
