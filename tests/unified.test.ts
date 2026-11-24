import test from 'node:test'
import assert from 'node:assert/strict'
import { unifyReferences, routeSource, routeEnvelopes } from '../lib/unified.js'
import { ZoteroPatchError } from '../lib/errors.js'

const zoteroRef = {
  source: 'zotero' as const, sourceId: 'Z1', title: 'T', itemType: 'journalArticle',
  authors: ['A'], year: 2020, doi: '10.1/x', tags: [], collectionKeys: [],
}
const agenteroRef = {
  source: 'agentero' as const, sourceId: 'A1', title: 'T', itemType: 'journalArticle',
  authors: ['A'], year: 2020, doi: '10.1/x', tags: [], collectionKeys: [],
}

test('跨库展示去重但保留各自来源与原生 ID', () => {
  const out = unifyReferences([zoteroRef, agenteroRef])
  assert.equal(out.length, 1)
  assert.equal(out[0].source, 'zotero')
  assert.equal(out[0].sourceId, 'Z1')
})

test('source=agentero 且 agentero 不可用时显式报错，不静默改走 zotero', async () => {
  await assert.rejects(
    () => routeSource('agentero', async () => 'zotero', undefined),
    (e: unknown) => e instanceof ZoteroPatchError &&
      e.code === 'ZOTERO_PATCH_AGENTERO_UNAVAILABLE',
  )
})

test('省略 source 且两源可用时合并去重', async () => {
  const env = await routeEnvelopes(
    undefined,
    async () => ({ source: 'zotero' as const, count: 1, items: [zoteroRef], total: 1 }),
    async () => ({ source: 'agentero' as const, count: 1, items: [agenteroRef], total: 1 }),
  )
  assert.equal(env.count, 1)
  assert.equal(env.items[0].sourceId, 'Z1')
})
