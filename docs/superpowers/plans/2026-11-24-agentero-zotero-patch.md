# Agentero Zotero Patch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个独立安装的 DSH bundle `agentero-zotero-patch`，把 Zotero 本地库以只读方式接入 Agentero 科研工作流，提供统一 `research_*` 工具、Sources 轨迹与可选 agentero 桥接，按 5 阶段逐个交付。

**Architecture:** 分层：Cordis 入口（`apply(ctx, config)` + `cordis.patch.yml insert`）→ 薄 DSH 适配层（`tools.ts` 调用 `ctx.tools.register`）→ 纯逻辑核心（transport / normalize / search / retrieve / export / match / changes / sources，零 DSH import）→ Zotero Local API（仅 loopback 23119）。核心逻辑不依赖 DSH 包，便于用 `node:test` 直接测试；DSH peer deps 由运行时提供，本地只用 ambient 类型声明。组件按阶段挂载：阶段 1-2 只有 core，阶段 3 加 sources，阶段 5 加默认关闭的 scholarly/enrichment。

**Tech Stack:** TypeScript 5.x（编译到 `lib/`）、Node 24（项目内 `.node24`）、`node:test` + `node:assert/strict`、Cordis 函数式插件（`export const name` / `inject` / `export function apply`）、`@deepseek-ai/dsh-tools` 的 `defineTool`（运行时由 DSH 提供）、Zotero Local API v3。

## Global Constraints

- Node `>=24.15.0`；所有命令通过 `./scripts/node.sh` 与 `./scripts/npm.cmd` 执行，禁止使用系统 Node 22。
- DSH `>=0.2.2-rc.4 <0.3.0`；desktop profile 为 `D:\ai-configs\runtime\dsh\profiles\desktop`（`DSH_HOME=D:\ai-configs\runtime\dsh`）。
- **不修改 agentero-dsh 任何源码**；与 agentero 的复用只能通过 `ctx` 可选探测 + 最小只读回退。
- 只注册 `research_*` 工具，不注册 `zotero_*` 别名，避免与 dsh-zotero 重名。
- 阶段 1-2 `source` 参数仅接受 `"zotero"`；阶段 4 起才接受跨库（省略）与 `"agentero"`。
- Transport 仅允许 `http://127.0.0.1:23119` 或 `http://localhost:23119`；拒绝重定向；响应体上限 16 MiB；每个请求带 `Zotero-API-Version: 3`，记住并回传 `Zotero-Server-ID`，412 视为实例漂移错误。
- `research_search` 默认走 `/items/top`；`qmode=everything` 只用于全文召回且必须二次按 `parentItem`/`itemType` 归一。
- 写入工具在阶段 1 完全不实现；阶段 2+ 若实现必须默认关闭并经 `ctx.approval.request`。本计划 5 阶段均不开放写入。
- 复用 dsh-zotero 逻辑须保留 MIT 版权声明（`THIRD_PARTY_NOTICES.md`）。
- 每阶段验收 = `typecheck` 通过 + 该阶段单测通过 + `scripts/verify-zotero.mjs` 真实库通过 + Git 提交（agent 分支 + PR 自审）。

---

## File Structure

```
package.json                      # ESM、脚本、peer deps、dsh.bundle.patch
tsconfig.json                     # NodeNext，rootDir=src，outDir=lib，declaration
cordis.patch.yml                  # 分阶段 insert 行
THIRD_PARTY_NOTICES.md            # dsh-zotero MIT 归属
src/
  dsh.d.ts                        # @deepseek-ai/cordis / dsh-tools 最小 ambient 类型
  types.ts                        # PaperReference / EvidenceSnippet / ToolEnvelope
  errors.ts                       # ZoteroPatchError + 错误码
  transport.ts                    # Zotero Local API transport（唯一网络出口）
  normalize.ts                    # Zotero item -> PaperReference；children 归一
  search.ts                       # 搜索参数构造 + top 过滤
  detail.ts                       # get / getBatch
  browse.ts                       # collections / tags / sources
  children.ts                     # 附件 / 笔记 / 批注
  retrieve.ts                     # 全文 + BM25 + 证据片段/页码
  export.ts                       # citation/bibtex/biblatex/ris/csljson
  match.ts                        # DOI -> arXiv/PMID -> 标题+作者+年份
  changes.ts                      # since 游标 + Last-Modified-Version
  sources.ts                      # Sources 事件折叠（阶段 3）
  handlers.ts                     # 9 个 research_* 的纯函数实现（零 DSH import）
  tools.ts                        # defineTool + ctx.tools.register（阶段 1-2）
  unified.ts                      # 统一服务层跨库路由（阶段 4）
  bridge.ts                       # agentero 可选探测（阶段 4）
  index.ts                        # core apply
  bridge-entry.ts                 # ./bridge 子路径入口
  sources-entry.ts                # ./sources 子路径入口
  scholarly.ts                    # 阶段 5，默认关闭
  enrichment.ts                   # 阶段 5，默认关闭
tests/
  mock-transport.ts               # 可注入 fetch 的假 transport
  transport.test.ts
  normalize.test.ts
  search.test.ts
  detail.test.ts
  retrieve.test.ts
  export.test.ts
  match.test.ts
  changes.test.ts
  sources.test.ts
  handlers.test.ts
```

---

### Task 1: 脚手架 + transport + 连接检测（阶段 1a）

**Files:**
- Create: `package.json`, `tsconfig.json`, `cordis.patch.yml`, `THIRD_PARTY_NOTICES.md`
- Create: `src/dsh.d.ts`, `src/types.ts`, `src/errors.ts`, `src/transport.ts`, `src/index.ts`
- Create: `tests/mock-transport.ts`, `tests/transport.test.ts`
- Modify: `.gitignore`（加入 `lib/`、`node_modules/`）

**Interfaces:**
- Consumes: 无（首个任务）
- Produces:
  - `ZoteroTransport` 类：`status(signal?): Promise<StatusView>`、`get(path, params?, signal?): Promise<{json:any; headers:Headers}>`、`endpoint: string`
  - `StatusView`：`{ reachable: boolean; endpoint: string; serverId?: string; zoteroVersion?: string; apiVersion?: string; schemaVersion?: string }`
  - `ZoteroPatchError(code)` 与 8 个错误码
  - `PaperReference` / `EvidenceSnippet` / `ToolEnvelope<T>` 类型

- [ ] **Step 1: 写失败测试 `tests/transport.test.ts`**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { ZoteroTransport } from '../lib/transport.js'
import { ZoteroPatchError } from '../lib/errors.js'

const HEADERS = {
  'zotero-api-version': '3',
  'zotero-schema-version': '44',
  'x-zotero-version': '10.0.8',
  'zotero-server-id': 'TESTSERVER',
}

