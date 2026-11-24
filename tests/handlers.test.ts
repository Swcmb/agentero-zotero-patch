import test from 'node:test'
import assert from 'node:assert/strict'
import { transportWith } from './mock-transport.ts'
import { researchHandlers } from '../lib/handlers.js'

const ITEMS = [
  { key: 'VH86EE2K', data: { itemType: 'journalArticle', title: 'Paper A', creators: [{ creatorType: 'author', name: 'A B' }], date: '2020', tags: [] } },
  { key: 'ZZ999999', data: { itemType: 'journalArticle', title: 'Paper B', creators: [], date: '2021', tags: [] } },
]

test('researchHandlers.search 归一条目并返回 Total-Results', async () => {
  const transport = transportWith(async (url) => {
    assert.equal(url.pathname, '/api/users/0/items/top')
    assert.equal(url.searchParams.get('q'), 'paper')
    return new Response(JSON.stringify(ITEMS), {
      status: 200,
      headers: { 'total-results': '2' },
    })
  })
  const result = await researchHandlers.search(transport, { query: 'paper' })
  assert.equal(result.source, 'zotero')
  assert.equal(result.count, 2)
  assert.equal(result.total, 2)
  assert.equal(result.items[0].sourceId, 'VH86EE2K')
  assert.deepEqual(result.items[0].authors, ['A B'])
})

test('researchHandlers.getBatch 逐条报告失败', async () => {
  const transport = transportWith(async (url) => {
    const key = url.pathname.split('/').pop()
    if (key === 'VH86EE2K') return new Response(JSON.stringify(ITEMS[0]), { status: 200 })
    return new Response('not found', { status: 404 })
  })
  const result = await researchHandlers.getBatch(transport, { keys: ['VH86EE2K', 'MISSING'] })
  assert.equal(result.length, 2)
  assert.equal(result[0].ok, true)
  assert.equal(result[0].item?.title, 'Paper A')
  assert.equal(result[1].ok, false)
  assert.match(result[1].error ?? '', /404/)
})

test('researchHandlers.children 按 kind 过滤', async () => {
  const transport = transportWith(async () => new Response(JSON.stringify([
    { key: 'P1', data: { itemType: 'attachment', filename: 'a.pdf', parentItem: 'X' } },
    { key: 'N1', data: { itemType: 'note', note: 'n', parentItem: 'X' } },
  ]), { status: 200 }))
  const result = await researchHandlers.children(transport, { key: 'X', kind: 'attachment' })
  assert.equal(result.count, 1)
  assert.equal(result.items[0].key, 'P1')
})
