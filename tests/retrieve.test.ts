import test from 'node:test'
import assert from 'node:assert/strict'
import { bm25Rank, chunkText, retrieve } from '../lib/retrieve.js'
import { transportWith } from './mock-transport.ts'

test('BM25 把含查询词的片段排在前面并保留页码', () => {
  const passages = [
    { attachmentKey: 'A', snippet: 'contrastive learning representation', page: 3, matchType: 'fulltext' as const },
    { attachmentKey: 'A', snippet: 'unrelated text about nothing', page: 7, matchType: 'fulltext' as const },
  ]
  const ranked = bm25Rank(passages, 'contrastive')
  assert.equal(ranked[0].snippet, 'contrastive learning representation')
  assert.equal(ranked[0].page, 3)
})

test('chunkText 按词数切片', () => {
  const chunks = chunkText('a b c d e', 2)
  assert.deepEqual(chunks.map((c) => c.snippet), ['a b', 'c d', 'e'])
})

test('retrieve 从附件 fulltext 提取证据并附加批注页码', async () => {
  const transport = transportWith(async (url) => {
    if (url.pathname.endsWith('/fulltext')) {
      return new Response(JSON.stringify({ content: 'contrastive learning is useful. '.repeat(20) }), { status: 200 })
    }
    return new Response(JSON.stringify([
      { key: 'ANN1', data: { itemType: 'annotation', annotationText: 'contrastive note', page: '5' } },
    ]), { status: 200 })
  })
  const evidence = await retrieve(transport, { key: 'PDF1', query: 'contrastive', maxSnippets: 3 })
  assert.ok(evidence.length > 0)
  assert.ok(evidence.some((e) => e.matchType === 'annotation' && e.page === 5))
  assert.ok(evidence.every((e) => e.attachmentKey === 'PDF1'))
})
