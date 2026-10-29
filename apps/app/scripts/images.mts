// Fabrique les images de l'appli (refonte, tranche R1), toutes par un seul moteur, `sharp` :
// 1. les quatre poses de la mascotte, découpées dans la planche validée par Louis
//    (assets/mascot/{fly,wave,sleep,search}.png) ;
// 2. le favicon (public/favicon.svg et public/favicon.png) et l'icône de l'appli sur téléphone
//    (assets/icon.png), dessinés depuis l'abeille du logo (src/ui/logo.generated.ts).
//
// Usage, depuis apps/app : `node scripts/images.mts <chemin de mascotte-planche.png>`. La planche
// reste hors du dépôt (elle n'est jamais commitée) ; les images produites, elles, le sont.
//
// Règles de sécurité (relecture du plan de R1, S2, S3, S8), vérifiées par src/asset-rules.test.ts :
// - le chemin donné en argument est seulement lu, et doit être un fichier `.png` ordinaire ;
// - le script n'écrit qu'à des chemins fixes, déduits de son propre emplacement, et ne lance aucun
//   programme ;
// - chaque image est ré-encodée par sharp **sans aucune métadonnée** : les générateurs d'images
//   écrivent dans le PNG le texte qui a servi à le produire et une signature d'origine (C2PA), qui
//   n'ont rien à faire dans l'appli. sharp ne recopie les métadonnées que si on le lui demande
//   (`withMetadata`), ce qu'on ne fait jamais.
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { palettes } from '../../../packages/brand/src/colors.ts'
import { bee, beeViewBox } from '../src/ui/logo.generated.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = (...parts: string[]) => join(root, ...parts)

// --- L'argument : la planche, seulement lue ---------------------------------------------------------
const sheet = process.argv[2]
if (!sheet || extname(sheet).toLowerCase() !== '.png' || !statSync(sheet).isFile()) {
  throw new Error('Usage : node scripts/images.mts <chemin de mascotte-planche.png>')
}

// --- 1. La mascotte ---------------------------------------------------------------------------------
// La planche est une grille 2 × 2 (vérifiée à l'œil sur l'image) : en haut, le vol puis le salut ;
// en bas, le sommeil puis la loupe. Le fond est transparent, les ailes blanches opaques.
const poses = [
  { name: 'fly', column: 0, row: 0 },
  { name: 'wave', column: 1, row: 0 },
  { name: 'sleep', column: 0, row: 1 },
  { name: 'search', column: 1, row: 1 },
] as const

/** La largeur maximale des poses produites : plus de deux fois la plus grande taille affichée (200 points). */
const MASCOT_WIDTH = 480
/** Le poids maximal d'une pose (plan de R1). */
const MASCOT_MAX_BYTES = 60 * 1024

const { width = 0, height = 0 } = await sharp(sheet).metadata()
const cell = { width: Math.floor(width / 2), height: Math.floor(height / 2) }
mkdirSync(out('assets', 'mascot'), { recursive: true })

for (const pose of poses) {
  // Chaque étape repart d'un tampon : sharp applique sinon `trim` avant `extract`.
  const piece = await sharp(sheet)
    .extract({
      left: pose.column * cell.width,
      top: pose.row * cell.height,
      width: cell.width,
      height: cell.height,
    })
    .png()
    .toBuffer()
  const png = await sharp(piece)
    // Rogne le transparent autour de l'abeille : la pose occupe toute son image.
    .trim()
    // Au plus 480 de large, jamais agrandie : une pose plus étroite dans la planche (le vol fait
    // 430 pixels) garde sa taille, un agrandissement n'ajouterait aucun détail.
    .resize({ width: MASCOT_WIDTH, withoutEnlargement: true })
    // Une palette (des aplats d'encre, de miel et de blanc, et leurs bords adoucis) : deux fois plus
    // léger, sans différence visible sur ces dessins. Sans `quality` sous 100, sharp garde toutes
    // les couleurs et la palette ne sert à rien.
    .png({ palette: true, quality: 90, compressionLevel: 9, effort: 10 })
    .toBuffer()
  if (png.length > MASCOT_MAX_BYTES) throw new Error(`${pose.name}.png : ${png.length} octets`)
  writeFileSync(out('assets', 'mascot', `${pose.name}.png`), png)
}

// --- 2. Le favicon et l'icône -----------------------------------------------------------------------
// L'abeille seule (le « w » est illisible à 16 px), aux couleurs du logo de jour ; le favicon SVG
// passe aux couleurs de nuit quand le navigateur est en thème sombre (règle @media, sans script).
const { day, night } = palettes
const beeSvg = (title: string) =>
  [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${beeViewBox}">`,
    `<title>${title}</title>`,
    '<style>',
    `.honey{fill:${day.honey}}.wing{fill:${day.surface}}.ink{fill:${day.text}}`,
    '@media (prefers-color-scheme: dark){',
    `.honey{fill:${night.honey}}.wing{fill:${night.surface}}.ink{fill:${night.text}}}`,
    '</style>',
    // Même ordre que ui/Logo.tsx : le miel et les ailes passent sous l'encre.
    `<path class="honey" d="${bee.honey}"/>`,
    `<path class="wing" d="${bee.wing}"/>`,
    `<path class="ink" d="${bee.ink}"/>`,
    '</svg>',
    '',
  ].join('\n')

// Le titre du SVG (Biome l'exige, noSvgWithoutTitle) reste neutre : le nom affiché de l'appli ne
// s'écrit qu'à un endroit, packages/brand/src/name.ts.
const faviconSvg = beeSvg('Favicon')
mkdirSync(out('public'), { recursive: true })
writeFileSync(out('public', 'favicon.svg'), faviconSvg)

// Pour les PNG, sharp dessine le SVG sans la règle de nuit (il n'a pas de thème) : le jour.
const [, , boxWidth = 1, boxHeight = 1] = beeViewBox.split(' ').map(Number)
const beeFor = (size: number) =>
  sharp(Buffer.from(faviconSvg), { density: (72 * size) / Math.max(boxWidth, boxHeight) }).resize({
    width: size,
    height: size,
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })

// Le favicon des navigateurs qui ne lisent pas le SVG : 64 × 64, fond transparent.
writeFileSync(
  out('public', 'favicon.png'),
  await beeFor(64).png({ palette: true, compressionLevel: 9 }).toBuffer(),
)

// L'icône de l'appli sur téléphone (expo.icon, natif seulement) : 1024 × 1024, opaque (iOS refuse
// la transparence), l'abeille sur la Cire avec une marge, pour que l'arrondi du système ne la
// coupe pas.
const ICON = 1024
const BEE_IN_ICON = 680
const beeLayer = await beeFor(BEE_IN_ICON).png().toBuffer()
const wax = day.background
const composed = await sharp({
  create: { width: ICON, height: ICON, channels: 3, background: wax },
})
  .composite([{ input: beeLayer, gravity: 'centre' }])
  .png()
  .toBuffer()
// Une seconde passe retire la couche de transparence que l'assemblage ajoute (sharp appliquerait
// sinon `removeAlpha` avant l'assemblage).
writeFileSync(
  out('assets', 'icon.png'),
  await sharp(composed).removeAlpha().png({ compressionLevel: 9 }).toBuffer(),
)
