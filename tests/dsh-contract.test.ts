import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// DSH 的 value schema DSL 只接受有限的 JSON Schema 关键字。这些约束关键字
// 一旦出现在 tools.ts 里，组件加载时就会抛 "unsupported JSON schema"。
// 真实的 cordis / dsh-tools 是 peer 依赖，测试环境不提供，因此这里用源码
// 契约守卫锁住约束，运行期范围校验由 handlers.test.ts 覆盖。
const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const readSrc = (file: string) => readFileSync(join(srcDir, file), 'utf8')

test('工具参数 schema 不含 DSH DSL 拒绝的约束关键字', () => {
  const source = readSrc('tools.ts')
  const forbidden = [
    'minimum', 'maximum', 'minLength', 'maxLength',
    'minItems', 'maxItems', 'exclusiveMinimum', 'exclusiveMaximum',
  ]
  for (const keyword of forbidden) {
    assert.doesNotMatch(source, new RegExp(`\\b${keyword}\\s*:`), `tools.ts 不应含 ${keyword}`)
  }
})

test('每个 object schema 都显式声明布尔 additionalProperties', () => {
  // DSH 0.2.3-alpha.2 的 dsh-tools enforced JSON Schema 子集要求 object schema
  // 必须显式给出 boolean additionalProperties，否则组件加载即抛
  // "unsupported JSON schema: schema.additionalProperties must be explicitly true or false"。
  // 这里用源码守卫锁住该不变量，避免未来新增工具时回归。
  const lines = readSrc('tools.ts').split('\n')
  const objectLineIndexes: number[] = []
  lines.forEach((line, i) => {
    if (/type:\s*['"]object['"]/.test(line)) objectLineIndexes.push(i)
  })
  assert.ok(objectLineIndexes.length > 0, '未找到任何 object schema，测试需更新')
  for (const i of objectLineIndexes) {
    const window = lines.slice(i, i + 4).join('\n')
    assert.match(
      window,
      /additionalProperties:\s*(true|false)\b/,
      `tools.ts:${i + 1} 的 object schema 必须显式声明 boolean additionalProperties`,
    )
  }
})

test('每个工具都声明 DSH 0.2.3 必需的 output { schema, render }', () => {
  // defineTool 会无条件读取 options.output.render；缺少 output 时组件加载
  // 直接抛 "Cannot read properties of undefined (reading 'render')"。
  const source = readSrc('tools.ts')
  const toolCount = (source.match(/defineTool\(\{/g) ?? []).length
  const outputCount = (source.match(/^\s*output:\s*output\(\),/gm) ?? []).length
  assert.ok(toolCount > 0, '未找到 defineTool 调用，测试需更新')
  assert.equal(outputCount, toolCount, '每个 defineTool 都必须声明 output: output()')
  assert.match(source, /schema:\s*\{\}/, 'output() 必须声明无约束 schema')
  assert.match(source, /render:\s*\([^)]*\)\s*=>/, 'output() 必须声明 render 函数')
})

test('九个 research_* 工具仍全部注册', () => {
  const source = readSrc('tools.ts')
  const names = [
    'research_search', 'research_get', 'research_get_batch', 'research_browse',
    'research_children', 'research_retrieve', 'research_export',
    'research_match_references', 'research_changes',
  ]
  for (const name of names) {
    assert.match(source, new RegExp(`name:\\s*'${name}'`), `缺少工具 ${name}`)
  }
  assert.match(source, /ctx\.tools!\.register\(d\)/)
})

test('所有 zoteroPatch* 服务都通过 ctx.provide 声明，不再直接赋值 ctx', () => {
  const entries = ['index.ts', 'sources-entry.ts', 'bridge-entry.ts', 'scholarly.ts', 'enrichment.ts']
  const services = [
    'zoteroPatch', 'zoteroPatchSources', 'zoteroPatchBridge',
    'zoteroPatchScholarly', 'zoteroPatchEnrichment',
  ]
  for (const file of entries) {
    const source = readSrc(file)
    assert.doesNotMatch(source, /\(ctx as any\)\.zoteroPatch\w*\s*=/, `${file} 不应直接给 ctx 赋值`)
  }
  for (const service of services) {
    assert.ok(
      entries.some((file) => readSrc(file).includes(`ctx.provide('${service}'`)),
      `${service} 必须通过 ctx.provide 声明`,
    )
  }
})
