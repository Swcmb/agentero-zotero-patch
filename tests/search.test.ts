import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSearchRequest, filterTop } from '../lib/search.js'

test('默认搜索走 /items/top；everything 走 /items 并带 qmode', () => {
  const req = buildSearchRequest({ query: 'contrastive', limit: 10 })
  assert.equal(req.path, 'users/0/items/top')
  assert.equal(req.params.q, 'contrastive')
  assert.equal(req.params.limit, 10)
  const everything = buildSearchRequest({ query: 'contrastive', qmode: 'everything' })
  assert.equal(everything.path, 'users/0/items')
  assert.equal(everything.params.qmode, 'everything')
})

test('filterTop 只保留顶层父条目，剔除附件与批注', () => {
  const rows = [
    { key: 'A', data: { parentItem: undefined, itemType: 'journalArticle' } },
    { key: 'B', data: { parentItem: 'A', itemType: 'attachment' } },
    { key: 'C', data: { parentItem: undefined, itemType: 'annotation' } },
  ]
  assert.deepEqual(filterTop(rows).map((r: any) => r.key), ['A'])
})
