// Fabrique les tuiles des catégories du récap du dimanche (R8, planche R8-Recap) : une image PNG
// carrée de 160 px par catégorie, un fond miel en dégradé et l'icône de la catégorie au milieu.
// Le récap la joint à l'e-mail à la place de la photo d'un projet qui n'en a pas (ou qui est
// signalé) : src/email/recap-images.ts, categoryTile.
//
// Les tuiles sont fabriquées une fois, puis enregistrées dans le dépôt (assets/category-tiles/) :
// l'API ne dessine rien pendant un envoi, et la même catégorie donne toujours les mêmes octets.
// Pour changer une couleur ou une icône : modifier ce script, puis le relancer depuis apps/api :
//   pnpm exec tsx scripts/category-tiles.mts
//
// Les icônes sont celles de l'appli (Phosphor, licence MIT), lues dans le paquet de l'appli
// (apps/app/node_modules/@phosphor-icons/core) ; leur licence est recopiée à côté des tuiles.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { palettes } from '@ruche/brand'
import sharp from 'sharp'

/** Le côté d'une tuile, en pixels : deux fois sa taille dans l'e-mail (écrans à haute densité). */
const SIZE = 160
/** Le côté de l'icône dans la tuile. */
const ICON = 72

/**
 * Les seize catégories semées par la migration 0016 (packages/db/migrations/0016_r6b_tools.sql),
 * chacune avec son icône. Une catégorie ajoutée plus tard par un administrateur n'a pas de tuile :
 * elle prend celle d'« Autre » (categoryTile).
 */
const categories: Record<string, string> = {
  'home-garden': 'plant',
  cooking: 'cooking-pot',
  family: 'users-three',
  learning: 'graduation-cap',
  games: 'game-controller',
  art: 'paint-brush',
  music: 'music-notes',
  'photo-video': 'film-strip',
  'health-sport': 'heartbeat',
  travel: 'airplane-tilt',
  money: 'piggy-bank',
  work: 'briefcase',
  code: 'code',
  animals: 'paw-print',
  science: 'planet',
  other: 'shapes',
}

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const phosphor = join(apiRoot, '..', 'app', 'node_modules', '@phosphor-icons', 'core')
const target = join(apiRoot, 'assets', 'category-tiles')
mkdirSync(target, { recursive: true })

// Les couleurs de jour, comme tous les e-mails : la lumière miel en haut à gauche, le miel en bas
// à droite (le bandeau du récap a le même dégradé), l'icône dans le brun des tuiles de l'appli.
const c = palettes.day

for (const [code, icon] of Object.entries(categories)) {
  const svg = readFileSync(join(phosphor, 'assets', 'regular', `${icon}.svg`), 'utf8')
  // Les tracés de l'icône, sur leur grille de 256 × 256 ; on les réduit à ICON px, centrés.
  const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1])
  if (paths.length === 0) throw new Error(`${icon}: no <path> in the SVG`)
  const offset = (SIZE - ICON) / 2
  const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${c.honeyLight}"/><stop offset="1" stop-color="${c.honey}"/>
  </linearGradient></defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>
  <g transform="translate(${offset} ${offset}) scale(${ICON / 256})" fill="${c.onHoneyTile}">
    ${paths.map((d) => `<path d="${d}"/>`).join('')}
  </g>
</svg>`
  // sharp dessine le SVG (librsvg), puis l'écrit en PNG sans aucune métadonnée (son réglage par
  // défaut) ; la compression maximale garde la tuile à quelques kilo-octets.
  await sharp(Buffer.from(tile))
    .png({ compressionLevel: 9 })
    .toFile(join(target, `${code}.png`))
}

// La licence MIT demande de joindre son texte à toute copie des icônes.
copyFileSync(join(phosphor, 'LICENSE'), join(target, 'LICENSE-phosphor.txt'))
console.log(`${Object.keys(categories).length} category tiles written to ${target}`)
