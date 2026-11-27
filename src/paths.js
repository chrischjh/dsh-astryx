import { homedir } from 'node:os'
import { join } from 'node:path'

/** Absolute DSH locations, taken from the env the Host plugin runs in. */
export function dshPaths(env = process.env) {
  const home = env.DSH_HOME || join(homedir(), '.dsh')
  const profileDir = env.DSH_PROFILE_DIR || ''
  const installDir = env.DSH_INSTALL_DIR || ''
  const skills = join(home, 'skills')
  const agentsSkills = join(homedir(), '.agents', 'skills')
  return {
    home,
    skills,
    agentsSkills,
    skillRoots: [
      { id: 'dsh', path: skills },
      { id: 'agents', path: agentsSkills },
    ],
    cache: join(home, 'cache', 'dsh-astryx'),

    profileDir,
    installDir,
  }
}
