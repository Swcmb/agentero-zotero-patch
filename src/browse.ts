import type { ZoteroTransport } from './transport.js'

export type BrowseKind = 'collections' | 'tags' | 'sources'

export async function browse(transport: ZoteroTransport, kind: BrowseKind, limit = 50) {
  const path = kind === 'collections' ? 'users/0/collections'
    : kind === 'tags' ? 'users/0/tags' : ''
  const { json, headers } = await transport.get(path, { limit })
  return {
    source: 'zotero' as const,
    count: json.length,
    items: json,
    total: Number(headers.get('total-results') ?? json.length),
  }
}
