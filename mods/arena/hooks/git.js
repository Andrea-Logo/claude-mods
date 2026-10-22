/** Runs git in `cwd`; never rejects, so a failed command is just a result. */
export async function git($, args, cwd) {
    try {
        const r = await $.process.run(['git', ...args], { cwd, timeoutMs: 60_000 });
        return { isOk: r.exitCode === 0, out: r.stdout.trim(), err: r.stderr.trim() };
    }
    catch (error) {
        return { isOk: false, out: '', err: error instanceof Error ? error.message : String(error) };
    }
}
/** Makes sure git ignores the arena's worktree folder, without touching .gitignore. */
export async function ignoreArenaFolder($, repoRoot) {
    const common = await git($, ['rev-parse', '--path-format=absolute', '--git-common-dir'], repoRoot);
    if (!common.isOk)
        return;
    const exclude = `${common.out}/info/exclude`;
    let text = '';
    try {
        text = (await $.fs.exists(exclude)) ? await $.fs.read(exclude) : '';
    }
    catch {
        text = '';
    }
    if (text.split('\n').some(line => line.trim() === '/.arena/'))
        return;
    const prefix = text.length === 0 || text.endsWith('\n') ? text : `${text}\n`;
    try {
        await $.fs.write(exclude, `${prefix}/.arena/\n`);
    }
    catch {
        // Only cosmetic: without it the folder shows up as untracked.
    }
}
/** Commits whatever a lane changed and returns the last line of its diff stat. */
export async function commitLane($, worktree, repoRoot, baseRef, branch, message) {
    await git($, ['add', '-A'], worktree);
    await git($, ['-c', 'user.name=Arena', '-c', 'user.email=arena@localhost', 'commit', '--no-verify', '-m', message], worktree);
    const stat = await git($, ['diff', '--stat', baseRef, branch], repoRoot);
    if (!stat.isOk || stat.out.length === 0)
        return undefined;
    return stat.out.split('\n').pop()?.trim();
}
/** Removes a lane's worktree and branch; best effort. */
export async function removeLane($, repoRoot, worktree, branch) {
    await git($, ['worktree', 'remove', '--force', worktree], repoRoot);
    await git($, ['branch', '-D', branch], repoRoot);
}
