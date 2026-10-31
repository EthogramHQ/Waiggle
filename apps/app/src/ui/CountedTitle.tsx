// Un titre de section suivi d'un nombre en discret : « Mes projets · 3 », « Projets · 50+ » (R3,
// page d'un membre). Le « · » et le chiffre sont dessinés ici, une fois, plutôt que composés dans
// chaque écran.
//
// Deux noms pour une même chose : ce qu'on voit (« Mes projets · 3 ») et ce qu'on entend. Un lecteur
// d'écran prononcerait le « · » (« point médian ») et lirait « 50+ » « cinquante plus » ; le nom lu
// est donc « Mes projets, 3 projets », dont l'écran donne la seconde moitié (`spokenCount`), traduite
// et au bon pluriel (« 3 projets », « 50 projets ou plus »).
//
// Une liste plafonnée (l'API n'envoie que les 50 premiers projets, PROJECT_LIST_MAX du contrat) ne
// connaît pas son vrai total : au plafond, l'écran passe `more`, et le nombre devient « 50+ ».
import { type HeadingLevel, Text } from './Text'

// Des espaces insécables autour du « · » : le nombre ne part jamais seul à la ligne suivante, et
// aucune ligne ne commence par le point.
const SEPARATOR = ' · '

export function CountedTitle({
  title,
  count,
  more = false,
  spokenCount,
  level = 2,
}: {
  /** Le titre de la section (« Mes projets »). */
  title: string
  /** Le nombre affiché après le titre. */
  count: number
  /** Le nombre est un plafond : il s'affiche « 50+ ». */
  more?: boolean
  /** Le nombre dit en toutes lettres, pour le nom lu (« 3 projets », « 50 projets ou plus »). */
  spokenCount: string
  /** Le niveau du titre dans la page (2 : une section). */
  level?: HeadingLevel
}) {
  return (
    <Text variant="heading" heading={level} accessibilityLabel={`${title}, ${spokenCount}`}>
      {title}
      <Text variant="heading" tone="muted">{`${SEPARATOR}${count}${more ? '+' : ''}`}</Text>
    </Text>
  )
}
