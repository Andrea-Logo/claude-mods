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

## Developing

Each mod is a plugin folder with `.claude-plugin/plugin.json`, `hooks/hooks.json` and a hooks module, the `types/index.d.ts` contract and tests in `tests/`. From a mod's folder:

```
claude plugin validate .
claude plugin test .
```

The mod API is in early access and can change between Claude Code releases.

## License

[MIT](LICENSE)
