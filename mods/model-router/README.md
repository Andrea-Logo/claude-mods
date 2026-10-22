# model-router

Spend less on subagents without thinking about it. The router reads the task each subagent is given, decides how hard it is, and starts it on the cheapest model and effort that fit: Haiku for a typo, Sonnet for everyday work, Opus for the hard parts.

## How it decides

For each subagent, the first of these that settles a tier wins:

1. **Your rules**: words you choose, e.g. `thesis=hard, typo=easy`.
2. **The agent type**: `Explore` is easy, `Plan` is hard.
3. **Keywords** in the task description (English and Italian): a typo, a rename or a file lookup is easy; architecture, debugging, security or research is hard.
4. **Haiku**, when the words do not settle it: one short classification call, a fraction of a cent.
5. Otherwise the task is **normal**.

Then the mode picks the model and effort:

| Tier | careful | balanced (default) | aggressive |
| --- | --- | --- | --- |
| easy | Haiku · low | Haiku · low | Haiku · low |
| normal | Sonnet · high | Sonnet · medium | Haiku · medium |
| hard | Opus · high | Opus · high | Sonnet · high |

## What it never does

- **Never more expensive**: a subagent never runs on a pricier model, or at a higher effort, than it would have without the router.
- **Never overrides a choice**: an agent whose model was named on purpose is left alone, and so are forks, teammates, workflow agents and resumed runs.
- **Never touches the main conversation**: changing model or effort mid-conversation throws away the prompt cache and can cost more than it saves. For a short, simple prompt sent to Opus or Fable it shows a toast suggesting `/model haiku` instead, at most every 15 minutes.

A subagent starts fresh, so choosing its model at the start costs no cache. Its effort is set from its first request, so it never changes mid-run either.

## Seeing the savings

With [agent-crew](../agent-crew) installed, each routed agent shows its tier, the model it was routed to and why, and what it saved: the same tokens at the parent model's prices, less what they cost. The pane's header adds up the savings. The figure counts the model's price only. The tokens a lower effort saves are not in it, since nobody can know how many there would have been.

## A word on judging savings

What counts is the cost of the finished job, not of one request. If a task goes to a model too small for it and has to be redone, it costs more. Start with `balanced` or `careful`, watch the crew for a while, and add rules for the tasks it gets wrong.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `mode` | `balanced` | `careful`, `balanced` or `aggressive`, as in the table above. |
| `rules` | empty | Your own rules, checked first: comma separated `keyword=tier` pairs; tiers `easy`, `normal`, `hard`. |
| `askHaiku` | `true` | Ask Haiku when the words do not settle a tier. Off: unclear tasks are normal. |
| `suggestMain` | `true` | Suggest a cheaper model for simple prompts to the main conversation. |
| `language` | `en` | Language of the suggestion: `en` or `it`. |

## Install

Needs a recent Claude Code (tested on 2.1.308); see [Requirements](../../README.md#requirements). For cloud sessions, see [Cloud sessions](../../README.md#cloud-sessions).

```
/plugin install model-router --marketplace Andrea-Logo/claude-mods
```

or, in the desktop app, **+** → **Plugins** → **Add marketplace** `Andrea-Logo/claude-mods` → **Add plugin**.
