// Fabrique src/ui/icons.generated.ts à partir des icônes Phosphor (licence MIT).
// Pour ajouter une icône : ajouter son nom à la liste ci-dessous (le nom exact du catalogue
// https://phosphoricons.com, suivi de « -fill » pour la version pleine), puis lancer
// `pnpm --filter @ruche/app icons`. Le fichier produit est enregistré dans le dépôt : l'appli
// ne dépend pas du paquet d'icônes pour fonctionner, seulement ce script.
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const icons = [
  // Navigation
  'house',
  'compass',
  'hash',
  'bell',
  'user',
  'users',
  'user-plus',
  'magnifying-glass',
  'list',
  'squares-four',
  'arrow-left',
  'arrow-right',
  'arrow-up-right',
  'arrow-square-out',
  'arrow-bend-up-left',
  'arrows-clockwise',
  'caret-left',
  'caret-right',
  'caret-down',
  'sign-in',
  'sign-out',
  // Actions
  'plus',
  'plus-circle',
  'x',
  'check',
  'pencil-simple',
  'trash',
  'share-network',
  'dots-three',
  'link',
  'download-simple',
  'upload-simple',
  'paper-plane-tilt',
  'camera',
  'image',
  'images',
  'push-pin',
  'funnel',
  'sliders-horizontal',
  'bookmark-simple',
  'heart',
  'star',
  'rocket-launch',
  // Réactions
  'sparkle',
  'lightbulb',
  'wrench',
  'smiley',
  'hands-clapping',
  'hand-waving',
  // Projet
  'lock-simple',
  'lock-simple-open',
  'globe-simple',
  'clock',
  'tag',
  'chat-circle',
  'chat-circle-dots',
  'megaphone-simple', // une note dans le fil : l'auteur annonce du nouveau
  'note-pencil', // écrire une note dans le journal
  // Messages et sécurité
  'check-circle',
  'warning',
  'warning-circle',
  'info',
  'eye',
  'eye-slash',
  'eye-closed',
  'envelope-simple',
  'at',
  'key',
  'fingerprint',
  'shield-check',
  'flag',
  'prohibit',
  'bell-slash',
  'bell-ringing',
  // Réglages
  'gear-six',
  'translate',
  'sun',
  'moon',
  'circle-half',
  'device-mobile',
  'desktop',
  // Versions pleines (onglet actif, réaction choisie)
  'house-fill',
  'compass-fill',
  'bell-fill',
  'user-fill',
  'heart-fill',
  'bookmark-simple-fill',
  'sparkle-fill',
  'lightbulb-fill',
  'wrench-fill',
  'smiley-fill',
  'hands-clapping-fill',
]

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const assets = join(root, 'node_modules', '@phosphor-icons', 'core', 'assets')

const paths = icons.map((name) => {
  const [base, weight] = name.endsWith('-fill') ? [name, 'fill'] : [name, 'regular']
  const svg = readFileSync(join(assets, weight, `${base}.svg`), 'utf8')
  // Chaque icône est faite d'un ou plusieurs tracés <path d="...">, dessinés sur une grille de 256.
  const ds = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1])
  if (ds.length === 0 || /<(circle|rect|line|polyline|polygon|ellipse)\b/.test(svg)) {
    throw new Error(`${name}: unexpected SVG shape, only <path> is supported`)
  }
  return `  '${name}': ${JSON.stringify(ds)},`
})

// La licence MIT demande de joindre son texte complet à toute copie : on le recopie en tête du
// fichier produit, tel qu'il est livré avec les icônes.
const license = readFileSync(
  join(root, 'node_modules', '@phosphor-icons', 'core', 'LICENSE'),
  'utf8',
)
  .trim()
  .split('\n')
  .map((line) => `// ${line}`.trimEnd())
  .join('\n')

const output = `// Fichier fabriqué par scripts/icons.mts : ne pas le modifier à la main.
// Icônes Phosphor (https://phosphoricons.com). Chaque icône : la liste de ses tracés SVG, sur une
// grille de 256 × 256. Licence des icônes :
//
${license}

export const iconPaths = {
${paths.join('\n')}
} as const

/** Le nom d'une icône disponible : 'sparkle' | 'arrow-left' | … */
export type IconName = keyof typeof iconPaths
`

const target = join(root, 'src', 'ui', 'icons.generated.ts')
writeFileSync(target, output)
// Mise en forme par Biome, comme le reste du code : le fichier ne change que si les icônes changent.
spawnSync('pnpm', ['exec', 'biome', 'format', '--write', target], { stdio: 'inherit' })
console.log(`${icons.length} icons written to src/ui/icons.generated.ts`)
