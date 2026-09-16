/** Copy for the view-tools rows (toolview claims) and capture surfaces. */

export const zh = {
  'tool.switchTitle': '切换视图',
  'tool.applyTitle': '调整视图',
  'tool.stateTitle': '读取视图状态',
} as const

/** English copy, key-for-key with {@link zh}. */
export const en = {
  'tool.switchTitle': 'Switch view',
  'tool.applyTitle': 'Adjust view',
  'tool.stateTitle': 'Read view state',
} as const

/** Locale key understood by the view-tools copy surfaces. */
export type ViewContextKey = keyof typeof zh
