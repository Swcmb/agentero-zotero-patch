import type { Context } from '@deepseek-ai/cordis'
import { createSourceLedger } from './sources.js'

export const name = 'zotero-patch-sources'
export const inject: string[] = []

export function apply(ctx: Context): void {
  ctx.provide('zoteroPatchSources', createSourceLedger())
}
