# Changelog

## 0.3.0

The plugin now equips the agent instead of only reporting.

- **Ships the Astryx skill.** `skills/astryx/SKILL.md` is vendored byte-identical from the CLI's computer-level skill and pinned by `skills.lock.json`; at activation it is registered on `ctx.skills` unless DSH already loads an Astryx skill (then the CLI copy wins and nothing is duplicated). `scripts/sync-skill.mjs` refreshes it, `--verify` fails on drift. The body carries the `astryx build → template → component` workflow and the naming rules (`label`, `is`/`has`, `value`/`onChange`).
- **Expert posture in the prompt**: load the skill, look props up in the CLI, never invent a component API, never hand-roll a component Astryx ships.
- **New tool `astryx_setup`**: project readiness — React 19, `@astryxdesign/core`, a theme package, the CLI, the `ASTRYX` agent-docs block, and the loaded skill, each with the fixing command.
- **Client half**: one detail-page section with three cards (开发就绪 / 版本与兼容 / 接线自检) and a "立即检查" button each, backed by same-origin read-only routes (`POST /dsh-astryx/{setup,status,selfcheck}`, Origin checked, 64 KiB body cap, 60 s deadline).
- **Renamed** to 「Astryx 前端助手」/ "Astryx Frontend Assistant" — the old title named an activity nobody could place.
- Routes wait for the `webServer` service via `ctx.inject` (it mounts after bundle rows), so headless profiles degrade to tools only.

## 0.2.0

Cross-platform rewrite, after running against a real global Astryx install.

- **Global CLI resolution no longer depends on `PATH` or `process.execPath`.** The Host runs inside Electron, where `execPath` is the app binary and a windowed launch inherits a short `PATH`; a Homebrew/global install was therefore invisible. Prefixes now come from `npm_config_prefix`, `PNPM_HOME`, `~/.npmrc`, `%APPDATA%\npm`, `%LOCALAPPDATA%\npm`, `/usr/local`, `/opt/homebrew/lib/nodejs`, `~/.nvm`, `~/.asdf`, `~/.volta`, `~/Library/pnpm`, and versioned Node installs one level down (`src/npmPrefixes.js`).
- **Manifest parsing fixed for the real CLI.** `astryx manifest --json` answers with an envelope (`{ apiVersion, type, data: { version, commands } }`); the probe previously read the top level and saw zero commands.
- **Windows-safe spawning** (`src/spawn.js`): CLIs run as `node <entry.mjs>` everywhere; a `.cmd`/`.bat` shim is spawned through a shell with pre-quoted arguments, because Node ≥ 20 refuses to spawn one directly. `MCP` probes use the same planner.
- **Skill visibility corrected.** DSH loads skills from `$DSH_HOME/skills` *and* `~/.agents/skills`, so the Astryx skill installed by the CLI's postinstall is effective; verdicts are now `effective` / `project-only` / `invalid` / `missing`, and the report lists the roots it checked.
- **CRLF safety** for patch layers and skill frontmatter (Windows-written files).
- **Cross-platform CI**: `ubuntu`, `macos`, `windows` × Node 22/24 run the suite and `npm pack --dry-run`.

Verified live in the DSH Host: `cli: global-cli 0.7.17`, `skill: effective`, and a local `astryx mcp` handshake returning 56 tools.

## 0.1.0

- `astryx_status`: installed vs latest `@astryxdesign/core`/`cli`, canary channel, update availability, and a verdict judged against the newest release.
- `astryx_selfcheck`: plugin row in the applied patch layers, CLI surface against `compat.json`, Astryx MCP row configuration plus a stdio handshake, and where the Astryx skill lives.
- `compat.json` contract; version facts and surface facts judged separately.
- Warm check after activation (non-blocking, cached).
- 57 tests over semver, verdicts, registry failures, project lookup, patch layers, skill visibility, MCP handshake and activation.
