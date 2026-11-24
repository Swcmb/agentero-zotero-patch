import test from 'node:test'
import assert from 'node:assert/strict'
import { createSourceLedger } from '../lib/sources.js'

test('折叠幂等：同一 event id 不产生重复记录，workspace 保留来源标识', () => {
  const ledger = createSourceLedger()
  const event = {
    id: 'e1',
    kind: 'read' as const,
    source: 'zotero' as const,
    sourceId: 'VH86EE2K',
    query: 'contrastive',
  }
  assert.equal(ledger.fold(event), true)
  assert.equal(ledger.fold(event), false)
  const ws = ledger.workspace()
  assert.equal(ws.totalSources, 1)
  assert.equal(ws.sources[0].source, 'zotero')
  assert.equal(ws.sources[0].sourceId, 'VH86EE2K')
  assert.deepEqual(ws.queries, ['contrastive'])
})

test('导出事件记录格式，不同来源分别计数', () => {
  const ledger = createSourceLedger()
  ledger.fold({ id: 'e2', kind: 'export', source: 'zotero', sourceId: 'A', exportFormat: 'bibtex' })
  ledger.fold({ id: 'e3', kind: 'read', source: 'agentero', sourceId: 'A' })
  const ws = ledger.workspace()
  assert.deepEqual(ws.exports, ['bibtex'])
  assert.equal(ws.totalSources, 2)
})
