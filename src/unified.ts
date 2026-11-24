import type { PaperReference, SourceKind } from './types.js'
import { identityOf } from './match.js'
import { ZoteroPatchError } from './errors.js'

/** 跨库去重展示：按 DOI/强标识/标题+作者+年份合并，但保留各自 source 与 sourceId。 */
export function unifyReferences(refs: PaperReference[]): PaperReference[] {
  const seen = new Set<string>()
  const out: PaperReference[] = []
  for (const ref of refs) {
    const id = identityOf({
      key: ref.sourceId,
      doi: ref.doi,
      title: ref.title,
      authors: ref.authors,
      year: ref.year,
    })
    const key = id ? `${id.method}:${id.value}` : `${ref.source}:${ref.sourceId}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ref)
  }
  return out
}

export async function routeSource<T>(
  source: SourceKind | undefined,
  zoteroCall: () => Promise<T>,
  agenteroCall?: () => Promise<T>,
): Promise<T> {
  if (source === undefined || source === 'zotero') return zoteroCall()
  if (source === 'agentero') {
    if (!agenteroCall) {
      throw new ZoteroPatchError(
        'AGENTERO_UNAVAILABLE: agentero 服务不可用',
        'ZOTERO_PATCH_AGENTERO_UNAVAILABLE',
      )
    }
    return agenteroCall()
  }
  throw new ZoteroPatchError(`未知 source: ${source}`, 'ZOTERO_PATCH_UNEXPECTED')
}

/** 跨库搜索信封：省略 source 且 agentero 可用时合并两库并去重。 */
export async function routeEnvelopes(
  source: SourceKind | undefined,
  zoteroCall: () => Promise<{ source: SourceKind; count: number; items: PaperReference[]; total?: number }>,
  agenteroCall?: () => Promise<{ source: SourceKind; count: number; items: PaperReference[]; total?: number }>,
) {
  if (source === 'agentero') return routeSource(source, zoteroCall, agenteroCall)
  if (source === 'zotero' || !agenteroCall) return zoteroCall()
  const [z, a] = await Promise.all([zoteroCall(), agenteroCall()])
  const items = unifyReferences([...z.items, ...a.items])
  return {
    source: 'zotero' as SourceKind,
    count: items.length,
    items,
    total: (z.total ?? z.count) + (a.total ?? a.count),
  }
}
