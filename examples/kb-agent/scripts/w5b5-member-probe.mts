/**
 * W5-B5/BP-13: the member-chart live probe — signs in as b4guard (member) and
 * runs one charts:queryData aggregate, printing CHART_OK / CHART_403 so the
 * driving script can assert the outcome. The b4guard account and its member
 * role binding ride nocobase-h5-wms's guard fixture (B4 守卫测试).
 */
const base = (process.env['NOCOBASE_BASE_URL'] ?? 'http://127.0.0.1:13000').replace(/\/$/u, '')

const post = async (path: string, body: Record<string, unknown>, token?: string): Promise<{ status: number; body: any }> => {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token === undefined ? {} : { authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json().catch(() => ({})) }
}

const signIn = await post('/api/auth:signIn', { account: 'b4guard', password: 'B4guard-2026' })
const token = signIn.body?.data?.token
if (typeof token !== 'string' || token === '') {
  console.log('CHART_NO_LOGIN')
  process.exit(0)
}

const probe = await post('/api/charts:queryData', {
  dataSource: 'main',
  collection: 'so_orders',
  measures: [{ field: ['amount'], aggregation: 'sum', alias: 'total' }],
}, token)
if (probe.status === 200) {
  console.log(`CHART_OK ${JSON.stringify(probe.body?.data ?? []).slice(0, 80)}`)
} else {
  console.log(`CHART_${String(probe.status)} ${JSON.stringify(probe.body).slice(0, 120)}`)
}
