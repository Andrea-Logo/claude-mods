import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CrewMember, CrewStatus, CrewTotals, RouterRoute, Tokens } from '../types'
import { costumeOf, parseRules } from './costumes'
import { costOf, modelName } from './pricing'
import { SIZE, spriteCells, spriteSvg } from './sprites'
import type { Mood } from './sprites'
import { activityOf, words } from './words'
import type { Lang } from './words'

const PANE = 'agent-crew'
const MAIN = 'main'
const ENDED: readonly CrewStatus[] = ['completed', 'failed', 'killed']

const NO_TOKENS: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

const crew = atom({ plugin: 'agent-crew', key: 'crew' } as const, {})
const archived = atom({ plugin: 'agent-crew', key: 'archived' } as const, {
  tokens: NO_TOKENS,
  usd: 0,
  saved: 0,
})
/** The model-router mod's routes, read when that mod is installed. */
const routerRoutes = { plugin: 'model-router', key: 'routes' } as const
const tick = atom({ plugin: 'agent-crew', key: 'tick' } as const, 0)
const sessionUsd = atom({ plugin: 'agent-crew', key: 'sessionUsd' } as const, null)

function member(id: string, now: number, fields: Partial<CrewMember> = {}): CrewMember {
  return {
    id,
    parentId: id === MAIN ? undefined : MAIN,
    label: id === MAIN ? 'Claude' : id,
    type: id === MAIN ? 'main' : 'agent',
    status: 'running',
    steps: 0,
    tools: 0,
    startedAt: now,
    tokens: NO_TOKENS,
    usd: 0,
    ...fields,
  }
}

/**
 * Changes one member, creating it first if no event has named it yet. The
 * pane only watches, so a failure here is swallowed rather than allowed to
 * get in the way of the agent it describes.
 */
async function touch(
  $: EngineInterface,
  id: string,
  change: (m: CrewMember) => CrewMember,
): Promise<void> {
  try {
    const now = await $.clock.now()
    await update($, crew, all => {
      const before = all[id] ?? member(id, now)
      return { ...all, [id]: change(before) }
    })
  } catch {
    // Nothing to do: the next event or poll brings the pane up to date.
  }
}

function addTokens(a: Tokens, b: Tokens): Tokens {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
  }
}

/** Dollars the router saved on a member: its tokens at the parent's prices, less what they cost. */
function savedOf(m: CrewMember, route: RouterRoute | undefined): number {
  if (route === undefined) return 0
  if (modelName(route.fromModel) === modelName(m.model ?? route.toModel)) return 0
  return Math.max(0, costOf(route.fromModel, m.tokens) - m.usd)
}

