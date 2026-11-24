import test from 'node:test'
import assert from 'node:assert/strict'
import { identityOf, matchReferences } from '../lib/match.js'

test('身份匹配优先级：DOI > arXiv/PMID > 标题+作者+年份', () => {
  const targets = [
    { key: 'T1', doi: '10.1/x' },
    { key: 'T2', extra: 'arXiv:2101.00001' },
    { key: 'T3', title: 'Alpha', authors: ['A'], year: 2020 },
  ]
  const candidates = [
    { key: 'C1', doi: '10.1/x' },
    { key: 'C2', extra: 'arXiv:2101.00001' },
    { key: 'C3', title: 'Alpha', authors: ['A'], year: 2020 },
  ]
  assert.deepEqual(matchReferences(targets, candidates), [
    { key: 'T1', matchedKey: 'C1', method: 'doi' },
    { key: 'T2', matchedKey: 'C2', method: 'arxiv' },
    { key: 'T3', matchedKey: 'C3', method: 'title-author-year' },
  ])
})

test('无法构造身份时返回 none 且不误匹配', () => {
  assert.equal(identityOf({ key: 'X' }), undefined)
  assert.deepEqual(matchReferences([{ key: 'X' }], [{ key: 'Y', doi: '10.2/y' }]), [
    { key: 'X', matchedKey: undefined, method: 'none' },
  ])
})
