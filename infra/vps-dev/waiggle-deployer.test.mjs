// Tests of waiggle-deployer and waiggle-retour (infra/vps-dev/contrat.md, A4, A5, A7, A10), run by
// `node --test infra/vps-dev/*.test.mjs infra/production/*.test.mjs` in the CI (A9).
// Each test builds its own bench (infra/faux-programmes.mjs): the test copy of the script, the fake
// gh, ssh, curl, systemd-run and id, and a bare repository standing for GitHub, checked by the real
// git. Linux only: elsewhere the whole file is skipped.
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  AUTRE_ID,
  argumentsAttestation,
  creerBanc,
  creerOrigine,
  DEBUT_CHEMINS,
  decouper,
  FICHIERS_MENTIONS,
  ID_LOUIS,
  lignes,
  linux,
  optionsSsh,
  PREFIXE,
  pr,
  racineDuDepot,
  raisonDuSaut,
  SECRETS,
  valeursDuBloc,
} from '../faux-programmes.mjs'

const DEPLOYER = 'infra/vps-dev/waiggle-deployer'
const RETOUR = 'infra/vps-dev/waiggle-retour'

/** The script as committed (no bench needed for the static checks). */
const sourceDe = (script) => readFileSync(join(racineDuDepot, script), 'utf8')

const API = '1f'.repeat(32)
const WEB = '2e'.repeat(32)

/** The tree of every fixture commit: site.env and the five files of the legal check. */
const ARBRE = {
  'infra/site.env': `# public addresses\nAPP_DOMAIN=waiggle.com\nIMAGE_PREFIX=${PREFIXE}\n`,
  'scripts/legal-placeholders.mjs': '// the legal check, from the commit tree\n',
  'packages/brand/src/legal.ts': 'export const legal = { name: "tree" }\n',
  'apps/api/src/env.ts': '// env.ts from the tree\n',
  'packages/i18n/src/locales/fr.ts': 'export default { tree: "fr" }\n',
  'packages/i18n/src/locales/en.ts': 'export default { tree: "en" }\n',
  'README.md': 'not part of the legal check\n',
}

/** The block of vps-dev, as the contract writes it (A3). */
const BLOC_VPS_DEV = {
  GIT: '/usr/bin/git',
  GH: '/usr/bin/gh',
  SSH: '/usr/bin/ssh',
  CURL: '/usr/bin/curl',
  SYSTEMD_RUN: '/usr/bin/systemd-run',
  FLOCK: '/usr/bin/flock',
  TIMEOUT: '/usr/bin/timeout',
  ID: '/usr/bin/id',
  ORIGINE: 'https://github.com/EthogramHQ/Waiggle.git',
  DEPOT: '/srv/waiggle-deploy/depot.git',
  GH_DIR: '/root/.config/waiggle-deploy/gh',
  NTFY: '/root/.config/waiggle-deploy/ntfy.curl',
  CLE: '/root/.ssh/waiggle-prod',
  CLE_RETOUR: '/root/.ssh/waiggle-retour',
  HOTES_CONNUS: '/root/.ssh/known_hosts',
  VERROU: '/run/waiggle-deploy.lock',
  ETAT: '/var/lib/waiggle-deploy',
  JOURNAL: '/var/log/waiggle-deploy.log',
  TRAVAIL: '/run/waiggle-deploy',
}

const bancs = []
afterEach(() => {
  while (bancs.length) bancs.pop().fermer()
})

const ecrire = (chemin, contenu, mode = 0o600) => {
  mkdirSync(dirname(chemin), { recursive: true })
  writeFileSync(chemin, contenu)
  chmodSync(chemin, mode)
}

/**
 * A bench where production runs S and main is S, B, C, each merged by Louis through its pull
 * request (#10, #11, #12), with the attestations of C's images.
 */
function preparer(
  script = DEPLOYER,
  { aussi = [], messageC = 'Merge pull request #12 from x/c' } = {},
) {
  const banc = creerBanc(script, { aussi })
  bancs.push(banc)
  const c = banc.chemins
  ecrire(
    join(c.GH_DIR, 'hosts.yml'),
    `github.com:\n  oauth_token: ${SECRETS.jeton}\n  user: lecteur\n`,
  )
  ecrire(c.NTFY, `url = "https://ntfy.example.invalid/${SECRETS.sujet}"\n`)
  if (c.CLE) ecrire(c.CLE, `-----BEGIN OPENSSH PRIVATE KEY-----\n${SECRETS.cle}\n`) // gitleaks:allow (fausse clé, faux-programmes.mjs)
  if (c.CLE_RETOUR)
    ecrire(c.CLE_RETOUR, `-----BEGIN OPENSSH PRIVATE KEY-----\n${SECRETS.cleRetour}\n`) // gitleaks:allow
  ecrire(c.HOTES_CONNUS, '203.0.113.7 ssh-ed25519 AAAAC3NzaHOTECONNU\n', 0o644)
  mkdirSync(c.ETAT, { recursive: true, mode: 0o700 })
  const origine = creerOrigine(banc, ARBRE)
  const S = origine.commit('Merge pull request #10 from x/s', { 'apps/s.txt': 's\n' })
  const B = origine.commit('Merge pull request #11 from x/b', { 'apps/b.txt': 'b\n' })
  const C = origine.commit(messageC, { 'apps/c.txt': 'c\n' })
  const etat = {
    service: S,
    github: { prs: [pr(10, S), pr(11, B), pr(12, C)] },
    attestations: { [`${PREFIXE}-api:${C}`]: API, [`${PREFIXE}-web:${C}`]: WEB },
  }
  const publier = () => banc.configurer(etat)
  publier()
  return { banc, c, origine, S, B, C, etat, publier }
}

/** Runs the test copy as sudo would: SUDO_USER set, and the caller's environment otherwise. */
const lancer = (banc, args, env = {}, script) =>
  banc.lancer(args, { env: { SUDO_USER: 'louis', PATH: '/usr/bin:/bin', ...env }, script })

