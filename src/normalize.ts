import type { PaperReference, SourceKind } from './types.js'

export function yearOf(date: unknown): number | undefined {
  if (typeof date !== 'string') return undefined
  const match = /(18|19|20)\d{2}/.exec(date)
  return match ? Number(match[0]) : undefined
}

export function normalizeItem(raw: any, source: SourceKind = 'zotero'): PaperReference {
  const data = raw?.data ?? {}
  const creators: any[] = Array.isArray(data.creators) ? data.creators : []
  const authors = creators
    .filter((c) => c?.creatorType === 'author')
    .map((c) => (
      typeof c.name === 'string' && c.name
        ? c.name
        : [c.firstName, c.lastName].filter(Boolean).join(' ')
    ))
    .filter((name: string) => name.length > 0)
  return {
    source,
    sourceId: String(raw?.key ?? ''),
    title: String(data.title ?? ''),
    itemType: String(data.itemType ?? 'document'),
    authors,
    year: yearOf(data.date),
    doi: data.DOI ? String(data.DOI) : undefined,
    abstract: typeof data.abstractNote === 'string' && data.abstractNote ? data.abstractNote : undefined,
    url: data.url ? String(data.url) : undefined,
    tags: (Array.isArray(data.tags) ? data.tags : [])
      .map((t: any) => String(t?.tag ?? ''))
      .filter(Boolean),
    collectionKeys: (Array.isArray(data.collections) ? data.collections : []).map(String),
    parentKey: data.parentItem ? String(data.parentItem) : undefined,
  }
}

export function normalizeChildren(raws: any[]): any[] {
  return (Array.isArray(raws) ? raws : []).map((raw) => {
    const data = raw?.data ?? {}
    return {
      key: String(raw?.key ?? ''),
      itemType: String(data.itemType ?? ''),
      title: String(data.title ?? data.filename ?? ''),
      parentKey: data.parentItem ? String(data.parentItem) : undefined,
      contentType: data.contentType ? String(data.contentType) : undefined,
      note: typeof data.note === 'string' ? data.note : undefined,
      annotationText: typeof data.annotationText === 'string' ? data.annotationText : undefined,
      page: data.page ? String(data.page) : undefined,
    }
  })
}
