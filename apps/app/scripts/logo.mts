// Fabrique src/ui/logo.generated.ts, le logo vectoriel de l'appli (l'abeille dont le vol écrit
// le « w »), à partir de deux fichiers texte relisibles du dossier scripts/logo/ :
// - abeille.svg : l'abeille, en trois tracés par rôle de couleur (`ink` l'encre, `honey` le miel,
//   `wing` les ailes), sans couleur ni script ;
// - chemin-centre.txt : la ligne centrale du « w » (73 points), son épaisseur et sa longueur,
//   mesurées sur l'image du logo (1194 × 653 pixels).
// Lancer `node scripts/logo.mts` depuis apps/app après avoir changé l'un des deux. Le fichier
// produit est enregistré dans le dépôt.
//
// D'où viennent ces deux fichiers (fait une fois, hors du dépôt, le 29/10/2026) :
// 1. L'abeille est décalquée de l'image validée par Louis (`abeille-jour.png`, 479 × 479, le logo
//    recadré à partir du point (715, 5)), qui reste hors du dépôt. Le décalque a tourné dans un
//    dossier temporaire, avec un package.json jetable (imagetracerjs, domaine public, et pngjs) :
//    aucun outil de décalque n'entre dans le dépôt ni dans pnpm-lock.yaml (potrace, l'autre
//    candidat, est sous GPL-2.0 seule, incompatible avec l'AGPL).
//    a. l'image est agrandie trois fois (interpolation bilinéaire), pour des bords plus fins que
//       le pixel ;
//    b. chaque point opaque prend le rôle de la couleur la plus proche ; un gris (le bord adouci
//       entre l'encre et une aile) va à l'encre ou à l'aile, jamais au miel ;
//    c. le départ du « w », qui sort sous l'abeille, est retiré : l'encre proche de la ligne
//       centrale et à plus de 26 px du miel (l'épaisseur du contour) ;
//    d. le miel et les ailes sont élargis d'un pixel, pour passer sous l'encre sans jour entre
//       les couches ;
//    e. chaque masque est adouci (flou puis seuil à la moitié, qui efface les marches
//       d'escalier), puis décalqué (imagetracerjs, tolérances 1) ; les coordonnées reviennent
//       dans le repère du logo, arrondies au dixième ;
//    f. relu sur une planche à 2 × : un seul tracé d'encre (les ailes et les anneaux sont ses
//       trous), trois pièces de miel, deux ailes, aucune miette. Le bas du ventre, là où sortait
//       le chemin, est un peu plus plat que l'original : le chemin le recouvre dans le logo.
// 2. La ligne centrale est copiée telle quelle des outils du chargement (`chemin-centre.txt`) ;
//    elle a été mesurée sur la même image.
//
// Ce que le script calcule (comme l'outil du prototype de chargement, `loop-snake.cjs`) :
// - `trail`, le « w » : une courbe lisse qui passe par les points de la ligne centrale
//   (Catmull-Rom convertie en courbes de Bézier cubiques : sans elle, le trait fait des angles à
//   chaque point), sans les 3 derniers points (ils tombent dans le bout arrondi du trait et
//   dévient), prolongée de 30 à son début pour retrouver le bout arrondi de l'original ;
// - `flight`, le vol de l'abeille au lancement : 170 d'élan avant le « w », le « w », puis une
//   sortie qui finit à l'horizontale ; `restOffset` est la fraction de ce vol où elle se pose
//   (c'est le logo) ;
// - `viewBox` (le logo entier) et `beeViewBox` (l'abeille seule, dans un carré), au plus juste.
//
// Règles de sécurité (relecture du plan de R1) : ce script n'importe rien de src/, ne lance aucun
// programme, n'écrit qu'à un chemin fixe ; le fichier produit ne contient que des données
// (« export const nom = <JSON> as const »), vérifié par src/asset-rules.test.ts.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

type Point = [number, number]

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = (name: string) => readFileSync(join(root, 'scripts', 'logo', name), 'utf8')

