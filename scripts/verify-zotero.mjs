#!/usr/bin/env node
/**
 * verify-zotero.mjs — 真实 Zotero Local API 联调冒烟测试
 *
 * 目的：在没有 DSH 运行时的情况下，验证 dsh-zotero 所依赖的 Zotero Local API
 * 传输契约是否成立。这里刻意复刻 dsh-zotero ZoteroHttpClient 的关键行为：
 *   1. 每个请求带 `Zotero-API-Version: 3`；
 *   2. 从响应记住 `Zotero-Server-ID`，后续请求回传，检测 412 身份漂移；
 *   3. 流式读取响应体并施加字节上限（默认 16 MiB）；
 *   4. 拒绝重定向，翻译非 2xx 状态码；
 *   5. 列表默认走 `/items/top`，避免附件/批注混入搜索结果。
 *
 * 用法（项目内 Node 24）：
 *   ./scripts/node.sh scripts/verify-zotero.mjs
 *   ZOTERO_API_BASE=http://127.0.0.1:23119/api ./scripts/node.sh scripts/verify-zotero.mjs
 *
 * 退出码：全部通过 0；任一失败 1。
 */
import process from 'node:process';

const BASE = process.env.ZOTERO_API_BASE ?? 'http://127.0.0.1:23119/api';
const API_VERSION = '3';
const MAX_BYTES = 16 * 1024 * 1024;

const VERSION_HEADER = 'zotero-api-version';
const SERVER_ID_HEADER = 'zotero-server-id';
const ZOTERO_VERSION_HEADER = 'x-zotero-version';
const SCHEMA_VERSION_HEADER = 'zotero-schema-version';
const TOTAL_HEADER = 'total-results';

let serverId;
let passed = 0;
let failed = 0;

function ok(label, detail = '') {
  passed += 1;
  console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
}
function fail(label, detail = '') {
  failed += 1;
  console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
}
function info(label, detail = '') {
  console.log(`  INFO  ${label}${detail ? ` — ${detail}` : ''}`);
}

function baseWithSlash() {
  return BASE.endsWith('/') ? BASE : `${BASE}/`;
}

