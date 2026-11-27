# dsh-astryx

Checks @astryxdesign releases and says whether the newest Astryx still fits this plugin's support contract — and self-checks whether the Astryx MCP server and skill in this DSH install actually work.

Astryx is a beta design system (`@astryxdesign/core`, currently 0.7.x) with a CLI that is deliberately the agent interface (`astryx docs`, `astryx component <Name>`, `astryx manifest --json`, `astryx mcp`). Beta means the CLI surface and the component API move. An agent that teaches itself Astryx once and never re-checks will confidently write code against a surface that no longer exists. This plugin is the guard: it watches the registry and it checks the local wiring.

## Tools

### `astryx_status`

Versions, update availability and a compatibility verdict. Cached for `ttlHours`; pass `refresh: true` to re-check now.

| Field | Meaning |
|---|---|
| `astryx.installedCore` / `installedCli` / `installedSource` | what the project has, from `node_modules` (accurate) or from `package.json` ranges (`package.json`), or `none` |
| `astryx.latestCore` / `latestCli` / `canaryCore` | npm `dist-tags` |
| `astryx.updateAvailable` | an install exists and it differs from latest (never true on an empty project) |
| `compat.verdict` | see the table below — always judged against the **newest** release |
| `probe` | `astryx manifest --json` result from the project or global CLI: version and any missing required command |

Verdicts:

| Verdict | Meaning | What to do |
|---|---|---|
| `compatible` | newest release is inside `supported` and equals `testedAgainst` | nothing |
| `compatible-untested` | newest is inside the range but newer than anything verified | run `astryx_selfcheck`, then bump `testedAgainst` |
| `plugin-update-required` | newest release is **outside** the range this plugin supports | update this plugin, or pin `@astryxdesign/core` |
| `astryx-too-old` | below the supported minimum | upgrade Astryx |
| `capability-incompatible` | CLI answered but a required command/flag is gone, whatever the version says | update `compat.json` and the plugin |
| `unknown` | registry unreachable and nothing installed | retry with `refresh: true` |

### `astryx_selfcheck`

Read-only self-check of the pieces this setup depends on. It reports facts and a failure code; it repairs nothing.

Checks:

1. **Plugin** — is the `dsh-astryx` row present in the applied patch layers (bundle patches → profile patch → home patch, later wins), and is it disabled? The tool being callable is itself the registration proof.
2. **CLI** — resolvable (project `node_modules`, then `PATH`), and does `astryx manifest --json` still expose every command in `compat.json`?
3. **MCP** — is an Astryx `@deepseek-ai/dsh-mcp-client` row configured? If it is stdio, the plugin performs one `initialize` → `tools/list` handshake and reports tool count and latency. With no row it probes the local `astryx mcp` and labels the result `basis: "local-cli"`.
4. **Skill** — the Astryx skill is only *effective* when it sits where DSH loads skills. The check distinguishes `effective` (DSH skill root, valid frontmatter), `invisible` (only in `~/.agents/skills`, which DSH does not read), `project-only`, `invalid` (frontmatter missing `name`/`description`) and `missing`.
5. **Project** — whether this directory has Astryx and whether `astryx init` already wrote its managed `ASTRYX:` block into `AGENTS.md`.

Failure codes: `plugin-row-missing`, `plugin-row-disabled`, `mcp-unreachable`, `skill-invalid`, `contract-drift`.

## Install

```bash
# from the plugin manager, or from a shell:
dsh plugin install /Users/chrischen/projects/dsh-astryx
```

The bundle declares one row, `dsh-astryx`, with the defaults below.

## Config

| Key | Default | Meaning |
|---|---|---|
| `ttlHours` | `6` | how long a status result stays fresh |
| `checkOnStart` | `true` | warm the cache once after activation (non-blocking, unref'd timer) |
| `registry` | `https://registry.npmjs.org` | dist-tags endpoint base |
| `projectPath` | `''` → `process.cwd()` | default directory to search for an Astryx project |

## Compatibility policy

`compat.json` is the contract:

- `supported` — the range the plugin's guidance is written for;
- `testedAgainst` — the release actually verified;
- `requiredCommands` / `requiredInitFlags` — the CLI surface the guidance depends on.

Bump `testedAgainst` after a probe pass; widen `supported` only after reviewing the release notes; change `required*` when the plugin's own guidance changes. Nothing here pins `@astryxdesign/*` — the plugin reads versions, it never installs them.

## Degraded modes

- **No Astryx installed**: `astryx_status` still answers, because the newest release is judged from the registry against the contract. `updateAvailable` is `false` and the reason says so.
- **No network**: the verdict falls back to the installed version, and `registry.ok` is `false` with the error.
- **No CLI**: version facts still work; `probe.ran` is `false`, and `capability-incompatible` cannot trigger.
- **Streamable-HTTP MCP rows**: reported as configured but not probed (`error` says so) — this plugin speaks JSON-RPC over stdio only.

## Layout

```
index.js            Host plugin: two tools, one prompt section, warm check
compat.json         support contract (versions + required CLI surface)
src/semver.js       minimal semver (comparators, prerelease ordering)
src/contract.js     contract loader
src/registry.js     npm dist-tags (failures stay data)
src/project.js      project lookup, installed versions, CLI manifest probe
src/compat.js       verdict logic
src/cache.js        ttl cache under $DSH_HOME/cache/dsh-astryx
src/status.js       status assembly + text renderer
src/paths.js        DSH locations from the environment
src/patchScan.js    applied patch layers (bundles → profile → home), line-based
src/skills.js       skill presence, visibility to DSH, frontmatter validity
src/mcpProbe.js     one-shot MCP initialize → tools/list
src/selfcheck.js    the self-check report
```

Tests: `node --test test/` (57 cases, no network).

## Known limits

- Patch scanning is line-based YAML, tuned to the row shapes DSH writes; unusual nesting is reported as not found rather than guessed.
- Patch layers are found from `$DSH_HOME/profiles/*` by looking for the profile that owns `node_modules/dsh-astryx`, so the check does not depend on `DSH_PROFILE_DIR` being exported into the Host process.
- A skill file freshly written into `~/.dsh/skills` appears in the DSH catalog at the next session start, not mid-session.
