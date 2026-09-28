// W3-B2 probe: confirm child-collection names, FK columns, and column fields
// for the 12 subtable pages. Read-only; prints one line per child collection.
const base = 'http://127.0.0.1:13000'

const signIn = await fetch(`${base}/api/auth:signIn`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
}).then(r => r.json())
const token = signIn?.data?.token

const candidates = [
  'pur_order_lines', 'pur_request_lines', 'pur_rfq_suppliers', 'pur_quotes',
  'so_order_lines', 'mps_plan_items', 'mfg_bom_lines', 'mfg_bom_operations',
  'qm_inspection_readings', 'wms_receipt_lines', 'wms_shipment_lines',
  'wms_count_lines', 'mfg_material_issue_lines', 'srm_certificates',
  'srm_audit_records', 'srm_score_cards', 'mps_plans', 'wms_counts',
  'mfg_material_issues', 'wms_receipts', 'wms_shipments', 'qm_inspections',
  'pur_orders', 'pur_requests', 'pur_rfqs', 'so_orders', 'mfg_boms', 'srm_suppliers',
]
const out = []
for (const name of candidates) {
  const res = await fetch(`${base}/api/collections/${name}`, { headers: { authorization: `Bearer ${token}` } })
  if (res.status !== 200) { out.push(`${name}: MISSING`); continue }
  const fields = await fetch(`${base}/api/fields:list?pageSize=200&filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: name } }))}`, { headers: { authorization: `Bearer ${token}` } }).then(r => r.json())
  const list = (fields?.data ?? []).map(f => `${f.name}:${f.type}`).join(' ')
  out.push(`${name}: ${list}`)
}
console.log(out.join('\n'))
