# dsh-astryx

Watches `@astryxdesign` (Astryx) releases and says whether the newest Astryx still fits this plugin's support contract — and self-checks whether the Astryx MCP server and skill in this DSH install actually work.

Astryx is a beta design system (`@astryxdesign/core`, 0.7.x) whose CLI is deliberately the agent interface: `astryx docs`, `astryx component <Name>`, `astryx manifest --json`, `astryx mcp`. Beta means that surface moves. An agent that learns Astryx once and never re-checks will confidently write code against commands that no longer exist. This plugin is the guard: it watches the registry and it checks the local wiring.

## Tools

### `astryx_status`

Versions, update availability, and a compatibility verdict. Cached for `ttlHours`; pass `refresh: true` to re-check now.

| Field | Meaning |
|---|---|
| `astryx.installedCore` / `installedCli` / `installedSource` | what the project has: `node_modules` (accurate), `package.json` ranges, or `none` |
| `astryx.latestCore` / `latestCli` / `canaryCore` | npm `dist-tags` |
| `astryx.updateAvailable` | an install exists and differs from latest (never true on an empty project) |
| `compat.verdict` | always judged against the **newest** release — see below |
| `probe` | `astryx manifest --json` from the project CLI, then any global install: version and any missing required command |

| Verdict | Meaning | What to do |
|---|---|---|
| `compatible` | newest release is inside `supported` and equals `testedAgainst` | nothing |
| `compatible-untested` | inside the range but newer than anything verified | run `astryx_selfcheck`, then bump `testedAgainst` |
| `plugin-update-required` | newest release is **outside** this plugin's range | update this plugin, or pin `@astryxdesign/core` |
| `astryx-too-old` | below the supported minimum | upgrade Astryx |
| `capability-incompatible` | the CLI answered but a required command or flag is gone, whatever the version says | update `compat.json` and the plugin |
| `unknown` | registry unreachable and nothing installed | retry with `refresh: true` |

Version numbers and surface facts are judged separately on purpose: a release can keep its version shape and still drop a command.

### `astryx_selfcheck`

Read-only. Reports facts and one failure code; repairs nothing.

1. **Plugin** — the `dsh-astryx` row in the applied patch layers (bundle patches → profile patch → home patch, later wins) and whether it is disabled. The tool being callable is itself the registration proof.
2. **CLI** — resolvable, and does `astryx manifest --json` still expose every command in `compat.json`?
3. **MCP** — is an Astryx `@deepseek-ai/dsh-mcp-client` row configured? If it is stdio, one `initialize` → `tools/list` handshake reports tool count and latency. With no row, the local `astryx mcp` is probed and labelled `basis: "local-cli"` (on 0.7.17 it answers with its full tool list, 56 tools).
4. **Skill** — Astryx writes its skill to `~/.agents/skills/astryx/SKILL.md`. DSH loads skills from both `$DSH_HOME/skills` and `~/.agents/skills`, so the verdicts are `effective` (in a loaded root, valid frontmatter), `project-only` (an `astryx-project` skill inside this repo only), `invalid` (frontmatter missing `name`/`description`) and `missing`. `roots` lists the directories that were checked.
5. **Project** — whether this directory uses Astryx and whether `astryx init` already wrote its managed `ASTRYX:` block into `AGENTS.md`.

Failure codes: `plugin-row-missing`, `plugin-row-disabled`, `mcp-unreachable`, `skill-invalid`, `contract-drift`.

## Install

```
plugin_manager install_bundle  →  /Users/chrischen/projects/dsh-astryx
```

One row, `dsh-astryx`, with the defaults below.

## Config

