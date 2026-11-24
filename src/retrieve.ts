import type { ZoteroTransport } from './transport.js'
import type { EvidenceSnippet } from './types.js'

const K1 = 1.2
const B = 0.75

export function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5]+/).filter((t) => t.length > 1)
}

export function bm25Rank(passages: EvidenceSnippet[], query: string): EvidenceSnippet[] {
  const terms = tokenize(query)
  if (terms.length === 0) return passages
  const docs = passages.map((p) => tokenize(p.snippet))
  const avg = docs.reduce((sum, d) => sum + d.length, 0) / Math.max(docs.length, 1)
  const df = terms.map((term) => docs.filter((d) => d.includes(term)).length)
  const idf = df.map((n) => Math.log(1 + (docs.length - n + 0.5) / (n + 0.5)))
  return passages
    .map((p, i) => {
      const d = docs[i]
      const tf = terms.map((term) => d.filter((t) => t === term).length)
      const score = terms.reduce((sum, _, j) => {
        const f = tf[j]
        return sum + idf[j] * (f * (K1 + 1)) /
          (f + K1 * (1 - B + B * (d.length / Math.max(avg, 1))))
      }, 0)
      return { passage: p, score }
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.passage)
}

export function chunkText(text: string, wordsPerChunk = 200): EvidenceSnippet[] {
  const words = text.split(/\s+/).filter(Boolean)
  const out: EvidenceSnippet[] = []
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    out.push({
      attachmentKey: '',
      snippet: words.slice(i, i + wordsPerChunk).join(' '),
      matchType: 'fulltext',
    })
  }
  return out
}

export async function retrieve(
  transport: ZoteroTransport,
  args: { key: string; query: string; maxSnippets?: number },
): Promise<EvidenceSnippet[]> {
  const { json } = await transport.get(
    `users/0/items/${encodeURIComponent(args.key)}/fulltext`,
  )
  const content = typeof json?.content === 'string' ? json.content : ''
  const chunks = chunkText(content).map((c) => ({ ...c, attachmentKey: args.key }))
  const ranked = bm25Rank(chunks, args.query)
  // 批注自带页码，作为可回溯定位的证据补充；端点不可用时不影响全文证据。
  try {
    const ann = await transport.get(
      `users/0/items/${encodeURIComponent(args.key)}/children`,
      { itemType: 'annotation', limit: 100 },
    )
    for (const row of ann.json) {
      if (
        typeof row?.data?.annotationText === 'string' &&
        row.data.annotationText.toLowerCase().includes(args.query.toLowerCase())
      ) {
        ranked.push({
          attachmentKey: args.key,
          snippet: row.data.annotationText,
          page: row.data.page ? Number(row.data.page) : undefined,
          matchType: 'annotation',
          annotationKey: row.key,
        })
      }
    }
  } catch {
    // 批注端点不可用不影响全文证据
  }
  return ranked.slice(0, Math.min(Math.max(args.maxSnippets ?? 10, 1), 50))
}
