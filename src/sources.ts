import type { PaperReference, SourceKind, EvidenceSnippet } from './types.js'

export interface SourceEvent {
  id: string
  kind: 'search' | 'read' | 'evidence' | 'export'
  source: SourceKind
  sourceId: string
  title?: string
  query?: string
  evidence?: EvidenceSnippet[]
  exportFormat?: string
}

export interface SourceWorkspace {
  sources: PaperReference[]
  totalSources: number
  exports: string[]
  queries: string[]
}

/** 会话事件增量折叠：以 event.id 去重，保证重复回放不产生重复记录。 */
export function createSourceLedger() {
  const seen = new Set<string>()
  const byId = new Map<string, PaperReference>()
  const exports: string[] = []
  const queries: string[] = []
  return {
    fold(event: SourceEvent): boolean {
      if (seen.has(event.id)) return false
      seen.add(event.id)
      const key = `${event.source}:${event.sourceId}`
      if (!byId.has(key)) {
        byId.set(key, {
          source: event.source,
          sourceId: event.sourceId,
          title: event.title ?? '',
          itemType: 'unknown',
          authors: [],
          tags: [],
          collectionKeys: [],
        })
      }
      if (event.query) queries.push(event.query)
      if (event.kind === 'export' && event.exportFormat) exports.push(event.exportFormat)
      return true
    },
    workspace(): SourceWorkspace {
      const sources = [...byId.values()]
      return {
        sources,
        totalSources: sources.length,
        exports: [...exports],
        queries: [...queries],
      }
    },
  }
}
