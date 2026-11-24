import type { ZoteroTransport } from './transport.js'

export async function changes(transport: ZoteroTransport, args: { since?: number; limit?: number }) {
  const { json, headers } = await transport.get('users/0/items', {
    since: args.since,
    limit: args.limit ?? 100,
  })
  const version = headers.get('last-modified-version')
  return { items: json, version: version ? Number(version) : undefined }
}
