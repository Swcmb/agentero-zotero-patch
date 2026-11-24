import type { ZoteroTransport } from './transport.js'
import { normalizeItem } from './normalize.js'

export async function getItem(transport: ZoteroTransport, key: string) {
  const { json } = await transport.get(`users/0/items/${encodeURIComponent(key)}`)
  return normalizeItem(json)
}

export async function getBatch(transport: ZoteroTransport, keys: string[]) {
  const out: Array<{
    key: string
    ok: boolean
    item?: ReturnType<typeof normalizeItem>
    error?: string
  }> = []
  for (const key of keys) {
    try {
      out.push({ key, ok: true, item: await getItem(transport, key) })
    } catch (error) {
      out.push({ key, ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return out
}
