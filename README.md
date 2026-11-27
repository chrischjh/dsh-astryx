# dsh-astryx · Astryx frontend assistant

Enabling this plugin is enough for an agent to build UI with [Astryx](https://github.com/meta/astryx) as a developer who knows the system: it **ships the Astryx skill**, states the expert posture in the prompt, and adds three read-only reports so nothing is guessed.

What the Astryx skill carries — and therefore what the agent gets:

- the workflow: `astryx build "<idea>"` names a template → `astryx template <name> <path>` scaffolds it → `astryx component <Name>` prints props;
- the naming rules agents get wrong: text goes in `label` (Text/Heading/Link take children), booleans start with `is`/`has`, inputs take `value`/`onChange`;
- the shipping rules: no hardcoded `#hex`/`px`, no `@apply`, no raw `<div>`/`<span>` where a component exists, and re-read the files before delivering.

The plugin is the harness side of that: it makes the knowledge present, points the agent at the CLI for version-matched truth, and checks the wiring.

## The skill, and whence it comes

`skills/astryx/SKILL.md` is vendored **byte-identical** from the Astryx CLI's computer-level skill (`astryx init --user`) and pinned by `skills.lock.json`. At activation:

- if DSH already loads an Astryx skill (the CLI keeps one in `~/.agents/skills` or `$DSH_HOME/skills`), that copy wins and this bundle registers nothing — no duplicates, and the CLI stays the source of truth;
- otherwise the bundled copy is registered on `ctx.skills`, so the plugin alone is sufficient.

Refresh after an Astryx release: `node scripts/sync-skill.mjs` (copy + re-pin); `node scripts/sync-skill.mjs --verify` fails on drift.

## Tools (read-only)

| Tool | Answers |
|---|---|
| `astryx_setup` | Can this project build UI with Astryx right now? React 19, `@astryxdesign/core`, a theme package, the CLI, the `ASTRYX` agent-docs block, and the loaded skill — each with the exact command that fixes a gap |
| `astryx_status` | Installed vs newest `@astryxdesign/core`/`cli`, canary channel, and whether the newest release is still inside this plugin's support range (`compatible`, `compatible-untested`, `plugin-update-required`, `astryx-too-old`, `capability-incompatible`, `unknown`) |
| `astryx_selfcheck` | The `dsh-astryx` row in the applied patch layers, the CLI surface against `compat.json`, an Astryx MCP `initialize`→`tools/list` handshake, and whether the Astryx skill sits in a directory DSH loads (`effective`, `project-only`, `invalid`, `missing`) |

Failure codes: `plugin-row-missing`, `plugin-row-disabled`, `mcp-unreachable`, `skill-invalid`, `contract-drift`.

## Detail page

The plugin's detail page gets one extra section with three cards — 开发就绪 / 版本与兼容 / 接线自检 — each with a "立即检查" button. They POST to same-origin routes (`/dsh-astryx/setup`, `/status`, `/selfcheck`): POST-only, JSON-only, `Origin` must equal `Host`, bounded body, 60 s deadline, and nothing is written. Headless profiles never mount the web server and simply omit this half.

## Install

```
plugin_manager install_bundle → /Users/chrischen/projects/dsh-astryx   (linked checkout)
plugin_manager install_bundle → graphics:npm dsh-astryx                 (from npm)
plugin_manager install_bundle → github:chrischjh/dsh-astryx             (from source)
```

One row, `dsh-astryx`. Config: `ttlHours` (6), `checkOnStart` (true), `registry`, `projectPath`.

## What it deliberately does not do

- It does not ship Astryx's ~120 pages of docs. Those live in the CLI and the installed package (`astryx docs <topic>`, `node_modules/@astryxdesign/core/docs/`), which are version-matched; a vendored copy would drift.
- It does not declare an Astryx MCP row. `astryx mcp` exists and its own docs call MCP the path for agents that cannot run commands; DSH agents run the CLI directly. `astryx_selfcheck` still probes a configured row.
- It does not install packages, run `astryx init`, or edit `AGENTS.md`. Every fix it suggests is printed, not performed.

## Cross-platform

The Host runs inside Electron, where `process.execPath` is the app binary and `PATH` is the short one a GUI launch inherits. The CLI is therefore resolved by **layout** (`src/npmPrefixes.js`): `npm_config_prefix`, `PNPM_HOME`, `~/.npmrc`, `%APPDATA%\npm`, `%LOCALAPPDATA%\npm`, `/usr/local`, `/opt/homebrew/lib/nodejs`, `~/.nvm`, `~/.asdf`, `~/.volta`, `~/Library/pnpm`, and versioned Node installs one level down. Spawning goes through `src/spawn.js`: `node <entry.mjs>` everywhere, and a `.cmd`/`.bat` shim only through a shell with pre-quoted arguments. Text parsers normalise CRLF. CI runs `ubuntu × macos × windows` at Node 22 and 24

## Layout

```
index.js            activation: skill, prompt, tools, routes, warm check
client.js           detail-page section (three cards)
skills/astryx/      vendored Astryx skill + skills.lock.json
src/skillInstall.js skill load, DSH addendum, duplicate suppression
src/setup.js        project readiness
src/compat.js       release verdict
src/selfcheck.js    wiring self-check
src/route.js        same-origin read-only routes
src/tools.js        the three tool contracts
src/npmPrefixes.js  PATH-independent npm global discovery
src/spawn.js        cross-platform spawn planning
src/patchScan.js    applied patch layers (bundles → profile → home)
src/skills.js       skill presence/visibility
src/mcpProbe.js     one-shot MCP handshake
src/project.js      project + installed versions + CLI manifest probe
src/registry.js     npm dist-tags
src/status.js       status assembly
src/cache.js        ttl cache under $DSH_HOME/cache/dsh-astryx
src/semver.js       comparators for the support range
```

Tests: `node --test` (97 cases, no network).

## Publishing

Published: `dsh-astryx` on npm. Catalog entry: [`market/chrischjh__dsh-astryx.yml`](market/chrischjh__dsh-astryx.yml), copied verbatim into `awesome-dsh-plugin` as `data/plugins/chrischjh__dsh-astryx.yml` once the repo is a day old.