const journal = (banc) => lignes(banc.lire(banc.chemins.JOURNAL))
const fins = (banc) => journal(banc).filter((l) => / fin /.test(l))
const debuts = (banc) => journal(banc).filter((l) => / debut /.test(l))
const champ = (ligne, cle) => new RegExp(` ${cle}=(\\S*)`).exec(ligne)?.[1]
const deploiements = (banc) => banc.appels('ssh').filter((a) => a.commande?.startsWith('deploy '))
const notifications = (banc) => banc.appels('curl').map((a) => a.texte.trim())
const court = (sha) => sha.slice(0, 7)

/** A refusal: its exit code, exactly one `fin` line with its reason, nothing deployed. */
function refuse(banc, r, raison, code = 2) {
  assert.equal(r.code, code, `exit code (stderr: ${r.stderr})`)
  const f = fins(banc)
  assert.equal(f.length, 1, `one fin line: ${journal(banc).join('\n')}`)
  assert.equal(champ(f[0], 'raison'), raison)
  assert.deepEqual(deploiements(banc), [], 'production never receives deploy')
  assert.deepEqual(banc.refuses(), [], 'every call follows the contract')
}

/** A deployment that went through. */
function deploye(banc, r, C) {
  assert.equal(r.code, 0, `exit code (stderr: ${r.stderr})`)
  assert.deepEqual(banc.refuses(), [], 'every call follows the contract')
  assert.deepEqual(
    deploiements(banc).map((a) => a.commande),
    [`deploy ${C} ${PREFIXE}-api@sha256:${API} ${PREFIXE}-web@sha256:${WEB}`],
  )
}

const attendre = async (condition, ms = 20_000) => {
  const fin = Date.now() + ms
  while (!condition()) {
    if (Date.now() > fin) throw new Error('condition not met in time')
    await new Promise((r) => setTimeout(r, 50))
  }
}

const maintenant = () => Math.floor(Date.now() / 1000)
const ecrireEssais = (banc, lignesEssais) =>
  ecrire(join(banc.chemins.ETAT, 'essais'), lignesEssais.map((l) => `${l}\n`).join(''))

