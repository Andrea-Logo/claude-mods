import type { RouterEffort, RouterTier } from '../types'

export type Mode = 'careful' | 'balanced' | 'aggressive'

export type Family = 'haiku' | 'sonnet' | 'opus'

type Plan = { family: Family; effort: RouterEffort }

/** Model and effort per tier, per mode. */
export const PLANS: Record<Mode, Record<RouterTier, Plan>> = {
  careful: {
    easy: { family: 'haiku', effort: 'low' },
    normal: { family: 'sonnet', effort: 'high' },
    hard: { family: 'opus', effort: 'high' },
  },
  balanced: {
    easy: { family: 'haiku', effort: 'low' },
    normal: { family: 'sonnet', effort: 'medium' },
    hard: { family: 'opus', effort: 'high' },
  },
  aggressive: {
    easy: { family: 'haiku', effort: 'low' },
    normal: { family: 'haiku', effort: 'medium' },
    hard: { family: 'sonnet', effort: 'high' },
  },
}

const RANK: Record<string, number> = { haiku: 1, sonnet: 2, opus: 3, fable: 4, mythos: 4 }

/** The family a model id or alias belongs to, by name. */
export function familyOf(model: string): string | undefined {
  return /(haiku|sonnet|opus|fable|mythos)/.exec(model.toLowerCase())?.[1]
}

/** How expensive a model is, 0 when unknown. */
export function rankOf(model: string): number {
  const family = familyOf(model)
  return family === undefined ? 0 : (RANK[family] ?? 0)
}

const EFFORTS: readonly RouterEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']

/** Each family's effort when a request names none. */
const DEFAULT_EFFORT: Record<string, RouterEffort> = {
  haiku: 'medium',
  sonnet: 'high',
  opus: 'medium',
  fable: 'high',
  mythos: 'high',
}

export function effortRank(effort: string | number | undefined, model: string): number {
  const level = typeof effort === 'string' ? effort : DEFAULT_EFFORT[familyOf(model) ?? '']
  const i = EFFORTS.indexOf(level as RouterEffort)
  return i < 0 ? EFFORTS.length : i
}

export function isEffort(effort: string): effort is RouterEffort {
  return (EFFORTS as readonly string[]).includes(effort)
}

// English and Italian stems. A task whose description hits one list and not
// the other gets that tier; anything else is unclear.
const EASY =
  /\b(typo|spelling|rename|format|reformat|indent|lint fix|bump|list|count|locate|find (the |a )?file|look up|lookup|grep|summari[sz]e (this|the) (file|page)|translate|fix (a |the )?link|refuso|errore di battitura|rinomin|formatt|elenc|cont[ao]|trova|cerca (il|un|la) file|traduc|sposta|copia)/
const HARD =
  /\b(architect|design (a|the) system|plan |planning|refactor (the|all|whole)|race condition|deadlock|concurren|security|vulnerab|performance|optimi[sz]|algorithm|proof|prove|root cause|debug|migrat|research|investigat|deep|architettur|progett|pianific|ottimizz|sicurezza|algoritm|dimostr|causa|indag|approfond|ricerca)/

export type Verdict = { tier: RouterTier; by: 'keywords' } | undefined

/** The tier the description's words settle, if they settle one. */
export function tierByWords(description: string): Verdict {
  const text = description.toLowerCase()
  const isEasy = EASY.test(text)
  const isHard = HARD.test(text)
  if (isEasy && !isHard) return { tier: 'easy', by: 'keywords' }
  if (isHard && !isEasy) return { tier: 'hard', by: 'keywords' }
  return undefined
}

/** A main-loop prompt short and plain enough to be worth a cheaper model. */
export function isSimplePrompt(text: string): boolean {
  const t = text.trim()
  return t.length > 0 && t.length <= 160 && !t.includes('\n') && tierByWords(t)?.tier === 'easy'
}

const BY_TYPE: Record<string, RouterTier> = {
  explore: 'easy',
  'claude-code-guide': 'easy',
  'statusline-setup': 'easy',
  plan: 'hard',
}

export function tierByType(subagentType: string): RouterTier | undefined {
  return BY_TYPE[subagentType.toLowerCase()]
}

/** Parses 'thesis=hard, typo=easy' into rules; unknown tiers are dropped. */
export function parseRules(text: string): [string, RouterTier][] {
  return text
    .split(',')
    .map(pair => pair.split('=').map(s => s.trim().toLowerCase()))
    .filter(
      (pair): pair is [string, RouterTier] =>
        pair.length === 2 &&
        (pair[0] ?? '').length > 0 &&
        ['easy', 'normal', 'hard'].includes(pair[1] ?? ''),
    )
}
