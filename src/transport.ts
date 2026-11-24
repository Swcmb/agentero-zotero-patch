import { ZoteroPatchError } from './errors.js'
import type { StatusView } from './types.js'

export interface TransportOptions {
  baseUrl?: string
  timeoutMs?: number
  maxResponseBytes?: number
  fetchImpl?: typeof fetch
}

const API_VERSION = '3'
const VERSION_HEADER = 'zotero-api-version'
const SERVER_ID_HEADER = 'zotero-server-id'
const ZOTERO_VERSION_HEADER = 'x-zotero-version'
const SCHEMA_VERSION_HEADER = 'zotero-schema-version'
const ALLOWED = new Set(['http://127.0.0.1:23119', 'http://localhost:23119'])

/** Zotero Local API 的唯一网络出口：loopback 限定、身份保护、字节上限。 */
export class ZoteroTransport {
  private readonly base: string
  private readonly timeoutMs: number
  private readonly maxBytes: number
  private readonly doFetch: typeof fetch
  private serverId?: string

  constructor(options: TransportOptions = {}) {
    const base = options.baseUrl ?? 'http://127.0.0.1:23119/api'
    this.base = base.endsWith('/') ? base : `${base}/`
    const origin = new URL(this.base).origin
    if (!ALLOWED.has(origin)) {
      throw new ZoteroPatchError(`仅允许 loopback 23119，实际 ${origin}`, 'ZOTERO_PATCH_BAD_PATH')
    }
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.maxBytes = options.maxResponseBytes ?? 16 * 1024 * 1024
    this.doFetch = options.fetchImpl ?? fetch
  }

  get endpoint(): string {
    return new URL(this.base).host
  }

  get rememberedServerId(): string | undefined {
    return this.serverId
  }

  private async readBounded(response: Response): Promise<string> {
    const reader = response.body?.getReader()
    if (!reader) return await response.text()
    const decoder = new TextDecoder()
    let text = ''
    let bytes = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > this.maxBytes) {
        await reader.cancel()
        throw new ZoteroPatchError(`响应超过 ${this.maxBytes} 字节`, 'ZOTERO_PATCH_RESPONSE_TOO_LARGE')
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  }

  async get(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
    signal?: AbortSignal,
    expectJson = true,
  ): Promise<{ json: any; text: string; headers: Headers }> {
    const url = new URL(path, this.base)
    if (url.origin !== new URL(this.base).origin) {
      throw new ZoteroPatchError('拒绝跨源请求', 'ZOTERO_PATCH_BAD_PATH')
    }
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
    const headers: Record<string, string> = { [VERSION_HEADER]: API_VERSION }
    if (this.serverId) headers[SERVER_ID_HEADER] = this.serverId
    const timeout = AbortSignal.timeout(this.timeoutMs)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
    let response: Response
    try {
      response = await this.doFetch(url, {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: combined,
      })
    } catch (error) {
      throw new ZoteroPatchError(
        'Zotero 不可达：请启动 Zotero 并开启本地 API',
        'ZOTERO_PATCH_UNREACHABLE',
        { cause: error },
      )
    }
    const id = response.headers.get(SERVER_ID_HEADER)
    if (id) this.serverId = id
    if (!response.ok) {
      const code = response.status === 412
        ? 'ZOTERO_PATCH_SERVER_MISMATCH'
        : response.status === 404
          ? 'ZOTERO_PATCH_NOT_FOUND'
          : response.status === 501
            ? 'ZOTERO_PATCH_API_VERSION'
            : 'ZOTERO_PATCH_UNEXPECTED'
      throw new ZoteroPatchError(`Zotero 返回 HTTP ${response.status}`, code)
    }
    const body = await this.readBounded(response)
    return {
      json: expectJson ? JSON.parse(body.replace(/^\uFEFF/, '')) : undefined,
      text: body,
      headers: response.headers,
    }
  }

  async status(signal?: AbortSignal): Promise<StatusView> {
    const { headers } = await this.get('', undefined, signal, false)
    return {
      reachable: true,
      endpoint: this.endpoint,
      serverId: headers.get(SERVER_ID_HEADER) ?? undefined,
      zoteroVersion: headers.get(ZOTERO_VERSION_HEADER) ?? undefined,
      apiVersion: headers.get(VERSION_HEADER) ?? undefined,
      schemaVersion: headers.get(SCHEMA_VERSION_HEADER) ?? undefined,
    }
  }
}
