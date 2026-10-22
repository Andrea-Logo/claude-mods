import { expect, mock, test } from 'claude-code/testing';
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
};
/** Stands in for the engine and for git in a repository at /repo. */
function engine(on, isRepo = true) {
    const world = { git: [], spawned: [] };
    on('session.start', (_, e) => ({ cwd: e.cwd }));
    on('command.register', () => ({ value: { command: 'arena' } }));
    on('ui.open', () => ({ value: { isPlaced: true } }));
    on('ui.toast', () => ({ value: undefined }));
    on('session.root', () => ({ value: '/repo' }));
    on('fs.exists', () => ({ value: false }));
    on('fs.write', () => ({ value: undefined }));
    on('process.run', (_, e) => {
        const argv = e.argv;
        world.git.push([...argv]);
        const ok = (stdout = '') => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } });
        const args = argv.slice(1).join(' ');
        if (!isRepo)
            return { value: { exitCode: 128, stdout: '', stderr: 'not a git repository', isStdoutTruncated: false, isStderrTruncated: false } };
        if (args === 'rev-parse --show-toplevel')
            return ok('/repo\n');
        if (args === 'rev-parse HEAD')
            return ok('abc123\n');
        if (args === 'rev-parse --abbrev-ref HEAD')
            return ok('main\n');
        if (args.startsWith('rev-parse --path-format'))
            return ok('/repo/.git\n');
        if (args.startsWith('diff --stat'))
            return ok(' reverse.ts | 5 +++++\n 1 file changed, 5 insertions(+)\n');
        return ok();
    });
    on('agent.spawn', (_, e) => {
        world.spawned.push({ cwd: e.cwd, prompt: e.prompt });
        return { model: 'claude-haiku-5-5', agentId: `a${world.spawned.length}` };
    });
    on('turn.step', async function* (_, e) {
        return {
            turnId: e.turnId,
            index: e.index,
            answer: '',
            toolUses: [],
            stopReason: 'end_turn',
            usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-haiku-5-5' },
        };
    });
    on('turn.complete', () => ({}));
    return world;
}
test('two variants start in their own worktrees and are followed live', { options: { language: 'it' } }, async ($, on) => {
    mock.clock(on, { now: 5000 });
    const world = engine(on);
    await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true });
    const reply = await $.command.run({ command: 'arena', args: 'scrivi una funzione che inverte una stringa' });
    expect(JSON.stringify(reply)).toContain('2 varianti');
    const added = world.git.filter(a => a[1] === 'worktree' && a[2] === 'add');
    expect(added.length).toBe(2);
    expect(world.spawned.map(s => s.cwd)).toEqual([added[0]?.[5], added[1]?.[5]]);
    expect(world.spawned[0]?.prompt).toContain('scrivi una funzione che inverte una stringa');
    const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-haiku-5-5', messageCount: 1, agentId: 'a1' });
    for await (const _ of stream) {
        // drain
    }
    await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1', agentId: 'a1', reason: 'answer' });
    // The finished lane's work is committed before its summary is read.
    expect(world.git.some(a => a.includes('commit'))).toBe(true);
    for (const surface of ['terminal', 'desktop']) {
        const ui = await $.ui.mount({ ...PANE, surface });
        expect(await ui.find({ type: 'Text', text: /Variante 1/ })).toBeDefined();
        expect(await ui.find({ type: 'Text', text: /finita/ })).toBeDefined();
        expect(await ui.find({ type: 'Text', text: /al lavoro/ })).toBeDefined();
        expect(await ui.find({ type: 'Text', text: /1 file changed, 5 insertions/ })).toBeDefined();
        // 1000 in x $0.10 + 500 out x $0.50, per million: $0.00035.
        expect(await ui.find({ type: 'Text', text: /1\.5k token ≈ \$0\.000/ })).toBeDefined();
        await ui.unmount();
    }
});
test('outside a git repository it says so and starts nothing', async ($, on) => {
    const world = engine(on, false);
    await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true });
    const reply = await $.command.run({ command: 'arena', args: 'do something' });
    expect(JSON.stringify(reply)).toContain('git repository');
    expect(world.spawned.length).toBe(0);
});
