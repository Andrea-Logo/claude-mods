import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = {
  plugin: 'agent-crew',
  component: 'Pane',
  requestId: 'agent-crew',
  props: {
    title: 'Ciurma',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

let agentStatus = 'running'

/** Stands in for the engine beneath the plugin. */
function engine(on: On) {
  on('command.register', () => ({ value: { command: 'crew' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  on('agent.list', () => ({
    value: [
      { id: 'a1', description: 'Design the landing page', type: 'general-purpose', status: agentStatus },
    ],
  }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [], cost: { usd: 0.5 } },
  }))
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn',
      usage: {
        input_tokens: 1000,
        output_tokens: 500,
        cache_read_input_tokens: 2000,
        cache_creation_input_tokens: 0,
        model: 'claude-sonnet-5-5',
      },
    }
  })
  on('tool.call', () => ({ result: {} }))
}

test('a subagent shows with its costume, model, effort, activity and cost', { options: { language: 'it' } }, async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  engine(on)
  agentStatus = 'running'

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ prompt: 'Make it pretty', description: 'Design the landing page', subagentType: 'general-purpose' })
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', effort: 'high', messageCount: 1, agentId: 'a1' })
  for await (const _ of stream) {
    // drain
  }
  await $.tool.call({ tool: 'Read', file_path: '/site/index.html', agentId: 'a1' })
  await clock.advance(1000)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /Design the landing page/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /pittore/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /legge index\.html/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Sonnet 5\.5 · alto/ })).toBeDefined()
    // 1000 in x $2 + 500 out x $10 + 2000 cache reads x $0.20, per million.
    expect(await ui.find({ type: 'Text', text: /\$0\.007/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\$0\.500 sessione/ })).toBeDefined()
    await ui.unmount()
  }
})

test('finished agents grey out and can be cleared', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  engine(on)
  agentStatus = 'running'

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ prompt: 'Look around', description: 'Find the config files', subagentType: 'Explore' })
  agentStatus = 'completed'
  await clock.advance(1000)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /explorer/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /done/ })).toBeDefined()
  await ui.press({ key: 'clear' })
  expect(await ui.find({ type: 'Text', text: /Find the config files/ })).toBeUndefined()
  await ui.unmount()
})
