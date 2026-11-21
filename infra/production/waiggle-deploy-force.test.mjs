// Tests of waiggle-deploy-force, the guard of production (infra/vps-dev/contrat.md, A6, A10), run by
// `node --test infra/vps-dev/*.test.mjs infra/production/*.test.mjs` in the CI (A9).
// The bench (infra/faux-programmes.mjs) gives the test copy fake gh, docker and logger; git, setsid and
// tail are the real ones, and `$DEPOT` is a clone of a bare repository standing for GitHub, whose
// infra/deploy.sh is a fake that records its arguments and leaves a witness file.
// Linux only: elsewhere the whole file is skipped.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  argumentsAttestationEmpreinte,
  creerBanc,
  creerOrigine,
  lignes,
  linux,
  PREFIXE,
  racineDuDepot,
  raisonDuSaut,
} from '../faux-programmes.mjs'

const FORCE = 'infra/production/waiggle-deploy-force'

const API = '3c'.repeat(32)
const WEB = '4d'.repeat(32)
const CLIENT = '203.0.113.9 50022 22'

const bancs = []
afterEach(() => {
  while (bancs.length) bancs.pop().fermer()
})

/** The fake deploy.sh: records its arguments, leaves a witness, sleeps, exits with a chosen code. */
const fauxDeploySh = (dossier) => `#!/bin/bash
printf '%s\\n' "$@" > '${dossier}/deploy-arguments'
: > '${dossier}/temoin-deploy'
echo "deploy.sh: running"
sleep "$(cat '${dossier}/deploy-sommeil' 2>/dev/null || echo 0)"
echo "deploy.sh: done"
: > '${dossier}/deploy-fini'
exit "$(cat '${dossier}/deploy-code' 2>/dev/null || echo 0)"
`

/** The attestations of main's CI for the images API and WEB of `prefixe`, one per commit. */
const attestationsDe = (prefixe, commits) =>
  commits.flatMap((commit) => [
    { image: `${prefixe}-api@sha256:${API}`, commit },
    { image: `${prefixe}-web@sha256:${WEB}`, commit },
  ])

/**
 * A production running S, on a main that reads P, S, N (P older, N newer), with the attestations
 * of main's CI for the images API and WEB of all three.
 */
function preparer() {
  const banc = creerBanc(FORCE)
  bancs.push(banc)
  const c = banc.chemins
  const origine = creerOrigine(banc, { 'infra/deploy.sh': fauxDeploySh(banc.dossier) })
  banc.git('clone', '--quiet', banc.origine, c.DEPOT)
  const P = origine.commit('Merge pull request #1 from x/p', { 'apps/p.txt': 'p\n' })
  const S = origine.commit('Merge pull request #2 from x/s', { 'apps/s.txt': 's\n' })
  const N = origine.commit('Merge pull request #3 from x/n', { 'apps/n.txt': 'n\n' })
  const cote = origine.commit('Not on main', { 'apps/x.txt': 'x\n' }, { branche: 'autre' })
  writeFileSync(
    c.DEPLOYE,
    `RUCHE_VERSION=${S}\nAPI_IMAGE=${PREFIXE}-api@sha256:${'0'.repeat(64)}\nWEB_IMAGE=x\n`,
  )
  mkdirSync(c.JOURNAUX, { recursive: true, mode: 0o700 })
  const attestations = attestationsDe(PREFIXE, [P, S, N])
  banc.configurer({ attestationsProduction: attestations })
  const temoin = join(banc.dossier, 'temoin-deploy')
  const injecte = join(banc.dossier, 'injecte')
  return { banc, c, P, S, N, cote, attestations, temoin, injecte }
}

const deploy = (
  commit,
  { api = API, web = WEB, prefixeApi = PREFIXE, prefixeWeb = PREFIXE } = {},
) => `deploy ${commit} ${prefixeApi}-api@sha256:${api} ${prefixeWeb}-web@sha256:${web}`

/** Runs the guard as sshd would, under its forced command (`--retour` for the return key). */
const commande = (banc, texte, { retour = false, client = CLIENT, args } = {}) => {
  const env = { PATH: '/usr/bin:/bin', HOME: banc.dossier, SSH_CLIENT: client }
  if (texte !== undefined) env.SSH_ORIGINAL_COMMAND = texte
  return banc.demarrer(args ?? (retour ? ['--retour'] : []), { env, detache: true })
}
const lancer = (banc, texte, options) => commande(banc, texte, options).fini

const argumentsDeDeploy = (banc) => lignes(banc.lire(join(banc.dossier, 'deploy-arguments')))
const messages = (banc) => banc.appels('logger').map((a) => a.message)

