import type { Context } from '@deepseek-ai/cordis'
import type { EvidenceSnippet } from './types.js'
import { ZoteroPatchError } from './errors.js'

export async function rankPassages(
  passages: EvidenceSnippet[],
  query: string,
  modelAvailable: boolean,
): Promise<EvidenceSnippet[]> {
  if (!modelAvailable) {
    throw new ZoteroPatchError(
      '语义模型不可用，不静默回退 BM25',
      'ZOTERO_PATCH_UNEXPECTED',
    )
  }
  // 实际排序模型按部署选择；未启用时上面的显式错误是唯一行为。
  const q = query.toLowerCase()
  return passages.filter((p) => p.snippet.toLowerCase().includes(q))
}

export const name = 'zotero-patch-enrichment'
export const inject: string[] = []

export function apply(ctx: Context, config: { enabled?: boolean } = {}): void {
  ctx.effect(() => {
    ;(ctx as any).zoteroPatchEnrichment = {
      rank: (passages: EvidenceSnippet[], query: string) =>
        rankPassages(passages, query, config.enabled === true),
    }
    return () => {
      delete (ctx as any).zoteroPatchEnrichment
    }
  })
}
