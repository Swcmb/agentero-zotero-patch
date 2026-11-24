import type { Context } from '@deepseek-ai/cordis'
import { ZoteroTransport } from './transport.js'
import { registerResearchTools } from './tools.js'

export const name = 'zotero-patch'
export const inject = ['tools']

export interface Config {
  baseUrl?: string
  timeoutMs?: number
}

export function apply(ctx: Context, config: Config = {}): void {
  const transport = new ZoteroTransport(config)
  ctx.effect(() => {
    const disposeTools = registerResearchTools(ctx, transport)
    ;(ctx as any).zoteroPatch = { transport }
    return () => {
      disposeTools()
      delete (ctx as any).zoteroPatch
    }
  })
}