function moodOf(m: CrewMember): Mood {
  switch (m.status) {
    case 'running':
      return 'active'
    case 'waiting':
      return 'waiting'
    case 'idle':
      return 'resting'
    case 'pending':
      return 'pending'
    case 'completed':
      return 'done'
    default:
      return 'failed'
  }
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
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** Members in tree order: the main loop, then each agent under its parent. */
function ordered(all: Record<string, CrewMember>): [CrewMember, number][] {
  const list = Object.values(all)
  const ids = new Set(list.map(m => m.id))
  const childrenOf = (parent: string | undefined) =>
    list
      .filter(m => {
        const p = m.parentId !== undefined && ids.has(m.parentId) ? m.parentId : undefined
        return m.id !== MAIN && (p ?? MAIN) === (parent ?? MAIN)
      })
      .sort((a, b) => a.startedAt - b.startedAt)
  const out: [CrewMember, number][] = []
  const walk = (m: CrewMember, depth: number) => {
    out.push([m, depth])
    for (const child of childrenOf(m.id)) walk(child, depth + 1)
  }
  const main = all[MAIN]
  if (main !== undefined) walk(main, 0)
  else for (const child of childrenOf(MAIN)) walk(child, 0)
  return out
}

let isPolling = false

async function poll($: EngineInterface): Promise<void> {
  if (isPolling) return
  isPolling = true
  try {
    const [agents, usage, now] = await Promise.all([
      $.agent.list(),
      $.session.usage(),
      $.clock.now(),
    ])
    const all = await read($, crew)
    const changes: Record<string, CrewMember> = {}
    for (const a of agents) {
      const before = all[a.id] ?? member(a.id, now)
      const label = a.description || a.name || a.type
      const isEnded = ENDED.includes(a.status)
      const after: CrewMember = {
        ...before,
        label: before.label === a.id || before.label === 'agent' ? label : before.label,
        type: a.type,
        parentId: a.parentId ?? MAIN,
        status: a.status,
        endedAt: isEnded ? (before.endedAt ?? now) : undefined,
        activity: isEnded ? undefined : before.activity,
      }
      if (all[a.id] === undefined || JSON.stringify(after) !== JSON.stringify(before)) {
        changes[a.id] = after
      }
    }
    if (Object.keys(changes).length > 0) {
      await update($, crew, current => ({ ...current, ...pick(changes, current) }))
    }

    const usd = usage.cost?.usd ?? null
    if (usd !== (await read($, sessionUsd))) await update($, sessionUsd, () => usd)

    const isBusy = Object.values(await read($, crew)).some(
      m => m.status === 'running' || m.status === 'waiting',
    )
    if (isBusy) await update($, tick, n => n + 1)
  } finally {
    isPolling = false
  }
}

/** The polled members, keeping any field an event wrote since the read. */
function pick(
  polled: Record<string, CrewMember>,
  current: Record<string, CrewMember>,
): Record<string, CrewMember> {
  const out: Record<string, CrewMember> = {}
  for (const [id, p] of Object.entries(polled)) {
    if (id === MAIN) continue
    const c = current[id]
    out[id] =
      c === undefined
        ? p
        : {
            ...c,
            label: p.label,
            type: p.type,
            parentId: p.parentId,
            status: p.status,
            endedAt: p.endedAt,
            activity: ENDED.includes(p.status) ? undefined : c.activity,
          }
  }
  return out
}

async function clearFinished($: EngineInterface): Promise<void> {
  const all = await read($, crew)
  const gone = Object.values(all).filter(m => m.id !== MAIN && ENDED.includes(m.status))
  if (gone.length === 0) return
  const routes = (await read($, routerRoutes)) ?? {}
  await update($, archived, a =>
    gone.reduce<CrewTotals>(
      (sum, m) => ({
        tokens: addTokens(sum.tokens, m.tokens),
        usd: sum.usd + m.usd,
        saved: (sum.saved ?? 0) + savedOf(m, routes[m.id]),
      }),
      a,
    ),
  )
  await update($, crew, current => {
    const kept = { ...current }
    for (const m of gone) delete kept[m.id]
    return kept
  })
}

export const register: Register = (on, options) => {
  const lang: Lang = options.language === 'it' ? 'it' : 'en'
  const w = words(lang)
  const rules = parseRules(typeof options.costumes === 'string' ? options.costumes : '')
  const autoOpen = options.autoOpen !== false
  on('session.start', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, crew, all =>
      all[MAIN] === undefined ? { ...all, [MAIN]: member(MAIN, now, { status: 'idle' }) } : all,
    )
    await $.command.register({ name: 'crew', description: 'Open the agent crew pane' })
    $.clock.every(1000, () => void poll($))
    if (autoOpen) void $.ui.open({ id: PANE, title: w.title })

    return next(e)
  })

  on('command.run', { command: 'crew' }, async $ => {
    await $.ui.open({ id: PANE, title: w.title })

    return { text: w.opened }
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (result.agentId !== undefined) {
      const id = result.agentId
      await touch($, id, m => ({
        ...m,
        label: e.description || m.label,
        type: e.subagentType,
        parentId: e.parentAgentId ?? MAIN,
        model: result.model ?? m.model,
        status: 'running',
      }))
    }

    return result
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    const id = e.agentId ?? MAIN
    const now = await $.clock.now()
    await touch($, id, m => ({
      ...m,
      status: 'running',
      startedAt: id === MAIN && m.status !== 'running' ? now : m.startedAt,
      endedAt: undefined,
      activity: w.thinking,
    }))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      await touch($, MAIN, m => ({ ...m, status: 'idle', endedAt: now, activity: undefined }))
    }

    return result
  })

  on('turn.step', async function* ($, e, next) {
    const id = e.agentId ?? MAIN
    await touch($, id, m => ({
      ...m,
      model: e.model,
      effort: e.effort === undefined ? m.effort : String(e.effort),
      activity: w.thinking,
    }))
    const result = yield* next(e)
    const usage = result.usage
    await touch($, id, m => {
      if (usage === null) return { ...m, steps: m.steps + 1 }
      const t: Tokens = {
        input: usage.input_tokens,
        output: usage.output_tokens,
        cacheRead: usage.cache_read_input_tokens,
        cacheWrite: usage.cache_creation_input_tokens,
      }
      return {
        ...m,
        model: usage.model || m.model,
        steps: m.steps + 1,
        tokens: addTokens(m.tokens, t),
        usd: m.usd + costOf(usage.model || e.model, t),
      }
    })

    return result
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId ?? MAIN
    const input = e as unknown as Record<string, unknown>
    await touch($, id, m => ({
      ...m,
      tools: m.tools + 1,
      activity: activityOf(lang, String(e.tool), input),
    }))

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const all = await read($, crew)
    const old = await read($, archived)
    const realUsd = await read($, sessionUsd)
    const frame = await read($, tick)
    const routes = (await read($, routerRoutes)) ?? {}
    const now = await $.clock.now()
    const rows = ordered(all)
    const columns = e.props.bodyColumns ?? e.viewport?.columns ?? 40

    const working = rows.filter(([m]) => m.status === 'running' || m.status === 'waiting').length
    const usd = rows.reduce((sum, [m]) => sum + m.usd, old.usd)
    const hasEnded = rows.some(([m]) => m.id !== MAIN && ENDED.includes(m.status))
    const saved = rows.reduce((sum, [m]) => sum + savedOf(m, routes[m.id]), old.saved ?? 0)
    const totals = [
      `≈ ${dollars(usd)} ${w.estimate}`,
      saved > 0 ? `${w.saved} ≈ ${dollars(saved)}` : undefined,
      realUsd === null ? undefined : `${dollars(realUsd)} ${w.session}`,
    ]
      .filter(Boolean)
      .join(' · ')

    const statusColor = (s: CrewStatus) =>
      s === 'running'
        ? 'success'
        : s === 'waiting'
          ? 'warning'
          : s === 'failed' || s === 'killed'
            ? 'error'
            : undefined

    const card = (m: CrewMember) => {
      const isEnded = ENDED.includes(m.status)
      const costume = costumeOf(m, rules)
      const total = m.tokens.input + m.tokens.output + m.tokens.cacheRead + m.tokens.cacheWrite
      const runFor = (m.endedAt ?? now) - m.startedAt
      const route = routes[m.id]
      // The router lowers effort below where the crew may hear it, so its word wins.
      const effort = route?.effort ?? m.effort
      const facts = [
        m.model === undefined ? undefined : modelName(m.model),
        effort === undefined ? undefined : (w.effort[effort] ?? effort),
        elapsed(runFor),
        w.steps(m.steps),
        w.tools(m.tools),
      ].filter(Boolean)
      const savedHere = savedOf(m, route)
      const routing =
        route === undefined
          ? undefined
          : `${w.routed}: ${w.tier[route.tier]} → ${modelName(route.toModel)} (${w.by[route.by]})` +
            (savedHere > 0 ? ` · ${w.saved} ≈ ${dollars(savedHere)}` : '')
      return { costume, total, facts, isEnded, routing }
    }

    if (e.surface === 'terminal') {
      const { Box, Text, Button, Raster } = $.ui.resolve(e)
      return (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            <Text bold>
              {w.title} · {w.working(working)}
            </Text>
            <Text dimColor>{totals}</Text>
          </Box>
          {rows.length === 0 && <Text dimColor>{w.empty}</Text>}
          {rows.map(([m, depth]) => {
            const c = card(m)
            const indent = Math.min(depth * 2, 8)
            return (
              <Box key={m.id} flexDirection="row" gap={1} paddingLeft={indent}>
                <Raster
                  key={`sprite-${m.id}`}
                  columns={SIZE}
                  rows={SIZE / 2}
                  cells={spriteCells(c.costume, moodOf(m), frame)}
                />
                <Box flexDirection="column" width={Math.max(10, columns - SIZE - 1 - indent)}>
                  <Text bold={!c.isEnded} dimColor={c.isEnded} wrap="truncate-end">
                    {m.label} <Text dimColor>· {w.costume[c.costume]}</Text>
                  </Text>
                  <Text color={statusColor(m.status)} wrap="truncate-end">
                    {w.status[m.status]}
                    {m.activity === undefined ? '' : ` — ${m.activity}`}
                  </Text>
                  <Text dimColor wrap="truncate-end">
                    {c.facts.join(' · ')}
                  </Text>
                  <Text dimColor wrap="truncate-end">
                    {count(c.total)} {w.tokens} (in {count(m.tokens.input)} · out{' '}
                    {count(m.tokens.output)} · {w.cache} {count(m.tokens.cacheRead + m.tokens.cacheWrite)}) ≈{' '}
                    {dollars(m.usd)}
                  </Text>
                  {c.routing !== undefined && (
                    <Text color="success" wrap="truncate-end">
                      {c.routing}
                    </Text>
                  )}
                </Box>
              </Box>
            )
          })}
          {hasEnded && (
            <Button key="clear" label={w.clear} onPress={() => void clearFinished($)} />
          )}
        </Box>
      )
    }

    const { Box, Text, Button, Svg } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text weight="semibold" size="heading">
            {w.title} · {w.working(working)}
          </Text>
          <Text dimColor size="footnote">
            {totals}
          </Text>
        </Box>
        {rows.length === 0 && <Text dimColor>{w.empty}</Text>}
        {rows.map(([m, depth]) => {
          const c = card(m)
          const alt = `${m.label}: ${w.costume[c.costume]}, ${w.status[m.status]}`
          return (
            <Box key={m.id} flexDirection="row" gap={1} paddingLeft={Math.min(depth * 2, 8)} alignItems="center">
              <Svg
                source={spriteSvg(c.costume, moodOf(m))}
                alt={alt}
                width={44}
                height={48}
                isInteractive
              />
              <Box flexDirection="column" flexShrink={1}>
                <Text weight={c.isEnded ? 'regular' : 'semibold'} dimColor={c.isEnded} wrap="truncate-end">
                  {m.label} <Text dimColor size="footnote">· {w.costume[c.costume]}</Text>
                </Text>
                <Text color={statusColor(m.status)} size="footnote" wrap="truncate-end">
                  {w.status[m.status]}
                  {m.activity === undefined ? '' : ` — ${m.activity}`}
                </Text>
                <Text dimColor size="caption" wrap="truncate-end">
                  {c.facts.join(' · ')}
                </Text>
                <Text dimColor size="caption" tabular wrap="truncate-end">
                  {count(c.total)} {w.tokens} (in {count(m.tokens.input)} · out {count(m.tokens.output)} ·{' '}
                  {w.cache} {count(m.tokens.cacheRead + m.tokens.cacheWrite)}) ≈ {dollars(m.usd)}
                </Text>
                {c.routing !== undefined && (
                  <Text color="success" size="caption" wrap="truncate-end">
                    {c.routing}
                  </Text>
                )}
              </Box>
            </Box>
          )
        })}
        {hasEnded && <Button key="clear" label={w.clear} onPress={() => void clearFinished($)} />}
      </Box>
    )
  })
}
