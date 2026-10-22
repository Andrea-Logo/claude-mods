import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Bout, Judge, Lane, LaneStatus, Tokens } from '../types'
import { commitLane, diffOf, git, ignoreArenaFolder, mergeLane, removeLane } from './git'
import { SYSTEM, judgePrompt, readVerdict } from './judge'
import { costOf, modelName } from './pricing'
import { words } from './words'
import type { Words } from './words'
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

  const home = repo?.startsWith('~') ? ((await $.env.get('HOME')) ?? '') : ''
  const root = repo === undefined ? await $.session.root() : repo.startsWith('~') ? `${home}${repo.slice(1)}` : repo
  const top = await git($, ['rev-parse', '--show-toplevel'], root)
  if (!top.isOk) return w.notRepo(root, short(top.err, 160))
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

/** Commits a finished lane's work, records its summary, and calls the judge once all are in. */
async function finishLane(
  $: EngineInterface,
  lang: Lang,
  agentId: string,
  status: LaneStatus,
  error?: string,
): Promise<void> {
  const found = await laneOf($, agentId)
  if (found === undefined) return
  const [b, lane] = found
  if (ENDED.includes(lane.status)) return
  const now = await $.clock.now()
  await changeLane($, agentId, l => ({ ...l, status, endedAt: now, error }))
  const summary = await commitLane($, lane.worktree, b.repoRoot, b.baseRef, lane.branch, `arena: variant ${lane.index}`)
  await changeLane($, agentId, l => ({ ...l, summary, isSettled: true }))
  await judgeBout($, lang)
}

/** Sets the bout's judge, while the bout is still the current one. */
async function setJudge($: EngineInterface, judge: Judge): Promise<void> {
  await update($, bout, b => (b === null ? b : { ...b, judge }))
}

/**
 * Once every lane is settled, asks a cheap model which change to keep. Two
 * lanes settling together both get here; the token makes one of them judge.
 */
async function judgeBout($: EngineInterface, lang: Lang): Promise<void> {
  const w = words(lang)
  const token = `${await $.clock.now()}-${Math.random()}`
  const thinking: Judge = { status: 'thinking', token, usd: 0 }
  await update($, bout, b =>
    b === null || b.judge !== undefined || !b.lanes.every(l => l.isSettled === true) ? b : { ...b, judge: thinking },
  )
  const b = await read($, bout)
  if (b === null || b.judge?.token !== token) return

  const kept = b.lanes.filter(l => l.status === 'done' && l.summary !== undefined)
  const [only] = kept
  if (kept.length === 0) return setJudge($, { status: 'skipped', token, reason: w.nothingToKeep, usd: 0 })
  if (kept.length === 1 && only !== undefined) {
    return setJudge($, { status: 'skipped', token, winner: only.index, reason: w.onlyOne(only.index), usd: 0 })
  }

  try {
    const entries = await Promise.all(
      kept.map(async l => ({ index: l.index, diff: await diffOf($, b.repoRoot, b.baseRef, l.branch) })),
    )
    const reply = await $.model.complete({
      model: 'haiku',
      system: SYSTEM,
      prompt: judgePrompt(b.task, entries, lang),
      maxTokens: 400,
      effort: 'low',
      timeoutMs: 90_000,
    })
    const usd = costOf('claude-haiku-5-5', {
      input: reply.usage.input_tokens,
      output: reply.usage.output_tokens,
      cacheRead: reply.usage.cache_read_input_tokens,
      cacheWrite: reply.usage.cache_creation_input_tokens,
    })
    const verdict = reply.isAnswered ? readVerdict(reply.text, kept.map(l => l.index)) : undefined
    await setJudge(
      $,
      verdict === undefined
        ? { status: 'failed', token, reason: w.judgeFailed, usd }
        : { status: 'done', token, winner: verdict.winner, reason: verdict.reason, usd },
    )
  } catch {
    await setJudge($, { status: 'failed', token, reason: w.judgeFailed, usd: 0 })
  }
}

/** Merges the lane the person picked, then clears the worktrees and branches. */
async function keepLane($: EngineInterface, w: Words, index: number): Promise<void> {
  const b = await read($, bout)
  const lane = b?.lanes.find(l => l.index === index)
  if (b === null || lane === undefined || b.outcome?.isMerged === true) return
  const result = await mergeLane($, b.repoRoot, b.baseBranch, lane.branch, `arena: keep variant ${index}: ${short(b.task, 60)}`)
  if (!result.isMerged) {
    const message =
      result.problem === 'wrong-branch'
        ? w.wrongBranch(b.baseBranch, result.detail)
        : result.problem === 'dirty'
          ? w.dirty
          : w.conflict(short(result.detail, 120))
    await update($, bout, x => (x === null ? x : { ...x, outcome: { isMerged: false, index, message } }))
    $.ui.toast(message)
    return
  }
  for (const l of b.lanes) await removeLane($, b.repoRoot, l.worktree, l.branch)
  const message = w.merged(index, b.baseBranch)
  await update($, bout, x => (x === null ? x : { ...x, outcome: { isMerged: true, index, message } }))
  $.ui.toast(message)
}

async function closeBout($: EngineInterface): Promise<void> {
  await update($, bout, () => null)
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
        await finishLane($, lang, e.agentId, isOk ? 'done' : 'failed', isOk ? undefined : e.reason)
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

    const total = b.lanes.reduce((sum, l) => sum + l.usd, b.judge?.usd ?? 0)
    const isOver = b.lanes.every(l => ENDED.includes(l.status))
    const judge = b.judge
    const outcome = b.outcome
    const isMerged = outcome?.isMerged === true
    const keepable = b.lanes.filter(l => l.status === 'done' && l.summary !== undefined)
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
        {judge !== undefined && (
          <Box flexDirection="column">
            <Text bold>{w.judge}</Text>
            {judge.status === 'thinking' ? (
              <Text dimColor>{w.judgeThinking}</Text>
            ) : (
              <Text wrap="wrap">
                {judge.winner === undefined ? '' : `${w.lane(judge.winner)} · ${w.recommended}: `}
                {judge.reason ?? ''}
              </Text>
            )}
          </Box>
        )}
        {outcome !== undefined && (
          <Text color={outcome.isMerged ? 'success' : 'error'} wrap="wrap">
            {outcome.message}
          </Text>
        )}
        {isOver &&
          !isMerged &&
          judge !== undefined &&
          judge.status !== 'thinking' &&
          keepable.map(l => (
            <Button
              key={`keep-${l.index}`}
              label={w.choose(l.index)}
              variant={judge.winner === l.index ? 'primary' : undefined}
              onPress={() => void keepLane($, w, l.index)}
            />
          ))}
        {isOver && !isMerged && <Button key="discard" label={w.discard} onPress={() => void discardBout($, w.discarded)} />}
        {isMerged && <Button key="close" label={w.close} onPress={() => void closeBout($)} />}
      </Box>
    )
  })
}
