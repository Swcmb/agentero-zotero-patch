import test from 'node:test'
import assert from 'node:assert/strict'
import { assertEgressAllowed } from '../lib/scholarly.js'
import { rankPassages } from '../lib/enrichment.js'
import { ZoteroPatchError } from '../lib/errors.js'

test('外部检索默认拒绝未启用与未授权域名', () => {
  assert.throws(() => assertEgressAllowed('https://api.openalex.org/works', false), ZoteroPatchError)
  assert.throws(() => assertEgressAllowed('https://evil.example', true), (e: unknown) =>
    e instanceof ZoteroPatchError && e.code === 'ZOTERO_PATCH_EGRESS_DENIED')
  assert.doesNotThrow(() => assertEgressAllowed('https://api.openalex.org/works', true))
})

test('语义模型缺失时显式报错，不静默回退 BM25', async () => {
  const passages = [{ attachmentKey: 'A', snippet: 'contrastive learning', matchType: 'fulltext' as const }]
  await assert.rejects(
    () => rankPassages(passages, 'contrastive', false),
    (e: unknown) => e instanceof ZoteroPatchError && /不静默回退/.test(e.message),
  )
  const ranked = await rankPassages(passages, 'contrastive', true)
  assert.equal(ranked.length, 1)
})
