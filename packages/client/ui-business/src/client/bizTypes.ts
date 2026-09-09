/**
 * Wire-contract mirrors the business page renders: the `nocobase.listMeta`
 * collection rows and the `nocobase.list` row page. The gateway owns
 * validation; these shapes exist so the page never re-parses the wire.
 * @module @deepseek-ai/dsh-client-ui-business/client/bizTypes
 */

/** One collection definition as the page switches over. */
export interface BizCollectionRow {
  readonly name: string
  readonly title?: string
  /** True when the backend marks the collection hidden from UI listings. */
  readonly hidden?: boolean
  readonly filter_target_key?: string
  readonly fields: readonly {
    readonly name: string
    readonly type: string
    readonly title?: string
    readonly target?: string
  }[]
}

/** One business row; cells stay opaque JSON until the card renders them. */
export type BizRowView = Record<string, unknown>

/** One row page as `nocobase.list` projects it. */
export interface BizRowPageView {
  readonly count: number
  readonly page: number
  readonly page_size: number
  readonly rows: readonly BizRowView[]
}
