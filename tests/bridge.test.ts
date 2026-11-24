import test from 'node:test'
import assert from 'node:assert/strict'
import { probeAgentero, setAgenteroAdapter, getAgenteroAdapter } from '../lib/bridge.js'

test('probeAgentero 在 host 或 library 存在时报告可用', () => {
  const empty = probeAgentero({ get: () => undefined } as any)
  assert.equal(empty.available, false)
  const withHost = probeAgentero({
    get: (name: string) => (name === 'agentero-host' ? { ready: true } : undefined),
  } as any)
  assert.equal(withHost.available, true)
  assert.ok(withHost.host)
})

test('adapter 可设置与清除，卸载后不残留', () => {
  const adapter = { search: async () => [], get: async () => ({}) }
  setAgenteroAdapter(adapter)
  assert.equal(getAgenteroAdapter(), adapter)
  setAgenteroAdapter(undefined)
  assert.equal(getAgenteroAdapter(), undefined)
})
