# arena

> **Preview (0.1.0).** Arena starts the variants and follows them live. The automatic judge and the merge of the winner are the next step and are not in this version yet.

Two Claude variants take on the same task at the same time, each in its own git worktree, and a pane follows them side by side: status, model, time, steps, tokens and cost, live.

```
/arena write a function that reverses a string
```

## What it does

1. Creates two git worktrees of your project, on branches `arena/<id>-1` and `arena/<id>-2`, from the commit you are on. They live in `.arena/` at the project's root, which arena adds to `.git/info/exclude`, so your `.gitignore` is not touched.
2. Starts one Claude subagent in each worktree with your task, told to work only there.
3. Opens the **Arena** pane: one row per variant with its status (starting, working, done, failed), model, elapsed time, steps, tokens and estimated cost.
4. When a variant finishes, commits its work on its branch and shows the size of its change (`1 file changed, 5 insertions(+)`).
5. Once both are done, **Discard bout** removes the worktrees and the branches. Your own branch is never changed.

To look at a variant's work, check out its branch or open its worktree folder.

## Options

```
/arena [--repo <path>] <task>
```

`--repo` names the git repository to run in. You need it when the session does not start inside one, for example a cloud session with several repositories.

| Setting | Default | What it does |
| --- | --- | --- |
| `language` | `en` | Labels in English (`en`) or Italian (`it`). |

## Good to know

- The project needs at least one commit.
- Each variant is a full subagent run, so a bout costs about twice what one run of the task costs. With [model-router](../model-router) installed, each variant is routed like any subagent and may land on a cheaper model; the two can end up on different models.
- With [agent-crew](../agent-crew) installed, the variants also show up in the crew.
- In a cloud session the pane may not be drawn, depending on the app you watch it in. Arena still runs, and its reply says when the pane could not be shown.
- One bout at a time.

## Coming next

- An automatic judge (a cheap model) that compares the two changes and proposes a winner.
- A button per variant to pick the winner; the winner is merged into your branch and the rest cleaned up.

## Install

```
/plugin install arena --marketplace Andrea-Logo/claude-mods
```

or, in the desktop app, **+** → **Plugins** → **Add marketplace** `Andrea-Logo/claude-mods` → **Add plugin**. Needs a recent Claude Code (tested on 2.1.308).
