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
