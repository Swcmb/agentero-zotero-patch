import type { ZoteroTransport } from './transport.js'
import { normalizeChildren } from './normalize.js'

export type ChildKind = 'attachment' | 'note' | 'annotation'

export async function children(transport: ZoteroTransport, key: string, kind?: ChildKind) {
  if (kind === 'annotation') {
    const { json } = await transport.get(
      `users/0/items/${encodeURIComponent(key)}/children`,
      { itemType: 'annotation', limit: 100 },
    )
    return { source: 'zotero' as const, count: json.length, items: normalizeChildren(json) }
  }
  const { json } = await transport.get(
    `users/0/items/${encodeURIComponent(key)}/children`,
    { limit: 100 },
  )
  const rows = normalizeChildren(json).filter((row) => !kind || row.itemType === kind)
  return { source: 'zotero' as const, count: rows.length, items: rows }
}
