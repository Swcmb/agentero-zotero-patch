export interface SearchArgs {
  query?: string
  source?: 'zotero'
  tags?: string[]
  collection?: string
  qmode?: 'metadata' | 'everything'
  sort?: 'dateModified' | 'dateAdded' | 'date' | 'title' | 'creator'
  direction?: 'asc' | 'desc'
  offset?: number
  limit?: number
}

export function buildSearchRequest(args: SearchArgs): {
  path: string
  params: Record<string, string | number | undefined>
} {
  const params: Record<string, string | number | undefined> = {
    limit: Math.min(Math.max(args.limit ?? 10, 1), 100),
    ...(args.offset ? { start: Math.max(args.offset, 0) } : {}),
    ...(args.query ? { q: args.query } : {}),
    ...(args.qmode === 'everything' ? { qmode: 'everything' } : {}),
    ...(args.tags?.length ? { tag: args.tags.join(' || ') } : {}),
    ...(args.collection ? { collection: args.collection } : {}),
    ...(args.sort ? { sort: args.sort } : {}),
    ...(args.direction ? { direction: args.direction } : {}),
  }
  return {
    path: args.qmode === 'everything' ? 'users/0/items' : 'users/0/items/top',
    params,
  }
}

const NON_PARENT_TYPES = new Set(['attachment', 'annotation', 'note'])

export function filterTop(rows: any[]): any[] {
  return (Array.isArray(rows) ? rows : []).filter((row) => (
    row?.data?.parentItem === undefined && !NON_PARENT_TYPES.has(row?.data?.itemType)
  ))
}