/** Lines outside the block of paths and outside comments. */
const horsDuBloc = (source) => {
  const { avant, apres } = decouper(source)
  return [...avant, ...apres].filter((l) => !/^\s*#/.test(l))
}

describe('waiggle-deployer', { skip: !linux && raisonDuSaut }, () => {
  // --- From the security review v0

  it('refuses an argument that is not exactly 40 lowercase hexadecimal characters (39, 41, uppercase, `--upload-pack=x`, a trailing newline, two arguments)', async () => {
    const { banc, C } = preparer()
    const cas = [
      ['0'.repeat(39)],
      ['0'.repeat(41)],
      [`${C.slice(0, 39)}A`],
      ['--upload-pack=x'],
      [`${C}\n`],
      [C, C],
    ]
    for (const args of cas) {
      const r = await lancer(banc, args)
      assert.equal(r.code, 2, `${JSON.stringify(args)}: ${r.stderr}`)
      assert.match(r.stderr, /^waiggle-deployer : /m)
    }
    const f = fins(banc)
    assert.equal(f.length, cas.length)
    for (const l of f) {
      assert.equal(champ(l, 'raison'), 'argument')
      assert.equal(champ(l, 'commit'), '-')
    }
    assert.deepEqual(banc.appels('gh'), [])
    assert.deepEqual(banc.appels('ssh'), [])
  })

  it('refuses to run when the user id is not 0', async () => {
    const { banc, C } = preparer()
    banc.configurer({ uid: 1000 })
    const r = await lancer(banc, [C])
    assert.equal(r.code, 2)
    assert.deepEqual(journal(banc), [], 'no log line')
    for (const prog of ['gh', 'ssh', 'curl', 'systemd-run']) assert.deepEqual(banc.appels(prog), [])
  })

  it("ignores PATH, HOME, GIT_*, GH_*, SSH_* and RUCHE_* from the caller's environment", async () => {
    const { banc, c, C } = preparer()
    const piege = join(banc.dossier, 'piege')
    const temoin = join(banc.dossier, 'piege-touche')
    for (const nom of [
      'git',
      'gh',
      'ssh',
      'curl',
      'id',
      'flock',
      'timeout',
      'systemd-run',
      'env',
      'node',
    ]) {
      ecrire(join(piege, nom), `#!/bin/sh\ntouch '${temoin}'\nexit 0\n`, 0o755)
    }
    ecrire(join(piege, 'bashenv'), `touch '${temoin}'\n`, 0o644)
    ecrire(
      join(piege, 'home', '.gitconfig'),
      `[core]\n\tfsmonitor = ${join(piege, 'git')}\n`,
      0o644,
    )
    ecrire(join(piege, 'home', '.ssh', 'config'), 'Host *\n  ProxyCommand /bin/false\n', 0o644)
    const r = await lancer(banc, [C], {
      PATH: `${piege}:/usr/bin:/bin`,
      HOME: join(piege, 'home'),
      BASH_ENV: join(piege, 'bashenv'),
      GIT_DIR: piege,
      GIT_CONFIG_GLOBAL: join(piege, 'home', '.gitconfig'),
      GIT_SSH_COMMAND: join(piege, 'ssh'),
      GIT_EXEC_PATH: piege,
      GH_TOKEN: 'jeton-de-l-appelant',
      GH_CONFIG_DIR: piege,
      GH_HOST: 'evil.example.invalid',
      SSH_AUTH_SOCK: join(piege, 'agent'),
      SSH_ORIGINAL_COMMAND: 'deploy',
      RUCHE_VERSION: C,
      RUCHE_HOME: piege,
    })
    deploye(banc, r, C)
    assert.equal(existsSync(temoin), false, 'no program of the caller ran')
    for (const appel of banc.appels()) {
      assert.equal(appel.env.PATH, '/usr/sbin:/usr/bin:/sbin:/bin', appel.prog)
      assert.equal(appel.env.HOME, '/root', appel.prog)
      const venus = Object.keys(appel.env).filter(
        (k) => /^(GIT_|GH_|SSH_|RUCHE_|BASH_ENV$)/.test(k) && k !== 'GH_CONFIG_DIR',
      )
      assert.deepEqual(venus, [], `${appel.prog} received ${venus.join(', ')}`)
    }
    for (const appel of banc.appels('gh')) assert.equal(appel.env.GH_CONFIG_DIR, c.GH_DIR)
  })

  it('refuses a commit that is not on main of the GitHub repository', async () => {
    const a = preparer()
    const cote = a.origine.commit(
      'Pushed on another branch',
      { 'apps/x.txt': 'x\n' },
      { branche: 'autre' },
    )
    refuse(a.banc, await lancer(a.banc, [cote]), 'pas-sur-main')
    assert.deepEqual(a.banc.appels('ssh'), [], 'production is not even asked its version')

    const b = preparer()
    refuse(b.banc, await lancer(b.banc, [`${'c0ffee'.repeat(6)}c0ff`]), 'pas-sur-main')
  })

  it('refuses a commit that does not descend from the version in production', async () => {
    const a = preparer()
    a.etat.service = a.C
    a.publier()
    refuse(a.banc, await lancer(a.banc, [a.B]), 'plus-ancien')

    // A version in production that main does not know at all.
    const b = preparer()
    b.etat.service = b.origine.commit('Elsewhere', { 'apps/y.txt': 'y\n' }, { branche: 'autre' })
    b.publier()
    refuse(b.banc, await lancer(b.banc, [b.C]), 'plus-ancien')
    assert.deepEqual(
      b.banc.appels('gh').filter((x) => x.args[0] === 'api'),
      [],
    )
  })

  it('refuses the commit already in production', async () => {
    const { banc, C, etat, publier } = preparer()
    etat.service = C
    publier()
    refuse(banc, await lancer(banc, [C]), 'deja-en-service')
  })

  it('refuses when production answers a version that is not 40 hexadecimal characters', async () => {
    for (const reponse of ['abc', 'S', '', 'deux lignes']) {
      const { banc, S, C } = preparer()
      const version = {
        abc: 'abc\n',
        S: `${S.toUpperCase()}\n`,
        '': '',
        'deux lignes': `${S}\n${S}\n`,
      }[reponse]
      banc.configurer({ ssh: { version } })
      refuse(banc, await lancer(banc, [C]), 'version-illisible')
    }
  })

  it('reads infra/site.env from the commit tree, never from a working copy of louis', async () => {
    const arbre = 'ghcr.io/ethogramhq/waiggle-arbre'
    const a = preparer()
    const D = a.origine.commit('Merge pull request #13 from x/d', {
      'infra/site.env': `IMAGE_PREFIX=${arbre}\n`,
    })
    a.etat.github.prs.push(pr(13, D))
    a.etat.attestations = { [`${arbre}-api:${D}`]: API, [`${arbre}-web:${D}`]: WEB }
    a.publier()
    // Decoys: a working copy of louis in his home and in the current directory.
    const maison = join(a.banc.dossier, 'home', 'louis')
    ecrire(join(maison, 'Waiggle', 'infra', 'site.env'), 'IMAGE_PREFIX=ghcr.io/piege/x\n', 0o644)
    ecrire(join(a.banc.dossier, 'infra', 'site.env'), 'IMAGE_PREFIX=ghcr.io/piege/y\n', 0o644)
    const r = await lancer(a.banc, [D], { HOME: maison })
    assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(
      a.banc
        .appels('gh')
        .filter((x) => x.args[0] === 'attestation')
        .map((x) => x.args[2]),
      [`oci://${arbre}-api:${D}`, `oci://${arbre}-web:${D}`],
    )
    assert.deepEqual(
      deploiements(a.banc).map((x) => x.commande),
      [`deploy ${D} ${arbre}-api@sha256:${API} ${arbre}-web@sha256:${WEB}`],
    )

    // Exactly one IMAGE_PREFIX line, with a conforming value.
    for (const siteEnv of [
      `IMAGE_PREFIX=${PREFIXE}\nIMAGE_PREFIX=${arbre}\n`,
      'IMAGE_PREFIX=docker.io/Evil/x\n',
    ]) {
      const b = preparer()
      const E = b.origine.commit('Merge pull request #14 from x/e', { 'infra/site.env': siteEnv })
      b.etat.github.prs.push(pr(14, E))
      b.publier()
      refuse(b.banc, await lancer(b.banc, [E]), 'site-env')
      assert.deepEqual(
        b.banc.appels('gh').filter((x) => x.args[0] === 'attestation'),
        [],
      )
    }
  })

  it('runs the legal check as an unprivileged user that cannot read /root', async () => {
    const { banc, c, C } = preparer()
    deploye(banc, await lancer(banc, [C]), C)
    const [unite] = banc.appels('systemd-run')
    assert.ok(unite, 'the legal check runs under systemd-run')
    assert.ok(unite.args.includes('DynamicUser=yes'))
    assert.ok(unite.args.includes('ProtectHome=yes'))
    assert.ok(unite.dossier.startsWith(`${c.TRAVAIL}/`))
    // Readable by the dynamic user: the directory 0755, the files 0644, only the five of the tree.
    assert.equal(unite.modeDossier, 0o755)
    assert.deepEqual(
      unite.fichiers.map((f) => [f.chemin, f.mode, f.contenu]),
      [...FICHIERS_MENTIONS].sort().map((f) => [f, 0o644, ARBRE[f]]),
    )
    assert.equal(existsSync(unite.dossier), false, 'the directory is removed afterwards')
  })

  it("refuses when an image has no provenance attestation from main's CI for this commit, and never calls production", async () => {
    const { banc, C, etat, publier } = preparer()
    delete etat.attestations[`${PREFIXE}-web:${C}`]
    publier()
    refuse(banc, await lancer(banc, [C]), 'attestation')
    assert.equal(fins(banc)[0].includes('texte-recu-de-github'), false)
  })

  it('refuses a digest that is not 64 hexadecimal characters', async () => {
    for (const mauvaise of [`${'1f'.repeat(31)}1`, API.toUpperCase(), `sha256:${API}`]) {
      const { banc, C, etat, publier } = preparer()
      etat.attestations[`${PREFIXE}-api:${C}`] = mauvaise
      publier()
      refuse(banc, await lancer(banc, [C]), 'empreinte')
    }
  })

  it('calls production with exactly: deploy <commit> <prefix>-api@sha256:<64 hex> <prefix>-web@sha256:<64 hex>', async () => {
    const { banc, C } = preparer()
    const r = await lancer(banc, [C])
    deploye(banc, r, C)
    const [version, deploy] = banc.appels('ssh')
    assert.equal(version.commande, 'version')
    assert.deepEqual([basename(version.parent[0] ?? ''), version.parent[1]], ['timeout', '60'])
    assert.deepEqual([basename(deploy.parent[0] ?? ''), deploy.parent[1]], ['timeout', '900'])
    assert.equal(banc.appels('ssh').length, 2)
    assert.match(r.stdout, /sortie du gardien/, 'the output of the guard is passed through')
  })

  it('refuses a second run while one is in progress', async () => {
    const { banc, C } = preparer()
    banc.configurer({ ssh: { dormirDeploy: 4000 } })
    const premier = banc.demarrer([C], { env: { SUDO_USER: 'louis' } })
    await attendre(() => deploiements(banc).length === 1)
    const notifiees = banc.appels('curl').length
    const essais = banc.lire(join(banc.chemins.ETAT, 'essais'))
    const r = await lancer(banc, [C])
    assert.equal(r.code, 3, r.stderr)
    assert.equal(banc.appels('curl').length, notifiees, 'no notification for the lock')
    assert.equal(banc.lire(join(banc.chemins.ETAT, 'essais')), essais, 'not counted')
    assert.equal((await premier.fini).code, 0)
    const f = fins(banc)
    assert.equal(f.length, 2)
    assert.deepEqual(f.map((l) => champ(l, 'raison')).sort(), ['ok', 'verrou'])
  })

  it('refuses a run sooner than the minimum interval after the previous attempt, counted before any other check', async () => {
    // A commit that is not on main: the interval answers first.
    const a = preparer()
    ecrireEssais(a.banc, [`${maintenant() - 60} ${a.S}`])
    const cote = a.origine.commit('Not on main', {}, { branche: 'autre' })
    refuse(a.banc, await lancer(a.banc, [cote]), 'ecart', 3)
    assert.deepEqual(a.banc.appels('gh'), [])
    assert.deepEqual(a.banc.appels('ssh'), [])
    assert.deepEqual(a.banc.appels('systemd-run'), [])

    // Ten minutes later, the attempt goes through and is counted.
    const b = preparer()
    ecrireEssais(b.banc, [`${maintenant() - 601} ${b.S}`])
    deploye(b.banc, await lancer(b.banc, [b.C]), b.C)
    const essais = lignes(b.banc.lire(join(b.banc.chemins.ETAT, 'essais')))
    assert.equal(essais.length, 2)
    assert.match(essais[1], new RegExp(`^[0-9]+ ${b.C}$`))
  })

  it('writes one log line per attempt, accepted or refused, with the caller, the commit and the result', async () => {
    const horodatage = '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z'
    const a = preparer()
    deploye(a.banc, await lancer(a.banc, [a.C]), a.C)
    assert.deepEqual(
      journal(a.banc).map((l) => l.replace(/^\S+/, 'T').replace(/duree=[0-9]+$/, 'duree=N')),
      [
        `T debut script=waiggle-deployer appelant=louis commit=${a.C}`,
        `T fin script=waiggle-deployer appelant=louis commit=${a.C} service=${a.S} api=${API} web=${WEB} etape=11 resultat=ok raison=ok duree=N`,
      ],
    )
    for (const l of journal(a.banc)) assert.match(l, new RegExp(`^${horodatage} `))

    const b = preparer()
    b.etat.github.prs[2].merged_by = { id: AUTRE_ID, login: 'autre' }
    b.publier()
    refuse(b.banc, await lancer(b.banc, [b.C]), 'pas-louis')
    assert.equal(debuts(b.banc).length, 1)
    assert.match(
      fins(b.banc)[0],
      new RegExp(
        `^${horodatage} fin script=waiggle-deployer appelant=louis commit=${b.C} service=${b.S} api=- web=- etape=6 resultat=refus raison=pas-louis duree=[0-9]+$`,
      ),
    )
  })

  it('never prints or logs the token, the key or the content of a file under /root', async () => {
    const a = preparer()
    const ra = await lancer(a.banc, [a.C])
    const b = preparer()
    delete b.etat.attestations[`${PREFIXE}-api:${b.C}`]
    b.publier()
    const rb = await lancer(b.banc, [b.C])
    const secrets = [...Object.values(SECRETS), 'HOTECONNU', 'ntfy.example.invalid']
    for (const [banc, r] of [
      [a.banc, ra],
      [b.banc, rb],
    ]) {
      const ecrits = [
        r.stdout,
        r.stderr,
        banc.lire(banc.chemins.JOURNAL),
        ...notifications(banc),
      ].join('\n')
      for (const s of secrets) assert.equal(ecrits.includes(s), false, s)
      // A text received from GitHub is never copied into the log or a notification (A3.7).
      const copies = [banc.lire(banc.chemins.JOURNAL), ...notifications(banc)].join('\n')
      assert.equal(copies.includes('texte-recu-de-github'), false)
    }
  })

  it('never puts the token on a command line', async () => {
    const { banc, C } = preparer()
    deploye(banc, await lancer(banc, [C]), C)
    for (const appel of banc.appels()) {
      const ligne = [...appel.args, ...appel.parent].join(' ')
      assert.equal(ligne.includes(SECRETS.jeton), false, appel.prog)
      assert.equal(ligne.includes(SECRETS.sujet), false, appel.prog)
    }
    for (const script of [DEPLOYER, RETOUR]) {
      const source = sourceDe(script)
      assert.doesNotMatch(source, /https:\/\/[^\s"'@/]*:[^\s"'@]*@/, 'no https://x:token@ address')
      assert.doesNotMatch(source, /oauth_token|hosts\.yml|GH_TOKEN|GITHUB_TOKEN|--with-token/)
    }
  })

  it('sends one notification per attempt, accepted or refused', async () => {
    const a = preparer()
    deploye(a.banc, await lancer(a.banc, [a.C]), a.C)
    const [debut, fin] = notifications(a.banc)
    assert.equal(notifications(a.banc).length, 2)
    assert.equal(debut, `début : ${court(a.C)}, demandé par louis`)
    assert.match(
      fin,
      new RegExp(
        `^déployé : ${court(a.C)} \\(avant ${court(a.S)}\\), demandé par louis, [0-9]+ s$`,
      ),
    )

    const b = preparer()
    b.etat.github.prs[2].merged_by = { id: AUTRE_ID, login: 'autre' }
    b.publier()
    refuse(b.banc, await lancer(b.banc, [b.C]), 'pas-louis')
    assert.deepEqual(notifications(b.banc), [
      `début : ${court(b.C)}, demandé par louis`,
      `refusé (pas-louis) : ${court(b.C)}, demandé par louis, étape 6`,
    ])
    for (const t of [...notifications(a.banc), ...notifications(b.banc)])
      assert.doesNotMatch(t, /\n/)
  })

  it('production keeps deploying when the caller sends SIGTERM after the deploy step started', async () => {
    const { banc, C } = preparer()
    banc.configurer({ ssh: { dormirDeploy: 3000 } })
    const essai = banc.demarrer([C], { env: { SUDO_USER: 'louis' } })
    await attendre(() => deploiements(banc).length === 1)
    essai.enfant.kill('SIGTERM')
    const r = await essai.fini
    assert.equal(r.code, 4, r.stderr)
    const f = fins(banc)
    assert.equal(f.length, 1)
    assert.equal(champ(f[0], 'resultat'), 'interrompu')
    assert.equal(champ(f[0], 'raison'), 'interrompu')
    // Nothing is sent to production to stop it: one version, one deploy, nothing after.
    assert.deepEqual(
      banc.appels('ssh').map((x) => x.commande.split(' ')[0]),
      ['version', 'deploy'],
    )
    assert.deepEqual(banc.refuses(), [])
  })

  // --- From the security review v1

  it('calls gh attestation verify, for each image, with exactly the repository, the signer workflow ci.yml, --source-ref refs/heads/main, --source-digest <commit> and --deny-self-hosted-runners', async () => {
    const { banc, c, C } = preparer()
    deploye(banc, await lancer(banc, [C]), C)
    const attestations = banc.appels('gh').filter((x) => x.args[0] === 'attestation')
    assert.deepEqual(
      attestations.map((x) => x.args),
      [argumentsAttestation(PREFIXE, 'api', C), argumentsAttestation(PREFIXE, 'web', C)],
    )
    for (const x of attestations) assert.equal(x.env.GH_CONFIG_DIR, c.GH_DIR)
  })

  it('calls ssh with the root key, IdentitiesOnly, StrictHostKeyChecking=yes and BatchMode, and no option from the caller', async () => {
    const { banc, c, C } = preparer()
    const r = await lancer(banc, [C], {
      SSH_AUTH_SOCK: join(banc.dossier, 'agent'),
      GIT_SSH_COMMAND: '/bin/false',
      HOME: join(banc.dossier, 'home'),
    })
    deploye(banc, r, C)
    const attendu = optionsSsh(c, false)
    for (const appel of banc.appels('ssh')) {
      assert.deepEqual(appel.args.slice(0, attendu.length), attendu)
      assert.equal(appel.args.length, attendu.length + appel.commande.split(' ').length)
      assert.equal(appel.cle, 'deploiement')
    }
    const installe = valeursDuBloc(decouper(banc.source).bloc)
    assert.equal(installe.CLE, '/root/.ssh/waiggle-prod')
    assert.equal(installe.HOTES_CONNUS, '/root/.ssh/known_hosts')
  })

  it('checks ancestry with the real git against a local copy of main, never with a fake git', async () => {
    const { banc, c, origine } = preparer()
    assert.equal(valeursDuBloc(decouper(banc.source).bloc).GIT, '/usr/bin/git')
    assert.equal(c.GIT.startsWith(banc.dossier), false, 'the test copy keeps the real git')
    const cote = origine.commit('Not on main', {}, { branche: 'autre' })
    refuse(banc, await lancer(banc, [cote]), 'pas-sur-main')
    // The local copy of main is root's bare repository, fetched from ORIGINE.
    assert.equal(
      banc.git('-C', c.DEPOT, 'rev-parse', 'refs/remotes/origin/main'),
      banc.git('-C', banc.origine, 'rev-parse', 'refs/heads/main'),
    )
  })

  it('differs from the installed script only in the block of paths', () => {
    for (const script of [DEPLOYER, RETOUR]) {
      const banc = creerBanc(script)
      bancs.push(banc)
      const source = decouper(banc.source)
      const copie = decouper(banc.texteCopie)
      assert.deepEqual(copie.avant, source.avant, `${script}: before the block`)
      assert.deepEqual(copie.apres, source.apres, `${script}: after the block`)
      // The installed block is the contract's (A3); waiggle-retour may leave out what it does not use.
      const { PRODUCTION, ...installe } = valeursDuBloc(source.bloc)
      assert.match(PRODUCTION ?? '', /^louis@[0-9]{1,3}(\.[0-9]{1,3}){3}$/, script)
      for (const [cle, valeur] of Object.entries(installe))
        assert.equal(valeur, BLOC_VPS_DEV[cle], `${script}: ${cle}`)
      if (script === DEPLOYER)
        assert.deepEqual(Object.keys(installe).sort(), Object.keys(BLOC_VPS_DEV).sort())
      // Outside the block, no program is called by its bare name (A3.5).
      const nu =
        /(^|[;&|({]\s*|\$\(\s*|\b(then|do|else|if|while|until|!)\s+)(git|gh|ssh|curl|systemd-run|flock|timeout|id|node|docker|logger|setsid|tail|env|sudo|cat|rm|mkdir|chmod|chown|date|sed|grep|awk|sort|wc|head|cut|tr|mktemp|install|ls|mv|cp|sleep)(\s|$)/
      for (const l of horsDuBloc(banc.source)) assert.doesNotMatch(l, nu, `${script}: ${l}`)
    }
  })

  it('has no default taken from the environment and no test switch', async () => {
    for (const script of [DEPLOYER, RETOUR]) {
      const source = sourceDe(script)
      const defauts = [...source.matchAll(/\$\{([A-Z_][A-Z0-9_]*):?[-=]/g)].map((m) => m[1])
      assert.deepEqual(
        defauts.filter((n) => n !== 'SUDO_USER'),
        [],
        script,
      )
      assert.doesNotMatch(source, /\/home\b/, script)
      assert.doesNotMatch(
        source,
        /--test|--dry-run|--simulation|DRY_RUN|\bTEST_|_TEST\b|\bDEBUG\b/,
        script,
      )
    }
    // No switch from the environment either: these change nothing, production is called.
    const { banc, C } = preparer()
    const r = await lancer(banc, [C], {
      TEST: '1',
      DRY_RUN: '1',
      WAIGGLE_TEST: '1',
      DEBUG: '1',
      SIMULATION: '1',
    })
    deploye(banc, r, C)
  })

  it('records the calling user given by sudo before clearing the environment', async () => {
    for (const script of [DEPLOYER, RETOUR]) {
      const lu = horsDuBloc(sourceDe(script))
      const sudo = lu.findIndex((l) => l.includes('SUDO_USER'))
      const vide = lu.findIndex((l) => l.includes('compgen -e'))
      assert.ok(sudo >= 0 && vide > sudo, `${script}: SUDO_USER is read before compgen -e`)
    }
    const a = preparer()
    deploye(a.banc, await lancer(a.banc, [a.C]), a.C)
    assert.ok(journal(a.banc).every((l) => champ(l, 'appelant') === 'louis'))
    assert.match(notifications(a.banc)[0], /demandé par louis$/)

    const b = preparer()
    await lancer(b.banc, [b.C], { SUDO_USER: 'Louis;touch x' })
    assert.ok(journal(b.banc).length > 0)
    assert.ok(journal(b.banc).every((l) => champ(l, 'appelant') === 'inconnu'))
  })

  it('logs and notifies a malformed argument without copying it', async () => {
    const { banc } = preparer()
    const r = await lancer(banc, ['MARQUEUR-ARGUMENT-0001'])
    refuse(banc, r, 'argument')
    assert.equal(champ(fins(banc)[0], 'commit'), '-')
    assert.equal(notifications(banc).length, 1)
    const copies = [banc.lire(banc.chemins.JOURNAL), ...notifications(banc)].join('\n')
    assert.equal(copies.includes('MARQUEUR'), false)
  })

  it('refuses to deploy when the start notification cannot be sent', async () => {
    const a = preparer()
    a.banc.configurer({ curl: [22] })
    refuse(a.banc, await lancer(a.banc, [a.C]), 'notification', 5)
    assert.equal(debuts(a.banc).length, 1)
    assert.deepEqual(a.banc.appels('gh'), [])
    assert.deepEqual(a.banc.appels('ssh'), [])

    // The end notification failing does not change the exit code.
    const b = preparer()
    b.banc.configurer({ curl: [0, 22] })
    deploye(b.banc, await lancer(b.banc, [b.C]), b.C)
  })

  it('runs the legal check in a transient unit without network, /home or /root, stopped after its time limit', async () => {
    const { banc, C } = preparer()
    banc.configurer({ mentions: 1 })
    refuse(banc, await lancer(banc, [C]), 'mentions')
    const [unite] = banc.appels('systemd-run')
    for (const p of [
      'PrivateNetwork=yes',
      'ProtectHome=yes',
      'ProtectSystem=strict',
      'RuntimeMaxSec=60',
    ]) {
      assert.ok(unite.args.includes(p), p)
    }
    // Run without the commit, from the tree's own copy of the script.
    assert.deepEqual(unite.args.slice(-2), ['/usr/bin/node', 'scripts/legal-placeholders.mjs'])
    assert.equal(existsSync(unite.dossier), false, 'removed even after a failure')
    assert.deepEqual(
      banc.appels('gh').filter((x) => x.args[0] === 'attestation'),
      [],
    )
  })

  it('refuses a commit pushed on main without a pull request', async () => {
    const a = preparer()
    a.etat.github.prs.pop()
    a.publier()
    const r = await lancer(a.banc, [a.C])
    refuse(a.banc, r, 'sans-pr')
    assert.match(r.stderr, /réessaie dans quelques minutes/)
    assert.deepEqual(
      a.banc.appels('gh').filter((x) => x.args[0] === 'attestation'),
      [],
    )

    // A pull request that contains the commit but was merged as another commit.
    const b = preparer()
    b.etat.github.prs[2] = pr(12, 'f'.repeat(40), { commits: [b.C] })
    b.publier()
    refuse(b.banc, await lancer(b.banc, [b.C]), 'sans-pr')
  })

  it('refuses a merge commit whose pull request was merged by another account, compared by numeric id', async () => {
    // Same login as Louis, another id: refused.
    const a = preparer()
    a.etat.github.prs[2].merged_by = { id: AUTRE_ID, login: 'L-maillere' }
    a.publier()
    refuse(a.banc, await lancer(a.banc, [a.C]), 'pas-louis')

    // Louis's id under a new login: accepted.
    const b = preparer()
    b.etat.github.prs[2].merged_by = { id: ID_LOUIS, login: 'nouveau-nom' }
    b.publier()
    deploye(b.banc, await lancer(b.banc, [b.C]), b.C)
  })

  it('refuses a pull request that is not merged, or whose base is not main, even when merge_commit_sha matches', async () => {
    const ailleurs = { ref: 'develop', repo: { full_name: 'EthogramHQ/Waiggle' } }
    const cas = [
      [{ merged: false, merged_at: null }, 'sans-pr'],
      [{ base: ailleurs }, 'sans-pr'],
      [{ base: { ref: 'main', repo: { full_name: 'autre/Waiggle' } } }, 'sans-pr'],
      [{ detail: { merged: false } }, 'pas-louis'],
      [{ detail: { base: ailleurs } }, 'pas-louis'],
      [{ detail: { base: { ref: 'main', repo: { full_name: 'autre/Waiggle' } } } }, 'pas-louis'],
      [{ detail: { merge_commit_sha: 'e'.repeat(40) } }, 'pas-louis'],
    ]
    for (const [autres, raison] of cas) {
      const { banc, C, etat, publier } = preparer()
      etat.github.prs[2] = pr(12, C, autres)
      publier()
      refuse(banc, await lancer(banc, [C]), raison)
    }
  })

  it('refuses when a first-parent commit between the version in production and the commit was not merged by Louis', async () => {
    const a = preparer()
    a.etat.github.prs[1].merged_by = { id: AUTRE_ID, login: 'autre' }
    a.publier()
    refuse(a.banc, await lancer(a.banc, [a.C]), 'pas-louis')
    assert.ok(a.banc.appels('gh').some((x) => x.args[1] === 'repos/EthogramHQ/Waiggle/pulls/11'))

    // The commits of a merged branch (second parents) are not first-parent: they need no PR.
    const b = preparer()
    const t = b.origine.travail
    b.banc.git('-C', t, 'checkout', '--quiet', '-b', 'branche', b.B)
    b.banc.git(
      '-C',
      t,
      'commit',
      '--quiet',
      '--allow-empty',
      '-m',
      'Work on a branch, no PR of its own',
    )
    b.banc.git('-C', t, 'checkout', '--quiet', 'main')
    b.banc.git(
      '-C',
      t,
      'merge',
      '--quiet',
      '--no-ff',
      '-m',
      'Merge pull request #15 from x/branche',
      'branche',
    )
    b.banc.git('-C', t, 'push', '--quiet', 'origin', 'HEAD:refs/heads/main')
    const F = b.banc.git('-C', t, 'rev-parse', 'HEAD')
    b.etat.github.prs.push(pr(15, F))
    b.etat.attestations = { [`${PREFIXE}-api:${F}`]: API, [`${PREFIXE}-web:${F}`]: WEB }
    b.publier()
    deploye(b.banc, await lancer(b.banc, [F]), F)
  })

  it('never reads the pull request number from the commit message', async () => {
    const { banc, C, etat, publier } = preparer(DEPLOYER, {
      messageC: 'Merge pull request #99 from x/c',
    })
    // #99 exists, merged by Louis, but as another commit; C itself has no pull request.
    etat.github.prs[2] = pr(99, 'e'.repeat(40))
    publier()
    refuse(banc, await lancer(banc, [C]), 'sans-pr')
    assert.equal(
      banc.appels('gh').some((x) => x.args[1] === 'repos/EthogramHQ/Waiggle/pulls/99'),
      false,
    )
  })

  // --- Added by the contract (part D)

  it('refuses a run when the daily cap of attempts is reached', async (t) => {
    const minuit = Math.floor(maintenant() / 86400) * 86400
    if (maintenant() - minuit < 700)
      return t.skip('too close to midnight UTC to place six attempts today')
    const a = preparer()
    ecrireEssais(
      a.banc,
      [0, 1, 2, 3, 4, 5].map((i) => `${minuit + i} ${a.S}`),
    )
    refuse(a.banc, await lancer(a.banc, [a.C]), 'plafond', 3)
    assert.deepEqual(a.banc.appels('gh'), [])
    assert.deepEqual(a.banc.appels('ssh'), [])

    // Six attempts yesterday do not count today.
    const b = preparer()
    ecrireEssais(
      b.banc,
      [0, 1, 2, 3, 4, 5].map((i) => `${minuit - 3600 - i} ${b.S}`),
    )
    deploye(b.banc, await lancer(b.banc, [b.C]), b.C)
  })

  it('notifies a refusal for the interval or the daily cap at most once every ten minutes', async () => {
    const { banc, S, C } = preparer()
    ecrireEssais(banc, [`${maintenant() - 60} ${S}`])
    assert.equal((await lancer(banc, [C])).code, 3)
    assert.equal(notifications(banc).length, 1)
    assert.equal((await lancer(banc, [C])).code, 3)
    // A malformed argument falls under the same window (A4 step 1).
    assert.equal((await lancer(banc, ['x'])).code, 2)
    assert.equal(notifications(banc).length, 1, 'one notification for the three refusals')
    assert.equal(fins(banc).length, 3, 'each refusal still has its log line')
  })

  it('does not count a malformed argument as an attempt', async () => {
    const { banc, C } = preparer()
    assert.equal((await lancer(banc, ['zz'])).code, 2)
    assert.deepEqual(lignes(banc.lire(join(banc.chemins.ETAT, 'essais'))), [])
    deploye(banc, await lancer(banc, [C]), C)
  })

  it('keeps the common block identical in waiggle-deployer and waiggle-retour', () => {
    const commun = (script) => {
      const l = sourceDe(script).split('\n')
      const debut = l.flatMap((x, i) => (x === '# --- commun : début ---' ? [i] : []))
      const fin = l.flatMap((x, i) => (x === '# --- commun : fin ---' ? [i] : []))
      assert.equal(debut.length, 1, `${script}: one start marker`)
      assert.equal(fin.length, 1, `${script}: one end marker`)
      return l.slice(debut[0], fin[0] + 1)
    }
    const bloc = commun(DEPLOYER)
    assert.ok(bloc.length > 2, 'the common block is not empty')
    assert.deepEqual(commun(RETOUR), bloc)
    assert.equal(bloc.includes(DEBUT_CHEMINS), false, 'the block of paths stays out of it')
  })

  it('refuses more than 50 first-parent commits between the version in production and the commit', async () => {
    const a = preparer()
    const suite = a.origine.commits(49, 'Merge pull request')
    const dernier = suite.at(-1)
    // S..dernier: B, C and 49 more = 51 first-parent commits.
    refuse(a.banc, await lancer(a.banc, [dernier]), 'intervalle-trop-long')
    assert.deepEqual(
      a.banc.appels('gh').filter((x) => x.args[0] === 'api'),
      [],
    )

    // Exactly 50: accepted.
    const b = preparer()
    const cinquante = b.origine.commits(48, 'Merge pull request')
    const D = cinquante.at(-1)
    for (const [i, sha] of cinquante.entries()) b.etat.github.prs.push(pr(100 + i, sha))
    b.etat.attestations = { [`${PREFIXE}-api:${D}`]: API, [`${PREFIXE}-web:${D}`]: WEB }
    b.publier()
    deploye(b.banc, await lancer(b.banc, [D]), D)
    assert.equal(
      b.banc.appels('gh').filter((x) => /\/commits\/.*\/pulls$/.test(x.args[1] ?? '')).length,
      50,
    )
  })
})

describe('waiggle-retour', { skip: !linux && raisonDuSaut }, () => {
  const admin = { SUDO_USER: 'admin' }
  const preparerRetour = (cible) => {
    const p = preparer(RETOUR)
    const sha = p[cible]
    p.etat.attestations = { [`${PREFIXE}-api:${sha}`]: API, [`${PREFIXE}-web:${sha}`]: WEB }
    p.publier()
    return { ...p, cible: sha }
  }

  it('deploys a commit of main older than the version in production', async () => {
    for (const service of ['C', 'B']) {
      // B is older than C; B is also the version in production in the second case (a repair).
      const p = preparerRetour('B')
      p.etat.service = p[service]
      p.publier()
      const r = await lancer(p.banc, [p.cible], admin)
      deploye(p.banc, r, p.cible)
      assert.deepEqual(
        p.banc.appels('ssh').map((x) => x.commande.split(' ')[0]),
        ['deploy'],
        'no version call',
      )
      assert.ok(p.banc.appels('curl').every((x) => x.args[6] === 'Title: waiggle-retour'))
      const [fin] = fins(p.banc)
      assert.equal(champ(fin, 'resultat'), 'ok')
      assert.equal(champ(fin, 'appelant'), 'admin')
      assert.match(fin, / script=waiggle-retour /)
    }
  })

  it('is not blocked by the interval or the daily cap of waiggle-deployer', async () => {
    const p = preparerRetour('C')
    const minuit = Math.floor(maintenant() / 86400) * 86400
    const essais = [
      ...[0, 1, 2, 3, 4, 5].map((i) => `${minuit + i} ${p.S}`),
      `${maintenant() - 10} ${p.S}`,
    ]
    ecrireEssais(p.banc, essais)
    deploye(p.banc, await lancer(p.banc, [p.cible], admin), p.cible)
    assert.deepEqual(
      lignes(p.banc.lire(join(p.c.ETAT, 'essais'))),
      essais,
      'neither read nor written',
    )
  })

  it('uses the return key, never the deploy key', async () => {
    const p = preparerRetour('C')
    deploye(p.banc, await lancer(p.banc, [p.cible], admin), p.cible)
    const attendu = optionsSsh(p.c, true)
    for (const appel of p.banc.appels('ssh')) {
      assert.equal(appel.cle, 'retour')
      assert.deepEqual(appel.args.slice(0, attendu.length), attendu)
    }
    assert.doesNotMatch(
      horsDuBloc(p.banc.source).join('\n'),
      /\$\{?CLE\b(?!_)/,
      'the deploy key is never used',
    )
  })

  it('waits for a running deployment to finish, up to fifteen minutes', async () => {
    const { banc, C } = preparer(DEPLOYER, { aussi: [RETOUR] })
    banc.configurer({ ssh: { dormirDeploy: 3000 } })
    const deployer = banc.demarrer([C], { env: { SUDO_USER: 'louis' } })
    await attendre(() => deploiements(banc).length === 1)
    const retour = banc.demarrer([C], { env: admin, script: 'waiggle-retour' })
    const rd = await deployer.fini
    const rr = await retour.fini
    assert.equal(rd.code, 0, rd.stderr)
    assert.equal(rr.code, 0, rr.stderr)
    const [premier, second] = deploiements(banc)
    const finDuPremier = banc.appels('ssh-fin')[0]
    assert.equal(premier.cle, 'deploiement')
    assert.equal(second.cle, 'retour')
    assert.ok(second.t >= finDuPremier.t, 'the return waits for the lock')
    assert.match(
      horsDuBloc(sourceDe(RETOUR)).join(' '),
      /\$\{?FLOCK\}?"?\s+(-\S+\s+)*-w\s*"?900\b/,
      'the wait is bounded at 900 seconds',
    )
  })
})
