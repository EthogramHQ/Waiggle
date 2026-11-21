// Shared test helper for the night deployment scripts (infra/vps-dev/contrat.md, A10).
//
// It builds a "bench" in a temporary directory:
//   - the test copy of a script, where only the block between `# --- chemins : début ---` and
//     `# --- chemins : fin ---` changes (A3.5);
//   - fake gh, ssh, curl, systemd-run, docker, id and logger, which succeed only with the exact
//     arguments of the contract (A3, A6) and record each call in `appels.jsonl`;
//   - a bare repository standing for GitHub (`ORIGINE`), checked by the real git (I-3).
// flock, timeout, setsid, tail, env and git stay the real programs.
//
// The fakes are tiny files whose shebang is the absolute path of the running node: the scripts
// clear PATH (A3.3), so `#!/usr/bin/env node` would not find it.
//
// Linux only (A9). Importing this module does nothing, so a test file can skip itself elsewhere.
import { spawn, spawnSync } from 'node:child_process'
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const linux = process.platform === 'linux'
export const raisonDuSaut =
  !linux && 'Linux only (bash, flock, setsid): infra/vps-dev/contrat.md A9'

/** Louis's numeric GitHub account id (A1, `ID_LOUIS`), and another account for the refusals. */
export const ID_LOUIS = 128143287
export const AUTRE_ID = 59812734

export const DEPOT_GITHUB = 'EthogramHQ/Waiggle'
export const PREFIXE = 'ghcr.io/ethogramhq/waiggle'

/** The root of the Waiggle repository (this file lives in `infra/`). */
export const racineDuDepot = fileURLToPath(new URL('..', import.meta.url))

export const DEBUT_CHEMINS = '# --- chemins : début ---'
export const FIN_CHEMINS = '# --- chemins : fin ---'

/** Programs replaced by a fake in every bench. */
export const FAUX = ['gh', 'ssh', 'curl', 'systemd-run', 'docker', 'id', 'logger']

/** Programs that stay real, wherever the host keeps them. */
const REELS = ['git', 'flock', 'timeout', 'setsid', 'tail', 'env', 'bash', 'nohup', 'node']

/** Secrets planted in the bench: none of them may leave a file (A3.6, A3.7, A7). */
export const SECRETS = {
  jeton: 'github_pat_11SECRETJETONDETEST0123456789',
  sujet: 'sujet-ntfy-secret-4f9a2c',
  cle: 'CLE-PRIVEE-SECRETE-DE-DEPLOIEMENT',
  cleRetour: 'CLE-PRIVEE-SECRETE-DE-RETOUR',
}

/** The exact filters of the contract (A4 step 6). */
export const filtrePulls = (c) =>
  `[.[] | select(.merged_at != null and .merge_commit_sha == "${c}" and .base.ref == "main" and .base.repo.full_name == "${DEPOT_GITHUB}") | .number]`
export const FILTRE_PR =
  '[.merged, .merge_commit_sha, .base.ref, .base.repo.full_name, .merged_by.id] | @tsv'
export const FILTRE_ATTESTATION = '.[0].verificationResult.statement.subject[0].digest.sha256'

/** The arguments of `gh attestation verify` for one image (A3). */
export const argumentsAttestation = (prefixe, part, commit) => [
  'attestation',
  'verify',
  `oci://${prefixe}-${part}:${commit}`,
  '--repo',
  DEPOT_GITHUB,
  '--signer-workflow',
  `${DEPOT_GITHUB}/.github/workflows/ci.yml`,
  '--source-ref',
  'refs/heads/main',
  '--source-digest',
  commit,
  '--deny-self-hosted-runners',
  '--format',
  'json',
  '--jq',
  FILTRE_ATTESTATION,
]

/** The options of ssh before the remote command (A3), for the deploy key or the return key. */
export const optionsSsh = (chemins, retour = false) => [
  '-F',
  '/dev/null',
  '-4',
  '-i',
  retour ? chemins.CLE_RETOUR : chemins.CLE,
  '-o',
  'IdentitiesOnly=yes',
  '-o',
  'StrictHostKeyChecking=yes',
  '-o',
  `UserKnownHostsFile=${chemins.HOTES_CONNUS}`,
  '-o',
  `BatchMode=${retour ? 'no' : 'yes'}`,
  '-o',
  'ConnectTimeout=20',
  chemins.PRODUCTION,
]

