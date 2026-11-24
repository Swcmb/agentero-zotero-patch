export interface MatchTarget {
  key: string
  doi?: string
  extra?: string
  title?: string
  authors?: string[]
  year?: number
}

export function identityOf(ref: MatchTarget): { method: string; value: string } | undefined {
  if (ref.doi) return { method: 'doi', value: ref.doi.toLowerCase().trim() }
  const arxiv = /(?:arXiv:)?(\d{4}\.\d{4,5})/i.exec(ref.extra ?? '')
  if (arxiv) return { method: 'arxiv', value: arxiv[1] }
  const pmid = /PMID:\s*(\d+)/i.exec(ref.extra ?? '')
  if (pmid) return { method: 'pmid', value: pmid[1] }
  if (ref.title && ref.authors?.length && ref.year) {
    return {
      method: 'title-author-year',
      value: `${ref.title.toLowerCase().trim()}|${ref.authors.join(';').toLowerCase()}|${ref.year}`,
    }
  }
  return undefined
}

export function matchReferences(targets: MatchTarget[], candidates: MatchTarget[]) {
  const index = new Map<string, string>()
  for (const c of candidates) {
    const id = identityOf(c)
    if (id) index.set(`${id.method}:${id.value}`, c.key)
  }
  return targets.map((t) => {
    const id = identityOf(t)
    const matchedKey = id ? index.get(`${id.method}:${id.value}`) : undefined
    return { key: t.key, matchedKey, method: id?.method ?? 'none' }
  })
}
