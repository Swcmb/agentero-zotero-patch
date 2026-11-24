import type { Context } from '@deepseek-ai/cordis'
import { ZoteroPatchError } from './errors.js'

const ALLOWED_HOSTS = new Set([
  'api.openalex.org',
  'api.crossref.org',
  'export.arxiv.org',
  'api.semanticscholar.org',
])

export function assertEgressAllowed(url: string, enabled: boolean): void {
  if (!enabled) {
    throw new ZoteroPatchError('外部检索未启用', 'ZOTERO_PATCH_EGRESS_DENIED')
  }
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    throw new ZoteroPatchError('非法 URL', 'ZOTERO_PATCH_BAD_PATH')
  }
  if (!ALLOWED_HOSTS.has(host)) {
    throw new ZoteroPatchError(`未授权的外网目标 ${host}`, 'ZOTERO_PATCH_EGRESS_DENIED')
  }
}

export const name = 'zotero-patch-scholarly'
export const inject: string[] = []

export function apply(ctx: Context, config: { enabled?: boolean } = {}): void {
  ctx.provide('zoteroPatchScholarly', {
    assertEgressAllowed: (url: string) => assertEgressAllowed(url, config.enabled === true),
  })
}
