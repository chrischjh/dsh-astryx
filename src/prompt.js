export const PROMPT_SECTION = {
  name: 'astryx:expert',
  order: 3102,
  text: [
    'Astryx frontend work (any @astryxdesign project, or a request to build UI with Astryx): load the `astryx` skill first and follow its WORKFLOW — `astryx build "<idea>"` names a template, `astryx template <name> <path>` scaffolds it, `astryx component <Name>` prints the props.',
    'Never invent an Astryx component API or prop name from memory, and never hand-roll a component Astryx ships.',
    'Before the first page in a project, `astryx_setup` says whether the project is ready (React 19, core, a theme, the CLI, the agent-docs block); `astryx_status` watches releases; `astryx_selfcheck` reports the local CLI/MCP/skill wiring.',
  ].join(' '),
}
