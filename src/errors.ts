export type ZoteroPatchErrorCode =
  | 'ZOTERO_PATCH_UNREACHABLE'
  | 'ZOTERO_PATCH_SERVER_MISMATCH'
  | 'ZOTERO_PATCH_API_VERSION'
  | 'ZOTERO_PATCH_NOT_FOUND'
  | 'ZOTERO_PATCH_BAD_PATH'
  | 'ZOTERO_PATCH_RESPONSE_TOO_LARGE'
  | 'ZOTERO_PATCH_WRITE_DENIED'
  | 'ZOTERO_PATCH_EGRESS_DENIED'
  | 'ZOTERO_PATCH_AGENTERO_UNAVAILABLE'
  | 'ZOTERO_PATCH_BAD_ARG'
  | 'ZOTERO_PATCH_UNEXPECTED'

export class ZoteroPatchError extends Error {
  constructor(
    message: string,
    readonly code: ZoteroPatchErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'ZoteroPatchError'
  }
}
