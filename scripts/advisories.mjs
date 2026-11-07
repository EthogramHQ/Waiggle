// Le guetteur d'avis de sécurité (audit de sécurité du 7/11/2026, N2), lancé chaque jour par la
// CI (tâche « Dependency audit », .github/workflows/ci.yml) et à chaque pull request.
//
// Pourquoi, en plus de `pnpm audit` : un avis publié par les mainteneurs d'une brique, dans les
// « security advisories » de son dépôt GitHub, n'arrive dans les bases que lisent `pnpm audit`,
// Dependabot et OSV que des jours plus tard, parfois jamais. Le 3/11/2026, un avis critique de
// Better Auth n'était dans aucune des trois quatre jours après. Ce script lit donc directement
// les avis des dépôts de nos dépendances directes (et de Caddy, notre porte d'entrée), puis
// compare chaque version touchée à celles de pnpm-lock.yaml.
//
// Rouge (code de sortie 1) : un avis haut ou critique touche une version du verrou, et aucune
// exception en cours ne le couvre. La règle qui suit (docs/ops/serveur.md, « Un avis de
// sécurité ») : une pull request à la main le jour même. Un avis moyen ou faible est listé, sans
// rougir : Renovate le corrigera à son rythme.
//
// Les exceptions : scripts/advisories-accepted.json, chacune avec sa raison et sa date de fin
// (« until », comprise) ; passée cette date, l'avis rougit de nouveau.
//
// Usage : node scripts/advisories.mjs (jeton GitHub dans GITHUB_TOKEN ou GH_TOKEN, sinon sans
// jeton, limité à 60 demandes par heure). Tests : scripts/advisories.test.mjs.
import { appendFileSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ─── Comparer des versions ──────────────────────────────────────────────────────────────────────

// « 1.7.16-beta.1 » → { parts: [1, 7, 16], pre: ['beta', '1'] }. Le « v » de tête (Go) est ignoré.
const parse = (version) => {
  const [main = '', pre] = version.trim().replace(/^v/, '').split('+')[0].split(/-(.*)/s)
  return {
    parts: main.split('.').map((part) => Number.parseInt(part, 10) || 0),
    pre: pre ? pre.split('.') : [],
  }
}

/** Négatif si a < b, 0 si égales, positif si a > b (règles de semver, pré-versions comprises). */
export const compare = (a, b) => {
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < Math.max(x.parts.length, y.parts.length, 3); i++) {
    const diff = (x.parts[i] ?? 0) - (y.parts[i] ?? 0)
    if (diff !== 0) return diff
  }
  // Une pré-version (1.7.16-beta.1) vient avant la version (1.7.16).
  if (x.pre.length === 0 || y.pre.length === 0) return y.pre.length - x.pre.length
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i]
    const q = y.pre[i]
    if (p === undefined) return -1
    if (q === undefined) return 1
    const numeric = /^\d+$/.test(p) && /^\d+$/.test(q)
    const diff = numeric ? Number(p) - Number(q) : p.localeCompare(q)
    if (diff !== 0) return diff
  }
  return 0
}

// Une condition : un opérateur facultatif, puis une version (« >= 1.0.0 », « <1.10.1 », « 2.1.5 »).
const CONDITION = /(<=|>=|<|>|=)?\s*(v?\d[^\s,]*)/g

/**
 * Vrai si `version` est dans `range`, écrit comme GitHub l'écrit : des conditions toutes vraies,
 * séparées par des virgules (« >= 1.0.0, < 1.7.16 ») ou, dans des avis écrits à la main, par des
 * espaces seuls (« >=1.3.0 < 1.10.1 ») ; ou une version seule (« = 2.1.5 »).
 */
export const inRange = (version, range) =>
  [...range.matchAll(CONDITION)].every(([, op = '=', bound = '']) => {
    const diff = compare(version, bound)
    if (op === '<') return diff < 0
    if (op === '<=') return diff <= 0
    if (op === '>') return diff > 0
    if (op === '>=') return diff >= 0
    return diff === 0
  })

const major = (version) => parse(version).parts[0]

/**
 * Vrai si `version`, prise dans `range`, a déjà un correctif de l'avis. Les avis écrits par les
 * mainteneurs ont parfois une plage trop large (« >= 4.12.0 », corrigé en 4.12.2), ou deux lignes
 * de versions dont la plage de l'une contient l'autre (« <= 0.45.1 » corrigé en 0.45.2, et
 * « <= 1.0.0-beta.19 ») : un correctif fait foi s'il est de la même version majeure, antérieur ou
 * égal à `version`, et au-dessus de la borne basse de `range`. Cette dernière condition garde
 * rouge une faille revenue après un premier correctif (corrigée en 1.6.11, revenue en 1.6.14 :
 * « >= 1.6.14, < 1.7.16 »).
 */
