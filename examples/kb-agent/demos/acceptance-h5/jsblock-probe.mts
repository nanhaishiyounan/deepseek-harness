/**
 * H5 step-0 probe: can a JSBlockModel (authoring channel, flowSurfaces:
 * addBlock type='jsBlock') read a collection through ctx.api.resource and
 * render a custom colored grid through ctx.render? Three-way verdict per the
 * 50-h5 plan: full OK / constrained OK / blocked (fallback to GridCard).
 * Probe target: the 供应商绩效雷达 page grid; --remove tears the probe out.
 */
import { call, dataOf, listRoutes, signInWithRetry } from './nocobase-flow-page-lib.mts'

const PROBE_CODE = [
  // The runjs allowlist vocabulary: ctx.makeResource + the FlowResource
  // methods (setResourceName/setFilter/setPageSize/refresh/getData); render
  // stays top-level per the react-runtime contract.
  "const multi = ctx.makeResource('MultiRecordResource');",
  "multi.setResourceName('srm_suppliers');",
  'multi.setPageSize(100);',
  'await multi.refresh();',
  'const rows = multi.getData() || [];',
  'const color = { qualified: "#52c41a", preferred: "#13c2c2", restricted: "#fa8c16", frozen: "#ff4d4f", potential: "#d9d9d9", reviewing: "#1677ff", rejected: "#ff4d4f", eliminated: "#d9d9d9" };',
  'const chips = rows.map((row) => `<span style="display:inline-block;margin:2px;padding:2px 8px;border-radius:4px;background:${color[row.lifecycle_status] || "#d9d9d9"};color:#fff;font-size:12px">${row.name}·${row.lifecycle_status || "?"}</span>`).join("");',
  'ctx.render(`<div data-probe="h5-jsblock" style="padding:8px"><b>JSBlock 探针：${rows.length} 家供应商</b><div>${chips}</div></div>`);',
].join('\n')

async function pageGridUid(token: string): Promise<string> {
  const routes = await listRoutes(token, 'H5probe')
  const flow = routes.find(row => row.title === '供应商绩效雷达' && row.type === 'flowPage')
  if (flow === undefined) throw new Error('供应商绩效雷达 page not found')
  const tab = routes.find(row => row.parentId === flow.id && row.type === 'tabs')
  if (tab?.schemaUid == null) throw new Error('no tabs child')
  const grid = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${tab.schemaUid}&subKey=grid`)
  if (grid?.uid == null) throw new Error('no grid')
  return String(grid.uid)
}

async function main(): Promise<void> {
  const token = await signInWithRetry()
  const gridUid = await pageGridUid(token)
  if (process.argv.includes('--remove')) {
    const rows = (await dataOf(token, 'GET', '/api/flowModels:list?pageSize=2000')) as Array<{ uid?: string, use?: string, parentId?: string }> | null
    let removed = 0
    for (const row of (rows ?? []).filter(r => r.use === 'JSBlockModel' && r.parentId === gridUid)) {
      await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(String(row.uid))}`)
      removed += 1
    }
    console.log(`h5-probe: ${removed} JSBlockModel removed`)
    return
  }
  const existing = ((await dataOf(token, 'GET', '/api/flowModels:list?pageSize=2000')) as Array<{ uid?: string, use?: string, parentId?: string }> | null) ?? []
  if (existing.some(row => row.use === 'JSBlockModel' && row.parentId === gridUid)) {
    console.log('h5-probe: JSBlock already on the grid (kept); --remove to tear it out')
    return
  }
  const response = await fetch('http://127.0.0.1:13000/api/flowSurfaces:addBlock', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      target: { uid: gridUid },
      type: 'jsBlock',
      settings: { showBlockCard: true, code: PROBE_CODE },
    }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    console.log(`h5-probe: REJECTED HTTP ${response.status}\n${JSON.stringify(payload, null, 2).slice(0, 4000)}`)
    return
  }
  console.log(`h5-probe: jsBlock added → ${JSON.stringify(payload?.data ?? payload).slice(0, 300)}`)
}

await main()
