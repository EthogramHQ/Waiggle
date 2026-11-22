// La garde du poids du premier chargement (tranche R18, « Les finitions », choix 2 du plan) :
// `node apps/app/scripts/bundle-report.mjs <dossier construit> --max-start <Ko>` additionne le poids
// en brotli des scripts que la page `/fr/` demande d'emblée (ce que le navigateur reçoit une fois la
// compression à l'avance posée, infra/web/precompress.mjs) et rend le code 1 au-delà de la limite.
// La CI la lance juste après la construction : un écran lourd ajouté par mégarde au départ fait
// échouer la vérification au lieu d'alourdir l'appli en silence.
//
// Chaque test écrit une fausse construction dans un dossier temporaire : quelques pages HTML et des
// scripts faits d'octets au hasard. Des octets au hasard ne se compressent pas : leur poids en
// brotli reste celui du fichier, ce qui rend les totaux prévisibles sans dépendre du compresseur.
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const SCRIPT = join(__dirname, 'bundle-report.mjs')
const KIB = 1024

const ENTRY = '_expo/static/js/web/entry-0123456789abcdef0123456789abcdef.js'
const COMMON = '_expo/static/js/web/common-0123456789abcdef0123456789abcdef.js'
const ON_DEMAND = '_expo/static/js/web/SettingsScreen-fedcba9876543210fedcba9876543210.js'
const RULES_ONLY = '_expo/static/js/web/rules-fedcba9876543210fedcba9876543210.js'
const STYLE = '_expo/static/css/web-0123456789abcdef0123456789abcdef.css'
const FONT = 'assets/node_modules/@expo-google-fonts/funnel-sans/FunnelSans_400Regular.ttf'

// Une page pré-rendue qui demande ses scripts et ses ressources comme celles d'Expo.
const page = (scripts: string[], extra = '') =>
  [
    '<!doctype html><html lang="fr"><head>',
    ...scripts.map((src) => `<link rel="preload" href="/${src}" as="script">`),
    extra,
    '</head><body><div id="root"></div>',
    ...scripts.map((src) => `<script src="/${src}" defer></script>`),
    '</body></html>',
  ].join('')

const dirs: string[] = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true })
})

/**
 * Une fausse construction : `/fr/` demande deux scripts (20 et 10 Kio, 30 Kio au départ), un style
 * et une police lourds ; un morceau à la demande et le script propre à `/fr/rules`, lourds aussi,
 * ne sont pas demandés par `/fr/`.
 */
const fakeBuild = ({ withHome = true } = {}) => {
  const dist = mkdtempSync(join(tmpdir(), 'waiggle-bundle-report-'))
  dirs.push(dist)
  const files: Record<string, Buffer | string> = {
    [ENTRY]: randomBytes(20 * KIB),
    [COMMON]: randomBytes(10 * KIB),
    [ON_DEMAND]: randomBytes(200 * KIB),
    [RULES_ONLY]: randomBytes(200 * KIB),
    [STYLE]: randomBytes(200 * KIB),
    [FONT]: randomBytes(200 * KIB),
    'fr/rules.html': page([ENTRY, RULES_ONLY]),
    'fr/projects/[id].html': page([ENTRY]),
  }
  if (withHome) {
    files['fr/index.html'] = page(
      [ENTRY, COMMON],
      `<link rel="stylesheet" href="/${STYLE}"><link rel="preload" href="/${FONT}" as="font" crossorigin>`,
    )
  }
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dist, path)), { recursive: true })
    writeFileSync(join(dist, path), content)
  }
  return dist
}

/** Lance la garde comme la CI, avec une limite en Ko. */
const guard = (dist: string, maxStart: number) =>
  spawnSync(process.execPath, [SCRIPT, dist, '--max-start', String(maxStart)], {
    encoding: 'utf8',
  })

describe('bundle-report --max-start', () => {
  it('exits with 1 when the start scripts of /fr/ weigh more than the limit', () => {
    // 30 Kio au départ, limite de 20 Ko.
    const run = guard(fakeBuild(), 20)
    expect({ status: run.status, stderr: run.stderr }).toEqual({
      status: 1,
      stderr: expect.any(String),
    })
  })

  it('exits with 0 when the start scripts of /fr/ stay under the limit', () => {
    // 30 Kio au départ, limite de 45 Ko.
    const run = guard(fakeBuild(), 45)
    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' })
  })

  // Témoin des deux précédents : le même dossier, une limite de part et d'autre. Seuls les scripts
  // demandés par `/fr/` comptent : ni le style, ni la police, ni le morceau à la demande, ni le
  // script de `/fr/rules` (200 Kio chacun) ne font dépasser une limite de 45 Ko.
  it('counts the start scripts of /fr/ only, not its style or font, nor the chunks loaded on demand', () => {
    const dist = fakeBuild()
    expect([guard(dist, 20).status, guard(dist, 45).status]).toEqual([1, 0])
  })

  // Une construction où `/fr/` manque ne se mesure pas : la garde échoue au lieu de laisser passer.
  it('fails when the build has no /fr/ page to measure', () => {
    const run = guard(fakeBuild({ withHome: false }), 45)
    expect(run.status).not.toBe(0)
    expect(run.status).not.toBeNull()
  })
})
