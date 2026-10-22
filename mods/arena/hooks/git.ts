import type { EngineInterface } from 'claude-code'

export type GitResult = { isOk: boolean; out: string; err: string }

/** Runs git in `cwd`; never rejects, so a failed command is just a result. */
export async function git($: EngineInterface, args: readonly string[], cwd: string): Promise<GitResult> {
  try {
    const r = await $.process.run(['git', ...args], { cwd, timeoutMs: 60_000 })
    return { isOk: r.exitCode === 0, out: r.stdout.trim(), err: r.stderr.trim() }
  } catch (error) {
    return { isOk: false, out: '', err: error instanceof Error ? error.message : String(error) }
  }
}

/** Makes sure git ignores the arena's worktree folder, without touching .gitignore. */
export async function ignoreArenaFolder($: EngineInterface, repoRoot: string): Promise<void> {
  const common = await git($, ['rev-parse', '--path-format=absolute', '--git-common-dir'], repoRoot)
  if (!common.isOk) return
  const exclude = `${common.out}/info/exclude`
  let text = ''
  try {
    text = (await $.fs.exists(exclude)) ? await $.fs.read(exclude) : ''
  } catch {
    text = ''
  }
  if (text.split('\n').some(line => line.trim() === '/.arena/')) return
  const prefix = text.length === 0 || text.endsWith('\n') ? text : `${text}\n`
  try {
    await $.fs.write(exclude, `${prefix}/.arena/\n`)
  } catch {
    // Only cosmetic: without it the folder shows up as untracked.
  }
}

/** Commits whatever a lane changed and returns the last line of its diff stat. */
export async function commitLane(
  $: EngineInterface,
  worktree: string,
  repoRoot: string,
  baseRef: string,
  branch: string,
  message: string,
): Promise<string | undefined> {
  await git($, ['add', '-A'], worktree)
  await git(
    $,
    ['-c', 'user.name=Arena', '-c', 'user.email=arena@localhost', 'commit', '--no-verify', '-m', message],
    worktree,
  )
  const stat = await git($, ['diff', '--stat', baseRef, branch], repoRoot)
  if (!stat.isOk || stat.out.length === 0) return undefined
  return stat.out.split('\n').pop()?.trim()
}

/** Removes a lane's worktree and branch; best effort. */
export async function removeLane(
  $: EngineInterface,
  repoRoot: string,
  worktree: string,
  branch: string,
): Promise<void> {
  await git($, ['worktree', 'remove', '--force', worktree], repoRoot)
  await git($, ['branch', '-D', branch], repoRoot)
}

/** The full diff of a lane's branch against the bout's base. */
export async function diffOf($: EngineInterface, repoRoot: string, baseRef: string, branch: string): Promise<string> {
  const diff = await git($, ['diff', baseRef, branch], repoRoot)
  return diff.isOk ? diff.out : ''
}

export type MergeResult = { isMerged: boolean; problem?: 'wrong-branch' | 'dirty' | 'conflict'; detail: string }

/**
 * Merges a lane's branch into the base branch, refusing rather than risking
 * the person's work: the repository must still be on the base branch, with no
 * uncommitted changes, and a merge that conflicts is undone.
 */
export async function mergeLane(
  $: EngineInterface,
  repoRoot: string,
  baseBranch: string,
  branch: string,
  message: string,
): Promise<MergeResult> {
  const current = await git($, ['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot)
  if (!current.isOk || current.out !== baseBranch) {
    return { isMerged: false, problem: 'wrong-branch', detail: current.out }
  }
  const status = await git($, ['status', '--porcelain'], repoRoot)
  if (!status.isOk || status.out.length > 0) return { isMerged: false, problem: 'dirty', detail: status.out }

  // Use the person's own identity; only a repository with none gets the arena's.
  const email = await git($, ['config', 'user.email'], repoRoot)
  const identity = email.isOk && email.out.length > 0 ? [] : ['-c', 'user.name=Arena', '-c', 'user.email=arena@localhost']
  const merged = await git($, [...identity, 'merge', '--no-ff', '--no-verify', '-m', message, branch], repoRoot)
  if (merged.isOk) return { isMerged: true, detail: merged.out }
  await git($, ['merge', '--abort'], repoRoot)
  return { isMerged: false, problem: 'conflict', detail: merged.err || merged.out }
}