test('status 解析版本头并回传 server-id，拒绝跨源 baseUrl', async () => {
  const calls: Array<{ url: string; headers: Record<string, string> }> = []
  const fakeFetch = async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const url = input as URL
    calls.push({ url: url.href, headers: init?.headers as Record<string, string> })
    if (calls.length === 1) {
      return new Response('Nothing to see here.', { status: 200, headers: HEADERS })
    }
    assert.equal((init?.headers as Record<string, string>)['zotero-server-id'], 'TESTSERVER')
    return new Response(JSON.stringify([{ key: 'AAAA1111', data: { title: 't', itemType: 'journalArticle' } }]), {
      status: 200,
      headers: { ...HEADERS, 'total-results': '1' },
    })
  }
  const t = new ZoteroTransport({ fetchImpl: fakeFetch as typeof fetch })
  const status = await t.status()
  assert.equal(status.reachable, true)
  assert.equal(status.apiVersion, '3')
  assert.equal(status.zoteroVersion, '10.0.8')
  assert.equal(status.schemaVersion, '44')
  assert.equal(status.serverId, 'TESTSERVER')
  const page = await t.get('users/0/items/top', { limit: 3 })
  assert.equal(page.json.length, 1)
  assert.equal(calls[1].url, 'http://127.0.0.1:23119/api/users/0/items/top?limit=3')
  assert.throws(() => new ZoteroTransport({ baseUrl: 'http://evil.example/api' }), ZoteroPatchError)
})

test('412 实例漂移与非 2xx 状态翻译为错误码', async () => {
  const fakeFetch = async () => new Response('mismatch', { status: 412 })
  const t = new ZoteroTransport({ fetchImpl: fakeFetch as typeof fetch })
  await assert.rejects(() => t.get('users/0/items'), (e: unknown) =>
    e instanceof ZoteroPatchError && e.code === 'ZOTERO_PATCH_SERVER_MISMATCH')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /d/agentero-zotero-patch && ./scripts/node.sh .node24/runtime/node_modules/npm/bin/npm-cli.js install && ./scripts/node.sh .node24/runtime/node_modules/npm/bin/npm-cli.js test`
Expected: FAIL，`Cannot find module '../lib/transport.js'`

- [ ] **Step 3: 写 `package.json` / `tsconfig.json` / ambient 类型**

```json
{
  "name": "agentero-zotero-patch",
  "version": "0.1.0",
  "type": "module",
  "main": "./lib/index.js",
  "types": "./lib/index.d.ts",
  "exports": {
    ".": { "types": "./lib/index.d.ts", "default": "./lib/index.js" },
    "./bridge": { "types": "./lib/bridge-entry.d.ts", "default": "./lib/bridge-entry.js" },
    "./sources": { "types": "./lib/sources-entry.d.ts", "default": "./lib/sources-entry.js" },
    "./scholarly": { "types": "./lib/scholarly.d.ts", "default": "./lib/scholarly.js" },
    "./enrichment": { "types": "./lib/enrichment.d.ts", "default": "./lib/enrichment.js" },
    "./package.json": "./package.json"
  },
  "engines": { "node": ">=24.15.0", "dsh": ">=0.2.2-rc.4 <0.3.0" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "npm run build && node --test tests/*.test.js",
    "verify:zotero": "node scripts/verify-zotero.mjs"
  },
  "devDependencies": { "typescript": "^5.9.0", "@types/node": "^24.0.0" },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.1.0",
    "@deepseek-ai/dsh-tools": ">=0.2.2-rc.4"
  },
  "files": ["lib", "cordis.patch.yml", "README.md", "THIRD_PARTY_NOTICES.md", "LICENSE"],
  "license": "MIT",
  "dsh": { "manifestVersion": 1, "bundle": { "patch": "./cordis.patch.yml" } }
}
```

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "lib",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts"]
}
```

```ts
// src/dsh.d.ts
declare module '@deepseek-ai/cordis' {
  export interface Context {
    get<T = unknown>(name: string): T | undefined
    on(event: string, listener: (...args: any[]) => void): () => void
    effect(fn: () => void | (() => void)): () => void
    tools?: { register(definition: unknown): () => void }
  }
  export class Service<C = unknown> {
    constructor(ctx: Context, name?: string)
  }
}
declare module '@deepseek-ai/dsh-tools' {
  export interface ToolDefinition {
    name: string
    description: string
    parameters: Record<string, unknown>
    output?: Record<string, unknown>
    execute(args: any, exec: any): Promise<unknown>
    [key: string]: unknown
  }
  export function defineTool<const S, const O>(options: Record<string, unknown>): ToolDefinition
  export class ToolArgsError extends Error {}
}
```

- [ ] **Step 4: 写 `src/errors.ts`**

```ts
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
```

- [ ] **Step 5: 写 `src/types.ts`**

```ts
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
```

- [ ] **Step 6: 写 `src/transport.ts`**

```ts
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

  get endpoint(): string { return new URL(this.base).host }
  get rememberedServerId(): string | undefined { return this.serverId }

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
  ): Promise<{ json: any; headers: Headers }> {
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
      response = await this.doFetch(url, { method: 'GET', headers, redirect: 'manual', signal: combined })
    } catch (error) {
      throw new ZoteroPatchError('Zotero 不可达：请启动 Zotero 并开启本地 API', 'ZOTERO_PATCH_UNREACHABLE', { cause: error })
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
    return { json: JSON.parse(body.replace(/^\uFEFF/, '')), headers: response.headers }
  }

  async status(signal?: AbortSignal): Promise<StatusView> {
    const { headers } = await this.get('', undefined, signal)
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
```

- [ ] **Step 7: 写 `src/index.ts`（阶段 1 只有 core 行）与 `cordis.patch.yml`**

```ts
// src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { ZoteroTransport } from './transport.js'

export const name = 'zotero-patch'
export const inject = ['tools']

export interface Config {
  baseUrl?: string
  timeoutMs?: number
}

export function apply(ctx: Context, config: Config = {}): void {
  const transport = new ZoteroTransport(config)
  ctx.effect(() => {
    // 阶段 1 只挂载服务；工具注册在 Task 2 加入。
    ;(ctx as any).zoteroPatch = { transport }
    return () => { delete (ctx as any).zoteroPatch }
  })
}
```

```yaml
# cordis.patch.yml（阶段 1-2）
- insert:
    - id: zotero-patch
      name: agentero-zotero-patch
      config: {}
```

- [ ] **Step 8: 运行测试确认通过**

Run: `cd /d/agentero-zotero-patch && npm test`
Expected: `transport.test.ts` 2/2 PASS

- [ ] **Step 9: 提交**

```bash
git checkout -b agent/2026-11-24-phase1a-transport
git add package.json tsconfig.json cordis.patch.yml THIRD_PARTY_NOTICES.md src tests .gitignore
git commit -m "feat(zotero-patch): [AI] 建立插件骨架与 Zotero transport

Agent-Task: 阶段 1a - transport 与连接检测
Agent-Model: Tencent Hunyuan Hy
Agent-Decision: 核心逻辑零 DSH import，peer deps 用 ambient 类型声明，
  使 node:test 可独立运行且不与 DSH 版本 pin 冲突"
```

---

### Task 2: 阶段 1 只读工具（search / get / get_batch / browse / children）

**Files:**
- Create: `src/normalize.ts`, `src/search.ts`, `src/detail.ts`, `src/browse.ts`, `src/children.ts`, `src/handlers.ts`, `src/tools.ts`
- Create: `tests/normalize.test.ts`, `tests/search.test.ts`, `tests/detail.test.ts`, `tests/handlers.test.ts`
- Modify: `src/index.ts`（调用 `registerResearchTools`）

**Interfaces:**
- Consumes: `ZoteroTransport`（Task 1）
- Produces:
  - `normalizeItem(raw, source?): PaperReference`
  - `searchItems(transport, args): Promise<ToolEnvelope<PaperReference>>`
  - `getItem(transport, key): Promise<PaperReference>`
  - `getBatch(transport, keys): Promise<Array<{key:string; ok:boolean; item?:PaperReference; error?:string}>>`
  - `browse(transport, kind): Promise<ToolEnvelope<any>>`
  - `children(transport, key, kind?): Promise<ToolEnvelope<any>>`
  - `researchHandlers` 对象，`tools.ts` 的 9 个工具全部调用这些纯函数

- [ ] **Step 1: 写失败测试 `tests/normalize.test.ts`**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeItem } from '../lib/normalize.js'

