// Un titre de section suivi d'un nombre en discret : « Mes projets · 3 », « Projets · 50+ » (R3,
// page d'un membre), « Commentaires 6 » (R5b, sous un projet et en tête de la feuille). Le
// séparateur et le chiffre sont dessinés ici, une fois, plutôt que composés dans chaque écran.
//
// Deux noms pour une même chose : ce qu'on voit (« Mes projets · 3 ») et ce qu'on entend. Un lecteur
// d'écran prononcerait le « · » (« point médian ») et lirait « 50+ » « cinquante plus » ; le nom lu
// est donc « Mes projets, 3 projets », dont l'écran donne la seconde moitié (`spokenCount`), traduite
// et au bon pluriel (« 3 projets », « 50 projets ou plus »). Avec 0, le titre seul : ni « 0 » à
// voir, ni « 0 commentaire » à entendre (R5b).
//
// Une liste plafonnée (l'API n'envoie que les 50 premiers projets, PROJECT_LIST_MAX du contrat) ne
// connaît pas son vrai total : au plafond, l'écran passe `more`, et le nombre devient « 50+ ».
//
// Aucun mot ne se coupe en son milieu, même à 200 % de texte sur 320 points (R5b, « Commentaires (7) »
// des listes « À reprendre ») : le titre et son nombre reçoivent `wholeWords` (voir Text.tsx), et la
// taille descend juste assez pour que leur plus long bloc insécable tienne sur une ligne.
import { maxHeadingScale, maxTextScale } from '@ruche/brand'
import { type HeadingLevel, Text } from './Text'

// Le « · » entre deux espaces insécables : le nombre ne part jamais seul à la ligne suivante, et
// aucune ligne ne commence par le point. Écrites par leur numéro : l'outil d'écriture changerait
// une insécable tapée telle quelle en un caractère invisible à la relecture.
const NBSP = String.fromCodePoint(0xa0)
const separators = {
  dot: `${NBSP}·${NBSP}`,
  // Une espace ordinaire (R5b, ui-I3) : quand la ligne est pleine, le nombre passe à la ligne
  // entier, au lieu que le bloc insécable « Commentaires · 6 » ne se coupe au milieu du mot.
  space: ' ',
} as const

export function CountedTitle({
  title,
  count,
  more = false,
  spokenCount,
  level = 2,
  separator = 'dot',
  variant = 'heading',
  nativeID,
}: {
  /** Le titre de la section (« Mes projets »). */
  title: string
  /** Le nombre affiché après le titre ; avec 0, le titre seul. */
  count: number
  /** Le nombre est un plafond : il s'affiche « 50+ ». */
  more?: boolean
  /** Le nombre dit en toutes lettres, pour le nom lu (« 3 projets », « 50 projets ou plus »). */
  spokenCount: string
  /** Le niveau du titre dans la page (2 : une section). */
  level?: HeadingLevel
  /** Entre le titre et le nombre : « · » insécable (par défaut), ou une espace ordinaire. */
  separator?: 'dot' | 'space'
  /** La taille : un titre de section (par défaut), ou le grand titre d'une feuille (`title2`). */
  variant?: 'heading' | 'title2'
  /** L'identifiant du titre, pour qu'une fenêtre se nomme par lui (`aria-labelledby`). */
  nativeID?: string
}) {
  if (count === 0) {
    return (
      <Text variant={variant} heading={level} wholeWords={title} nativeID={nativeID}>
        {title}
      </Text>
    )
  }
  const number = `${separators[separator]}${count}${more ? '+' : ''}`
  const words = `${title}${number}`
  return (
    <Text
      variant={variant}
      heading={level}
      wholeWords={words}
      accessibilityLabel={`${title}, ${spokenCount}`}
      nativeID={nativeID}
    >
      {title}
      {/* Le nombre, dans le titre : même taille, même agrandissement (un grand titre de section
          grossit moins que le texte courant, voir Text.tsx), seule la couleur change. */}
      <Text
        variant={variant}
        tone="muted"
        wholeWords={words}
        maxScale={level <= 2 ? maxHeadingScale : maxTextScale}
      >
        {number}
      </Text>
    </Text>
  )
}