/** The arguments of curl for a notification (A3, I1). */
export const argumentsCurl = (chemins, titre) => [
  '-fsS',
  '--max-time',
  '10',
  '-K',
  chemins.NTFY,
  '-H',
  `Title: ${titre}`,
  '--data-binary',
  '@-',
]

/** The arguments of systemd-run for the legal check (A3, I-5), for a working directory. */
export const argumentsSystemdRun = (dossier) => [
  '--wait',
  '--pipe',
  '--collect',
  '--quiet',
  ...[
    'DynamicUser=yes',
    'PrivateNetwork=yes',
    'ProtectHome=yes',
    'ProtectSystem=strict',
    'PrivateTmp=yes',
    'NoNewPrivileges=yes',
    'RuntimeMaxSec=60',
    `WorkingDirectory=${dossier}`,
  ].flatMap((p) => ['-p', p]),
  '/usr/bin/node',
  'scripts/legal-placeholders.mjs',
]

/** The five files the legal check needs (A4 step 8). */
export const FICHIERS_MENTIONS = [
  'scripts/legal-placeholders.mjs',
  'packages/brand/src/legal.ts',
  'apps/api/src/env.ts',
  'packages/i18n/src/locales/fr.ts',
  'packages/i18n/src/locales/en.ts',
]

// ---------------------------------------------------------------------------------------------
// The test copy

/**
 * Splits a script around its block of paths. Throws unless each marker appears exactly once,
 * in this order, each on a line of its own.
 */
export function decouper(texte) {
  const lignes = texte.split('\n')
  const debut = lignes.flatMap((l, i) => (l === DEBUT_CHEMINS ? [i] : []))
  const fin = lignes.flatMap((l, i) => (l === FIN_CHEMINS ? [i] : []))
  if (debut.length !== 1 || fin.length !== 1 || fin[0] < debut[0]) {
    throw new Error(
      `the block of paths must appear once (${debut.length} start, ${fin.length} end)`,
    )
  }
  return {
    avant: lignes.slice(0, debut[0] + 1),
    bloc: lignes.slice(debut[0] + 1, fin[0]),
    apres: lignes.slice(fin[0]),
  }
}

/** The `NAME=value` assignments of a block, quotes removed. */
export function valeursDuBloc(bloc) {
  const valeurs = {}
  for (const ligne of bloc) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(ligne)
    if (m) valeurs[m[1]] = m[2].replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1')
  }
  return valeurs
}

const executable = (chemin) => {
  try {
    const s = statSync(chemin)
    return s.isFile() && (s.mode & 0o111) !== 0
  } catch {
    return false
  }
}

const reel = (nom) => {
  const r = spawnSync('/bin/sh', ['-c', `command -v ${nom}`], { encoding: 'utf8' })
  const chemin = r.stdout.trim()
  if (r.status !== 0 || !chemin.startsWith('/')) throw new Error(`${nom} is missing on this host`)
  return chemin
}

/**
 * The test copy of a script: the block of paths rewritten, everything else untouched.
 * - a program with a fake in `bin` becomes the fake; one of `REELS` stays the real program;
 * - any other absolute path moves under `racine` (`/var/log/x` becomes `<racine>/var/log/x`),
 *   unless it is a real executable of the host (`/usr/bin/install`, `/bin/chmod`);
 * - `remplacements` wins over both.
 */
export function copieDeTest(texte, { bin, racine, remplacements = {} }) {
  const { avant, bloc, apres } = decouper(texte)
  const valeurs = {}
  const nouveau = bloc.map((ligne) => {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(ligne)
    if (!m) return ligne
    const nom = m[1]
    const v = m[2].replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1')
    let n = v
    if (nom in remplacements) n = remplacements[nom]
    else if (v.startsWith('/')) {
      const base = basename(v)
      if (existsSync(join(bin, base))) n = join(bin, base)
      else if (REELS.includes(base)) n = reel(base)
      else if (!executable(v)) n = join(racine, v)
    }
    valeurs[nom] = n
    return `${nom}='${n}'`
  })
  return { texte: [...avant, ...nouveau, ...apres].join('\n'), valeurs }
}

// ---------------------------------------------------------------------------------------------
// The bench

const ecrire = (chemin, contenu, mode = 0o644) => {
  mkdirSync(dirname(chemin), { recursive: true })
  writeFileSync(chemin, contenu)
  chmodSync(chemin, mode)
}

