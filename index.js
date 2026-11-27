import { Contract } from './src/contract.js'
import { StatusService } from './src/status.js'
import { SelfCheck } from './src/selfcheck.js'
import { SetupCheck } from './src/setup.js'
import { createTools } from './src/tools.js'
import { createRoutes } from './src/route.js'
import { registerSkillEffect } from './src/skillInstall.js'
import { PROMPT_SECTION } from './src/prompt.js'
import { dshPaths } from './src/paths.js'

export const name = 'astryx'

/**
 * Equips the agent to build UI with Astryx: it ships the Astryx skill (unless a
 * DSH-loaded copy already exists), states the expert posture in the prompt, and
 * exposes three read-only reports — project readiness, releases, wiring.
 */
export function apply(ctx, config = {}) {
  const settings = normalize(config)
  const paths = dshPaths()
  const log = (message) => ctx.logger?.warn?.(`[dsh-astryx] ${message}`)

  let contract
  try {
    contract = Contract.load()
  } catch (error) {
    log(`contract load failed: ${String(error?.message ?? error)}`)
    return
  }

  const status = new StatusService({
    contract,
    config: settings,
    cacheDir: paths.cache,
    defaultProjectPath: settings.projectPath,
  })
  const setup = new SetupCheck({ paths })
  const selfCheck = new SelfCheck({ contract, paths })

  const skillEffect = registerSkillEffect(ctx, { paths, log })
  if (skillEffect !== undefined) ctx.effect(skillEffect, 'dsh-astryx bundled Astryx skill')

  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt !== undefined && typeof systemPrompt.section === 'function') {
    ctx.effect(() => systemPrompt.section(PROMPT_SECTION), 'dsh-astryx prompt section')
  }

  const tools = ctx.get('tools')
  if (tools !== undefined && typeof tools.register === 'function') {
    for (const tool of createTools({ status, selfCheck, setup, settings })) {
      ctx.effect(() => tools.register(tool), `dsh-astryx ${tool.name}`)
    }
  } else {
    log('ctx.tools is unavailable; the Astryx reports were not registered')
  }

  // The Web server mounts after bundle rows, so wait for the service instead of
  // checking once at activation and silently skipping the UI half (headless
  // profiles simply never get the route).
  const registerRoutes = (scoped) => {
    const webServer = scoped.get('webServer')
    if (webServer === undefined || typeof webServer.register !== 'function') {
      log('ctx.webServer is unavailable; the detail-page routes were not registered')
      return
    }
    scoped.effect(() => webServer.register(createRoutes({ status, setup, selfCheck, log })), 'dsh-astryx routes')
  }
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (scoped) => registerRoutes(scoped !== null && typeof scoped === 'object' ? scoped : ctx))
  } else {
    registerRoutes(ctx)
  }

  if (settings.checkOnStart) {
    ctx.effect(() => {
      const timer = setTimeout(() => {
        status.collect({ projectPath: settings.projectPath }).catch((error) => {
          log(`background check failed: ${String(error?.message ?? error)}`)
        })
      }, 5)
      timer.unref?.()
      return () => clearTimeout(timer)
    }, 'dsh-astryx warm check')
  }
}

function normalize(config) {
  const ttlHours = Number(config.ttlHours)
  return {
    ttlHours: Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 6,
    checkOnStart: config.checkOnStart !== false,
    registry: typeof config.registry === 'string' && config.registry ? config.registry : 'https://registry.npmjs.org',
    projectPath: typeof config.projectPath === 'string' ? config.projectPath : '',
  }
}
