import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

/** A command typed at the prompt, as the engine stamps it. */
const TYPED = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const

const PANE = {
  plugin: 'arena',
  component: 'Pane',
  requestId: 'arena',
  props: {
    title: 'Arena',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

type World = { git: string[][]; spawned: { cwd?: string; prompt: string }[]; stopped: string[] }

/** Stands in for the engine and for git in a repository at /repo. */
function engine(on: On, isRepo = true, isDirty = false, stopRefused = false): World {
  const world: World = { git: [], spawned: [], stopped: [] }
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'arena' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.root', () => ({ value: '/repo' }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    const argv = (e as { argv: readonly string[] }).argv
    world.git.push([...argv])
    const ok = (stdout = '') => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    const args = argv.slice(1).join(' ')
    if (!isRepo) return { value: { exitCode: 128, stdout: '', stderr: 'not a git repository', isStdoutTruncated: false, isStderrTruncated: false } }
    if (args === 'rev-parse --show-toplevel') return ok('/repo\n')
    if (args === 'rev-parse HEAD') return ok('abc123\n')
    if (args === 'rev-parse --abbrev-ref HEAD') return ok('main\n')
    if (args.startsWith('rev-parse --path-format')) return ok('/repo/.git\n')
    if (args.startsWith('diff --stat')) return ok(' reverse.ts | 5 +++++\n 1 file changed, 5 insertions(+)\n')
    if (args === 'status --porcelain') return ok(isDirty ? ' M notes.md\n' : '')
    if (args.startsWith('diff abc123')) return ok(`+export const reverse = s => [...s].reverse().join('') // ${args}`)
    return ok()
  })
  on('agent.spawn', (_, e) => {
    world.spawned.push({ cwd: e.cwd, prompt: e.prompt })
    return { model: 'claude-haiku-5-5', agentId: `a${world.spawned.length}` }
  })
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn',
      usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-haiku-5-5' },
    }
  })
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('tool.call', { tool: 'TaskStop' }, (_, e) => {
    world.stopped.push(String(e.task_id))
    return stopRefused ? { deny: 'not allowed here' } : { result: {} }
  })
  on('model.complete', () => ({
    value: {
      isAnswered: true,
      text: 'WINNER: 2\nREASON: più corta e altrettanto corretta.',
      usage: { input_tokens: 2000, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  }))
  // The engine alone sets a spawn's agent id, so the lanes are found by name.
  on('agent.list', () => ({
    value: world.spawned.map((_, i) => ({ id: `a${i + 1}`, name: `arena-3uw-${i + 1}`, description: '', type: 'general-purpose', status: 'running' })),
  }))
  return world
}

test('two variants start in their own worktrees and are followed live', { options: { language: 'it' } }, async ($, on) => {
  const clock = mock.clock(on, { now: 5000 })
  const world = engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })

  const reply = await $.command.run({ ...TYPED, command: 'arena', args: 'scrivi una funzione che inverte una stringa' })
  expect(JSON.stringify(reply)).toContain('2 varianti')
  await clock.advance(1000)

  const added = world.git.filter(a => a[1] === 'worktree' && a[2] === 'add')
  expect(added.length).toBe(2)
  expect(world.spawned.map(s => s.cwd)).toEqual([added[0]?.[5], added[1]?.[5]])
  expect(world.spawned[0]?.prompt).toContain('scrivi una funzione che inverte una stringa')

  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-haiku-5-5', messageCount: 1, agentId: 'a1' })
  for await (const _ of stream) {
    // drain
  }
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1', agentId: 'a1', reason: 'answer' })

  // The finished lane's work is committed before its summary is read.
  expect(world.git.some(a => a.includes('commit'))).toBe(true)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /Variante 1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /finita/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /al lavoro/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 file changed, 5 insertions/ })).toBeDefined()
    // 1000 in x $0.10 + 500 out x $0.50, per million: $0.00035.
    expect(await ui.find({ type: 'Text', text: /1\.5k token ≈ \$0\.000/ })).toBeDefined()
    // Each lane has its gladiator: an animated SVG on desktop, cells in a terminal.
    expect(await ui.find({ type: surface === 'desktop' ? 'Svg' : 'Raster' })).toBeDefined()
    await ui.unmount()
  }
})