// --- L'abeille : les trois tracés, lus par leur identifiant ---------------------------------------
const svg = source('abeille.svg')
const beePath = (id: string): string => {
  const match = new RegExp(`<path id="${id}" d="([^"]+)"`).exec(svg)
  if (!match?.[1]) throw new Error(`abeille.svg : tracé « ${id} » introuvable`)
  return match[1].replace(/\s+/g, ' ').trim()
}
const bee = { ink: beePath('ink'), honey: beePath('honey'), wing: beePath('wing') }

// --- Le chemin -------------------------------------------------------------------------------------
const centre = JSON.parse(source('chemin-centre.txt')) as { thick: number; d: string }
const trailPoints: Point[] = centre.d
  .slice(1)
  .split(' L')
  .map((pair) => pair.trim().split(' ').map(Number) as Point)

const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1])
const direction = (a: Point, b: Point): Point => {
  const length = distance(a, b)
  return [(b[0] - a[0]) / length, (b[1] - a[1]) / length]
}
const along = (p: Point, d: Point, k: number): Point => [p[0] + d[0] * k, p[1] + d[1] * k]

const points = trailPoints.slice(0, -3)
const first = points[0] as Point
const last = points[points.length - 1] as Point
const at = (i: number) => points[i] as Point
// La direction d'arrivée se prend sur les 3 derniers segments, celle du départ sur le premier.
const arrival = direction(at(points.length - 4), last)
const departure = direction(at(1), first)

