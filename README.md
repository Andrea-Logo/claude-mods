# claude-mods

Small mods for [Claude Code](https://claude.com/claude-code): additions that change Claude Code's own interface and behaviour, such as a pane beside the chat, a toast, a slash command or a rule on tool calls.

This repository is a Claude Code plugin marketplace. Each mod lives in its own folder under `mods/` and is listed in `.claude-plugin/marketplace.json`, so you can install the ones you want with one line.

## Mods

| Mod | What it does |
| --- | --- |
| [agent-crew](mods/agent-crew) | A side pane that shows the main agent and every subagent as little animated pixel critters dressed for their role (painter, explorer, builder, ...), with status, current activity, model, effort, tokens and an estimated dollar cost. |

## Install

In the Claude Code desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `Andrea-Logo/claude-mods`, then **Add plugin** and pick the mod.

At the prompt of a terminal session:

```
/plugin install agent-crew --marketplace Andrea-Logo/claude-mods
```

From a shell:

```
claude plugin install agent-crew --marketplace Andrea-Logo/claude-mods
```

Answer `y` to add the marketplace, then choose a scope. The mod is active right away.

## Developing

Each mod is a plugin folder with `.claude-plugin/plugin.json`, `hooks/hooks.json` and a hooks module. From a mod's folder:

```
claude plugin validate .
claude plugin test .
```

The mod API is in early access and can change between Claude Code releases.

## License

[MIT](LICENSE)
