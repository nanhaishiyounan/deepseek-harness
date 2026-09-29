/**
 * W4-R1 C2 leg-3: fetch the 质检单 page grid tree (the flowModels:findOne
 * the browser issues) as admin and as qc_inspector, and diff the table
 * block's columns — isolating whether the column models themselves are
 * ACL-trimmed per role before rendering.
 *
 * Usage: node --import tsx/esm examples/kb-agent/scripts/w4-r1-qc-tree.mts
 */
import { call, signInWithRetry } from './nocobase-flow-page-lib.mts'

async function signIn(account: string, password: string): Promise<string> {
  const payload = await call('', 'POST', '/api/auth:signIn', { account, password })
  const token = payload?.data?.token
  if (typeof token !== 'string' || token.length === 0) throw new Error(`signIn ${account} returned no token`)
  return token
}

const GRID_UID = 'w8qmtaew1jr4xk1r'

type TreeNode = Record<string, any>

function countColumns(node: TreeNode | undefined, depth = 0): { tables: number, columns: number, sample: string[] } {
  if (node === undefined || depth > 8) return { tables: 0, columns: 0, sample: [] }
  let tables = node.use === 'TableBlockModel' ? 1 : 0
  let columns = 0
  const sample: string[] = []
  if (node.use === 'TableBlockModel' || node.subKey === 'columns') {
    const cols = Array.isArray(node.columns) ? node.columns : []
    columns += cols.length
    for (const column of cols) sample.push(`${String(column.use ?? '?')}:${String(column.field?.stepParams?.fieldSettings?.init?.fieldPath ?? column.props?.title ?? '?')}`)
  }
  for (const key of ['items', 'children', 'blocks'] as const) {
    if (Array.isArray(node?.[key])) {
      for (const child of node[key]) {
        const result = countColumns(child, depth + 1)
        tables += result.tables
        columns += result.columns
        sample.push(...result.sample)
      }
    }
  }
  return { tables, columns, sample }
}

for (const [who, token] of [['admin', await signInWithRetry()], ['member', await signIn('qc_inspector', 'Qc#2026')]] as const) {
  const payload = await call(token, 'GET', `/api/flowModels:findOne?parentId=${GRID_UID}&subKey=grid`)
  const tree = payload?.data ?? payload
  const serialized = JSON.stringify(tree ?? {})
  const result = countColumns(tree)
  console.log(`${who}: findOne bytes=${String(serialized.length)} tables=${String(result.tables)} columns=${String(result.columns)}`)
  console.log(`  columns: ${result.sample.slice(0, 20).join(' , ')}`)
}
