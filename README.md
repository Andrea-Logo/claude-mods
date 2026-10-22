# claude-mods

Small mods for [Claude Code](https://claude.com/claude-code): additions that change Claude Code's own interface and behaviour, such as a pane beside the chat, a toast, a slash command or a rule on tool calls.

This repository is a Claude Code plugin marketplace. Each mod lives in its own folder under `mods/` and is listed in `.claude-plugin/marketplace.json`, so you can install the ones you want with one line.

## Mods

| Mod | What it does |
| --- | --- |
| [agent-crew](mods/agent-crew) | A side pane that shows the main agent and every subagent as little animated pixel critters dressed for their role (painter, explorer, builder, ...), with status, activity, model, effort, tokens and estimated cost. |
| [model-router](mods/model-router) | Starts each subagent on the cheapest model and effort that fits its task (Haiku for a typo, Sonnet for everyday work, Opus for the hard parts), never above what it would have used; suggests a cheaper model for simple prompts. Shows its savings in agent-crew. |

## Install

In the Claude Code desktop app: **+** → **Plugins** → **Add marketplace** `Andrea-Logo/claude-mods` → **Add plugin**, then pick the mod.

In a terminal session, at the prompt:

```
/plugin install agent-crew --marketplace Andrea-Logo/claude-mods
```

From a shell:

```
claude plugin install agent-crew --marketplace Andrea-Logo/claude-mods
```

Answer `y` to add the marketplace, then choose a scope (project or user). The mod is active right away.

## Requirements

Mods use Claude Code's function-hook API, which is in early access, so they need a recent Claude Code. They are tested on **2.1.308**. Older releases may not know function-hook plugins at all: on 2.1.206, `claude plugin list` shows each mod as failed to load with `Hook load failed: ... "path": ["hooks"] ... expected record, received undefined`. If you see that, run `claude update`.

The desktop app updates its own Claude Code separately from the one in your terminal, so a mod can work in the app's Code tab while `claude plugin list` in the terminal still reports it as failed.

## Updating

To get a newer version of a mod:

```
claude plugin marketplace update claude-mods
claude plugin update <mod>@claude-mods
```

then restart Claude Code.

## Cloud sessions

A Claude Code session on the web (claude.ai/code) starts in a fresh container that has none of your local plugins. To have mods in every cloud session, add them to the environment's **setup script** (the cloud environment menu in the session's title bar, then **Edit**), which runs when each new session starts:

```
claude plugin marketplace add Andrea-Logo/claude-mods || true
claude plugin install agent-crew@claude-mods || true
claude plugin install model-router@claude-mods || true
```

Settings can be set there too, for example the language:

```
echo '{"language":"it"}' | claude plugin configure agent-crew@claude-mods --values-stdin || true
```

`|| true` keeps a slow network from stopping the session from starting.

## Developing

Each mod is a plugin folder with `.claude-plugin/plugin.json`, `hooks/hooks.json` and a hooks module, the `types/index.d.ts` contract and tests in `tests/`. From a mod's folder:

```
claude plugin validate .
claude plugin test .
```

The mod API is in early access and can change between Claude Code releases.

## License

[MIT](LICENSE)