// Catmull-Rom → Bézier : chaque segment [p1, p2] reçoit deux points de contrôle, tirés de ses
// voisins p0 et p3 ; aux bouts, un voisin imaginaire prolonge la ligne.
const before: Point = [2 * first[0] - at(1)[0], 2 * first[1] - at(1)[1]]
const after = along(last, arrival, distance(at(points.length - 2), last))
type Segment = [Point, Point, Point, Point]
const segments: Segment[] = points.slice(0, -1).map((p1, i) => {
  const p0 = i ? at(i - 1) : before
  const p2 = at(i + 1)
  const p3 = points[i + 2] ?? after
  return [
    p1,
    [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
    [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
    p2,
  ]
})
const cubic = (s: Segment, t: number): Point => {
  const u = 1 - t
  const c = (j: 0 | 1) =>
    u * u * u * s[0][j] + 3 * u * u * t * s[1][j] + 3 * u * t * t * s[2][j] + t * t * t * s[3][j]
  return [c(0), c(1)]
}
// Longueur d'une courbe, mesurée en la découpant en petits segments droits.
const lengthOf = (curve: (t: number) => Point, steps: number) => {
  let total = 0
  let previous = curve(0)
  for (let i = 1; i <= steps; i++) {
    const p = curve(i / steps)
    total += distance(previous, p)
    previous = p
  }
  return total
}
const smoothLength = segments.reduce((sum, s) => sum + lengthOf((t) => cubic(s, t), 40), 0)

const f = (n: number) => String(Math.round(n * 10) / 10)
const pt = (p: Point) => `${f(p[0])} ${f(p[1])}`
const smooth = segments.map((s) => ` C${pt(s[1])} ${pt(s[2])} ${pt(s[3])}`).join('')

const START = 30
const trail = `M${pt(along(first, departure, START))} L${pt(first)}${smooth}`

// Le vol : l'élan, le « w », puis une sortie (Bézier quadratique) qui part dans l'axe du chemin et
// finit à l'horizontale.
const LEAD = 170
const exitControl = along(last, arrival, 150)
const exitEnd: Point = [exitControl[0] + 150, exitControl[1]]
const exitLength = lengthOf((t) => {
  const u = 1 - t
  return [
    u * u * last[0] + 2 * u * t * exitControl[0] + t * t * exitEnd[0],
    u * u * last[1] + 2 * u * t * exitControl[1] + t * t * exitEnd[1],
  ]
}, 400)
const flight = `M${pt(along(first, departure, LEAD))} L${pt(first)}${smooth} Q${pt(exitControl)} ${pt(exitEnd)}`
const restOffset =
  Math.round(((LEAD + smoothLength) / (LEAD + smoothLength + exitLength)) * 1e4) / 1e4

// --- Les cadres ------------------------------------------------------------------------------------
type Box = [number, number, number, number]
const boxOf = (ps: Point[], margin = 0): Box => [
  Math.min(...ps.map((p) => p[0])) - margin,
  Math.min(...ps.map((p) => p[1])) - margin,
  Math.max(...ps.map((p) => p[0])) + margin,
  Math.max(...ps.map((p) => p[1])) + margin,
]
const pathPoints = (d: string): Point[] => {
  const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  return n.flatMap((x, i) => (i % 2 === 0 ? [[x, n[i + 1] as number] as Point] : []))
}
const beeBox = boxOf(pathPoints(bee.ink))
// Le trait : ses points, échantillonnés, élargis de sa demi-épaisseur (bouts ronds compris).
const trailSamples: Point[] = [
  along(first, departure, START),
  ...segments.flatMap((s) => [0, 0.25, 0.5, 0.75, 1].map((t) => cubic(s, t))),
]
const trailBox = boxOf(trailSamples, centre.thick / 2)
const outward = (b: Box): Box => [
  Math.floor(b[0]),
  Math.floor(b[1]),
  Math.ceil(b[2]),
  Math.ceil(b[3]),
]
const toViewBox = (b: Box) => `${b[0]} ${b[1]} ${b[2] - b[0]} ${b[3] - b[1]}`
const full = outward([
  Math.min(beeBox[0], trailBox[0]),
  Math.min(beeBox[1], trailBox[1]),
  Math.max(beeBox[2], trailBox[2]),
  Math.max(beeBox[3], trailBox[3]),
])
// L'abeille seule, au centre d'un carré (une icône, un favicon).
const beeSide = Math.max(beeBox[2] - beeBox[0], beeBox[3] - beeBox[1])
const beeCentre: Point = [(beeBox[0] + beeBox[2]) / 2, (beeBox[1] + beeBox[3]) / 2]
const beeSquare = outward([
  beeCentre[0] - beeSide / 2,
  beeCentre[1] - beeSide / 2,
  beeCentre[0] + beeSide / 2,
  beeCentre[1] + beeSide / 2,
])

// --- Le fichier produit ----------------------------------------------------------------------------
// Une déclaration par ligne, en JSON pur. Biome ne les reformate pas (sinon il passerait les
// guillemets en apostrophes et ajouterait des virgules finales : ce ne serait plus du JSON).
const declare = (name: string, value: unknown, about: string) =>
  `// ${about}\n// biome-ignore format: données fabriquées, en JSON (src/asset-rules.test.ts)\nexport const ${name} = ${JSON.stringify(value)} as const\n`

const output = [
  '// Fichier fabriqué par scripts/logo.mts : ne pas le modifier à la main.',
  "// Le logo de l'appli en données : des tracés SVG dans le repère de l'image d'origine",
  '// (1194 × 653). Les couleurs sont dans Logo.tsx, par rôle ; ici, aucune couleur ni aucun code.',
  '',
  declare('viewBox', toViewBox(full), 'Le cadre du logo entier (le « w » et l’abeille).'),
  declare('beeViewBox', toViewBox(beeSquare), 'Le cadre de l’abeille seule, carré.'),
  declare('trailWidth', Math.round(centre.thick * 100) / 100, 'L’épaisseur du « w ».'),
  declare('trail', trail, 'Le « w », un trait aux bouts ronds de l’épaisseur trailWidth.'),
  declare('trailPoints', trailPoints, 'Les points de la ligne centrale du « w », dans l’ordre.'),
  declare(
    'beeAnchor',
    last.map((n) => Math.round(n * 10) / 10),
    'Le bout du « w », sous l’abeille.',
  ),
  declare('bee', bee, 'L’abeille, par rôle : l’encre (contour et anneaux), le miel, les ailes.'),
  declare('flight', flight, 'Le vol du lancement : l’élan, le « w », la sortie à l’horizontale.'),
  declare('restOffset', restOffset, 'La fraction du vol où l’abeille se pose : le logo.'),
].join('\n')

const target = join(root, 'src', 'ui', 'logo.generated.ts')
writeFileSync(target, output)
console.log(`logo written to src/ui/logo.generated.ts (restOffset ${restOffset})`)
