import test from 'node:test'
import assert from 'node:assert/strict'
import { ZoteroTransport } from '../lib/transport.js'
import { ZoteroPatchError } from '../lib/errors.js'

const HEADERS: Record<string, string> = {
  'zotero-api-version': '3',
  'zotero-schema-version': '44',
  'x-zotero-version': '10.0.8',
  'zotero-server-id': 'TESTSERVER',
}

test('status 解析版本头并回传 server-id，拒绝跨源 baseUrl', async () => {
  const calls: Array<{ url: string; headers: Record<string, string> }> = []
  const fakeFetch = async (input: any, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input))
    calls.push({ url: url.href, headers: (init?.headers ?? {}) as Record<string, string> })
    if (calls.length === 1) {
      return new Response('Nothing to see here.', { status: 200, headers: HEADERS })
    }
    assert.equal((init?.headers as Record<string, string>)['zotero-server-id'], 'TESTSERVER')
    return new Response(
      JSON.stringify([{ key: 'AAAA1111', data: { title: 't', itemType: 'journalArticle' } }]),
      { status: 200, headers: { ...HEADERS, 'total-results': '1' } },
    )
  }
  const t = new ZoteroTransport({ fetchImpl: fakeFetch as typeof fetch })
  const status = await t.status()
  assert.equal(status.reachable, true)
  assert.equal(status.apiVersion, '3')
  assert.equal(status.zoteroVersion, '10.0.8')
  assert.equal(status.schemaVersion, '44')
  assert.equal(status.serverId, 'TESTSERVER')
  const page = await t.get('users/0/items/top', { limit: 3 })
  assert.equal(page.json.length, 1)
  assert.equal(calls[1].url, 'http://127.0.0.1:23119/api/users/0/items/top?limit=3')
  assert.throws(() => new ZoteroTransport({ baseUrl: 'http://evil.example/api' }), ZoteroPatchError)
})

test('412 实例漂移翻译为错误码', async () => {
  const fakeFetch = async () => new Response('mismatch', { status: 412 })
  const t = new ZoteroTransport({ fetchImpl: fakeFetch as typeof fetch })
  await assert.rejects(
    () => t.get('users/0/items'),
    (e: unknown) => e instanceof ZoteroPatchError && e.code === 'ZOTERO_PATCH_SERVER_MISMATCH',
  )
})
