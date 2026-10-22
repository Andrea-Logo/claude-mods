# claude-mods

A public Claude Code plugin marketplace of small mods (function-hook plugins), owned by Andrea.

## Languages

- **Talk to Andrea in Italian**: every reply, question and summary in a session on this repository.
- **Everything in the repository is in English**: code, comments, READMEs, commit messages, pull request titles and descriptions.
- **Text a mod shows its user is localized**: each mod has a `language` setting (`en` default, `it` too); English is the default for everyone who installs it.

## Structure

- `.claude-plugin/marketplace.json` lists every mod; a new mod gets an entry with `"source": "./mods/<name>"`.
- `mods/<name>/` is one plugin: `.claude-plugin/plugin.json`, `hooks/hooks.json`, the hooks module and its helpers in `hooks/`, the `$.state` contract in `types/index.d.ts`, tests in `tests/`, its own `README.md`.
- The root `README.md` has a table of the mods: keep it in step with the marketplace.

## Rules

- The repository is public: no personal data, private paths, names of the owner's folders, or anything from his private notes. Anything personal a mod needs becomes a `userConfig` setting.
- Before pushing, run `claude plugin validate mods/<name>` and `claude plugin test mods/<name>`.
- Never push to `main` directly: work on a branch and open a pull request for Andrea to merge.
- A mod is developed and tried live in the session's own mods folder (the plugin-authoring skill says where), then copied here without the engine-written `.claude-plugin/types/` folder.
- Model prices in a mod come from Anthropic's published list prices; update them when they change.
- Keep manifests loadable by older Claude Code releases: no `options` on `userConfig` fields (older releases reject the whole plugin as an invalid manifest). List the allowed values in the field's `description` and read the value forgivingly in code, falling back to the default.
