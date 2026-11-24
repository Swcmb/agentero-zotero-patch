import type { ZoteroTransport } from './transport.js'
import { buildSearchRequest, filterTop } from './search.js'
import { getItem, getBatch } from './detail.js'
import { browse } from './browse.js'
import { children } from './children.js'
import { normalizeItem } from './normalize.js'
import type { PaperReference } from './types.js'
import { retrieve } from './retrieve.js'
import { exportCitation, type ExportFormat } from './export.js'
import { matchReferences, type MatchTarget } from './match.js'
import { changes } from './changes.js'
import { getAgenteroAdapter } from './bridge.js'
import { routeEnvelopes, routeSource } from './unified.js'
import { ZoteroPatchError } from './errors.js'

// DSH 的 value schema DSL 不支持 minimum/maximum 等约束关键字，因此数值范围
// 改在纯函数层做运行时校验。参数名 -> [最小值, 最大值]。
const NUM_RANGES: Record<string, Array<[key: string, min: number, max: number]>> = {
  search: [['limit', 1, 100], ['offset', 0, Number.MAX_SAFE_INTEGER]],
  browse: [['limit', 1, 100]],
  retrieve: [['maxSnippets', 1, 50]],
  changes: [['since', 0, Number.MAX_SAFE_INTEGER], ['limit', 1, 100]],
}

function assertRanges(tool: string, args: any): void {
  for (const [key, min, max] of NUM_RANGES[tool] ?? []) {
    const value = args?.[key]
    if (value === undefined || value === null) continue
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      throw new ZoteroPatchError(
        `${tool}.${key} 必须是 ${min}-${max} 之间的整数`,
        'ZOTERO_PATCH_BAD_ARG',
      )
    }
  }
}

// 同理迁移原 schema 的 minItems/maxItems 数组长度约束。
const ARRAY_RANGES: Record<string, Array<[key: string, min: number, max: number]>> = {
  getBatch: [['keys', 1, 50]],
  export: [['keys', 1, 50]],
  matchReferences: [['targets', 1, Number.MAX_SAFE_INTEGER]],
}

function assertArrayRanges(tool: string, args: any): void {
  for (const [key, min, max] of ARRAY_RANGES[tool] ?? []) {
    const value = args?.[key]
    if (value === undefined || value === null) continue
    if (!Array.isArray(value) || value.length < min || value.length > max) {
      throw new ZoteroPatchError(
        `${tool}.${key} 必须包含 ${min}-${max} 个元素`,
        'ZOTERO_PATCH_BAD_ARG',
      )
    }
  }
}

/** 纯函数业务层：不 import 任何 DSH 包，便于用 node:test 直接测试。 */
export const researchHandlers = {
  async search(transport: ZoteroTransport, args: any) {
    assertRanges('search', args)
    const adapter = getAgenteroAdapter()
    const zoteroCall = async () => {
      const { path, params } = buildSearchRequest(args)
      const { json, headers } = await transport.get(path, params)
      const rows = args.qmode === 'everything' ? filterTop(json) : json
      const items: PaperReference[] = rows.map((raw: any) => normalizeItem(raw))
      return {
        source: 'zotero' as const,
        count: items.length,
        items,
        total: Number(headers.get('total-results') ?? items.length),
      }
    }
    const agenteroCall = adapter ? async () => {
      const rows = await adapter.search(args)
      const items: PaperReference[] = rows.map((raw: any) => normalizeItem(raw, 'agentero'))
      return { source: 'agentero' as const, count: items.length, items, total: items.length }
    } : undefined
    return routeEnvelopes(args.source, zoteroCall, agenteroCall)
  },
  async get(transport: ZoteroTransport, args: any) {
    const adapter = getAgenteroAdapter()
    return routeSource(
      args.source,
      () => getItem(transport, args.key),
      adapter ? async () => normalizeItem(await adapter.get(args), 'agentero') : undefined,
    )
  },
  async getBatch(transport: ZoteroTransport, args: any) {
    assertArrayRanges('getBatch', args)
    return getBatch(transport, args.keys)
  },
  async browse(transport: ZoteroTransport, args: any) {
    assertRanges('browse', args)
    return browse(transport, args.kind, args.limit ?? 50)
  },
  async children(transport: ZoteroTransport, args: any) {
    return children(transport, args.key, args.kind)
  },
  async retrieve(transport: ZoteroTransport, args: any) {
    assertRanges('retrieve', args)
    const evidence = await retrieve(transport, args)
    return { source: 'zotero' as const, count: evidence.length, items: evidence }
  },
  async export(transport: ZoteroTransport, args: any) {
    assertArrayRanges('export', args)
    const format: ExportFormat = args.format ?? 'bibtex'
    const items: string[] = []
    for (const key of args.keys as string[]) {
      const ref = await getItem(transport, key)
      items.push(exportCitation(ref, format))
    }
    return { source: 'zotero' as const, count: items.length, items, format }
  },
  async matchReferences(transport: ZoteroTransport, args: any) {
    assertArrayRanges('matchReferences', args)
    const targets: MatchTarget[] = args.targets ?? []
    let candidates: MatchTarget[] = args.candidates
    if (!candidates) {
      const { json } = await transport.get('users/0/items/top', { limit: 100 })
      candidates = json.map((raw: any) => {
        const ref = normalizeItem(raw)
        return { key: ref.sourceId, doi: ref.doi, title: ref.title, authors: ref.authors, year: ref.year, extra: raw?.data?.extra }
      })
    }
    return { source: 'zotero' as const, count: targets.length, items: matchReferences(targets, candidates) }
  },
  async changes(transport: ZoteroTransport, args: any) {
    assertRanges('changes', args)
    const result = await changes(transport, args)
    return { source: 'zotero' as const, count: result.items.length, ...result }
  },
}
