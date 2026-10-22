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
  /** True once the agent list has shown it, so leaving the list means it ended. */
  isListed?: boolean
}

export type CrewTotals = { tokens: Tokens; usd: number; saved: number }

/**
 * The model-router mod's decision for a subagent, as that mod's contract
 * declares it. The crew only reads it; without the router it is absent.
 */
export type RouterRoute = {
  tier: 'easy' | 'normal' | 'hard'
  by: 'rule' | 'type' | 'keywords' | 'haiku' | 'default'
  fromModel: string
  toModel: string
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}

declare module 'claude-code' {
  interface PluginState {
    'agent-crew': {
      crew: Record<string, CrewMember>
      archived: CrewTotals
      tick: number
      sessionUsd: number | null
    }
    'model-router': {
      routes: Record<string, RouterRoute>
    }
  }
}
