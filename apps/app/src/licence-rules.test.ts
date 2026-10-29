/// <reference types="node" />
// Règles de licence vérifiées automatiquement (relecture juridique du plan de R1, 29/10/2026).
// Waiggle est sous AGPL-3.0 ; tout ce qu'il embarque doit pouvoir l'accompagner, et chaque
// élément de tiers doit être nommé, avec sa licence, dans public/licences-tierces.txt.
// - chaque dépendance directe de l'appli et des paquets a une licence de la liste admise ;
// - chaque police livrée est nommée dans le fichier des licences.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fontFamilies } from '@ruche/brand'
import { prefixes } from './ui/theme/fonts'

const repo = join(__dirname, '..', '..', '..')

// Licences « permissives » (on peut les réutiliser dans un logiciel libre sous AGPL) et l'OFL des
// polices. Elles s'écrivent comme dans le champ `license` d'un package.json (codes SPDX).
const allowed = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'MPL-2.0',
  'OFL-1.1',
  'Unlicense',
  '0BSD',
  'CC0-1.0',
  'MIT AND OFL-1.1', // les paquets de polices d'Expo : le code en MIT, la police en OFL
])

// Une dépendance hors de la liste, acceptée après examen : son nom et la raison. Vide aujourd'hui.
const exceptions: Record<string, string> = {}

/** L'appli et chaque paquet de packages/ : leurs dépendances directes, hors paquets du dépôt. */
const directDependencies = () =>
  ['apps/app', ...readdirSync(join(repo, 'packages')).map((name) => `packages/${name}`)].flatMap(
    (dir) => {
      const pkg = JSON.parse(readFileSync(join(repo, dir, 'package.json'), 'utf8'))
      return Object.entries<string>({ ...pkg.dependencies, ...pkg.devDependencies })
        .filter(([, version]) => !version.startsWith('workspace:'))
        .map(([name]) => ({ dir, name }))
    },
  )

describe('licence rules', () => {
  it('only depends on packages under an admitted licence', () => {
    const offenders = directDependencies()
      .filter(({ name }) => !(name in exceptions))
      .map(({ dir, name }) => {
        const manifest = JSON.parse(
          readFileSync(join(repo, dir, 'node_modules', name, 'package.json'), 'utf8'),
        )
        // Une espace en trop ne change pas la licence : « MIT  AND OFL-1.1 ».
        const licence = String(manifest.license ?? 'none').replace(/\s+/g, ' ')
        return { name, licence }
      })
      .filter(({ licence }) => !allowed.has(licence))
    expect(offenders).toEqual([])
  })

  it('names every shipped font in the third-party licences', () => {
    const notice = readFileSync(join(__dirname, '..', 'public', 'licences-tierces.txt'), 'utf8')
    const missing = Object.keys(prefixes)
      .map((family) => fontFamilies[family as keyof typeof fontFamilies])
      .filter((name) => !notice.includes(name))
    expect(missing).toEqual([])
  })
})
