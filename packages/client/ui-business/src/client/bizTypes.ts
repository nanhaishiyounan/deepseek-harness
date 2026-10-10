/**
 * Wire-contract mirrors the business page renders: the `carbon.listMeta`
 * table roster and the `carbon.list` row page. The gateway owns validation;
 * these shapes exist so the page never re-parses the wire.
 * @module @deepseek-ai/dsh-client-ui-business/client/bizTypes
 */

/** One business-table definition as the page switches over (the carbon catalog row). */
export interface BizCollectionRow {
  /** The carbon table name (`salesOrder`). */
  readonly name: string
  /** The Chinese label (`销售订单`). */
  readonly title?: string
  /** The carbon module group id (`master`/`sales`/`purchasing`/`inventory`/`production`/`quality`). */
  readonly module?: string
  /** The manifest-derived risk tier (`read`/`write`). */
  readonly risk?: 'read' | 'write'
  /** The row-addressable key column (`id`, or `itemId` on the stock table). */
  readonly id_column?: string
  /** Key columns the page previews (the catalog's key_columns projection). */
  readonly fields: readonly {
    readonly name: string
    readonly type: string
    readonly title?: string
    readonly target?: string
  }[]
}

/** One business row; cells stay opaque JSON until the card renders them. */
export type BizRowView = Record<string, unknown>

/** One row page as `carbon.list` projects it. */
export interface BizRowPageView {
  readonly count: number
  /** 1-based page number derived from the wire offset/limit pair. */
  readonly page: number
  readonly page_size: number
  readonly rows: readonly BizRowView[]
}
