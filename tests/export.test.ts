import test from 'node:test'
import assert from 'node:assert/strict'
import { exportCitation } from '../lib/export.js'

const ref = {
  source: 'zotero' as const,
  sourceId: 'VH86EE2K',
  title: 'T',
  itemType: 'journalArticle',
  authors: ['A B'],
  year: 2020,
  doi: '10.1/x',
  tags: [],
  collectionKeys: [],
}

test('导出格式包含来源标识与原生 ID', () => {
  assert.match(exportCitation(ref, 'bibtex'), /@article\{VH86EE2K/)
  assert.match(exportCitation(ref, 'biblatex'), /doi = \{10\.1\/x\}/)
  assert.match(exportCitation(ref, 'ris'), /TY  - JOUR/)
  assert.match(exportCitation(ref, 'citation'), /A B \(2020\)/)
  assert.match(exportCitation(ref, 'csljson'), /"id":"VH86EE2K"/)
  assert.equal(JSON.parse(exportCitation(ref, 'csljson')).source, 'zotero')
})