| Key | Default | Meaning |
|---|---|---|
| `ttlHours` | `6` | how long a status result stays fresh |
| `checkOnStart` | `true` | warm the cache once after activation (non-blocking, unref'd timer) |
| `registry` | `https://registry.npmjs.org` | dist-tags endpoint base |
| `projectPath` | `''` → `process.cwd()` | default directory to search for an Astryx project |

## Cross-platform

The Host runs inside Electron: `process.execPath` is the app binary, and a Finder/Explorer launch inherits a short `PATH`. Nothing here relies on either.

- **Global CLI lookup** (`src/npmPrefixes.js`) — npm puts packages under `<prefix>/lib/node_modules` (POSIX) or `<prefix>/node_modules` (Windows). Prefixes come from `npm_config_prefix`, `PNPM_HOME`, `~/.npmrc`, `%APPDATA%\npm`, `%LOCALAPPDATA%\npm`, `/usr/local`, `/opt/homebrew/lib/nodejs`, `~/.nvm`, `~/.asdf`, `~/.volta`, `~/Library/pnpm`, plus versioned Node installs one level down. `PATH` and `execPath` are extra hints, never the only source.
- **Spawning** (`src/spawn.js`) — global CLIs run as `node <entry.mjs>`, identically on every OS. A `.cmd`/`.bat` shim is the last resort and is spawned through a shell with pre-quoted arguments, because Node ≥ 20 refuses to spawn one directly.
- **Files** — every path goes through `node:path`; patch and skill text is CRLF-normalised before parsing; `.gitattributes` pins LF for hashed content.
- **CI** — `.github/workflows/ci.yml` runs the suite and `npm pack --dry-run` on `ubuntu`, `macos` and `windows` × Node 22/24.

## Compatibility policy

`compat.json` is the contract: `supported` (the range the guidance is written for), `testedAgainst` (the release actually verified), `requiredCommands` / `requiredInitFlags` (the CLI surface the guidance depends on). Bump `testedAgainst` after a probe pass, widen `supported` only after reading the release notes, and change `required*` when the guidance itself changes. Nothing here pins `@astryxdesign/*`: the plugin reads versions, it never installs them.

## Degraded modes

- **No Astryx installed** — `astryx_status` still answers, judging the newest release from the registry against the contract.
- **No network** — the verdict falls back to the installed version; `registry.ok` is `false` with the error.
- **No CLI** — version facts still work; `probe.ran` is `false` and `capability-incompatible` cannot trigger.
- **Streamable-HTTP MCP rows** — reported as configured but not probed; this plugin speaks JSON-RPC over stdio only.

## Layout

```
index.js            Host plugin: two tools, one prompt section, warm check
compat.json         support contract (versions + required CLI surface)
src/semver.js       minimal semver (comparators, prerelease ordering)
src/contract.js     contract loader
src/registry.js     npm dist-tags (failures stay data)
src/npmPrefixes.js  npm global prefix discovery, PATH-independent
src/spawn.js        cross-platform spawn planning (.cmd quoting)
src/project.js      project lookup, installed versions, CLI manifest probe
src/compat.js       verdict logic
src/cache.js        ttl cache under $DSH_HOME/cache/dsh-astryx
src/status.js       status assembly + text renderer
src/paths.js        DSH locations and skill roots from the environment
src/patchScan.js    applied patch layers (bundles → profile → home), line-based
src/skills.js       skill presence, visibility, frontmatter validity
src/mcpProbe.js     one-shot MCP initialize → tools/list
src/selfcheck.js    the self-check report
```

Tests: `node --test test/` (75 cases, no network).

## Publishing to the plugin market

Ready: `dsh.bundle.patch`, namespaced row id, icon, en/zh locale, README as the detail page, CI matrix.

The catalog entry is prepared at [`market/chrischjh__dsh-astryx.yml`](market/chrischjh__dsh-astryx.yml) — it is copied verbatim into `awesome-dsh-plugin` as `data/plugins/chrischjh__dsh-astryx.yml` (category `dev`, raster icon from `assets/`).

Done: public repo, `repository`/`homepage`/`bugs`, `dsh-plugin` topic, green CI on three platforms, packed-tarball install verified.

Still needs the account owner:

1. `npm login`, then `npm publish` from a TTY so the OTP flow works; verify with `npm view dsh-astryx version`. The catalog picks up npm downloads automatically through the `repository` field, so there is no `npm:` key to add.
2. The catalog PR once the repo is a day old (the project is new; a same-day submission reads as spam).

## Known limits

- Patch scanning is line-based YAML tuned to the row shapes DSH writes; unusual nesting is reported as not found rather than guessed.
- A skill written into a loaded root appears in the DSH catalog at the next session start, not mid-session.
- `astryx_status` judges the newest release; it does not predict what a future release will break.
