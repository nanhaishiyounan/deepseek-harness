/**
 * Restricted-filter re-export over the client package's vocabulary — the
 * nb_* tools' filter surface, kept here so the tool package stays a thin
 * consumer of the shared NocoBase client package.
 * @module @deepseek-ai/dsh-tool-nocobase/filter
 */

export {
  compileNbFilter as compileFilter,
  describeNbFilterCondition as describeFilterCondition,
  parseNbFilterCondition as parseFilterCondition,
} from '@deepseek-ai/dsh-connector-nocobase'
export type { NbFilterCondition, NbFilterConditionInput, NbFilterMatch, NbFilterOp } from '@deepseek-ai/dsh-connector-nocobase'
