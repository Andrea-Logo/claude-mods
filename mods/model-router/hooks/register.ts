import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { RouterReason, RouterRoute, RouterTier } from '../types'
import {
  PLANS,
  effortRank,
  familyOf,
  isSimplePrompt,
  parseRules,
  rankOf,
  tierByType,
  tierByWords,
} from './tiers'
import type { Mode } from './tiers'

const routes = atom({ plugin: 'model-router', key: 'routes' } as const, {})

/** How long the classifier sees of a subagent's prompt. */
const PROMPT_SAMPLE = 2000

/** At most one cheaper-model suggestion in this long. */
const SUGGEST_EVERY_MS = 15 * 60 * 1000

const LABELS = ['easy', 'medium', 'hard'] as const

/** Asks the small fast model for a tier; undefined when it cannot say. */
async function askHaiku($: EngineInterface, text: string): Promise<RouterTier | undefined> {
  try {
    const label = await $.model.classify(text, LABELS, { model: 'haiku' })
    if (label === 'easy' || label === 'hard') return label
    if (label === 'medium') return 'normal'
    return undefined
  } catch {
    return undefined
  }
}

async function record($: EngineInterface, id: string, route: RouterRoute): Promise<void> {
  try {
    await update($, routes, all => ({ ...all, [id]: route }))
  } catch {
    // The route only feeds the display; the spawn goes on without it.
  }
}

export const register: Register = (on, options) => {
  // Settings are free text, so read them forgivingly; anything unknown is the default.
  const isItalian = String(options.language).trim().toLowerCase() === 'it'
  const asked = String(options.mode).trim().toLowerCase()
  const mode: Mode = asked === 'careful' || asked === 'aggressive' ? asked : 'balanced'
  const rules = parseRules(typeof options.rules === 'string' ? options.rules : '')
  const askHaikuWhenUnsure = options.askHaiku !== false
  const suggestMain = options.suggestMain !== false
  let lastSuggestion = Number.NEGATIVE_INFINITY

  on('agent.spawn', async ($, e, next) => {
    // Leave alone what someone chose on purpose, and what a model is not
    // picked for: a model named in the call, a fork, a teammate, a workflow
    // agent, a resumed run.
    if (
      e.model !== undefined ||
      e.fork ||
      e.isTeammate === true ||
      e.workflow !== undefined ||
      e.resume !== undefined
    ) {
      return next(e)
    }

    const text = `${e.description}\n\n${e.prompt}`.toLowerCase()
    let tier: RouterTier | undefined
    let by: RouterReason = 'default'
    const rule = rules.find(([word]) => text.includes(word))
    if (rule !== undefined) {
      tier = rule[1]
      by = 'rule'
    }
    if (tier === undefined) {
      tier = tierByType(e.subagentType)
      if (tier !== undefined) by = 'type'
    }
    if (tier === undefined) {
      const words = tierByWords(e.description)
      if (words !== undefined) {
        tier = words.tier
        by = 'keywords'
      }
    }
    if (tier === undefined && askHaikuWhenUnsure) {
      tier = await askHaiku($, `${e.description}\n\n${e.prompt.slice(0, PROMPT_SAMPLE)}`)
      if (tier !== undefined) by = 'haiku'
    }
    tier ??= 'normal'

    const plan = PLANS[mode][tier]
    // Only ever cheaper: a plan at or above the parent's model, or a parent
    // model the router does not know, keeps the parent's.
    const isCheaper = rankOf(plan.family) < rankOf(e.parentModel)
    const result = await next(isCheaper ? { ...e, model: plan.family } : e)

    if (result.agentId !== undefined) {
      await record($, result.agentId, {
        tier,
        by,
        fromModel: e.parentModel,
        toModel: result.model ?? (isCheaper ? plan.family : e.parentModel),
      })
    }

    return result
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    const id = e.agentId
    if (id === undefined) return yield* next(e)

    let route: RouterRoute | undefined
    try {
      route = (await read($, routes))[id]
    } catch {
      route = undefined
    }
    if (route === undefined) return yield* next(e)

    const plan = PLANS[mode][route.tier]
    // Only ever lower: an effort above the request's own leaves it be.
    const isLower = effortRank(plan.effort, e.model) < effortRank(e.effort, e.model)
    if (!isLower) return yield* next(e)

    if (route.effort !== plan.effort) await record($, id, { ...route, effort: plan.effort })
    return yield* next({ ...e, effort: plan.effort })
  })

  on('prompt.submit', async ($, e, next) => {
    if (
      suggestMain &&
      e.command === undefined &&
      e.isMeta !== true &&
      e.origin.kind === 'composer' &&
      isSimplePrompt(e.text)
    ) {
      try {
        const now = await $.clock.now()
        const model = await $.session.model()
        if (rankOf(model) >= 3 && now - lastSuggestion >= SUGGEST_EVERY_MS) {
          lastSuggestion = now
          const family = familyOf(model) ?? model
          $.ui.toast(
            isItalian
              ? `Sembra una richiesta semplice: con /model haiku costerebbe molto meno che con ${family}.`
              : `This looks like a simple request: /model haiku would cost far less than ${family}.`,
          )
        }
      } catch {
        // A suggestion is never worth holding the prompt up.
      }
    }

    return next(e)
  }).catch(($, e, next) => next(e))
}
