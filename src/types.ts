export type SourceKind = 'agentero' | 'zotero'

export interface PaperReference {
  source: SourceKind
  sourceId: string
  title: string
  itemType: string
  authors: string[]
  year?: number
  doi?: string
  abstract?: string
  url?: string
  tags: string[]
  collectionKeys: string[]
  parentKey?: string
}

export interface EvidenceSnippet {
  attachmentKey: string
  snippet: string
  page?: number
  matchType: 'fulltext' | 'note' | 'annotation'
  annotationKey?: string
}

export interface ToolEnvelope<T> {
  source: SourceKind
  count: number
  items: T[]
  nextOffset?: number
  total?: number
}

export interface StatusView {
  reachable: boolean
  endpoint: string
  serverId?: string
  zoteroVersion?: string
  apiVersion?: string
  schemaVersion?: string
}