export const patchedBy = (version, range, patchedLists) => {
  const lowerBounds = [...range.matchAll(CONDITION)]
    .filter(([, op]) => op === '>' || op === '>=')
    .map(([, , bound]) => bound)
  return patchedLists
    .flatMap((patched) => [...(patched ?? '').matchAll(CONDITION)].map(([, , bound]) => bound))
    .some(
      (fix) =>
        major(fix) === major(version) &&
        compare(version, fix) >= 0 &&
        lowerBounds.every((lower) => compare(fix, lower) >= 0),
    )
}

// ─── Lire le verrou et les dépendances ──────────────────────────────────────────────────────────

/**
 * Chaque version de chaque paquet de pnpm-lock.yaml : Map nom → Set de versions. On lit les
 * entrées des sections `packages:` et `snapshots:` (« '@scope/nom@1.2.3': », « nom@1.2.3(pair): »).
 */
export const lockedVersions = (lockText) => {
  const locked = new Map()
  let inside = false
  for (const line of lockText.split('\n')) {
    if (/^\S/.test(line)) inside = /^(packages|snapshots):\s*$/.test(line)
    if (!inside) continue
    const entry = line.match(/^ {2}'?((?:@[^/@\s']+\/)?[^@\s'(]+)@(\d[^@\s'(:]*)/)
    if (!entry) continue
    const [, name, version] = entry
    if (!locked.has(name)) locked.set(name, new Set())
    locked.get(name).add(version)
  }
  return locked
}

/** Le dépôt GitHub (« propriétaire/nom ») d'un paquet, d'après le champ `repository` de son manifeste. */
export const repoOf = (manifest) => {
  const field = manifest.repository
  const text = typeof field === 'string' ? field : field?.url
  if (typeof text !== 'string') return null
  const short = text.match(/^(?:github:)?([\w.-]+)\/([\w.-]+)$/)
  const full = text.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/)
  const [, owner, repo] = short ?? full ?? []
  return owner && repo ? `${owner}/${repo}` : null
}

// ─── Juger les avis ─────────────────────────────────────────────────────────────────────────────

const RED = new Set(['critical', 'high'])
const ECOSYSTEMS = new Set(['npm', 'go'])

/**
 * Les avis qui touchent une version du verrou. Chaque résultat dit s'il rougit (`red`), et s'il
 * est couvert par une exception (`accepted`) ou si celle-ci est passée (`expired`).
 * `today` : la date du jour, « AAAA-MM-JJ ».
 */
export const findAffected = ({ advisories, locked, accepted, today }) => {
  const findings = []
  for (const advisory of advisories) {
    if (advisory.withdrawn_at) continue
    for (const vulnerability of advisory.vulnerabilities ?? []) {
      const { ecosystem, name } = vulnerability.package ?? {}
      if (!ECOSYSTEMS.has(ecosystem)) continue
      const range = vulnerability.vulnerable_version_range
      if (!range) continue
      // Les versions corrigées de ce paquet, toutes lignes de l'avis confondues.
      const fixes = (advisory.vulnerabilities ?? [])
        .filter((other) => other.package?.name === name)
        .map((other) => other.patched_versions)
      for (const version of locked.get(name) ?? []) {
        if (!inRange(version, range) || patchedBy(version, range, fixes)) continue
        const exception = accepted.find((a) => a.ghsa === advisory.ghsa_id && a.package === name)
        const expired = exception !== undefined && exception.until < today
        const covered = exception !== undefined && !expired
        findings.push({
          ghsa: advisory.ghsa_id,
          url: advisory.html_url,
          summary: advisory.summary,
          severity: advisory.severity,
          package: name,
          version,
          range,
          patched: vulnerability.patched_versions ?? null,
          accepted: covered ? exception : null,
          expired,
          red: RED.has(advisory.severity) && !covered,
        })
      }
    }
  }
  return findings
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'moderate', 'low', 'unknown']

/** Les résultats rouges d'abord, puis par gravité. */
export const sortFindings = (findings) =>
  [...findings].sort(
    (a, b) =>
      Number(b.red) - Number(a.red) ||
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  )

// ─── Le lancement ───────────────────────────────────────────────────────────────────────────────

const ROOT = fileURLToPath(new URL('..', import.meta.url))