test('--repo names the project to run in', async ($, on) => {
  mock.clock(on, { now: 5000 })
  const world = engine(on)
  await $.session.start({ cwd: '/elsewhere', surface: 'desktop', isInteractive: true })
  await $.command.run({ ...TYPED, command: 'arena', args: '--repo /repo reverse a string' })
  expect(world.spawned.length).toBe(2)
  expect(world.spawned[0]?.prompt).toContain('Task: reverse a string')
})

test('outside a git repository it says so and starts nothing', async ($, on) => {
  const world = engine(on, false)
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  const reply = await $.command.run({ ...TYPED, command: 'arena', args: 'do something' })
  expect(JSON.stringify(reply)).toContain('git repository')
  expect(world.spawned.length).toBe(0)
})

async function finishBoth($: Parameters<TestBody>[0]) {
  for (const id of ['a1', 'a2']) {
    await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: `t-${id}`, agentId: id, reason: 'answer' })
  }
}

test('the judge recommends a variant and keeping it merges it and cleans up', { options: { language: 'it' } }, async ($, on) => {
  const clock = mock.clock(on, { now: 5000 })
  const world = engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.command.run({ ...TYPED, command: 'arena', args: 'inverti una stringa' })
  await clock.advance(1000)
  await finishBoth($)
  // Each lane's agent, still listed alive once its work is in, is stopped on the next pulse.
  await clock.advance(1000)
  expect(world.stopped.sort()).toEqual(['a1', 'a2'])

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Variante 2 · consigliata: più corta/ })).toBeDefined()
  expect(await ui.find({ key: 'keep-1' })).toBeDefined()
  await ui.press({ key: 'keep-2' })

  const merge = world.git.find(a => a.includes('merge') && !a.includes('--abort'))
  expect(merge).toContain('arena/3uw-2')
  expect(world.git.filter(a => a[1] === 'worktree' && a[2] === 'remove').length).toBe(2)
  expect(await ui.find({ type: 'Text', text: /Variante 2 unita in main/ })).toBeDefined()
  expect(await ui.find({ key: 'close' })).toBeDefined()
  await ui.unmount()
})

test('with uncommitted changes nothing is merged', { options: { language: 'it' } }, async ($, on) => {
  const clock = mock.clock(on, { now: 5000 })
  const world = engine(on, true, true)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.command.run({ ...TYPED, command: 'arena', args: 'inverti una stringa' })
  await clock.advance(1000)
  await finishBoth($)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'keep-1' })
  expect(world.git.some(a => a.includes('merge'))).toBe(false)
  expect(world.git.some(a => a[1] === 'worktree' && a[2] === 'remove')).toBe(false)
  expect(await ui.find({ type: 'Text', text: /modifiche non salvate/ })).toBeDefined()
  await ui.unmount()
})

test("a lane's completion notice stays out of the main conversation", async ($, on) => {
  const clock = mock.clock(on, { now: 5000 })
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.command.run({ ...TYPED, command: 'arena', args: 'reverse a string' })
  await clock.advance(1000)

  const lane = await $.prompt.submit({
    text: '<task-notification><task-id>a1</task-id><status>completed</status></task-notification>',
    wait: false,
    isMeta: true,
    origin: { kind: 'task-notification' },
  })
  expect(JSON.stringify(lane)).toContain('drop')

  const other = await $.prompt.submit({
    text: '<task-notification><task-id>zz9</task-id><status>completed</status></task-notification>',
    wait: false,
    isMeta: true,
    origin: { kind: 'task-notification' },
  })
  expect(JSON.stringify(other)).not.toContain('drop')

  const typed = await $.prompt.submit({ text: 'what did a1 do?', wait: false, origin: { kind: 'composer' } })
  expect(JSON.stringify(typed)).not.toContain('drop')
})

test('an agent that cannot be stopped is asked three times, then the pane says why', { options: { language: 'it' } }, async ($, on) => {
  const clock = mock.clock(on, { now: 5000 })
  const world = engine(on, true, false, true)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.command.run({ ...TYPED, command: 'arena', args: 'inverti una stringa' })
  await clock.advance(1000)
  await finishBoth($)
  await clock.advance(5000)

  expect(world.stopped.filter(id => id === 'a1').length).toBe(3)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /non è stato possibile fermare il suo agente: not allowed here/ })).toBeDefined()
  await ui.unmount()
})
