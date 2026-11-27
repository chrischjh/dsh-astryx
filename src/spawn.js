/**
 * Cross-platform spawn planning. Windows cannot spawn a `.cmd`/`.bat` without a
 * shell (Node ≥ 20, CVE-2024-27980), and shell mode does not quote arguments it
 * joins, so the command line is built here once for both callers.
 */
export function planSpawn({ file, args = [], platform = process.platform, options = {} }) {
  const base = { windowsHide: true, ...options }
  if (!needsShell(file, platform)) return { file, args, options: base }
  return {
    file: [file, ...args].map(quoteForShell).join(' '),
    args: [],
    options: { ...base, shell: true },
  }
}

export function needsShell(file, platform) {
  return platform === 'win32' && /\.(cmd|bat)$/i.test(String(file))
}

export function quoteForShell(value) {
  const text = String(value)
  return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text
}
