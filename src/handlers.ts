import type { ZoteroTransport } from './transport.js'
import { buildSearchRequest, filterTop } from './search.js'
import { getItem, getBatch } from './detail.js'
import { browse } from './browse.js'
import { children } from './children.js'
import { normalizeItem } from './normalize.js'
import type { PaperReference } from './types.js'

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
}
