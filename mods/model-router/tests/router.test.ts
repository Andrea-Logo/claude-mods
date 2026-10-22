import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const SPAWN = {
  tool_use_id: 'toolu_1',
  provider: { plugin: 'engine', tier: 'core' },
  background: false,
  fork: false,
} as const

type Seen = {
  model?: string
  effort?: string | number
  classified: number
  toasts: string[]
  routes: Record<string, unknown>
}

/** Stands in for the engine beneath the plugin, recording what reached it. */
function engine(on: On, classifyAs = 'medium'): Seen {
  const seen: Seen = { classified: 0, toasts: [], routes: {} }
  on('agent.spawn', (_, e) => {
    seen.model = e.model
    return { model: e.model ?? e.parentModel, agentId: 'a1' }
  })
  on('turn.step', async function* (_, e) {
    seen.effort = e.effort
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  })
  on('model.classify', () => {
    seen.classified += 1
    return { value: classifyAs }
  })
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('ui.toast', (_, e) => {
    seen.toasts.push(String((e as { text?: unknown }).text ?? e))
    return { value: undefined }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('state.set', (_, e, next) => {
    if (e.plugin === 'model-router' && e.key === 'routes') seen.routes = e.value as Record<string, unknown>
    return next(e)
  })
  return seen
}

async function step(
  $: Parameters<Parameters<typeof test>[1]>[0],
  model: string,
  effort?: 'high' | 'medium',
) {
  const stream = $.turn.step({ turnId: 't1', index: 0, model, effort, messageCount: 1, agentId: 'a1' })
  for await (const _ of stream) {
    // drain
  }
}

test('a typo goes to Haiku at low effort, by its words', async ($, on) => {
  const seen = engine(on)
  await $.agent.spawn({ ...SPAWN, parentModel: 'claude-opus-5-5', prompt: 'Fix it.', description: 'Fix a typo in README', subagentType: 'general-purpose' })
  expect(seen.model).toBe('haiku')
  expect(seen.classified).toBe(0)
  await step($, 'claude-haiku-5-5', 'high')
  expect(seen.effort).toBe('low')
  expect(seen.routes.a1).toMatchObject({ tier: 'easy', by: 'keywords', fromModel: 'claude-opus-5-5', effort: 'low' })
})

test('a model named in the call is left alone', async ($, on) => {
  const seen = engine(on)
  await $.agent.spawn({ ...SPAWN, parentModel: 'claude-opus-5-5', model: 'opus', prompt: 'Fix it.', description: 'Fix a typo', subagentType: 'general-purpose' })
  expect(seen.model).toBe('opus')
  await step($, 'claude-opus-5-5', 'high')
  expect(seen.effort).toBe('high')
})

test('an unclear task asks Haiku, and never goes above the parent model', async ($, on) => {
  const seen = engine(on, 'hard')
  await $.agent.spawn({ ...SPAWN, parentModel: 'claude-sonnet-5-5', prompt: 'Make the export work for the new client.', description: 'Update the export', subagentType: 'general-purpose' })
  expect(seen.classified).toBe(1)
  expect(seen.model).toBeUndefined()
  expect(seen.routes.a1).toMatchObject({ tier: 'hard', by: 'haiku', toModel: 'claude-sonnet-5-5' })
})

test('everyday work in balanced mode runs on Sonnet at medium effort', async ($, on) => {
  const seen = engine(on, 'medium')
  await $.agent.spawn({ ...SPAWN, parentModel: 'claude-opus-5-5', prompt: 'Add the new field to the form and its test.', description: 'Add a form field', subagentType: 'general-purpose' })
  expect(seen.model).toBe('sonnet')
  await step($, 'claude-sonnet-5-5')
  expect(seen.effort).toBe('medium')
})

test('a simple prompt on Opus gets one suggestion', { options: { language: 'it' } }, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const seen = engine(on)
  await $.prompt.submit({ text: 'correggi il refuso nel titolo', wait: false, origin: { kind: 'composer' } })
  await $.prompt.submit({ text: 'rinomina il file', wait: false, origin: { kind: 'composer' } })
  expect(seen.toasts.length).toBe(1)
  expect(seen.toasts[0]).toContain('/model haiku')
})
