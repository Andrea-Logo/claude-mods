export type RouterTier = 'easy' | 'normal' | 'hard'

export type RouterEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** What settled a subagent's tier. */
export type RouterReason = 'rule' | 'type' | 'keywords' | 'haiku' | 'default'

/** The router's decision for one subagent, keyed by its agent id. */
export type RouterRoute = {
  tier: RouterTier
  by: RouterReason
  /** The model the subagent would have run on: the parent's. */
  fromModel: string
  /** The model it runs on: the same as fromModel when no cheaper one fitted. */
  toModel: string
  /** The effort its requests are sent at, once the router lowered it. */
  effort?: RouterEffort
}

declare module 'claude-code' {
  interface PluginState {
    'model-router': {
      routes: Record<string, RouterRoute>
    }
  }
}
