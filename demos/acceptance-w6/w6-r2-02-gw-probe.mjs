#!/usr/bin/env node
/**
 * W6-R2 C-2 negative probe — the vfy-w6b2-perm-probe path, replayed against
 * the verb-split gateway: keeper's token must no longer write any wfl_alerts
 * row (the exact S3 forgery the verifier reproduced), the shared wfl_ reads
 * stay open, wfl_alerts reads are row-scoped (anonymous refused), and the
 * alert actions ride nocobase.alertAct end to end (claim ok for a routed
 * row, refusal surfaced for a non-routed one, claimant resolve ok).
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const GW = 'http://127.0.0.1:3080'
const OUT = fileURLToPath(new URL('./w6-r2-02-gw-verb-split.log', import.meta.url))

const env = readFileSync(new URL('../../platform/nocobase/.env', import.meta.url), 'utf8')
const envOf = (key) => env.split('\n').map(l => l.trim()).find(l => l.startsWith(`${key}=`))?.slice(key.length + 1)
const psql = (sql) => {
  const run = spawnSync('psql', [
    '-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres',
    '-d', envOf('DB_DATABASE') ?? envOf('DB_NAME') ?? 'nocobase', '-t', '-A', '-c', sql,
  ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' } })
  if (run.status !== 0) throw new Error(`psql failed: ${run.stderr}`)
  return (run.stdout ?? '').trim()
}

let seq = 0
const rpc = async (method, payload) => {
  const response = await fetch(`${GW}/api/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `r2-${String(++seq)}`, method, payload }),
  })
  return await response.json()
}

const lines = []
const say = (line) => { lines.push(line); console.log(line) }
const brief = (wire) => JSON.stringify(wire.result?.ok === true ? { ok: true, value: wire.result.value } : { ok: false, error: wire.result?.error })

// The verifier's exact target class: a resolved, engine-owned row keeper is not routed to.
const foreignRow = psql("SELECT id || '|' || COALESCE(notify_users::text,'[]') FROM wfl_alerts WHERE status='resolved' AND NOT (notify_users::jsonb ? 'keeper') ORDER BY id LIMIT 1;")
const [foreignId, foreignUsers] = foreignRow.split('|')
const myExpiry = psql("SELECT id FROM wfl_alerts WHERE rule_type='expiry' AND status='open' AND notify_users::jsonb ? 'keeper' ORDER BY id LIMIT 1;")
const arRow = psql("SELECT id FROM wfl_alerts WHERE rule_type='ar_overdue' AND status='open' AND NOT (notify_users::jsonb ? 'keeper') ORDER BY id LIMIT 1;")

say(`# W6-R2 C-2 verb-split probe（${new Date().toISOString()}）`)
say(`# 目标行 foreign=${foreignId}（notify_users=${foreignUsers}，keeper 不在路由）；keeper 路由的效期行=${myExpiry}；非路由账期行=${arRow}`)

say('\n== [S1] keeper 登录 ==')
const signedIn = await rpc('nocobase.signIn', { account: 'keeper', password: 'Keeper#2026' })
const token = signedIn.result?.value?.token
say(`signIn -> ${brief(signedIn)}`)

say('\n== [S2] 复现 perm-probe 路径：keeper token -> nocobase.update wfl_alerts#${foreignId} status resolved->open（修复后必须拒）==')
const forged = await rpc('nocobase.update', { collection: 'wfl_alerts', id: Number(foreignId), values: { status: 'open' }, authToken: token })
say(`update -> ${brief(forged)}`)
say(`psql 写后复核 status=${psql(`SELECT status FROM wfl_alerts WHERE id = ${foreignId};`)}（应保持 resolved）`)

say('\n== [S3] 回归：共享 wfl_ 读面保持放行（keeper list wfl_approval_todos）==')
const todos = await rpc('nocobase.list', { collection: 'wfl_approval_todos', filter: [{ field: 'status', op: 'eq', value: 'open' }], page: 1, page_size: 5, authToken: token })
say(`list todos -> ${brief(todos)}`)

say('\n== [S4] IDOR 读面：keeper list wfl_alerts（行级 scope——只回路由/认领行，finance 行不越权可见）==')
const myRows = await rpc('nocobase.list', { collection: 'wfl_alerts', filter: [{ field: 'status', op: 'in', value: ['open', 'acknowledged'] }], page: 1, page_size: 100, sort: ['-id'], authToken: token })
const rows = myRows.result?.value?.rows ?? []
const leaked = rows.filter(r => !(Array.isArray(r.notify_users) && r.notify_users.includes('keeper')) && r.owner !== 'keeper')
say(`list wfl_alerts -> ok=${String(myRows.result?.ok)} count=${String(rows.length)} 越权行数=${String(leaked.length)}（应 0）`)
say(`含账期行（finance 域）=${String(rows.some(r => r.rule_type === 'ar_overdue'))}（keeper 读面应无账期行）`)

say('\n== [S5] IDOR 读面：匿名 list/get wfl_alerts（应拒）==')
const anonList = await rpc('nocobase.list', { collection: 'wfl_alerts', page: 1, page_size: 5 })
say(`anonymous list -> ${brief(anonList)}`)
const anonGet = await rpc('nocobase.get', { collection: 'wfl_alerts', id: Number(foreignId) })
say(`anonymous get  -> ${brief(anonGet)}`)

say('\n== [S6] alertAct 正向：keeper 认领自己名下效期行 #'+myExpiry+'（token 身份 → 引擎单一入口）==')
const claim = await rpc('nocobase.alertAct', { id: Number(myExpiry), action: 'claim', authToken: token })
say(`claim  -> ${brief(claim)}`)
say(`psql owner/status=${psql(`SELECT owner || '|' || status FROM wfl_alerts WHERE id = ${myExpiry};`)}（应 keeper|acknowledged）`)

say('\n== [S7] alertAct 负向：keeper 认领非路由账期行 #'+arRow+'（引擎白名单 403 透出）==')
const refuse = await rpc('nocobase.alertAct', { id: Number(arRow), action: 'claim', authToken: token })
say(`claim  -> ${brief(refuse)}`)

say('\n== [S8] alertAct 关闭：认领人 keeper resolve #'+myExpiry+'（网关路径完整闭环）==')
const close = await rpc('nocobase.alertAct', { id: Number(myExpiry), action: 'resolve', note: 'W6-R2 网关探针关闭', authToken: token })
say(`resolve-> ${brief(close)}`)
say(`psql 终态=${psql(`SELECT status || '|' || resolved_by FROM wfl_alerts WHERE id = ${myExpiry};`)}（应 resolved|keeper）`)

say('\n== 判定 ==')
const verdict = forged.result?.ok === false && forged.result.error?.code === 'nocobase-collection-forbidden'
  && todos.result?.ok === true && leaked.length === 0 && rows.every(r => r.rule_type !== 'ar_overdue')
  && anonList.result?.ok === false && claim.result?.ok === true && claim.result.value?.user === 'keeper'
  && refuse.result?.ok === false && refuse.result.error?.code === 'nocobase-alert-refused'
  && close.result?.ok === true
say(verdict ? 'W6-R2-02 PASS：update×wfl_ 拒绝 + wfl_ 读回归 + 行级 scope + alertAct 闭环全符合' : 'W6-R2-02 FAIL（见上各行）')
if (!verdict) process.exitCode = 1

await (await import('node:fs/promises')).writeFile(OUT, `${lines.join('\n')}\n`)
