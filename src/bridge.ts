import type { Context } from '@deepseek-ai/cordis'

export interface AgenteroProbe {
  host: unknown
  library: unknown
  available: boolean
}

export interface AgenteroAdapter {
  search(args: any): Promise<any[]>
  get(args: any): Promise<any>
}

let adapter: AgenteroAdapter | undefined

export function setAgenteroAdapter(next?: AgenteroAdapter): void {
  adapter = next
}

export function getAgenteroAdapter(): AgenteroAdapter | undefined {
  return adapter
}

/** 可选探测：未安装 agentero-dsh 或服务缺失时不阻塞挂载。 */
export function probeAgentero(ctx: Context): AgenteroProbe {
  const host = ctx.get('agentero-host')
  const library = ctx.get('agentero-library')
  return { host, library, available: host !== undefined || library !== undefined }
}
