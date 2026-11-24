import test from 'node:test'
import assert from 'node:assert/strict'
import { changes } from '../lib/changes.js'
import { transportWith } from './mock-transport.ts'

test('changes 使用 since 游标并回传 Last-Modified-Version', async () => {
  const transport = transportWith(async (url) => {
    assert.equal(url.searchParams.get('since'), '40')
    return new Response(JSON.stringify([{ key: 'X' }]), {
      status: 200,
      headers: { 'last-modified-version': '44' },
    })
  })
  assert.deepEqual(await changes(transport, { since: 40, limit: 10 }), {
    items: [{ key: 'X' }],
    version: 44,
  })
})
