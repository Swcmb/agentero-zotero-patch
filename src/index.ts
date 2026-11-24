import type { Context } from '@deepseek-ai/cordis'
import { ZoteroTransport } from './transport.js'

export const name = 'zotero-patch'
export const inject = ['tools']

export interface Config {
  baseUrl?: string
  timeoutMs?: number
}

export function apply(ctx: Context, config: Config = {}): void {
  const transport = new ZoteroTransport(config)
  ctx.effect(() => {
    ;(ctx as any).zoteroPatch = { transport }
    return () => {
      delete (ctx as any).zoteroPatch
    }
  })
}
