import { ZoteroTransport } from '../lib/transport.js'

export function fakeResponse(body: unknown, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'zotero-api-version': '3', ...headers },
  })
}

export function transportWith(handler: (url: URL, init?: RequestInit) => Promise<Response>): ZoteroTransport {
  return new ZoteroTransport({
    fetchImpl: (async (input: any, init?: RequestInit) => handler(new URL(String(input)), init)) as typeof fetch,
  })
}
