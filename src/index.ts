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
  // Cordis 要求先 provide 再写服务属性；provide 返回的 disposer 由 fiber 自动管理。
  ctx.provide('zoteroPatch', { transport })
  ctx.effect(() => {
    const disposeTools = registerResearchTools(ctx, transport)
    return () => disposeTools()
  })
}