/** 流式读取，超过 MAX_BYTES 立即抛错（不缓冲超限后的字节）。 */
async function readBounded(response) {
  const reader = response.body?.getReader();
  if (!reader) return await response.text();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BYTES) {
      await reader.cancel();
      throw new Error(`响应超过 ${MAX_BYTES} 字节上限`);
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

/** 发送一个 GET，返回 { json|text, headers }；非 2xx 抛错。 */
async function request(path, params, { expectJson = true } = {}) {
  const url = new URL(path, baseWithSlash());
  if (url.origin !== new URL(baseWithSlash()).origin) {
    throw new Error(`拒绝跨源请求：${url.origin}`);
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  }
  const headers = { [VERSION_HEADER]: API_VERSION };
  if (serverId) headers[SERVER_ID_HEADER] = serverId;
  const response = await fetch(url, { method: 'GET', headers, redirect: 'manual' });

  const id = response.headers.get(SERVER_ID_HEADER);
  if (id) serverId = id;

  if (response.status === 412) {
    throw new Error('412 Zotero-Server-ID 不匹配（实例身份漂移）');
  }
  if (!response.ok) {
    const detail = await readBounded(response).catch(() => '');
    throw new Error(`HTTP ${response.status} ${url.pathname}${detail ? `：${detail.slice(0, 200)}` : ''}`);
  }
  const body = await readBounded(response);
  return {
    json: expectJson ? JSON.parse(body.replace(/^\uFEFF/, '')) : undefined,
    text: expectJson ? undefined : body,
    headers: response.headers,
  };
}

async function main() {
  console.log(`Zotero Local API 联调：${BASE}`);
  console.log('');

  // 1. 根端点 / 身份与版本
  const root = await request('', undefined, { expectJson: false });
  const zoteroVersion = root.headers.get(ZOTERO_VERSION_HEADER);
  const apiVersion = root.headers.get(VERSION_HEADER);
  const schemaVersion = root.headers.get(SCHEMA_VERSION_HEADER);
  info('根端点', `body="${root.text.trim()}"`);
  if (apiVersion === API_VERSION) ok('API 版本头', `Zotero-API-Version=${apiVersion}`);
  else fail('API 版本头', `期望 ${API_VERSION}，实际 ${apiVersion}`);
  if (zoteroVersion) ok('Zotero 版本头', `x-zotero-version=${zoteroVersion}`);
  else fail('Zotero 版本头', '响应缺少 x-zotero-version');
  if (schemaVersion) ok('Schema 版本头', `Zotero-Schema-Version=${schemaVersion}`);
  else fail('Schema 版本头', '响应缺少 Zotero-Schema-Version');
  if (serverId) ok('实例身份', `Zotero-Server-ID=${serverId}（后续请求将回传）`);
  else fail('实例身份', '响应缺少 Zotero-Server-ID');

  // 2. 顶层父条目（research_search 的默认数据源）
  const top = await request('users/0/items/top', { limit: 3 });
  const topTotal = top.headers.get(TOTAL_HEADER);
  if (Array.isArray(top.json) && top.json.length > 0) ok('/items/top', `返回 ${top.json.length} 条，Total-Results=${topTotal}`);
  else fail('/items/top', '未返回数组或数组为空');
  const first = Array.isArray(top.json) ? top.json[0] : undefined;
  if (first?.key && first?.itemType) info('首条父条目', `key=${first.key} type=${first.itemType} title="${String(first.data?.title ?? '').slice(0, 60)}"`);

  // 3. 单条详情（research_get）
  if (first?.key) {
    const one = await request(`users/0/items/${encodeURIComponent(first.key)}`);
    if (one.json?.key === first.key) ok('/items/<key>', `key=${one.json.key}（回传 server-id 未触发 412）`);
    else fail('/items/<key>', `返回 key=${one.json?.key}，期望 ${first.key}`);
  }

  // 4. 子条目（research_children）
  if (first?.key) {
    const children = await request(`users/0/items/${encodeURIComponent(first.key)}/children`, { limit: 10 });
    if (Array.isArray(children.json)) {
      ok('/items/<key>/children', `返回 ${children.json.length} 条`);
    } else {
      fail('/items/<key>/children', '未返回数组');
    }
  }

  // 5. 全文（research_retrieve）：直接从附件列表中取第一个 PDF，避免依赖父条目的子结构
  const attachments = await request('users/0/items', { itemType: 'attachment', limit: 20 });
  const pdf = Array.isArray(attachments.json)
    ? attachments.json.find((x) => String(x.data?.contentType ?? '').includes('pdf'))
    : undefined;
  if (pdf) {
    info('PDF 附件', `key=${pdf.key} file="${String(pdf.data?.filename ?? '').slice(0, 50)}"`);
    const ft = await request(`users/0/items/${encodeURIComponent(pdf.key)}/fulltext`);
    if (typeof ft.json?.content === 'string' && ft.json.content.length > 0) {
      ok('/items/<attachment>/fulltext', `抽取文本 ${ft.json.content.length} 字符`);
    } else {
      fail('/items/<attachment>/fulltext', '缺少非空 content');
    }
  } else {
    fail('/items?itemType=attachment', '未找到 PDF 附件');
  }

  // 6. 批注作为独立 itemType（设计文档中的证据定位来源）
  const ann = await request('users/0/items', { itemType: 'annotation', limit: 1 });
  if (ann.headers.get(TOTAL_HEADER) !== null) ok('批注检索', `Total-Results=${ann.headers.get(TOTAL_HEADER)}`);
  else fail('批注检索', '缺少 Total-Results 头');

  // 7. 合集与标签（research_browse 的数据源）
  const collections = await request('users/0/collections', { limit: 3 });
  if (Array.isArray(collections.json)) ok('/collections', `返回 ${collections.json.length} 条，Total-Results=${collections.headers.get(TOTAL_HEADER)}`);
  else fail('/collections', '未返回数组');
  const tags = await request('users/0/tags', { limit: 3 });
  if (Array.isArray(tags.json)) ok('/tags', `返回 ${tags.json.length} 条，Total-Results=${tags.headers.get(TOTAL_HEADER)}`);
  else fail('/tags', '未返回数组');

  console.log('');
  console.log(`结果：${passed} 通过，${failed} 失败`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error('');
  console.error(`联调中断：${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});
