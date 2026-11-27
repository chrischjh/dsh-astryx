import { Semver } from './semver.js'

/**
 * Decides whether Astryx is still inside this plugin's support contract.
 * Latest-version compatibility and installeability are separate facts; the
 * verdict always describes the newest release, so a stale install cannot hide it.
 */
export class CompatJudge {
  constructor(contract) {
    this.contract = contract
  }

  judge({ latest = {}, installed = {}, probe = {}, registryOk = true } = {}) {
    const reasons = []
    const actions = []
    const target = String(latest.core ?? '') || String(installed.core ?? '')
    const verdict = this.#verdict({ target, latest, installed, probe, registryOk, reasons, actions })
    return { verdict, target, reasons, actions }
  }

  #verdict(input) {
    const { target, latest, installed, probe, registryOk, reasons, actions } = input

    if (probe.ran && Array.isArray(probe.missing) && probe.missing.length > 0) {
      reasons.push(`probe: ${probe.via} is missing ${probe.missing.join(', ')} (surface this plugin depends on)`)
      actions.push('Run `astryx manifest --json` and review compat.json; the CLI surface changed, so update dsh-astryx')
      return 'capability-incompatible'
    }

    if (!target) {
      reasons.push(registryOk ? 'no Astryx version found in the registry or the project' : `registry unreachable; ${this.#registryError(installed)}`)
      actions.push('Retry with `refresh: true`, or install @astryxdesign/core in the project')
      return 'unknown'
    }

    if (!this.contract.supports('core', target)) {
      if (this.#belowMinimum(target)) {
        reasons.push(`${target} is below the supported minimum ${this.contract.range('core')}`)
        actions.push('Upgrade @astryxdesign/core inside the supported range')
        return 'astryx-too-old'
      }
      reasons.push(`newest Astryx ${target} is outside the range dsh-astryx ${this.contract.pluginVersion} supports (${this.contract.range('core')})`)
      actions.push('Update dsh-astryx (its compat.json support range) or pin @astryxdesign/core to the tested version')
      return 'plugin-update-required'
    }

    if (this.contract.isUntested(target, 'core')) {
      reasons.push(`${target} is newer than the tested ${this.contract.tested('core')}; inside the range, not yet verified`)
      actions.push('Run astryx_selfcheck, then bump testedAgainst in compat.json once the probe passes')
      return 'compatible-untested'
    }

    reasons.push(`${target} is inside ${this.contract.range('core')} and equals the tested ${this.contract.tested('core')}`)
    appendInstalledFacts(reasons, latest, installed, target)
    return 'compatible'
  }

  #belowMinimum(version) {
    const minimum = this.contract.range('core').split(/\s+/).find((token) => token.startsWith('>='))
    if (!minimum) return false
    return Semver.compare(version, minimum.slice(2)) < 0
  }

  #registryError(installed) {
    return installed.core ? `judged against installed ${installed.core}` : 'no installed Astryx either'
  }
}

function appendInstalledFacts(reasons, latest, installed, target) {
  if (!installed.core) {
    reasons.push('Astryx is not installed in the project')
    return
  }
  if (String(latest.core ?? '') && String(installed.core) !== String(latest.core)) {
    reasons.push(`project has ${installed.core} (${installed.source}); ${latest.core} is available`)
  }
}
