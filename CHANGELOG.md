# Changelog

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
