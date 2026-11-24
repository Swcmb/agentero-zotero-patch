import type { PaperReference } from './types.js'

export type ExportFormat = 'citation' | 'bibtex' | 'biblatex' | 'ris' | 'csljson'

const ZOTERO_TYPE_TO_BIB: Record<string, string> = {
  journalArticle: 'article',
  book: 'book',
  conferencePaper: 'inproceedings',
  thesis: 'phdthesis',
  report: 'techreport',
  webpage: 'misc',
  preprint: 'misc',
}

export function exportCitation(ref: PaperReference, format: ExportFormat): string {
  if (format === 'csljson') {
    return JSON.stringify({
      id: ref.sourceId,
      source: ref.source,
      type: ref.itemType,
      title: ref.title,
      author: ref.authors.map((name) => ({ literal: name })),
      issued: ref.year ? { 'date-parts': [[ref.year]] } : undefined,
      DOI: ref.doi,
    })
  }
  if (format === 'ris') {
    return [
      'TY  - JOUR',
      `TI  - ${ref.title}`,
      ...ref.authors.map((a) => `AU  - ${a}`),
      `PY  - ${ref.year ?? ''}`,
      `DO  - ${ref.doi ?? ''}`,
      `ID  - ${ref.sourceId}`,
      'ER  -',
    ].join('\n')
  }
  if (format === 'citation') {
    return `${ref.authors.join(', ')} (${ref.year ?? 'n.d.'}). ${ref.title}.`
  }
  const key = ref.sourceId
  const type = ZOTERO_TYPE_TO_BIB[ref.itemType] ?? 'misc'
  const fields = [
    `  title = {${ref.title}}`,
    `  author = {${ref.authors.join(' and ')}}`,
    `  year = {${ref.year ?? ''}}`,
    ...(ref.doi ? [`  doi = {${ref.doi}}`] : []),
  ]
  // bibtex 与 biblatex 共用同一确定性正文；差异留给部署侧的样式配置。
  return `@${type}{${key},\n${fields.join(',\n')}\n}`
}
