/**
 * W4-R1 C2 leg-4: compare the client-facing ACL snapshots (roles:check,
 * app:getInfo) between admin and qc_inspector — with tree, fields, rows all
 * byte-identical for both roles, the zero-column rendering must key off the
 * client ACL state.
 *
 * Usage: node --import tsx/esm examples/kb-agent/scripts/w4-r1-qc-roles.mts
 */
import { call, signInWithRetry } from './nocobase-flow-page-lib.mts'

async function signIn(account: string, password: string): Promise<string> {
  const payload = await call('', 'POST', '/api/auth:signIn', { account, password })
  const token = payload?.data?.token
  if (typeof token !== 'string' || token.length === 0) throw new Error(`signIn ${account} returned no token`)
  return token
}

for (const [who, token] of [['admin', await signInWithRetry()], ['member', await signIn('qc_inspector', 'Qc#2026')]] as const) {
  const roles = await call(token, 'GET', '/api/roles:check')
  const info = await call(token, 'GET', '/api/app:getInfo')
  const rolesBody = JSON.stringify(roles ?? {})
  const infoBody = JSON.stringify(info ?? {})
  console.log(`${who}: roles:check bytes=${String(rolesBody.length)} app:getInfo bytes=${String(infoBody.length)}`)
  console.log(`  roles:check: ${rolesBody.slice(0, 600)}`)
  const infoParsed = (info ?? {}) as Record<string, any>
  console.log(`  app:getInfo keys: ${Object.keys(infoParsed?.data ?? infoParsed).join(',')}`)
  const acl = (infoParsed?.data ?? infoParsed)?.acl
  if (acl !== undefined) {
    console.log(`  acl: ${JSON.stringify(acl).slice(0, 600)}`)
  }
}
