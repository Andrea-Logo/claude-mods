import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Bout, Lane, LaneStatus, Tokens } from '../types'
import { commitLane, git, ignoreArenaFolder, removeLane } from './git'
import { costOf, modelName } from './pricing'
import { words } from './words'
import type { Lang } from './words'

const PANE = 'arena'
const LANES = 2
const NO_TOKENS: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
const ENDED: readonly LaneStatus[] = ['done', 'failed']

const bout = atom({ plugin: 'arena', key: 'bout' } as const, null)
const tick = atom({ plugin: 'arena', key: 'tick' } as const, 0)

function short(text: string, max: number): string {
  const line = (text.split('\n')[0] ?? '').trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

function count(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function dollars(usd: number): string {
  return usd < 1 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`
}

function elapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

function lanePrompt(task: string, index: number, worktree: string): string {
  return [
    `You are variant ${index} of an arena: other agents are solving the same task in parallel, and the best result will be kept.`,
    '',
    `Work only inside this directory: ${worktree}`,
    'It is a git worktree of the project on a branch of its own. Read and change files only there, never outside it.',
    'Do not commit, push or switch branches: the arena commits your work when you finish.',
    '',
    `Task: ${task}`,
    '',
    'When you are done, reply with two or three lines on what you changed.',
  ].join('\n')
}

/** Changes the lane an agent works in, if it is one of the bout's. */
async function changeLane($: EngineInterface, agentId: string, change: (lane: Lane) => Lane): Promise<void> {
  try {
    await update($, bout, b =>
      b === null || !b.lanes.some(l => l.agentId === agentId)
        ? b
        : { ...b, lanes: b.lanes.map(l => (l.agentId === agentId ? change(l) : l)) },
    )
  } catch {
    // The pane only watches; the agent goes on either way.
  }
}

/** Changes a lane by its position, while the bout is still the current one. */
async function setLane($: EngineInterface, index: number, change: (lane: Lane) => Lane): Promise<void> {
  await update($, bout, b =>
    b === null ? b : { ...b, lanes: b.lanes.map(l => (l.index === index ? change(l) : l)) },
  )
}

async function laneOf($: EngineInterface, agentId: string | undefined): Promise<[Bout, Lane] | undefined> {
  if (agentId === undefined) return undefined
  const b = await read($, bout)
  const lane = b?.lanes.find(l => l.agentId === agentId)
  return b === null || lane === undefined ? undefined : [b, lane]
}

/**
 * Splits `--repo <path> <task>` into its parts; without the flag the bout runs
 * in the session's own project.
 */
function parseArgs(args: string): { repo?: string; task: string } {
  const m = /^--repo\s+(\S+)\s*([\s\S]*)$/.exec(args.trim())
  return m === null ? { task: args.trim() } : { repo: m[1], task: (m[2] ?? '').trim() }
}

/** Starts a bout; returns the line the command answers with. */
async function startBout($: EngineInterface, lang: Lang, task: string, repo?: string): Promise<string> {
  const w = words(lang)
  const current = await read($, bout)
  if (current !== null && current.lanes.some(l => !ENDED.includes(l.status))) return w.busy

  const root = repo ?? (await $.session.root())
  const top = await git($, ['rev-parse', '--show-toplevel'], root)
  if (!top.isOk) return w.notRepo
  const repoRoot = top.out
  const head = await git($, ['rev-parse', 'HEAD'], repoRoot)
  if (!head.isOk) return w.noCommit
  const branchName = await git($, ['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot)

  const now = await $.clock.now()
  const id = now.toString(36).slice(-6)
  await ignoreArenaFolder($, repoRoot)

  const lanes: Lane[] = []
  for (let index = 1; index <= LANES; index++) {
    const branch = `arena/${id}-${index}`
    const worktree = `${repoRoot}/.arena/${id}-${index}`
    const added = await git($, ['worktree', 'add', '-b', branch, worktree, head.out], repoRoot)
    if (!added.isOk) {
      for (const lane of lanes) await removeLane($, repoRoot, lane.worktree, lane.branch)
      return w.failedStart(short(added.err, 200))
    }
    lanes.push({ index, branch, worktree, status: 'starting', steps: 0, tokens: NO_TOKENS, usd: 0, startedAt: now })
  }

  const fresh: Bout = {
    id,
    task,
    repoRoot,
    baseRef: head.out,
    baseBranch: branchName.isOk ? branchName.out : 'HEAD',
    startedAt: now,
    lanes,
  }
  await update($, bout, () => fresh)
  const notShown = await openPane($, w.title)

  for (const lane of lanes) {
    try {
      const spawned = await $.agent.spawn({
        prompt: lanePrompt(task, lane.index, lane.worktree),
        description: `Arena ${lane.index}: ${short(task, 40)}`,
        name: agentName(id, lane.index),
        cwd: lane.worktree,
      })
      if (spawned.deny !== undefined) {
        const reason = spawned.deny
        await setLane($, lane.index, l => ({ ...l, status: 'failed', error: reason }))
        continue
      }
      // Without an id yet, the lane is found again by its agent's name (see pulse).
      const agentId = spawned.agentId
      await setLane($, lane.index, l => ({ ...l, agentId, model: spawned.model, status: 'running' }))
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      await setLane($, lane.index, l => ({ ...l, status: 'failed', error: reason }))
    }
  }

  return notShown === undefined ? w.started(LANES) : `${w.started(LANES)} ${w.notShown} (${notShown})`
}

/** Opens the pane in front; undefined once drawn, else why not. */
async function openPane($: EngineInterface, title: string): Promise<string | undefined> {
  try {
    const opened = await $.ui.open({ id: PANE, title, focus: true })
    return opened.isPlaced ? undefined : String(opened.reason)
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** Commits a finished lane's work and records its summary. */
async function finishLane($: EngineInterface, agentId: string, status: LaneStatus, error?: string): Promise<void> {
  const found = await laneOf($, agentId)
  if (found === undefined) return
  const [b, lane] = found
  if (ENDED.includes(lane.status)) return
  const now = await $.clock.now()
  await changeLane($, agentId, l => ({ ...l, status, endedAt: now, error }))
  const summary = await commitLane($, lane.worktree, b.repoRoot, b.baseRef, lane.branch, `arena: variant ${lane.index}`)
  await changeLane($, agentId, l => ({ ...l, summary }))
}

async function discardBout($: EngineInterface, message: string): Promise<void> {
  const b = await read($, bout)
  if (b === null) return
  for (const lane of b.lanes) await removeLane($, b.repoRoot, lane.worktree, lane.branch)
  await update($, bout, () => null)
  $.ui.toast(message)
}

/** The name a lane's agent is spawned under, which the agent list shows. */
function agentName(boutId: string, index: number): string {
  return `arena-${boutId}-${index}`
}

async function pulse($: EngineInterface): Promise<void> {
  try {
    const b = await read($, bout)
    if (b === null || b.lanes.every(l => ENDED.includes(l.status))) return
    if (b.lanes.some(l => l.agentId === undefined && !ENDED.includes(l.status))) {
      const agents = await $.agent.list()
      for (const lane of b.lanes) {
        if (lane.agentId !== undefined) continue
        const found = agents.find(a => a.name === agentName(b.id, lane.index))
        if (found !== undefined) await setLane($, lane.index, l => ({ ...l, agentId: found.id }))
      }
    }
    await update($, tick, n => n + 1)
  } catch {
    // Next second.
  }
}

export const register: Register = (on, options) => {
  const lang: Lang = String(options.language).trim().toLowerCase() === 'it' ? 'it' : 'en'
  const w = words(lang)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'arena',
      description: 'Run two Claude variants on the same task, each in its own git worktree',
      argumentHint: '[--repo <path>] <task>',
    })
    $.clock.every(1000, () => void pulse($))

    return next(e)
  })

  on('command.run', { command: 'arena' }, async ($, e) => {
    const { repo, task } = parseArgs(e.args)
    if (task.length === 0) {
      const notShown = await openPane($, w.title)
      return { text: notShown === undefined ? w.usage : `${w.usage} ${w.notShown} (${notShown})` }
    }
    return { text: await startBout($, lang, task, repo) }
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const usage = result.usage
    if (e.agentId !== undefined && (await laneOf($, e.agentId)) !== undefined) {
      await changeLane($, e.agentId, l => {
        if (usage === null) return { ...l, steps: l.steps + 1 }
        const t: Tokens = {
          input: usage.input_tokens,
          output: usage.output_tokens,
          cacheRead: usage.cache_read_input_tokens,
          cacheWrite: usage.cache_creation_input_tokens,
        }
        return {
          ...l,
          model: usage.model || e.model,
          steps: l.steps + 1,
          tokens: {
            input: l.tokens.input + t.input,
            output: l.tokens.output + t.output,
            cacheRead: l.tokens.cacheRead + t.cacheRead,
            cacheWrite: l.tokens.cacheWrite + t.cacheWrite,
          },
          usd: l.usd + costOf(usage.model || e.model, t),
        }
      })
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) {
      const isOk = e.reason === 'answer'
      try {
        await finishLane($, e.agentId, isOk ? 'done' : 'failed', isOk ? undefined : e.reason)
      } catch {
        // A lane that cannot be committed still shows as ended.
      }
    }

    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const b = await read($, bout)
    await read($, tick)
    const now = await $.clock.now()

    if (b === null) return <Text dimColor>{w.noBout}</Text>

    const total = b.lanes.reduce((sum, l) => sum + l.usd, 0)
    const isOver = b.lanes.every(l => ENDED.includes(l.status))
    const color = (s: LaneStatus) => (s === 'running' ? 'success' : s === 'failed' ? 'error' : undefined)

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold wrap="truncate-end">
            {w.title} · {short(b.task, 60)}
          </Text>
          <Text dimColor>
            {b.baseBranch} · {w.total} ≈ {dollars(total)}
          </Text>
        </Box>
        {b.lanes.map(l => {
          const all = l.tokens.input + l.tokens.output + l.tokens.cacheRead + l.tokens.cacheWrite
          const facts = [
            l.model === undefined ? undefined : modelName(l.model),
            elapsed((l.endedAt ?? now) - l.startedAt),
            w.steps(l.steps),
          ].filter(Boolean)
          return (
            <Box key={`lane-${l.index}`} flexDirection="column">
              <Text bold wrap="truncate-end">
                {w.lane(l.index)} <Text color={color(l.status)}>· {w.status[l.status]}</Text>
              </Text>
              <Text dimColor wrap="truncate-end">
                {facts.join(' · ')}
              </Text>
              <Text dimColor wrap="truncate-end">
                {count(all)} {w.tokens} ≈ {dollars(l.usd)} · {l.branch}
              </Text>
              {l.summary !== undefined && <Text wrap="truncate-end">{l.summary}</Text>}
              {l.summary === undefined && l.status === 'done' && <Text dimColor>{w.noChanges}</Text>}
              {l.error !== undefined && (
                <Text color="error" wrap="truncate-end">
                  {l.error}
                </Text>
              )}
            </Box>
          )
        })}
        {isOver && <Button key="discard" label={w.discard} onPress={() => void discardBout($, w.discarded)} />}
      </Box>
    )
  })
}