/** The environment given to git when the test itself builds repositories. */
const envGit = (dossier) => ({
  PATH: '/usr/sbin:/usr/bin:/sbin:/bin',
  HOME: dossier,
  LANG: 'C.UTF-8',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.invalid',
})

/**
 * Creates a bench for `script` (a path from the repository root, e.g. `infra/vps-dev/waiggle-deployer`).
 * The script is read first: while it does not exist, every test fails here with ENOENT and the
 * name of the missing script, which is the expected red.
 */
export function creerBanc(script, { remplacements = {}, enPlus = [], aussi = [] } = {}) {
  const source = readFileSync(join(racineDuDepot, script), 'utf8')
  const dossier = mkdtempSync(join(tmpdir(), 'waiggle-banc-'))
  const bin = join(dossier, 'bin')
  const racine = join(dossier, 'racine')
  mkdirSync(bin)
  mkdirSync(racine)
  const module = pathToFileURL(fileURLToPath(import.meta.url)).href
  // `enPlus`: fakes some tests add (the installer's pass-through git, and chown, since the tests
  // do not run as root).
  const noms = [...FAUX, ...enPlus]
  if (enPlus.includes('git')) writeFileSync(join(dossier, 'vrai-git'), reel('git'))
  for (const nom of noms) {
    ecrire(
      join(bin, nom),
      `#!${process.execPath}\nimport(${JSON.stringify(module)}).then((m) => m.executerFaux(${JSON.stringify(nom)}, ${JSON.stringify(dossier)}))\n`,
      0o755,
    )
  }
  const origine = join(dossier, 'origine.git')
  const { texte, valeurs } = copieDeTest(source, {
    bin,
    racine,
    remplacements: { ORIGINE: origine, ...remplacements },
  })
  // Parents of every relocated path exist; the paths themselves are left to the script or the test.
  for (const v of Object.values(valeurs)) {
    if (v.startsWith(racine)) mkdirSync(dirname(v), { recursive: true })
  }
  const copie = join(dossier, 'scripts', basename(script))
  ecrire(copie, texte, 0o755)
  // Other scripts sharing the same machine (waiggle-retour next to waiggle-deployer: same lock).
  const copies = { [basename(script)]: copie }
  for (const autre of aussi) {
    const r = copieDeTest(readFileSync(join(racineDuDepot, autre), 'utf8'), {
      bin,
      racine,
      remplacements: { ORIGINE: origine, ...remplacements },
    })
    copies[basename(autre)] = join(dossier, 'scripts', basename(autre))
    ecrire(copies[basename(autre)], r.texte, 0o755)
    Object.assign(valeurs, { ...r.valeurs, ...valeurs })
  }
  const fichierConfig = join(dossier, 'config.json')
  writeFileSync(fichierConfig, JSON.stringify({ chemins: valeurs }))

  const banc = {
    dossier,
    racine,
    bin,
    source,
    copie,
    copies,
    texteCopie: texte,
    chemins: valeurs,
    origine,
    /** A path of the real machine, relocated under the bench. */
    chemin: (p) => join(racine, p),
    configurer(partiel) {
      const actuelle = JSON.parse(readFileSync(fichierConfig, 'utf8'))
      writeFileSync(fichierConfig, JSON.stringify({ ...actuelle, ...partiel }))
    },
    /** Every recorded call, or those of one program. */
    appels(prog) {
      const f = join(dossier, 'appels.jsonl')
      if (!existsSync(f)) return []
      const tous = readFileSync(f, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
      return prog ? tous.filter((a) => a.prog === prog) : tous
    },
    /** Calls a fake refused because their arguments differ from the contract. */
    refuses() {
      return banc.appels().filter((a) => a.refuse)
    },
    lire(p) {
      return existsSync(p) ? readFileSync(p, 'utf8') : ''
    },
    git(...args) {
      const r = spawnSync(reel('git'), args, { encoding: 'utf8', env: envGit(dossier) })
      if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
      return r.stdout.trim()
    },
    /** Starts the test copy; `fini` resolves with the exit code and both outputs. */
    demarrer(args, { env = {}, delai = 60_000, detache = false, script = copie, interprete } = {}) {
      const fichier = copies[script] ?? script
      const [programme, tous] = interprete ? [interprete, [fichier, ...args]] : [fichier, args]
      const enfant = spawn(programme, tous, {
        cwd: dossier,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: detache,
      })
      let stdout = ''
      let stderr = ''
      enfant.stdout.on('data', (d) => {
        stdout += d
      })
      enfant.stderr.on('data', (d) => {
        stderr += d
      })
      const minuteur = setTimeout(() => enfant.kill('SIGKILL'), delai)
      const fini = new Promise((resoudre) => {
        enfant.on('close', (code, signal) => {
          clearTimeout(minuteur)
          resoudre({ code, signal, stdout, stderr })
        })
      })
      return { enfant, fini, sortie: () => stdout }
    },
    lancer(args, options) {
      return banc.demarrer(args, options).fini
    },
    fermer() {
      rmSync(dossier, { recursive: true, force: true })
    },
  }
  return banc
}

/**
 * The bare repository standing for GitHub, and a working clone to commit into.
 * `commit(message, fichiers, { branche })` commits on `main` (or another branch), pushes it and
 * returns the full commit.
 */
export function creerOrigine(banc, fichiersDeDepart = {}) {
  const travail = join(banc.dossier, 'travail')
  banc.git('init', '--quiet', '--bare', '--initial-branch=main', banc.origine)
  banc.git('init', '--quiet', '--initial-branch=main', travail)
  banc.git('-C', travail, 'remote', 'add', 'origin', banc.origine)
  const origine = {
    travail,
    commit(message, fichiers = {}, { branche = 'main' } = {}) {
      const actuelle = banc.git('-C', travail, 'branch', '--show-current')
      if (actuelle !== branche) {
        const existe = spawnSync(reel('git'), [
          '-C',
          travail,
          'rev-parse',
          '--verify',
          '--quiet',
          branche,
        ])
        banc.git(
          '-C',
          travail,
          'checkout',
          '--quiet',
          ...(existe.status === 0 ? [] : ['-b']),
          branche,
        )
      }
      for (const [chemin, contenu] of Object.entries(fichiers)) {
        ecrire(join(travail, chemin), contenu, chemin.endsWith('.sh') ? 0o755 : 0o644)
      }
      banc.git('-C', travail, 'add', '-A')
      banc.git('-C', travail, 'commit', '--quiet', '--allow-empty', '-m', message)
      banc.git('-C', travail, 'push', '--quiet', 'origin', `HEAD:refs/heads/${branche}`)
      const sha = banc.git('-C', travail, 'rev-parse', 'HEAD')
      if (branche !== 'main') banc.git('-C', travail, 'checkout', '--quiet', 'main')
      return sha
    },
    /** Many commits on main at once (for the 50-commit cap), without pushing each one. */
    commits(n, prefixe) {
      const shas = []
      for (let i = 0; i < n; i++) {
        banc.git('-C', travail, 'commit', '--quiet', '--allow-empty', '-m', `${prefixe} ${i}`)
        shas.push(banc.git('-C', travail, 'rev-parse', 'HEAD'))
      }
      banc.git('-C', travail, 'push', '--quiet', 'origin', 'HEAD:refs/heads/main')
      return shas
    },
  }
  origine.depart = origine.commit('Initial', fichiersDeDepart)
  return origine
}

/** A pull request as GitHub returns it, merged by Louis into main unless told otherwise. */
export const pr = (numero, sha, autres = {}) => ({
  number: numero,
  merged: true,
  merged_at: '2026-11-21T01:00:00Z',
  merge_commit_sha: sha,
  base: { ref: 'main', repo: { full_name: DEPOT_GITHUB } },
  merged_by: { id: ID_LOUIS, login: 'L-maillere' },
  commits: [sha],
  ...autres,
})

/** The lines of a log file. */
export const lignes = (texte) => texte.split('\n').filter(Boolean)

/** Files of a directory, recursively, with their mode and content. */
function inventaire(dossier) {
  const fichiers = []
  const parcourir = (d) => {
    for (const nom of readdirSync(d)) {
      const p = join(d, nom)
      const s = statSync(p)
      if (s.isDirectory()) parcourir(p)
      else
        fichiers.push({
          chemin: relative(dossier, p),
          mode: s.mode & 0o777,
          contenu: readFileSync(p, 'utf8'),
        })
    }
  }
  parcourir(dossier)
  return fichiers.sort((a, b) => a.chemin.localeCompare(b.chemin))
}

// ---------------------------------------------------------------------------------------------
// The fakes themselves (run inside the fake program's process)

const egal = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

/** Environment variables worth recording: the ones a caller could use to steer a program. */
const envSurveille = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(([k]) =>
      /^(PATH|HOME|LANG|GIT_.*|GH_.*|GITHUB_.*|SSH_.*|RUCHE_.*|SUDO_.*|BASH_ENV|ENV)$/.test(k),
    ),
  )