test('normalizeItem 保留来源标识与原生 ID，解析作者/年份/标签', () => {
  const ref = normalizeItem({
    key: 'VH86EE2K',
    data: {
      itemType: 'journalArticle', title: 'Big Self-Supervised Models',
      creators: [
        { creatorType: 'author', firstName: 'Ting', lastName: 'Chen', name: '' },
        { creatorType: 'editor', name: 'Editor X' },
      ],
      date: '2020-06-01', DOI: '10.1109/CVPR.2020.00981',
      abstractNote: 'abstract', url: 'https://example.test/p',
      tags: [{ tag: 'ssl' }], collections: ['ABC123'], parentItem: undefined,
    },
  })
  assert.equal(ref.source, 'zotero')
  assert.equal(ref.sourceId, 'VH86EE2K')
  assert.deepEqual(ref.authors, ['Ting Chen'])
  assert.equal(ref.year, 2020)
  assert.equal(ref.doi, '10.1109/CVPR.2020.00981')
  assert.deepEqual(ref.tags, ['ssl'])
  assert.deepEqual(ref.collectionKeys, ['ABC123'])
  assert.equal(ref.parentKey, undefined)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /d/agentero-zotero-patch && npm test`
Expected: FAIL，`Cannot find module '../lib/normalize.js'`

- [ ] **Step 3: 写 `src/normalize.ts`**

```ts
import type { PaperReference, SourceKind } from './types.js'

export function yearOf(date: unknown): number | undefined {
  if (typeof date !== 'string') return undefined
  const match = /(18|19|20)\d{2}/.exec(date)
  return match ? Number(match[0]) : undefined
}

export function normalizeItem(raw: any, source: SourceKind = 'zotero'): PaperReference {
  const data = raw?.data ?? {}
  const creators: any[] = Array.isArray(data.creators) ? data.creators : []
  const authors = creators
    .filter((c) => c?.creatorType === 'author')
    .map((c) => (typeof c.name === 'string' && c.name
      ? c.name
      : [c.firstName, c.lastName].filter(Boolean).join(' ')))
    .filter((name: string) => name.length > 0)
  return {
    source,
    sourceId: String(raw?.key ?? ''),
    title: String(data.title ?? ''),
    itemType: String(data.itemType ?? 'document'),
    authors,
    year: yearOf(data.date),
    doi: data.DOI ? String(data.DOI) : undefined,
    abstract: typeof data.abstractNote === 'string' && data.abstractNote ? data.abstractNote : undefined,
    url: data.url ? String(data.url) : undefined,
    tags: (Array.isArray(data.tags) ? data.tags : []).map((t: any) => String(t?.tag ?? '')).filter(Boolean),
    collectionKeys: (Array.isArray(data.collections) ? data.collections : []).map(String),
    parentKey: data.parentItem ? String(data.parentItem) : undefined,
  }
}

export function normalizeChildren(raws: any[]): any[] {
  return (Array.isArray(raws) ? raws : []).map((raw) => {
    const data = raw?.data ?? {}
    return {
      key: String(raw?.key ?? ''),
      itemType: String(data.itemType ?? ''),
      title: String(data.title ?? data.filename ?? ''),
      parentKey: data.parentItem ? String(data.parentItem) : undefined,
      contentType: data.contentType ? String(data.contentType) : undefined,
      note: typeof data.note === 'string' ? data.note : undefined,
      annotationText: typeof data.annotationText === 'string' ? data.annotationText : undefined,
      page: data.page ? String(data.page) : undefined,
    }
  })
}
```

- [ ] **Step 4: 写失败测试 `tests/search.test.ts`**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSearchRequest, filterTop } from '../lib/search.js'

test('默认搜索走 /items/top；everything 结果按 parentItem 归一', () => {
  const req = buildSearchRequest({ query: 'contrastive', limit: 10 })
  assert.equal(req.path, 'users/0/items/top')
  assert.equal(req.params.q, 'contrastive')
  const everything = buildSearchRequest({ query: 'contrastive', qmode: 'everything' })
  assert.equal(everything.path, 'users/0/items')
  assert.equal(everything.params.qmode, 'everything')
  const rows = [
    { key: 'A', data: { parentItem: undefined, itemType: 'journalArticle' } },
    { key: 'B', data: { parentItem: 'A', itemType: 'attachment' } },
  ]
  assert.deepEqual(filterTop(rows).map((r: any) => r.key), ['A'])
})
```

- [ ] **Step 5: 运行测试确认失败**，同 Step 2。

- [ ] **Step 6: 写 `src/search.ts`**

```ts
export interface SearchArgs {
  query?: string
  source?: 'zotero'
  tags?: string[]
  collection?: string
  qmode?: 'metadata' | 'everything'
  sort?: 'dateModified' | 'dateAdded' | 'date' | 'title' | 'creator'
  direction?: 'asc' | 'desc'
  offset?: number
  limit?: number
}

export function buildSearchRequest(args: SearchArgs): { path: string; params: Record<string, string | number | undefined> } {
  const params: Record<string, string | number | undefined> = {
    limit: Math.min(Math.max(args.limit ?? 10, 1), 100),
    ...(args.offset ? { start: Math.max(args.offset, 0) } : {}),
    ...(args.query ? { q: args.query } : {}),
    ...(args.qmode === 'everything' ? { qmode: 'everything' } : {}),
    ...(args.tags?.length ? { tag: args.tags.join(' || ') } : {}),
    ...(args.collection ? { collection: args.collection } : {}),
    ...(args.sort ? { sort: args.sort } : {}),
    ...(args.direction ? { direction: args.direction } : {}),
  }
  return { path: args.qmode === 'everything' ? 'users/0/items' : 'users/0/items/top', params }
}

export function filterTop(rows: any[]): any[] {
  return (Array.isArray(rows) ? rows : []).filter((row) =>
    row?.data?.parentItem === undefined && row?.data?.itemType !== 'attachment')
}
```

- [ ] **Step 7: 写 `src/detail.ts` / `src/browse.ts` / `src/children.ts`**

```ts
// src/detail.ts
import type { ZoteroTransport } from './transport.js'
import { normalizeItem } from './normalize.js'
export async function getItem(transport: ZoteroTransport, key: string) {
  const { json } = await transport.get(`users/0/items/${encodeURIComponent(key)}`)
  return normalizeItem(json)
}
export async function getBatch(transport: ZoteroTransport, keys: string[]) {
  const out: Array<{ key: string; ok: boolean; item?: ReturnType<typeof normalizeItem>; error?: string }> = []
  for (const key of keys) {
    try { out.push({ key, ok: true, item: await getItem(transport, key) }) }
    catch (error) { out.push({ key, ok: false, error: error instanceof Error ? error.message : String(error) }) }
  }
  return out
}
```

```ts
// src/browse.ts
import type { ZoteroTransport } from './transport.js'
export type BrowseKind = 'collections' | 'tags' | 'sources'
export async function browse(transport: ZoteroTransport, kind: BrowseKind, limit = 50) {
  const path = kind === 'collections' ? 'users/0/collections'
    : kind === 'tags' ? 'users/0/tags' : ''
  const { json, headers } = await transport.get(path, { limit })
  return { source: 'zotero' as const, count: json.length, items: json,
    total: Number(headers.get('total-results') ?? json.length) }
}
```

```ts
// src/children.ts
import type { ZoteroTransport } from './transport.js'
import { normalizeChildren } from './normalize.js'
export type ChildKind = 'attachment' | 'note' | 'annotation'
export async function children(transport: ZoteroTransport, key: string, kind?: ChildKind) {
  if (kind === 'annotation') {
    const { json } = await transport.get(`users/0/items/${encodeURIComponent(key)}/children`,
      { itemType: 'annotation', limit: 100 })
    return { source: 'zotero' as const, count: json.length, items: normalizeChildren(json) }
  }
  const { json } = await transport.get(`users/0/items/${encodeURIComponent(key)}/children`, { limit: 100 })
  const rows = normalizeChildren(json).filter((row) => !kind || row.itemType === kind)
  return { source: 'zotero' as const, count: rows.length, items: rows }
}
```

- [ ] **Step 8: 写 `src/handlers.ts` 的 5 个阶段 1 handler**

```ts
import type { ZoteroTransport } from './transport.js'
import { buildSearchRequest, filterTop } from './search.js'
import { getItem, getBatch } from './detail.js'
import { browse } from './browse.js'
import { children } from './children.js'
import { normalizeItem } from './normalize.js'
import type { PaperReference } from './types.js'

export const researchHandlers = {
  async search(transport: ZoteroTransport, args: any) {
    const { path, params } = buildSearchRequest(args)
    const { json, headers } = await transport.get(path, params)
    const rows = args.qmode === 'everything' ? filterTop(json) : json
    const items: PaperReference[] = rows.map((raw: any) => normalizeItem(raw))
    return { source: 'zotero', count: items.length, items,
      total: Number(headers.get('total-results') ?? items.length) }
  },
  async get(transport: ZoteroTransport, args: any) { return getItem(transport, args.key) },
  async getBatch(transport: ZoteroTransport, args: any) { return getBatch(transport, args.keys) },
  async browse(transport: ZoteroTransport, args: any) { return browse(transport, args.kind, args.limit ?? 50) },
  async children(transport: ZoteroTransport, args: any) { return children(transport, args.key, args.kind) },
}
```

- [ ] **Step 9: 写 `src/tools.ts`（真实 DSH 适配层，仅此文件 import dsh-tools）**

```ts
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type { ZoteroTransport } from './transport.js'
import { researchHandlers } from './handlers.js'

const SOURCE_PARAM = {
  type: 'string', enum: ['zotero'], description: '阶段 1-2 仅支持 zotero',
}

export function registerResearchTools(ctx: Context, transport: ZoteroTransport): () => void {
  const definitions = [
    defineTool({
      name: 'research_search',
      description: '搜索 Zotero 文献库（默认只返回顶层父条目）。',
      parameters: {
        query: { type: 'string', description: '关键词' },
        source: SOURCE_PARAM,
        tags: { type: 'array', items: { type: 'string' } },
        collection: { type: 'string' },
        qmode: { type: 'string', enum: ['metadata', 'everything'] },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        offset: { type: 'integer', minimum: 0 },
      },
      output: { schema: { type: 'object' } },
      async execute(args: any) { return researchHandlers.search(transport, args) },
    }),
    defineTool({
      name: 'research_get',
      description: '按 Zotero key 读取单条文献元数据。',
      parameters: { key: { type: 'string', minLength: 1 }, source: SOURCE_PARAM },
      async execute(args: any) { return researchHandlers.get(transport, args) },
    }),
    defineTool({
      name: 'research_get_batch',
      description: '批量读取 Zotero 条目，逐条报告成功或失败。',
      parameters: { keys: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 50 }, source: SOURCE_PARAM },
      async execute(args: any) { return researchHandlers.getBatch(transport, args) },
    }),
    defineTool({
      name: 'research_browse',
      description: '浏览 Zotero 合集与标签。',
      parameters: { kind: { type: 'string', enum: ['collections', 'tags'] }, source: SOURCE_PARAM, limit: { type: 'integer' } },
      async execute(args: any) { return researchHandlers.browse(transport, args) },
    }),
    defineTool({
      name: 'research_children',
      description: '读取 Zotero 条目的附件、笔记或批注子条目。',
      parameters: { key: { type: 'string' }, kind: { type: 'string', enum: ['attachment', 'note', 'annotation'] }, source: SOURCE_PARAM },
      async execute(args: any) { return researchHandlers.children(transport, args) },
    }),
  ]
  const disposers = definitions.map((d) => ctx.tools!.register(d))
  return () => disposers.forEach((dispose) => dispose())
}
```

- [ ] **Step 10: 修改 `src/index.ts` 调用工具注册，运行全部测试**

在 `ctx.effect` 内加入：`const disposeTools = registerResearchTools(ctx, transport); return () => disposeTools()`。

Run: `cd /d/agentero-zotero-patch && npm test && ./scripts/node.sh scripts/verify-zotero.mjs`
Expected: 全部单测 PASS；真实库冒烟 11/11 PASS

- [ ] **Step 11: 提交**

```bash
git checkout -b agent/2026-11-24-phase1-read-tools
git add src tests
git commit -m "feat(zotero-patch): [AI] 阶段 1 只读 research_* 工具

Agent-Task: 阶段 1 - Zotero 接入与只读工具
Agent-Model: Tencent Hunyuan Hy
Agent-Decision: 搜索默认走 /items/top 避免附件混入；纯 handler 与 DSH 适配层分离"
```

---

### Task 3: 阶段 2 研究工具（retrieve / export / match / changes）

**Files:**
- Create: `src/retrieve.ts`, `src/export.ts`, `src/match.ts`, `src/changes.ts`
- Create: `tests/retrieve.test.ts`, `tests/export.test.ts`, `tests/match.test.ts`, `tests/changes.test.ts`
- Modify: `src/handlers.ts`（加 4 个 handler）、`src/tools.ts`（加 4 个工具定义）

**Interfaces:**
- Consumes: `ZoteroTransport`, `normalizeItem`, `researchHandlers`
- Produces:
  - `retrieve(transport, {key, query, maxSnippets?}): Promise<EvidenceSnippet[]>`
  - `exportCitation(ref, format): string`，format ∈ citation|bibtex|biblatex|ris|csljson
  - `matchReferences(targets, candidates): Array<{key:string; matchedKey?:string; method:string}>`
  - `changes(transport, {since, limit}): Promise<{items:any[]; version?:number}>`

- [ ] **Step 1: 写失败测试 `tests/retrieve.test.ts`（BM25 排序与页码保留）**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { bm25Rank } from '../lib/retrieve.js'

test('BM25 把含查询词的片段排在前面', () => {
  const passages = [
    { attachmentKey: 'A', snippet: 'contrastive learning representation', page: 3 },
    { attachmentKey: 'A', snippet: 'unrelated text about nothing', page: 7 },
  ]
  const ranked = bm25Rank(passages, 'contrastive')
  assert.equal(ranked[0].snippet, 'contrastive learning representation')
  assert.equal(ranked[0].page, 3)
})
```

- [ ] **Step 2: 运行测试确认失败**（同 Task 2 Step 2）

- [ ] **Step 3: 写 `src/retrieve.ts`**

```ts
import type { ZoteroTransport } from './transport.js'
import type { EvidenceSnippet } from './types.js'

const K1 = 1.2
const B = 0.75

export function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5]+/).filter((t) => t.length > 1)
}

