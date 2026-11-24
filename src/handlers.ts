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

/** 纯函数业务层：不 import 任何 DSH 包，便于用 node:test 直接测试。 */
export const researchHandlers = {
  async search(transport: ZoteroTransport, args: any) {
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
  },
  async get(transport: ZoteroTransport, args: any) {
    return getItem(transport, args.key)
  },
  async getBatch(transport: ZoteroTransport, args: any) {
    return getBatch(transport, args.keys)
  },
  async browse(transport: ZoteroTransport, args: any) {
    return browse(transport, args.kind, args.limit ?? 50)
  },
  async children(transport: ZoteroTransport, args: any) {
    return children(transport, args.key, args.kind)
  },
  async retrieve(transport: ZoteroTransport, args: any) {
    const evidence = await retrieve(transport, args)
    return { source: 'zotero' as const, count: evidence.length, items: evidence }
  },
  async export(transport: ZoteroTransport, args: any) {
    const format: ExportFormat = args.format ?? 'bibtex'
    const items: string[] = []
    for (const key of args.keys as string[]) {
      const ref = await getItem(transport, key)
      items.push(exportCitation(ref, format))
    }
    return { source: 'zotero' as const, count: items.length, items, format }
  },
  async matchReferences(transport: ZoteroTransport, args: any) {
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
    const result = await changes(transport, args)
    return { source: 'zotero' as const, count: result.items.length, ...result }
  },
}