/** The command line of the parent process (`timeout 60 ssh …`, or the script itself). */
const parent = () => {
  try {
    return readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean)
  } catch {
    return []
  }
}

const reponses = {
  id(args, config) {
    if (!egal(args, ['-u'])) return null
    return { sortie: `${config.uid ?? 0}\n` }
  },

  logger(args) {
    if (args[0] !== '-t' || args[1] !== 'waiggle-deploy' || args.length < 3) return null
    return { message: args.slice(2).join(' ') }
  },

  docker(args, config) {
    const m =
      args.length === 6 &&
      args[0] === 'buildx' &&
      args[1] === 'imagetools' &&
      args[2] === 'inspect' &&
      args[4] === '--format' &&
      args[5] === '{{json .Manifest.Digest}}'
    if (!m) return null
    const empreinte = config.docker?.[args[3]]
    if (!empreinte) return { code: 1, erreur: `ERROR: ${args[3]}: not found\n` }
    return { sortie: `"sha256:${empreinte}"\n` }
  },

  curl(args, config, banc, appel) {
    const titre = /^Title: (.*)$/.exec(args[6] ?? '')?.[1] ?? ''
    if (!egal(args, argumentsCurl(config.chemins, titre))) return null
    if (!['waiggle-deployer', 'waiggle-retour'].includes(titre)) return null
    const rang = appelsDe(banc, 'curl').length
    appel.texte = appel.stdin
    return { code: config.curl?.[rang] ?? 0 }
  },

  gh(args, config) {
    const { GH_CONFIG_DIR: dossierGh } = process.env
    if (dossierGh !== config.chemins.GH_DIR) return null
    if (args[0] === 'auth' && args[1] === 'git-credential') return { code: 0 }
    const github = config.github ?? { prs: [] }
    if (args[0] === 'api' && args.length === 4 && args[2] === '--jq') {
      const commits = /^repos\/EthogramHQ\/Waiggle\/commits\/([0-9a-f]{40})\/pulls$/.exec(args[1])
      if (commits) {
        const c = commits[1]
        if (args[3] !== filtrePulls(c)) return null
        const liste = github.prs.filter((p) => p.commits.includes(c) || p.merge_commit_sha === c)
        const numeros = liste
          .filter(
            (p) =>
              p.merged_at !== null &&
              p.merge_commit_sha === c &&
              p.base.ref === 'main' &&
              p.base.repo.full_name === DEPOT_GITHUB,
          )
          .map((p) => p.number)
        return { sortie: `${JSON.stringify(numeros)}\n` }
      }
      const pulls = /^repos\/EthogramHQ\/Waiggle\/pulls\/([0-9]{1,9})$/.exec(args[1])
      if (pulls) {
        if (args[3] !== FILTRE_PR) return null
        const p = github.prs.find((x) => String(x.number) === pulls[1])
        if (!p) return { code: 1, erreur: 'gh: Not Found (HTTP 404) texte-recu-de-github\n' }
        const d = { ...p, ...(p.detail ?? {}) }
        const champs = [
          d.merged,
          d.merge_commit_sha,
          d.base.ref,
          d.base.repo.full_name,
          d.merged_by?.id,
        ]
        return {
          sortie: `${champs.map((x) => (x === null || x === undefined ? '' : String(x))).join('\t')}\n`,
        }
      }
      return null
    }
    if (args[0] === 'attestation') {
      const m = /^oci:\/\/(.+)-(api|web):([0-9a-f]{40})$/.exec(args[2] ?? '')
      if (!m || !egal(args, argumentsAttestation(m[1], m[2], m[3]))) return null
      const empreinte = config.attestations?.[`${m[1]}-${m[2]}:${m[3]}`]
      if (empreinte === undefined) {
        return { code: 1, erreur: 'Error: no attestations found texte-recu-de-github\n' }
      }
      return { sortie: `${empreinte}\n` }
    }
    return null
  },

  ssh(args, config) {
    const normal = optionsSsh(config.chemins, false)
    const retour = optionsSsh(config.chemins, true)
    let cle
    if (egal(args.slice(0, normal.length), normal)) cle = 'deploiement'
    else if (egal(args.slice(0, retour.length), retour)) cle = 'retour'
    else return null
    const commande = args.slice(normal.length).join(' ')
    const ssh = config.ssh ?? {}
    if (commande === 'version') {
      return {
        cle,
        commande,
        sortie: ssh.version ?? `${config.service}\n`,
        code: ssh.codeVersion ?? 0,
      }
    }
    if (
      /^deploy [0-9a-f]{40} ghcr\.io\/[a-z0-9._/-]+-api@sha256:[0-9a-f]{64} ghcr\.io\/[a-z0-9._/-]+-web@sha256:[0-9a-f]{64}$/.test(
        commande,
      )
    ) {
      return {
        cle,
        commande,
        sortie: ssh.sortieDeploy ?? `avant ${config.service ?? '-'}\nsortie du gardien\nfin 0\n`,
        code: ssh.codeDeploy ?? 0,
        dormir: ssh.dormirDeploy ?? 0,
      }
    }
    return { cle, commande, code: 2, erreur: 'waiggle-deploy-force : commande refusée\n' }
  },

  'systemd-run'(args, config) {
    const m = /^WorkingDirectory=(.+)$/.exec(args[19] ?? '')
    if (!m || !egal(args, argumentsSystemdRun(m[1]))) return null
    if (!m[1].startsWith(`${config.chemins.TRAVAIL}/`)) return null
    const dossier = m[1]
    const mode = statSync(dossier).mode & 0o777
    return { dossier, modeDossier: mode, fichiers: inventaire(dossier), code: config.mentions ?? 0 }
  },

  chown(args) {
    if (args.length < 2) return null
    return { proprietaire: args.at(-2), cible: args.at(-1) }
  },

  git(args, config, banc) {
    // Pass-through to the real git, used by the installer test only, which may corrupt one blob.
    const vrai = readFileSync(join(banc, 'vrai-git'), 'utf8')
    const r = spawnSync(vrai, args, { stdio: ['inherit', 'pipe', 'pipe'] })
    let sortie = r.stdout
    const visee = config.corrompre
    const show = args.indexOf('show')
    if (visee && show >= 0 && args.at(-1).endsWith(`:${visee}`)) {
      sortie = Buffer.concat([sortie, Buffer.from('# corrompu\n')])
    }
    return { sortieBrute: sortie, erreur: r.stderr.toString(), code: r.status ?? 1 }
  },
}

