# arena

> **Preview (0.2.0).** Tested with automated tests and on a scratch repository; feedback welcome.

Two Claude variants take on the same task at the same time, each in its own git worktree. A pane follows them side by side, live. When both are done, a cheap judge model compares the two changes and recommends one; you keep it with one click, and arena merges it into your branch and cleans up the rest.

```
/arena write a function that reverses a string
```

## What it does

1. **Two worktrees.** Arena creates two git worktrees of your project, on branches `arena/<id>-1` and `arena/<id>-2`, from the commit you are on. They live in `.arena/` at the project's root, which arena adds to `.git/info/exclude`, so your `.gitignore` is not touched.
2. **Two variants.** One Claude subagent starts in each worktree with your task, told to work only there.
3. **Live pane.** The **Arena** pane shows each variant's status (starting, working, done, failed), model, elapsed time, steps, tokens and estimated cost.
4. **Commit.** When a variant finishes, arena commits its work on its branch and shows the size of its change (`1 file changed, 5 insertions(+)`).
5. **Judge.** Once both are done, Haiku reads the task and both diffs and recommends one, in a line or two. It costs a fraction of a cent. If only one variant left changes, that one is recommended without asking.
6. **Keep.** A **Keep variant N** button per variant, the recommended one highlighted. Arena merges the one you pick into your branch (`git merge --no-ff`), then removes both worktrees and branches.

Arena never risks your work. It merges only while your repository is still on the branch the bout started from and has no uncommitted changes, and a merge that does not apply cleanly is undone. In each case the pane says why and you can pick again. **Discard bout** throws everything away instead.

## Options

```
/arena [--repo <path>] <task>
```

`--repo` names the git repository to run in (`~` works). You need it when the session does not start inside one, for example a cloud session with several repositories.

| Setting | Default | What it does |
| --- | --- | --- |
| `language` | `en` | Labels and the judge's reason in English (`en`) or Italian (`it`). |

In the desktop app, set it from a terminal:

```
echo '{"language":"it"}' | claude plugin configure arena@claude-mods --values-stdin
```

## Good to know

- The project needs at least one commit.
- Each variant is a full subagent run, so a bout costs about twice what one run of the task costs, plus the judge. With [model-router](../model-router) installed, each variant is routed like any subagent and may land on a cheaper model; the two can end up on different models.
- With [agent-crew](../agent-crew) installed, the variants also show up in the crew.
- In a cloud session the pane may not be drawn, depending on the app you watch it in. Arena still runs, and its reply says when the pane could not be shown.
- One bout at a time.

## Install

```
/plugin install arena --marketplace Andrea-Logo/claude-mods
```

or, in the desktop app, **+** → **Plugins** → **Add marketplace** `Andrea-Logo/claude-mods` → **Add plugin**. Needs a recent Claude Code (tested on 2.1.308).
