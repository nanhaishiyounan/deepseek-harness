/**
 * DraftSpec and the layout contract types. Pure types only — no runtime code.
 * @module @deepseek-ai/dsh-expert-pdf/types
 */

/** One authored section of the proposal body. */
export interface DraftSection {
  /** Section heading as typeset (for example 「风险分析」). */
  readonly heading: string
  /** Body paragraphs, each starting on a fresh line block; blank strings render as vertical spacing. */
  readonly paragraphs: readonly string[]
  /** Reference-source lines quoted under the section (document title and heading path). */
  readonly refs?: readonly string[]
}

/** The expert byline typeset on the cover and in the page header. */
export interface DraftExpert {
  /** Expert name (for example 张红喜). */
  readonly name: string
  /** Affiliation (for example 漯河市电子商务协会（会长）). */
  readonly org?: string
}

/**
 * The complete typesetting input for one expert-deliverable proposal: cover
 * fields, the authored sections, and the closing disclaimer. Ordering and
 * chapter structure are the drafter's product; this library only typesets.
 */
export interface DraftSpec {
  /** Order number, carried in the page header of every body page. */
  readonly orderNo: string
  /** Proposal title typeset on the cover. */
  readonly title: string
  /** Client name the proposal is addressed to. */
  readonly client: string
  /** Expert byline. */
  readonly expert: DraftExpert
  /** ISO calendar date (`YYYY-MM-DD`) typeset on the cover. */
  readonly date: string
  /** Body sections, typeset in order after the cover. */
  readonly sections: readonly DraftSection[]
  /** Closing disclaimer text; defaults to the library's standard line. */
  readonly disclaimer?: string
}