const appelsDe = (banc, prog) => {
  const f = join(banc, 'appels.jsonl')
  if (!existsSync(f)) return []
  return readFileSync(f, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((a) => a.prog === prog)
}

/** Entry point of every fake program. */
export async function executerFaux(nom, banc) {
  const args = process.argv.slice(2)
  const config = JSON.parse(readFileSync(join(banc, 'config.json'), 'utf8'))
  let stdin = ''
  if (nom === 'curl') {
    try {
      stdin = readFileSync(0, 'utf8')
    } catch {
      stdin = ''
    }
  }
  const appel = { prog: nom, args, t: Date.now(), env: envSurveille(), parent: parent(), stdin }
  const reponse = reponses[nom](args, config, banc, appel)
  if (reponse === null) {
    appel.refuse = true
    appendFileSync(join(banc, 'appels.jsonl'), `${JSON.stringify(appel)}\n`)
    process.stderr.write(`fake ${nom}: arguments outside the contract: ${JSON.stringify(args)}\n`)
    process.exit(97)
  }
  const { sortie, sortieBrute, erreur, code = 0, dormir = 0, ...details } = reponse
  Object.assign(appel, details)
  appendFileSync(join(banc, 'appels.jsonl'), `${JSON.stringify(appel)}\n`)
  if (sortie) process.stdout.write(sortie)
  if (sortieBrute) process.stdout.write(sortieBrute)
  if (erreur) process.stderr.write(erreur)
  if (dormir) await new Promise((r) => setTimeout(r, dormir))
  if (nom === 'ssh' && dormir)
    appendFileSync(
      join(banc, 'appels.jsonl'),
      `${JSON.stringify({ prog: 'ssh-fin', t: Date.now() })}\n`,
    )
  process.exitCode = code
}
