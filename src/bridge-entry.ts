import type { Context } from '@deepseek-ai/cordis'
import { probeAgentero, setAgenteroAdapter } from './bridge.js'

export const name = 'zotero-patch-bridge'
export const inject: string[] = []

export function apply(ctx: Context): void {
  const probe = probeAgentero(ctx)
  // 探测成功时由宿主侧注入具体 adapter；本插件不 import agentero-dsh-* 包。
  ctx.provide('zoteroPatchBridge', probe)
  ctx.effect(() => () => setAgenteroAdapter(undefined))
}