/** A refusal: code 2, nothing written, nothing launched. */
function refuse(p, r, quoi) {
  assert.equal(r.code, 2, `${quoi}: ${r.stderr}`)
  assert.equal(r.stdout, '', `${quoi}: nothing on the output`)
  assert.equal(existsSync(p.temoin), false, `${quoi}: deploy.sh did not run`)
  assert.equal(existsSync(p.injecte), false, `${quoi}: nothing was injected`)
  assert.deepEqual(p.banc.refuses(), [], 'every call follows the contract')
}

const attendre = async (condition, ms = 20_000) => {
  const fin = Date.now() + ms
  while (!condition()) {
    if (Date.now() > fin) throw new Error('condition not met in time')
    await new Promise((r) => setTimeout(r, 50))
  }
}

describe('waiggle-deploy-force', { skip: !linux && raisonDuSaut }, () => {
  // --- From the security review v0

  it('answers version with the commit of deployed.env and nothing else', async () => {
    const p = preparer()
    const r = await lancer(p.banc, 'version')
    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.stdout, `${p.S}\n`)
    assert.equal(existsSync(p.temoin), false)

    writeFileSync(p.c.DEPLOYE, 'RUCHE_VERSION=abc\n')
    refuse(p, await lancer(p.banc, 'version'), 'malformed RUCHE_VERSION')
    rmSync(p.c.DEPLOYE)
    refuse(p, await lancer(p.banc, 'version'), 'no deployed.env')
  })

  it('accepts only "deploy <40 hex> <prefix>-api@sha256:<64 hex> <prefix>-web@sha256:<64 hex>" as the whole command', async () => {
    const p = preparer()
    const bonne = deploy(p.N)
    for (const mauvaise of [
      `${bonne} extra`,
      ` ${bonne}`,
      `${bonne} `,
      bonne.replace('deploy ', 'deploy  '),
      bonne.replace(p.N, p.N.slice(0, 39)),
      bonne.replace(p.N, `${p.N.slice(0, 39)}A`),
      deploy(p.N, { api: API.slice(0, 63) }),
      deploy(p.N, {
        prefixeApi: 'docker.io/ethogramhq/waiggle',
        prefixeWeb: 'docker.io/ethogramhq/waiggle',
      }),
      `deploy ${p.N} ${PREFIXE}-api@sha256:${API}`,
      'Deploy',
      'version extra',
    ]) {
      refuse(p, await lancer(p.banc, mauvaise), JSON.stringify(mauvaise))
    }
    const r = await lancer(p.banc, bonne)
    assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(argumentsDeDeploy(p.banc), [
      p.N,
      `${PREFIXE}-api@sha256:${API}`,
      `${PREFIXE}-web@sha256:${WEB}`,
    ])
  })

  it('refuses extra words, quotes, ; | & $ ` and a newline, an empty command and an interactive session, without running anything (fichier témoin absent)', async () => {
    const p = preparer()
    const t = p.injecte
    const cas = [
      'version extra',
      `version; touch ${t}`,
      `version | touch ${t}`,
      `version & touch ${t}`,
      `version && touch ${t}`,
      `version $(touch ${t})`,
      `version \`touch ${t}\``,
      `version\ntouch ${t}`,
      `${deploy(p.N)};touch ${t}`,
      `${deploy(p.N)}\n`,
      `deploy $(touch ${t}) ${PREFIXE}-api@sha256:${API} ${PREFIXE}-web@sha256:${WEB}`,
      '"version"',
      "'version'",
      'version *',
      '',
      undefined,
    ]
    for (const texte of cas)
      refuse(p, await lancer(p.banc, texte), JSON.stringify(texte ?? 'interactive'))
    assert.deepEqual(p.banc.appels('gh'), [], 'nothing was even verified')
    assert.deepEqual(p.banc.appels('docker'), [], 'nothing was even inspected')
  })

  it('runs deploy.sh detached, so that a closed connection does not stop it', async () => {
    const p = preparer()
    writeFileSync(join(p.banc.dossier, 'deploy-sommeil'), '3')
    const session = commande(p.banc, deploy(p.N))
    await attendre(() => existsSync(p.temoin))
    // The connection closes: sshd's session and everything in its process group go away.
    process.kill(-session.enfant.pid, 'SIGHUP')
    setTimeout(() => {
      try {
        process.kill(-session.enfant.pid, 'SIGKILL')
      } catch {}
    }, 200)
    await session.fini
    assert.equal(
      existsSync(join(p.banc.dossier, 'deploy-fini')),
      false,
      'still running when the connection closed',
    )
    await attendre(() => existsSync(join(p.banc.dossier, 'deploy-fini')))
    // Its output went to the journal of this deployment, named after the time and the commit.
    const [journal, ...autres] = readdirSync(p.c.JOURNAUX)
    assert.deepEqual(autres, [])
    assert.match(journal, new RegExp(`^[0-9]{8}T[0-9]{6}Z-${p.N.slice(0, 7)}\\.log$`))
    await attendre(() => /^fin 0$/m.test(readFileSync(join(p.c.JOURNAUX, journal), 'utf8')))
    assert.match(readFileSync(join(p.c.JOURNAUX, journal), 'utf8'), /deploy\.sh: done/)
  })

  it('refuses a commit that does not descend from the version in production', async () => {
    const p = preparer()
    refuse(p, await lancer(p.banc, deploy(p.P)), 'older commit')
    refuse(p, await lancer(p.banc, deploy(p.S)), 'the commit in service')
    refuse(p, await lancer(p.banc, deploy(p.cote)), 'a commit that is not on main')
    // Without a version in service, the normal mode refuses.
    rmSync(p.c.DEPLOYE)
    refuse(p, await lancer(p.banc, deploy(p.N)), 'no version in service')
  })

  // --- From the security review v1

  it("refuses an image digest that has no provenance attestation from main's CI for this commit, and never reads a tag", async () => {
    const p = preparer()
    const autre = '5e'.repeat(32)
    // Tags that a workflow of another branch moved onto the other digest: the guard never reads them.
    p.banc.configurer({
      docker: { [`${PREFIXE}-api:${p.N}`]: autre, [`${PREFIXE}-web:${p.N}`]: autre },
    })
    refuse(p, await lancer(p.banc, deploy(p.N, { api: autre })), 'api digest without attestation')
    refuse(p, await lancer(p.banc, deploy(p.N, { web: autre })), 'web digest without attestation')
    refuse(p, await lancer(p.banc, deploy(p.N, { api: WEB, web: API })), 'swapped digests')
    // An attestation of main's CI, but for another commit (P), is not one for N.
    const pourP = attestationsDe(PREFIXE, [p.P])
    p.banc.configurer({ attestationsProduction: pourP })
    refuse(p, await lancer(p.banc, deploy(p.N)), 'attestations for another commit')
    // The web image of N has no attestation.
    p.banc.configurer({
      attestationsProduction: p.attestations.filter(
        (a) => !(a.commit === p.N && a.image.includes('-web@')),
      ),
    })
    refuse(p, await lancer(p.banc, deploy(p.N)), 'no attestation for the web image')
    // gh succeeds but prints another subject: refused too.
    p.banc.configurer({
      attestationsProduction: p.attestations.map((a) =>
        a.commit === p.N && a.image.includes('-api@') ? { ...a, sujet: autre } : a,
      ),
    })
    refuse(p, await lancer(p.banc, deploy(p.N)), 'another subject digest')
    // The text gh printed never reaches the log.
    const journal = messages(p.banc).join('\n')
    assert.equal(journal.includes('texte-recu-de-github'), false)
    assert.equal(journal.includes(autre), false)

    // With the attestations of N, the deployment goes: api then web, by the exact call of A6.
    p.banc.configurer({ attestationsProduction: p.attestations })
    const avant = p.banc.appels('gh').length
    const r = await lancer(p.banc, deploy(p.N))
    assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(
      p.banc
        .appels('gh')
        .slice(avant)
        .map((a) => a.args),
      [
        argumentsAttestationEmpreinte(PREFIXE, 'api', API, p.N),
        argumentsAttestationEmpreinte(PREFIXE, 'web', WEB, p.N),
      ],
    )
    for (const a of p.banc.appels('gh')) assert.equal(a.env.GH_CONFIG_DIR, p.c.GH_DIR)
    assert.deepEqual(p.banc.appels('docker'), [], 'docker is never called')
    assert.deepEqual(p.banc.refuses(), [])
  })

  it("accepts a commit older than the version in production only under the return key's forced command", async () => {
    const p = preparer()
    refuse(p, await lancer(p.banc, deploy(p.P)), 'older, deploy key')
    const r = await lancer(p.banc, deploy(p.P), { retour: true })
    assert.equal(r.code, 0, r.stderr)
    assert.equal(argumentsDeDeploy(p.banc)[0], p.P)
    // The same commit, and no version in service at all, are allowed for a repair.
    assert.equal((await lancer(p.banc, deploy(p.S), { retour: true })).code, 0)
    rmSync(p.c.DEPLOYE)
    const sans = await lancer(p.banc, deploy(p.N), { retour: true })
    assert.equal(sans.code, 0, sans.stderr)
    assert.equal(sans.stdout.split('\n')[0], 'avant -')
    // Not on main is refused in both modes; any other argument than --retour is refused.
    const q = preparer()
    refuse(q, await lancer(q.banc, deploy(q.cote), { retour: true }), 'not on main, return key')
    for (const args of [['--autre'], ['--retour', 'x'], ['--retour=1']]) {
      refuse(q, await lancer(q.banc, deploy(q.N), { args }), JSON.stringify(args))
    }
  })

  it('never hands SSH_ORIGINAL_COMMAND to a shell', async () => {
    const source = readFileSync(join(racineDuDepot, FORCE), 'utf8')
    const code = source.split('\n').filter((l) => !/^\s*#/.test(l))
    assert.equal(
      code.some((l) => /\beval\b/.test(l)),
      false,
      'no eval',
    )
    for (const l of code.filter((x) => /SSH_ORIGINAL_COMMAND/.test(x))) {
      assert.doesNotMatch(l, /(^|[^"=])\$\{?SSH_ORIGINAL_COMMAND/, `quoted or assigned only: ${l}`)
      assert.doesNotMatch(l, /\b(ba)?sh\s+-c\b/, `never in a -c text: ${l}`)
    }
    // The only -c is the fixed text of A6, step 5.
    const textes = code.filter((l) => /\bbash\s+-c\b/.test(l))
    assert.equal(textes.length, 1)
    assert.ok(textes[0].includes(`-c '"$0" "$1" "$2" "$3"; printf "fin %s\\n" "$?"'`), textes[0])
    // And in practice: a command substitution inside a well-formed deploy is not run.
    const p = preparer()
    refuse(
      p,
      await lancer(p.banc, deploy(p.N).replace(p.N, `$(touch ${p.injecte})`)),
      'substitution',
    )
  })

  // --- Added by the contract

  it('refuses two images whose prefixes differ', async () => {
    const p = preparer()
    const autre = 'ghcr.io/ethogramhq/autre'
    p.banc.configurer({
      attestationsProduction: [...p.attestations, ...attestationsDe(autre, [p.N])],
    })
    refuse(p, await lancer(p.banc, deploy(p.N, { prefixeWeb: autre })), 'web prefix differs')
    refuse(p, await lancer(p.banc, deploy(p.N, { prefixeApi: autre })), 'api prefix differs')
  })

  it('prints the version it replaces before following the deploy log', async () => {
    const p = preparer()
    const r = await lancer(p.banc, deploy(p.N))
    assert.equal(r.code, 0, r.stderr)
    const sortie = r.stdout.split('\n')
    assert.equal(sortie[0], `avant ${p.S}`)
    const enCours = sortie.indexOf('deploy.sh: running')
    const fini = sortie.indexOf('deploy.sh: done')
    assert.ok(enCours > 0 && fini > enCours, r.stdout)
  })

  it('exits with the exit code of deploy.sh', async () => {
    const p = preparer()
    writeFileSync(join(p.banc.dossier, 'deploy-code'), '7')
    const r = await lancer(p.banc, deploy(p.N))
    assert.equal(r.code, 7, r.stderr)
    const [journal] = readdirSync(p.c.JOURNAUX)
    assert.equal(lignes(readFileSync(join(p.c.JOURNAUX, journal), 'utf8')).at(-1), 'fin 7')
  })

  it('logs every command with the client address, without copying a refused command', async () => {
    const p = preparer()
    await lancer(p.banc, 'version')
    await lancer(p.banc, 'version; MARQUEUR-COMMANDE')
    await lancer(p.banc, deploy(p.N))
    await lancer(p.banc, 'version', { client: 'evil;x 1 2' })
    await lancer(p.banc, 'version', { client: '2001:db8::1 50022 22' })
    await lancer(p.banc, deploy(p.P), { retour: true })
    const m = messages(p.banc)
    assert.equal(m.length, 6, m.join('\n'))
    for (const l of m) {
      assert.match(l, /^(normal|retour) (accepte|refuse) \S+ commit=([0-9a-f]{40}|-) client=\S+$/)
    }
    assert.match(m[0], /^normal accepte \S+ commit=- client=203\.0\.113\.9$/)
    assert.match(m[1], /^normal refuse \S+ commit=- client=203\.0\.113\.9$/)
    assert.match(m[2], new RegExp(`^normal accepte \\S+ commit=${p.N} client=203\\.0\\.113\\.9$`))
    assert.match(m[3], / client=-$/)
    assert.match(m[4], / client=2001:db8::1$/)
    assert.match(m[5], new RegExp(`^retour accepte \\S+ commit=${p.P} client=`))
    assert.equal(m.join('\n').includes('MARQUEUR'), false)
    assert.deepEqual(p.banc.refuses(), [])
  })
})
