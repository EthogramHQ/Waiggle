// Test of infra/vps-dev/installer.sh (infra/vps-dev/contrat.md, A8, A10), run by
// `node --test infra/vps-dev/*.test.mjs infra/production/*.test.mjs` in the CI (A9).
// The bench (infra/faux-programmes.mjs) relocates every path of the script's block of paths under
// a temporary root (`/usr/local/sbin` becomes `<racine>/usr/local/sbin`), fakes id and chown (the
// tests do not run as root) and wraps the real git, so that one blob can be corrupted on its way.
// Linux only: elsewhere the whole file is skipped.
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { creerBanc, creerOrigine, linux, raisonDuSaut } from '../faux-programmes.mjs'

const INSTALLER = 'infra/vps-dev/installer.sh'
const DEPOT_DE_ROOT = '/srv/waiggle-deploy/depot.git'

/** The three files A8 names, and where they go. */
const NOMMES = {
  'infra/vps-dev/waiggle-deployer': ['/usr/local/sbin/waiggle-deployer', 0o755],
  'infra/vps-dev/waiggle-retour': ['/usr/local/sbin/waiggle-retour', 0o755],
  'infra/vps-dev/waiggle-deploy.logrotate': ['/etc/logrotate.d/waiggle-deploy', 0o644],
}

const bancs = []
afterEach(() => {
  while (bancs.length) bancs.pop().fermer()
})

const version = (v) => ({
  'infra/vps-dev/waiggle-deployer': `#!/bin/bash -p\n# deployer ${v}\n`,
  'infra/vps-dev/waiggle-retour': `#!/bin/bash -p\n# retour ${v}\n`,
  'infra/vps-dev/waiggle-deploy.logrotate': `/var/log/waiggle-deploy.log { weekly } # ${v}\n`,
  'infra/vps-dev/installer.sh': `# installer ${v}\n`,
  'infra/vps-dev/README.md': `not installed ${v}\n`,
  'infra/production/waiggle-deploy-force': `# not for vps-dev ${v}\n`,
})

/**
 * Root's bare repository holds main at V1 then V2, fetched from the bare repository standing for
 * GitHub; another branch holds a commit that is not on main.
 */
function preparer() {
  const banc = creerBanc(INSTALLER, { enPlus: ['git', 'chown'] })
  bancs.push(banc)
  const origine = creerOrigine(banc, version('v1'))
  const V1 = origine.depart
  const V2 = origine.commit('v2', version('v2'))
  const cote = origine.commit('not on main', version('cote'), { branche: 'autre' })
  const depot = banc.chemin(DEPOT_DE_ROOT)
  banc.git('init', '--quiet', '--bare', depot)
  banc.git(
    '-C',
    depot,
    'fetch',
    '--quiet',
    '--no-tags',
    banc.origine,
    '+refs/heads/main:refs/remotes/origin/main',
  )
  // The other branch reaches root's repository too, under another name: it must still be refused.
  banc.git(
    '-C',
    depot,
    'fetch',
    '--quiet',
    '--no-tags',
    banc.origine,
    '+refs/heads/autre:refs/remotes/origin/autre',
  )
  return { banc, V1, V2, cote, depot }
}

const lancer = (banc, args) =>
  banc.lancer(args, { env: { PATH: '/usr/bin:/bin', HOME: banc.dossier }, interprete: '/bin/bash' })

/** Every file under the relocated root, except root's bare repository. */
function poses(banc) {
  const trouves = []
  const parcourir = (d) => {
    for (const nom of readdirSync(d)) {
      const p = join(d, nom)
      if (p === banc.chemin(DEPOT_DE_ROOT)) continue
      if (statSync(p).isDirectory()) parcourir(p)
      else trouves.push(`/${relative(banc.racine, p)}`)
    }
  }
  parcourir(banc.racine)
  return trouves.sort()
}

const mode = (p) => statSync(p).mode & 0o777

describe('installer.sh', { skip: !linux && raisonDuSaut }, () => {
  it("installs only the named files, from root's bare repository at the named commit, and refuses a file that differs from that commit", async () => {
    // Installed at V1 while main is already at V2: the content is V1's, read from root's repository.
    const a = preparer()
    const r = await lancer(a.banc, [a.V1])
    assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(
      poses(a.banc),
      Object.values(NOMMES)
        .map(([dest]) => dest)
        .sort(),
    )
    for (const [chemin, [dest, m]] of Object.entries(NOMMES)) {
      const pose = a.banc.chemin(dest)
      assert.equal(readFileSync(pose, 'utf8'), version('v1')[chemin], dest)
      assert.equal(mode(pose), m, dest)
      const chown = a.banc.appels('chown').find((x) => x.args.includes(pose))
      assert.ok(
        chown?.args.some((x) => /^(root:root|0:0)$/.test(x)),
        `${dest} owned by root:root`,
      )
    }
    for (const d of ['/var/lib/waiggle-deploy', '/root/.config/waiggle-deploy']) {
      assert.equal(mode(a.banc.chemin(d)), 0o700, d)
    }
    // Read through git show at the commit, never from a working copy.
    const lus = a.banc
      .appels('git')
      .filter((x) => x.args.includes('show'))
      .map((x) => x.args.at(-1))
    for (const chemin of Object.keys(NOMMES)) assert.ok(lus.includes(`${a.V1}:${chemin}`), chemin)
    assert.deepEqual(a.banc.refuses(), [])

    // A file that differs from its blob once written is removed, and the run is refused.
    const b = preparer()
    b.banc.configurer({ corrompre: 'infra/vps-dev/waiggle-retour' })
    const rb = await lancer(b.banc, [b.V2])
    assert.notEqual(rb.code, 0)
    assert.equal(
      existsSync(b.banc.chemin('/usr/local/sbin/waiggle-retour')),
      false,
      'the differing file is removed',
    )

    // Refused before installing anything: a commit that is not on main, a malformed argument, two
    // arguments, a user id that is not 0.
    for (const [quoi, args, uid] of [
      ['not on main', (p) => [p.cote], 0],
      ['short commit', (p) => [p.V2.slice(0, 7)], 0],
      ['branch name', () => ['main'], 0],
      ['two arguments', (p) => [p.V2, p.V2], 0],
      ['not root', (p) => [p.V2], 1000],
    ]) {
      const p = preparer()
      p.banc.configurer({ uid })
      const rp = await lancer(p.banc, args(p))
      assert.notEqual(rp.code, 0, quoi)
      assert.deepEqual(poses(p.banc), [], `${quoi}: nothing installed`)
    }
  })
})
