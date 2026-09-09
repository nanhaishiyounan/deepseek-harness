/**
 * Seed batch-5 historical expert-service orders into the NocoBase `orders`
 * collection: 24 rows spread across the last 30 days, delivered-majority with
 * a minority of pending/generating/failed, each tied to a real service row
 * (server-assigned id resolved at seed time) and its expert. Idempotent by
 * the `ORD-B5-` order-number prefix: re-runs neither duplicate nor mutate.
 *
 * The approval workflow's collection trigger reacts to CREATE events even
 * while the workflow is toggled off (NocoBase 2.2.6 queues the execution), so
 * seeding is followed by a residue sweep: pending executions and pending
 * manual tasks whose order numbers carry the seed prefix are destroyed — the
 * seeded statuses stay exactly as landed and the approver queue stays clean.
 *
 * Usage (repo root, tsx loader, credentials from ambient env or root .env):
 *   node --env-file=.env --import tsx/esm examples/kb-agent/scripts/seed-orders.mts
 */
import { pathToFileURL } from 'node:url'
import { NocoBaseClient } from '@deepseek-ai/dsh-connector-nocobase'

/** Prefix every seeded historical order number carries (idempotency marker). */
const B5_PREFIX = 'ORD-B5-'

/** Status distribution: delivered-majority history plus a live minority. */
const STATUS_PLAN: readonly string[] = [
  'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered',
  'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered',
  'delivered', 'pending', 'pending', 'pending', 'generating', 'failed', 'failed', 'delivered',
]

/** Client enterprises (fictional, 漯河/豫中南 industrial context). */
const CLIENTS: readonly string[] = [
  '漯河宏发食品有限公司', '临颍县康健调味品有限公司', '舞阳豫香食品有限公司', '西平县绿源粮油有限公司',
  '郾城区金穗食品有限公司', '源汇区隆盛食品有限公司', '召陵区华味鲜食品有限公司', '周口豫东食品有限公司',
  '许昌襄禾食品有限公司', '驻马店天中食品有限公司',
]

/** One historical order's shape as it lands in the collection. */
interface HistoricalOrder {
  readonly orderNo: string
  readonly serviceId: string
  readonly serviceName: string
  readonly price: string
  readonly brief: string
  readonly clientName: string
  readonly expertName: string
  readonly expertOrg: string
  readonly status: string
  readonly generatedAt: string
}

/** Run report counts. */
interface OrdersReport { created: number; skipped: number; servicesMatched: number; executionsSwept: number }

/**
 * Seed the historical orders against the live backend, then sweep the
 * approval-workflow residue the collection trigger queued for them.
 * @param client - the REST client bound to the backend.
 * @param baseUrl - the NocoBase root, for the raw destroy REST calls.
 * @param token - an authorized API token.
 * @param today - anchor date; history spreads over the 30 days before it.
 * @returns created/skipped/swept counts plus how many distinct services were used.
 */
export async function seedHistoricalOrders(
  client: NocoBaseClient,
  baseUrl: string,
  token: string,
  today: Date,
): Promise<OrdersReport> {
  // Resolve service rows (server ids) and their experts from the live backend.
  const services = (await client.list<{ id: number; name: string; price?: string; expertId?: number }>('expert_services', { page: 1, pageSize: 300 })).rows
  const experts = new Map(
    (await client.list<{ id: number; name: string; org?: string }>('experts', { page: 1, pageSize: 200 })).rows.map(row => [row.id, row]),
  )
  if (services.length === 0) throw new Error('no expert_services rows found; run seed-experts-roster.mts first')

  const existing = new Set(
    (await client.list<{ orderNo: string }>('orders', { page: 1, pageSize: 500 })).rows
      .map(row => row.orderNo)
      .filter(orderNo => orderNo.startsWith(B5_PREFIX)),
  )

  const orders: HistoricalOrder[] = []
  for (const [index, status] of STATUS_PLAN.entries()) {
    const service = services[(index * 7) % services.length]!
    const expert = service.expertId === undefined ? undefined : experts.get(service.expertId)
    // Spread deterministically over the 30 days before the anchor; delivered
    // rows carry a generation timestamp, live rows carry none.
    const daysAgo = 1 + Math.floor(index * 29 / STATUS_PLAN.length)
    const placed = new Date(today.getTime() - daysAgo * 86_400_000)
    const orderNo = `${B5_PREFIX}${placed.toISOString().slice(0, 10).replaceAll('-', '')}-${(1000 + index * 37).toString(16)}`
    orders.push({
      orderNo,
      serviceId: `expert_services/${String(service.id)}`,
      serviceName: service.name,
      price: service.price ?? '议价',
      brief: `历史订单（批次五种子）：${service.name}交付${status === 'failed' ? '（当期未成行）' : ''}。`,
      clientName: CLIENTS[index % CLIENTS.length]!,
      expertName: expert?.name ?? '待指派专家',
      expertOrg: expert?.org ?? '',
      status,
      generatedAt: status === 'delivered' ? new Date(placed.getTime() + 2 * 86_400_000).toISOString() : '',
    })
  }

  let created = 0
  let skipped = 0
  for (const order of orders) {
    if (existing.has(order.orderNo)) {
      skipped += 1
      continue
    }
    await client.create('orders', order)
    created += 1
  }

  // Residue sweep: destroy pending executions the collection trigger queued
  // for seed rows, plus their pending manual tasks. Only executions whose
  // order number carries the seed prefix are touched.
  const call = async (path: string): Promise<{ data?: unknown }> => {
    const response = await fetch(`${baseUrl}${path}`, { headers: { authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error(`${path} -> HTTP ${String(response.status)}`)
    return await response.json() as { data?: unknown }
  }
  const pending = (await call(`/api/executions:list?pageSize=200&filter=${encodeURIComponent(JSON.stringify({ status: { $eq: 0 } }))}`)).data as Array<{ id: number; context?: { data?: { orderNo?: string } } }>
  const sweptExecutionIds = new Set<number>()
  for (const execution of pending) {
    if (!(execution.context?.data?.orderNo ?? '').startsWith(B5_PREFIX)) continue
    await fetch(`${baseUrl}/api/executions:destroy?filterByTk=${execution.id}`, { method: 'POST', headers: { authorization: `Bearer ${token}` } })
    sweptExecutionIds.add(execution.id)
  }
  const tasks = (await call(`/api/workflowManualTasks:list?pageSize=200&filter=${encodeURIComponent(JSON.stringify({ status: { $eq: 0 } }))}`)).data as Array<{ id: number; executionId: number }>
  for (const task of tasks) {
    if (!sweptExecutionIds.has(task.executionId)) continue
    await fetch(`${baseUrl}/api/workflowManualTasks:destroy?filterByTk=${task.id}`, { method: 'POST', headers: { authorization: `Bearer ${token}` } })
  }

  return { created, skipped, servicesMatched: new Set(orders.map(order => order.serviceName)).size, executionsSwept: sweptExecutionIds.size }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const baseUrl = process.env.NOCOBASE_BASE_URL
  const token = process.env.NOCOBASE_API_KEY
  if (baseUrl === undefined || baseUrl.length === 0 || token === undefined || token.length === 0) {
    console.error('seed-orders: NOCOBASE_BASE_URL and NOCOBASE_API_KEY must be set (ambient or --env-file=.env)')
    process.exit(1)
  }
  const report = await seedHistoricalOrders(new NocoBaseClient({ baseUrl, token }), baseUrl, token, new Date())
  console.log(`seed-orders: ${JSON.stringify(report)}`)
}