// Les manifestes du dépôt : la racine, chaque appli, chaque paquet (pnpm-workspace.yaml).
const workspaceManifests = () => {
  const dirs = ['.', 'apps/api/runtime']
  for (const parent of ['apps', 'packages']) {
    for (const entry of readdirSync(join(ROOT, parent), { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(join(parent, entry.name))
    }
  }
  return dirs.flatMap((dir) => {
    try {
      return [JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8'))]
    } catch {
      return []
    }
  })
}

// Les briques hors de npm, lues dans nos fichiers : Caddy, dans l'image « web ».
const otherBricks = () => {
  const dockerfile = readFileSync(join(ROOT, 'infra/web/Dockerfile'), 'utf8')
  const caddy = dockerfile.match(/^FROM caddy:(\d[\w.]*?)-alpine/m)?.[1]
  return caddy
    ? [{ repo: 'caddyserver/caddy', name: 'github.com/caddyserver/caddy/v2', version: caddy }]
    : []
}

// Les réglages venus de l'environnement : le jeton GitHub (CI ou PC) et le résumé de la CI. Ce
// script ne passe pas par Turborepo, qui n'a donc pas à les connaître.
const { GITHUB_TOKEN, GH_TOKEN, GITHUB_STEP_SUMMARY } = process.env
const token = GITHUB_TOKEN || GH_TOKEN
const github = async (path) => {
  const results = []
  let url = `https://api.github.com${path}`
  for (let page = 0; url && page < 10; page++) {
    const res = await fetch(url, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'waiggle-advisories',
        ...(token && { authorization: `Bearer ${token}` }),
      },
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`${path} : GitHub répond ${res.status}`)
    results.push(...(await res.json()))
    url = res.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1]
  }
  return results
}

const main = async () => {
  const locked = lockedVersions(readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8'))
  const accepted = JSON.parse(readFileSync(join(ROOT, 'scripts/advisories-accepted.json'), 'utf8'))
  const today = new Date().toISOString().slice(0, 10)

  // Nos dépendances directes (hors paquets du dépôt), et la version notée au verrou pour chacune.
  const direct = new Set()
  for (const manifest of workspaceManifests()) {
    for (const deps of [manifest.dependencies, manifest.devDependencies]) {
      for (const [name, spec] of Object.entries(deps ?? {})) {
        if (!String(spec).startsWith('workspace:') && locked.has(name)) direct.add(name)
      }
    }
  }

  // Le dépôt de chacune, d'après son manifeste au registre npm (la version du verrou).
  const repos = new Set(otherBricks().map((brick) => brick.repo))
  const noRepo = []
  const names = [...direct]
  for (let i = 0; i < names.length; i += 8) {
    await Promise.all(
      names.slice(i, i + 8).map(async (name) => {
        const version = [...locked.get(name)].sort(compare).at(-1)
        // Un nom à portée (« @better-auth/expo ») s'écrit « @better-auth%2Fexpo » dans l'adresse.
        const res = await fetch(
          `https://registry.npmjs.org/${name.replaceAll('/', '%2F')}/${version}`,
        )
        const repo = res.ok ? repoOf(await res.json()) : null
        if (repo) repos.add(repo)
        else noRepo.push(name)
      }),
    )
  }
  for (const brick of otherBricks()) {
    if (!locked.has(brick.name)) locked.set(brick.name, new Set())
    locked.get(brick.name).add(brick.version)
  }

  // Les avis publiés de chaque dépôt.
  const advisories = []
  const unreadable = []
  for (const repo of [...repos].sort()) {
    const list = await github(`/repos/${repo}/security-advisories?state=published&per_page=100`)
    if (list === null) unreadable.push(repo)
    else advisories.push(...list)
  }

  const findings = sortFindings(findAffected({ advisories, locked, accepted, today }))
  const lines = [
    `## Avis de sécurité des dépôts (${repos.size} dépôts, ${advisories.length} avis lus)`,
    '',
  ]
  if (findings.length === 0) lines.push('Aucun avis ne touche une version du verrou.')
  for (const f of findings) {
    const state = f.red
      ? f.expired
        ? '🔴 exception passée'
        : '🔴'
      : f.accepted
        ? `⚪ accepté jusqu'au ${f.accepted.until} : ${f.accepted.reason}`
        : '🟡'
    lines.push(
      `- ${state} **${f.severity}** [${f.ghsa}](${f.url}) ${f.package} ${f.version} (touché : ${f.range} ; corrigé : ${f.patched ?? 'aucune version'}) : ${f.summary}`,
    )
  }
  if (noRepo.length > 0) lines.push('', `Sans dépôt GitHub connu : ${noRepo.sort().join(', ')}.`)
  if (unreadable.length > 0) lines.push('', `Avis illisibles (404) : ${unreadable.join(', ')}.`)
  const red = findings.filter((f) => f.red)
  if (red.length > 0) {
    lines.push(
      '',
      `**${red.length} avis haut ou critique sans correctif au verrou** : une pull request à la main aujourd'hui (docs/ops/serveur.md, « Un avis de sécurité »).`,
    )
  }
  const report = lines.join('\n')
  console.log(report)
  if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, `${report}\n`)
  process.exitCode = red.length > 0 ? 1 : 0
}

// Lancé directement (et non importé par les tests) : on fait le tour.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main()
}