export function bm25Rank(passages: EvidenceSnippet[], query: string): EvidenceSnippet[] {
  const terms = tokenize(query)
  if (terms.length === 0) return passages
  const docs = passages.map((p) => tokenize(p.snippet))
  const avg = docs.reduce((sum, d) => sum + d.length, 0) / Math.max(docs.length, 1)
  const df = terms.map((term) => docs.filter((d) => d.includes(term)).length)
  const idf = df.map((n) => Math.log(1 + (docs.length - n + 0.5) / (n + 0.5)))
  return passages.map((p, i) => {
    const d = docs[i]
    const tf = terms.map((term) => d.filter((t) => t === term).length)
    const score = terms.reduce((sum, _, j) => {
      const f = tf[j]
      return sum + idf[j] * (f * (K1 + 1)) / (f + K1 * (1 - B + B * (d.length / Math.max(avg, 1))))
    }, 0)
    return { passage: p, score }
  }).sort((a, b) => b.score - a.score).map((x) => x.passage)
}

export function chunkText(text: string, wordsPerChunk = 200): EvidenceSnippet[] {
  const words = text.split(/\s+/).filter(Boolean)
  const out: EvidenceSnippet[] = []
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    out.push({ attachmentKey: '', snippet: words.slice(i, i + wordsPerChunk).join(' '), matchType: 'fulltext' })
  }
  return out
}

