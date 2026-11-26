import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type { ZoteroTransport } from './transport.js'
import { researchHandlers } from './handlers.js'

const SOURCE_PARAM = {
  type: 'string',
  enum: ['zotero', 'agentero'],
  description: '省略为跨库；zotero / agentero 为单源。agentero 未安装时指定该源会显式报错。',
}

/** DSH 适配层：唯一 import dsh-tools 的模块，负责注册 research_* 工具。 */
export function registerResearchTools(ctx: Context, transport: ZoteroTransport): () => void {
  const definitions = [
    defineTool({
      name: 'research_search',
      description: '搜索 Zotero 文献库（默认只返回顶层父条目，避免附件混入）。',
      parameters: {
        query: { type: 'string', description: '关键词' },
        source: SOURCE_PARAM,
        tags: { type: 'array', items: { type: 'string' } },
        collection: { type: 'string' },
        qmode: { type: 'string', enum: ['metadata', 'everything'] },
        limit: { type: 'integer' },
        offset: { type: 'integer' },
      },
      output: { schema: { type: 'object', additionalProperties: true } },
      async execute(args: any) { return researchHandlers.search(transport, args) },
    }),
    defineTool({
      name: 'research_get',
      description: '按 Zotero key 读取单条文献元数据。',
      parameters: { key: { type: 'string' }, source: SOURCE_PARAM },
      async execute(args: any) { return researchHandlers.get(transport, args) },
    }),
    defineTool({
      name: 'research_get_batch',
      description: '批量读取 Zotero 条目，逐条报告成功或失败。',
      parameters: {
        keys: { type: 'array', items: { type: 'string' } },
        source: SOURCE_PARAM,
      },
      async execute(args: any) { return researchHandlers.getBatch(transport, args) },
    }),
    defineTool({
      name: 'research_browse',
      description: '浏览 Zotero 合集与标签。',
      parameters: {
        kind: { type: 'string', enum: ['collections', 'tags'] },
        source: SOURCE_PARAM,
        limit: { type: 'integer' },
      },
      async execute(args: any) { return researchHandlers.browse(transport, args) },
    }),
    defineTool({
      name: 'research_children',
      description: '读取 Zotero 条目的附件、笔记或批注子条目。',
      parameters: {
        key: { type: 'string' },
        kind: { type: 'string', enum: ['attachment', 'note', 'annotation'] },
        source: SOURCE_PARAM,
      },
      async execute(args: any) { return researchHandlers.children(transport, args) },
    }),
    defineTool({
      name: 'research_retrieve',
      description: '在 Zotero 附件全文中检索证据片段，返回可回溯到附件与页码的结果。',
      parameters: {
        key: { type: 'string', description: 'PDF 附件 key' },
        query: { type: 'string' },
        maxSnippets: { type: 'integer' },
        source: SOURCE_PARAM,
      },
      async execute(args: any) { return researchHandlers.retrieve(transport, args) },
    }),
    defineTool({
      name: 'research_export',
      description: '按 citation/bibtex/biblatex/ris/csljson 导出 Zotero 条目。',
      parameters: {
        keys: { type: 'array', items: { type: 'string' } },
        format: { type: 'string', enum: ['citation', 'bibtex', 'biblatex', 'ris', 'csljson'] },
        source: SOURCE_PARAM,
      },
      async execute(args: any) { return researchHandlers.export(transport, args) },
    }),
    defineTool({
      name: 'research_match_references',
      description: '按 DOI → arXiv/PMID → 标题+作者+年份 的优先级匹配参考文献。',
      parameters: {
        targets: { type: 'array', items: { type: 'object', additionalProperties: true } },
        candidates: { type: 'array', items: { type: 'object', additionalProperties: true } },
        source: SOURCE_PARAM,
      },
      async execute(args: any) { return researchHandlers.matchReferences(transport, args) },
    }),
    defineTool({
      name: 'research_changes',
      description: '按 since 游标读取 Zotero 文献库增量变更。',
      parameters: {
        since: { type: 'integer' },
        limit: { type: 'integer' },
        source: SOURCE_PARAM,
      },
      async execute(args: any) { return researchHandlers.changes(transport, args) },
    }),
  ]
  const disposers = definitions.map((d) => ctx.tools!.register(d))
  return () => disposers.forEach((dispose) => dispose())
}
