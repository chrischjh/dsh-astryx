# Changelog

## 0.1.0

- `astryx_status`: installed vs latest `@astryxdesign/core`/`cli`, canary channel, update availability, and a verdict judged against the newest release (`compatible`, `compatible-untested`, `plugin-update-required`, `astryx-too-old`, `capability-incompatible`, `unknown`).
- `astryx_selfcheck`: plugin row in the applied patch layers, CLI surface against `compat.json`, Astryx MCP row configuration plus a stdio `initialize` → `tools/list` handshake, and where the Astryx skill is (DsH-visible or not).
- `compat.json` contract with `supported`, `testedAgainst`, `requiredCommands`, `requiredInitFlags`; version facts and surface facts are judged separately.
- Warm check after activation (non-blocking, cached for `ttlHours`).
- 53 tests over semver, verdicts, registry failures, project lookup, patch layers, skill visibility, MCP handshake and activation.