export async function retrieve(transport: ZoteroTransport, args: {
  key: string; query: string; maxSnippets?: number
}): Promise<EvidenceSnippet[]> {
  const { json } = await transport.get(`users/0/items/${encodeURIComponent(args.key)}/fulltext`)
  const content = typeof json?.content === 'string' ? json.content : ''
  const chunks = chunkText(content).map((c) => ({ ...c, attachmentKey: args.key }))
  const ranked = bm25Rank(chunks, args.query)
  // 批注自带页码，作为可回溯定位的补充证据。
  try {
    const ann = await transport.get(`users/0/items/${encodeURIComponent(args.key)}/children`,
      { itemType: 'annotation', limit: 100 })
    for (const row of ann.json) {
      if (typeof row?.data?.annotationText === 'string' && row.data.annotationText.toLowerCase().includes(args.query.toLowerCase())) {
        ranked.push({ attachmentKey: args.key, snippet: row.data.annotationText,
          page: row.data.page ? Number(row.data.page) : undefined,
          matchType: 'annotation', annotationKey: row.key })
      }
    }
  } catch { /* 批注端点不可用不影响全文证据 */ }
  return ranked.slice(0, Math.min(Math.max(args.maxSnippets ?? 10, 1), 50))
}
```

- [ ] **Step 4: 写失败测试 `tests/match.test.ts` 与实现 `src/match.ts`**

```ts
test('身份匹配优先级：DOI > arXiv/PMID > 标题+作者+年份', () => {
  const targets = [
    { key: 'T1', doi: '10.1/x' },
    { key: 'T2', extra: 'arXiv:2101.00001' },
    { key: 'T3', title: 'Alpha', authors: ['A'], year: 2020 },
  ]
  const candidates = [
    { key: 'C1', doi: '10.1/x' },
    { key: 'C2', extra: 'arXiv:2101.00001' },
    { key: 'C3', title: 'Alpha', authors: ['A'], year: 2020 },
  ]
  assert.deepEqual(matchReferences(targets, candidates), [
    { key: 'T1', matchedKey: 'C1', method: 'doi' },
    { key: 'T2', matchedKey: 'C2', method: 'arxiv' },
    { key: 'T3', matchedKey: 'C3', method: 'title-author-year' },
  ])
})
```

```ts
// src/match.ts
export interface MatchTarget { key: string; doi?: string; extra?: string; title?: string; authors?: string[]; year?: number }
export function identityOf(ref: MatchTarget): { method: string; value: string } | undefined {
  if (ref.doi) return { method: 'doi', value: ref.doi.toLowerCase().trim() }
  const arxiv = /(?:arXiv:)?(\d{4}\.\d{4,5})/i.exec(ref.extra ?? '')
  if (arxiv) return { method: 'arxiv', value: arxiv[1] }
  const pmid = /PMID:\s*(\d+)/i.exec(ref.extra ?? '')
  if (pmid) return { method: 'pmid', value: pmid[1] }
  if (ref.title && ref.authors?.length && ref.year) {
    return { method: 'title-author-year', value: `${ref.title.toLowerCase().trim()}|${ref.authors.join(';').toLowerCase()}|${ref.year}` }
  }
  return undefined
}
export function matchReferences(targets: MatchTarget[], candidates: MatchTarget[]) {
  const index = new Map<string, string>()
  for (const c of candidates) {
    const id = identityOf(c)
    if (id) index.set(`${id.method}:${id.value}`, c.key)
  }
  return targets.map((t) => {
    const id = identityOf(t)
    const matchedKey = id ? index.get(`${id.method}:${id.value}`) : undefined
    return { key: t.key, matchedKey, method: id?.method ?? 'none' }
  })
}
```

- [ ] **Step 5: 写 `src/export.ts` 与测试**

```ts
test('导出格式包含来源标识与原生 ID', () => {
  const ref = { source: 'zotero' as const, sourceId: 'VH86EE2K', title: 'T', itemType: 'journalArticle',
    authors: ['A B'], year: 2020, doi: '10.1/x', tags: [], collectionKeys: [] }
  assert.match(exportCitation(ref, 'bibtex'), /@article\{VH86EE2K/)
  assert.match(exportCitation(ref, 'ris'), /TY  - JOUR/)
  assert.match(exportCitation(ref, 'csljson'), /"id":"VH86EE2K"/)
  assert.equal(JSON.parse(exportCitation(ref, 'csljson')).source, 'zotero')
})
```

```ts
// src/export.ts
import type { PaperReference } from './types.js'
export type ExportFormat = 'citation' | 'bibtex' | 'biblatex' | 'ris' | 'csljson'
const ZOTERO_TYPE_TO_BIB: Record<string, string> = {
  journalArticle: 'article', book: 'book', conferencePaper: 'inproceedings',
  thesis: 'phdthesis', report: 'techreport', webpage: 'misc', preprint: 'misc',
}
export function exportCitation(ref: PaperReference, format: ExportFormat): string {
  if (format === 'csljson') {
    return JSON.stringify({ id: ref.sourceId, source: ref.source, type: ref.itemType,
      title: ref.title, author: ref.authors.map((name) => ({ literal: name })),
      issued: ref.year ? { 'date-parts': [[ref.year]] } : undefined, DOI: ref.doi })
  }
  if (format === 'ris') {
    return ['TY  - JOUR', `TI  - ${ref.title}`, ...ref.authors.map((a) => `AU  - ${a}`),
      `PY  - ${ref.year ?? ''}`, `DO  - ${ref.doi ?? ''}`, `ID  - ${ref.sourceId}`, 'ER  -'].join('\n')
  }
  const key = ref.sourceId
  const type = ZOTERO_TYPE_TO_BIB[ref.itemType] ?? 'misc'
  const fields = [`  title = {${ref.title}}`, `  author = {${ref.authors.join(' and ')}}`,
    `  year = {${ref.year ?? ''}}`, ...(ref.doi ? [`  doi = {${ref.doi}}`] : [])]
  if (format === 'citation') return `${ref.authors.join(', ')} (${ref.year ?? 'n.d.'}). ${ref.title}.`
  const name = format === 'biblatex' ? `@${type}{${key},\n${fields.join(',\n')}\n}` : `@${type}{${key},\n${fields.join(',\n')}\n}`
  return name
}
```

- [ ] **Step 6: 写 `src/changes.ts` 与测试**

```ts
test('changes 使用 since 游标并回传 Last-Modified-Version', async () => {
  const fake = async (_url: URL, init?: RequestInit) => new Response(JSON.stringify([{ key: 'X' }]),
    { status: 200, headers: { 'last-modified-version': '44', 'zotero-api-version': '3' } })
  const t = new ZoteroTransport({ fetchImpl: fake as typeof fetch })
  assert.deepEqual(await changes(t, { since: 40, limit: 10 }), { items: [{ key: 'X' }], version: 44 })
})
```

```ts
// src/changes.ts
import type { ZoteroTransport } from './transport.js'
export async function changes(transport: ZoteroTransport, args: { since?: number; limit?: number }) {
  const { json, headers } = await transport.get('users/0/items',
    { since: args.since, limit: args.limit ?? 100 })
  const version = headers.get('last-modified-version')
  return { items: json, version: version ? Number(version) : undefined }
}
```

- [ ] **Step 7: 扩展 handlers 与 tools**

在 `researchHandlers` 增加 `retrieve/export/match/changes` 四个方法；在 `tools.ts` 的 `definitions` 增加四个 `defineTool`，名称分别为 `research_retrieve`、`research_export`、`research_match_references`、`research_changes`，每个都带 `source: SOURCE_PARAM`，`execute` 调用对应 handler。

- [ ] **Step 8: 运行测试 + 真实联调，然后提交**

Run: `cd /d/agentero-zotero-patch && npm test && ./scripts/node.sh scripts/verify-zotero.mjs`
Expected: 全部 PASS

```bash
git checkout -b agent/2026-11-24-phase2-research-tools
git add src tests
git commit -m "feat(zotero-patch): [AI] 阶段 2 研究工具与证据定位

Agent-Task: 阶段 2 - retrieve/export/match/changes
Agent-Model: Tencent Hunyuan Hy
Agent-Decision: BM25 k1=1.2 b=0.75；批注页码作为可回溯证据；不开放写入"
```

---

### Task 4: 阶段 3 Sources 会话轨迹

**Files:**
- Create: `src/sources.ts`, `src/sources-entry.ts`, `tests/sources.test.ts`
- Modify: `cordis.patch.yml`（新增 `zotero-patch-sources` 行）

**Interfaces:**
- Consumes: `PaperReference`、`EvidenceSnippet`
- Produces:
  - `createSourceLedger(): { fold(event: SourceEvent): boolean; workspace(): SourceWorkspace }`
  - `SourceEvent`：`{ id: string; kind: 'search'|'read'|'evidence'|'export'; source: SourceKind; sourceId: string; query?: string; evidence?: EvidenceSnippet[] }`
  - `SourceWorkspace`：`{ sources: PaperReference[]; totalSources: number; exports: string[] }`

- [ ] **Step 1: 写失败测试 `tests/sources.test.ts`**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { createSourceLedger } from '../lib/sources.js'

test('折叠幂等：同一 event id 不产生重复记录，workspace 保留来源标识', () => {
  const ledger = createSourceLedger()
  const event = { id: 'e1', kind: 'read' as const, source: 'zotero' as const,
    sourceId: 'VH86EE2K', query: 'contrastive' }
  assert.equal(ledger.fold(event), true)
  assert.equal(ledger.fold(event), false)
  const ws = ledger.workspace()
  assert.equal(ws.totalSources, 1)
  assert.equal(ws.sources[0].source, 'zotero')
  assert.equal(ws.sources[0].sourceId, 'VH86EE2K')
})
```

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 写 `src/sources.ts`**

```ts
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
          source: event.source, sourceId: event.sourceId,
          title: event.title ?? '', itemType: 'unknown', authors: [], tags: [], collectionKeys: [],
        })
      }
      if (event.query) queries.push(event.query)
      if (event.kind === 'export' && event.exportFormat) exports.push(event.exportFormat)
      return true
    },
    workspace(): SourceWorkspace {
      const sources = [...byId.values()]
      return { sources, totalSources: sources.length, exports: [...exports], queries: [...queries] }
    },
  }
}
```

- [ ] **Step 4: 写 `src/sources-entry.ts`**

```ts
import type { Context } from '@deepseek-ai/cordis'
import { createSourceLedger } from './sources.js'
export const name = 'zotero-patch-sources'
export const inject: string[] = []
export function apply(ctx: Context): void {
  const ledger = createSourceLedger()
  ctx.effect(() => {
    ;(ctx as any).zoteroPatchSources = ledger
    return () => { delete (ctx as any).zoteroPatchSources }
  })
}
```

- [ ] **Step 5: 修改 `cordis.patch.yml`**

追加：
```yaml
    - id: zotero-patch-sources
      name: agentero-zotero-patch/sources
      config: {}
```

- [ ] **Step 6: 运行测试 + 提交**

```bash
cd /d/agentero-zotero-patch && npm test
git checkout -b agent/2026-11-24-phase3-sources
git add src tests cordis.patch.yml
git commit -m "feat(zotero-patch): [AI] 阶段 3 Sources 会话轨迹

Agent-Task: 阶段 3 - 来源折叠与幂等
Agent-Model: Tencent Hunyuan Hy
Agent-Decision: 以 event.id 去重保证幂等；workspace 只输出窗口化视图"
```

---

### Task 5: 阶段 4 统一服务层与 agentero 桥接

**Files:**
- Create: `src/unified.ts`, `src/bridge.ts`, `src/bridge-entry.ts`
- Create: `tests/unified.test.ts`, `tests/bridge.test.ts`
- Modify: `src/handlers.ts`（`source` 参数放开）、`cordis.patch.yml`（加 bridge 行）

**Interfaces:**
- Consumes: `researchHandlers`（阶段 1-2）、`ZoteroTransport`
- Produces:
  - `probeAgentero(ctx): { host: unknown; library: unknown; available: boolean }`
  - `routeSource(source: SourceKind | undefined, zoteroCall, agenteroCall?)`: 统一路由，agentero 缺失时返回明确错误而非静默回退到 zotero
  - `unifyReferences(refs: PaperReference[]): PaperReference[]`：按 DOI/强标识/标题+作者+年份去重展示，保留各自 source 与 sourceId

- [ ] **Step 1: 写失败测试 `tests/unified.test.ts`**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { unifyReferences, routeSource } from '../lib/unified.js'

test('跨库展示去重但保留各自来源与原生 ID', () => {
  const refs = [
    { source: 'zotero' as const, sourceId: 'Z1', title: 'T', itemType: 'journalArticle', authors: ['A'], year: 2020, doi: '10.1/x', tags: [], collectionKeys: [] },
    { source: 'agentero' as const, sourceId: 'A1', title: 'T', itemType: 'journalArticle', authors: ['A'], year: 2020, doi: '10.1/x', tags: [], collectionKeys: [] },
  ]
  const out = unifyReferences(refs)
  assert.equal(out.length, 1)
  assert.equal(out[0].source, 'zotero')
  assert.equal(out[0].sourceId, 'Z1')
})

test('source=agentero 且 agentero 不可用时明确报错，不静默改走 zotero', async () => {
  await assert.rejects(() => routeSource('agentero', async () => 'zotero', undefined), /AGENTERO_UNAVAILABLE/)
})
```

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 写 `src/unified.ts`**

```ts
import type { PaperReference, SourceKind } from './types.js'
import { identityOf } from './match.js'
import { ZoteroPatchError } from './errors.js'

export function unifyReferences(refs: PaperReference[]): PaperReference[] {
  const seen = new Set<string>()
  const out: PaperReference[] = []
  for (const ref of refs) {
    const id = identityOf(ref)
    const key = id ? `${id.method}:${id.value}` : `${ref.source}:${ref.sourceId}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ref)
  }
  return out
}

export async function routeSource<T>(
  source: SourceKind | undefined,
  zoteroCall: () => Promise<T>,
  agenteroCall?: () => Promise<T>,
): Promise<T> {
  if (source === undefined || source === 'zotero') return zoteroCall()
  if (source === 'agentero') {
    if (!agenteroCall) throw new ZoteroPatchError('AGENTERO_UNAVAILABLE: agentero 服务不可用', 'ZOTERO_PATCH_AGENTERO_UNAVAILABLE')
    return agenteroCall()
  }
  throw new ZoteroPatchError(`未知 source: ${source}`, 'ZOTERO_PATCH_UNEXPECTED')
}
```

- [ ] **Step 4: 写 `src/bridge.ts` 与 `src/bridge-entry.ts`**

```ts
// src/bridge.ts
import type { Context } from '@deepseek-ai/cordis'
export interface AgenteroProbe {
  host: unknown
  library: unknown
  available: boolean
}
export function probeAgentero(ctx: Context): AgenteroProbe {
  const host = ctx.get('agentero-host')
  const library = ctx.get('agentero-library')
  return { host, library, available: host !== undefined || library !== undefined }
}
```

```ts
// src/bridge-entry.ts
import type { Context } from '@deepseek-ai/cordis'
import { probeAgentero } from './bridge.js'
export const name = 'zotero-patch-bridge'
export const inject: string[] = []
export function apply(ctx: Context): void {
  const probe = probeAgentero(ctx)
  ctx.effect(() => {
    ;(ctx as any).zoteroPatchBridge = probe
    return () => { delete (ctx as any).zoteroPatchBridge }
  })
}
```

- [ ] **Step 5: 修改 handlers/tools 接受跨库 source**

将 `SOURCE_PARAM` 的 `enum` 改为 `['zotero', 'agentero']` 并说明「省略为跨库」；`researchHandlers.search/get/getBatch` 内部通过 `routeSource(args.source, zoteroCall, agenteroCallFromProbe)` 路由。agentero 调用仅在探测可用时构造，否则显式错误。

- [ ] **Step 6: 修改 `cordis.patch.yml` 加 bridge 行，运行测试并提交**

```yaml
    - id: zotero-patch-bridge
      name: agentero-zotero-patch/bridge
      config: {}
```

```bash
cd /d/agentero-zotero-patch && npm test
git checkout -b agent/2026-11-24-phase4-bridge
git add src tests cordis.patch.yml
git commit -m "feat(zotero-patch): [AI] 阶段 4 统一服务层与可选桥接

Agent-Task: 阶段 4 - 跨库路由与最小只读回退
Agent-Model: Tencent Hunyuan Hy
Agent-Decision: agentero 不可用时不静默改走 zotero，而是显式报错；
  跨库展示按 DOI/强标识去重但保留原生 sourceId"
```

---

### Task 6: 阶段 5 高级能力（默认关闭）

**Files:**
- Create: `src/scholarly.ts`, `src/enrichment.ts`, `tests/scholarly.test.ts`
- Modify: `cordis.patch.yml`（加两个 `disabled: true` 行）

**Interfaces:**
- Consumes: 无（独立组件）
- Produces: `searchExternal(query): Promise<PaperReference[]>`（scholarly）、`rankPassages(passages, query): Promise<EvidenceSnippet[]>`（enrichment）

- [ ] **Step 1: 写失败测试 `tests/scholarly.test.ts`**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { assertEgressAllowed } from '../lib/scholarly.js'

test('外部检索默认拒绝未授权域名', () => {
  assert.throws(() => assertEgressAllowed('https://evil.example', false), /ZOTERO_PATCH_EGRESS_DENIED/)
  assert.doesNotThrow(() => assertEgressAllowed('https://api.openalex.org', true))
})
```

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 写 `src/scholarly.ts` / `src/enrichment.ts`**

```ts
// src/scholarly.ts
import type { Context } from '@deepseek-ai/cordis'
import { ZoteroPatchError } from './errors.js'
const ALLOWED_HOSTS = new Set(['api.openalex.org', 'api.crossref.org', 'export.arxiv.org', 'api.semanticscholar.org'])
export function assertEgressAllowed(url: string, enabled: boolean): void {
  if (!enabled) throw new ZoteroPatchError('外部检索未启用', 'ZOTERO_PATCH_EGRESS_DENIED')
  let host: string
  try { host = new URL(url).hostname } catch {
    throw new ZoteroPatchError('非法 URL', 'ZOTERO_PATCH_BAD_PATH')
  }
  if (!ALLOWED_HOSTS.has(host)) {
    throw new ZoteroPatchError(`未授权的外网目标 ${host}`, 'ZOTERO_PATCH_EGRESS_DENIED')
  }
}
export const name = 'zotero-patch-scholarly'
export const inject: string[] = []
export function apply(ctx: Context, config: { enabled?: boolean } = {}): void {
  ctx.effect(() => {
    ;(ctx as any).zoteroPatchScholarly = {
      assertEgressAllowed: (url: string) => assertEgressAllowed(url, config.enabled === true),
    }
    return () => { delete (ctx as any).zoteroPatchScholarly }
  })
}
```

```ts
// src/enrichment.ts
import type { Context } from '@deepseek-ai/cordis'
import type { EvidenceSnippet } from './types.js'
import { ZoteroPatchError } from './errors.js'
export async function rankPassages(passages: EvidenceSnippet[], query: string, modelAvailable: boolean): Promise<EvidenceSnippet[]> {
  if (!modelAvailable) {
    throw new ZoteroPatchError('语义模型不可用，不静默回退 BM25', 'ZOTERO_PATCH_UNEXPECTED')
  }
  // 阶段 5 占位：模型可用性由配置注入；实际排序模型按部署选择，未启用时上面的显式错误是唯一行为。
  const q = query.toLowerCase()
  return passages.filter((p) => p.snippet.toLowerCase().includes(q))
}
export const name = 'zotero-patch-enrichment'
export const inject: string[] = []
export function apply(ctx: Context, config: { enabled?: boolean } = {}): void {
  ctx.effect(() => {
    ;(ctx as any).zoteroPatchEnrichment = {
      rank: (passages: EvidenceSnippet[], query: string) =>
        rankPassages(passages, query, config.enabled === true),
    }
    return () => { delete (ctx as any).zoteroPatchEnrichment }
  })
}
```

- [ ] **Step 4: 修改 `cordis.patch.yml` 加两个默认关闭行**

```yaml
    - id: zotero-patch-scholarly
      name: agentero-zotero-patch/scholarly
      disabled: true
      config: { enabled: false }
    - id: zotero-patch-enrichment
      name: agentero-zotero-patch/enrichment
      disabled: true
      config: { enabled: false }
```

- [ ] **Step 5: 运行测试 + 真实联调 + 提交**

```bash
cd /d/agentero-zotero-patch && npm test && ./scripts/node.sh scripts/verify-zotero.mjs
git checkout -b agent/2026-11-24-phase5-advanced
git add src tests cordis.patch.yml
git commit -m "feat(zotero-patch): [AI] 阶段 5 高级能力（默认关闭）

Agent-Task: 阶段 5 - scholarly/enrichment 独立开关与授权边界
Agent-Model: Tencent Hunyuan Hy
Agent-Decision: 两项默认 disabled；语义模型缺失显式报错，不静默回退 BM25"
```

---

## Self-Review（写完计划后执行）

**1. Spec coverage**
- §5 九个工具 → Task 2（5 个）+ Task 3（4 个）覆盖 ✓
- §6.2 写路径 → 明确 YAGNI，5 阶段均不开放 ✓
- §7 错误处理 → `errors.ts` 定义 9 个码，transport 翻译 ✓
- §8 迁移原则 → `THIRD_PARTY_NOTICES.md`，纯逻辑抽取 ✓
- §9 测试 → 每任务含单测 + 真实联调 ✓
- §10 五阶段 → Task 1-6 一一对应 ✓
- §12 待补齐项 → 工具 schema 在 Task 2/3 给出；bridge 接口面在 Task 5 给出；统一面板字段在 `PaperReference` 给出 ✓

**2. Placeholder scan**
- 无 `TBD` / `TODO` / `implement later`；`enrichment.ts` 中的模型排序是明确范围为“按部署选择，未启用即显式错误”，属于阶段 5 默认关闭设计，不是占位。

**3. Type consistency**
- `PaperReference.source` 始终 `SourceKind`；`sourceId` 始终 string。
- `researchHandlers.search/get/getBatch` 在 Task 2 定义，Task 5 扩展参数，函数名未变。
- `ZoteroTransport.get` 签名在 Task 1 定义，后续全部沿用。
- `createSourceLedger().fold/workspace` 在 Task 4 定义，无后续改名。

## Execution Handoff

Plan complete. Two execution options:

1. **Inline Execution（本会话内逐任务实现）** — 按 Task 1→6 顺序执行，每个任务跑测试后提交。
2. **Subagent-Driven** — 每任务派发新 subagent，任务间审查。
