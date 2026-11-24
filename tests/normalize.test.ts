import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeItem, normalizeChildren } from '../lib/normalize.js'

test('normalizeItem 保留来源标识与原生 ID，解析作者/年份/标签', () => {
  const ref = normalizeItem({
    key: 'VH86EE2K',
    data: {
      itemType: 'journalArticle',
      title: 'Big Self-Supervised Models',
      creators: [
        { creatorType: 'author', firstName: 'Ting', lastName: 'Chen', name: '' },
        { creatorType: 'editor', name: 'Editor X' },
      ],
      date: '2020-06-01',
      DOI: '10.1109/CVPR.2020.00981',
      abstractNote: 'abstract',
      url: 'https://example.test/p',
      tags: [{ tag: 'ssl' }],
      collections: ['ABC123'],
    },
  })
  assert.equal(ref.source, 'zotero')
  assert.equal(ref.sourceId, 'VH86EE2K')
  assert.deepEqual(ref.authors, ['Ting Chen'])
  assert.equal(ref.year, 2020)
  assert.equal(ref.doi, '10.1109/CVPR.2020.00981')
  assert.deepEqual(ref.tags, ['ssl'])
  assert.deepEqual(ref.collectionKeys, ['ABC123'])
  assert.equal(ref.parentKey, undefined)
})

test('normalizeChildren 归一附件/笔记/批注并保留页码', () => {
  const rows = normalizeChildren([
    { key: 'P1', data: { itemType: 'attachment', filename: 'a.pdf', contentType: 'application/pdf', parentItem: 'X' } },
    { key: 'N1', data: { itemType: 'note', note: '<p>note</p>', parentItem: 'X' } },
    { key: 'A1', data: { itemType: 'annotation', annotationText: 'quote', page: '3', parentItem: 'P1' } },
  ])
  assert.equal(rows[0].title, 'a.pdf')
  assert.equal(rows[0].contentType, 'application/pdf')
  assert.equal(rows[1].note, '<p>note</p>')
  assert.equal(rows[2].page, '3')
})
