export type Tokens = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export type LaneStatus = 'starting' | 'running' | 'done' | 'failed'

/** One variant of a bout: its branch, its worktree and the agent working in it. */
export type Lane = {
  index: number
  branch: string
  worktree: string
  agentId?: string
  status: LaneStatus
  model?: string
  steps: number
  tokens: Tokens
  /** Estimated dollars at list prices. */
  usd: number
  startedAt: number
  endedAt?: number
  /** The last line of `git diff --stat` once the lane's work is committed. */
  summary?: string
  /** True once the lane's work is committed and its summary read. */
  isSettled?: boolean
  error?: string
}

/** The judge's look at the finished lanes. */
export type Judge = {
  status: 'thinking' | 'done' | 'failed' | 'skipped'
  /** Who started it, so two lanes finishing together start one judge. */
  token: string
  /** The lane it proposes, by index. */
  winner?: number
  reason?: string
  usd: number
}

/** How the bout ended once the person picked a lane. */
export type Outcome = {
  isMerged: boolean
  index?: number
  message: string
}

/** One run of /arena: a task, the commit it starts from, and its lanes. */
export type Bout = {
  id: string
  task: string
  repoRoot: string
  baseRef: string
  baseBranch: string
  startedAt: number
  lanes: Lane[]
  judge?: Judge
  outcome?: Outcome
}

declare module 'claude-code' {
  interface PluginState {
    arena: {
      bout: Bout | null
      tick: number
    }
  }
}
