export type CrewStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'idle'
  | 'completed'
  | 'failed'
  | 'killed'

export type Tokens = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export type CrewMember = {
  /** 'main' for the main loop, else the agent id. */
  id: string
  /** Where it hangs in the tree; absent for the main loop. */
  parentId?: string
  /** What the pane calls it: the task description, or the agent's name. */
  label: string
  /** The agent type (`general-purpose`, `Explore`, ...). */
  type: string
  status: CrewStatus
  /** What it is doing now, already put into words. */
  activity?: string
  model?: string
  effort?: string
  steps: number
  tools: number
  startedAt: number
  endedAt?: number
  tokens: Tokens
  /** Estimated dollars at list prices. */
  usd: number
}

export type CrewTotals = { tokens: Tokens; usd: number }

declare module 'claude-code' {
  interface PluginState {
    'agent-crew': {
      crew: Record<string, CrewMember>
      archived: CrewTotals
      tick: number
      sessionUsd: number | null
    }
  }
}
