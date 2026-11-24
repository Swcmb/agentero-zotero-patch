import test from 'node:test'
import assert from 'node:assert/strict'
import { transportWith } from './mock-transport.ts'
import { researchHandlers } from '../lib/handlers.js'
import { ZoteroPatchError } from '../lib/errors.js'

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

// schema DSL 不支持 minimum/maximum，范围约束下沉到运行时后必须仍然生效。
test('数值参数在运行时拒绝越界值', async () => {
  const transport = transportWith(async () => new Response(JSON.stringify([]), { status: 200 }))
  const badArg = (e: unknown) => e instanceof ZoteroPatchError && e.code === 'ZOTERO_PATCH_BAD_ARG'
  await assert.rejects(() => researchHandlers.search(transport, { limit: 0 }), badArg)
  await assert.rejects(() => researchHandlers.search(transport, { limit: 101 }), badArg)
  await assert.rejects(() => researchHandlers.search(transport, { offset: -1 }), badArg)
  await assert.rejects(() => researchHandlers.browse(transport, { limit: 500 }), badArg)
  await assert.rejects(() => researchHandlers.retrieve(transport, { maxSnippets: 0 }), badArg)
  await assert.rejects(() => researchHandlers.changes(transport, { since: -1 }), badArg)
  await assert.rejects(() => researchHandlers.getBatch(transport, { keys: [] }), badArg)
  await assert.rejects(() => researchHandlers.export(transport, { keys: [] }), badArg)
  await assert.rejects(() => researchHandlers.matchReferences(transport, { targets: [] }), badArg)
  // 合法边界仍然通过（到达 transport，返回空结果）。
  const ok = await researchHandlers.search(transport, { limit: 100, offset: 0 })
  assert.equal(ok.count, 0)
})
