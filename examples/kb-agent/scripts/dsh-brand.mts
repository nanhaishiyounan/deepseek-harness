/**
 * DSH brand constants shared by the NocoBase brand scripts
 * (nocobase-n25-brand.mts, nocobase-portal-deploy.mts, setup-nocobase.mts
 * verify): the whitelabel site title and the byte-compared overlay rule.
 */
import { copyFileSync, existsSync, readFileSync } from 'node:fs'

/** The DSH site name the entry titles and systemSettings carry. */
export const BRAND_TITLE = 'DSH食品业务平台'

/** Byte-compared overlay so rebuilds restore the upstream assets and reruns reapply ours. */
export function overlayFile(source: string, target: string): boolean {
  if (existsSync(target) && readFileSync(target).equals(readFileSync(source))) return false
  copyFileSync(source, target)
  return true
}
