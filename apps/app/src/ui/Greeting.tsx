// Le salut d'un écran d'accueil (R4, planche R4-Fil-Premier) : la mascotte qui fait coucou, puis,
// à sa droite, le salut en miel (« Bonjour Inès ! ») et une phrase qui dit quoi faire. Au premier
// lancement, il remplace le fil encore vide.
//
// R11 (« Moins de mots ») : sans `title`, le salut est lui-même le titre de la section (niveau 2) :
// plus de « Ton fil t'attend » qui le redit. Avec un `title`, c'est lui le titre et le salut reste
// une ligne d'accroche.
//
// Quand la place manque (téléphone de 320 points, texte agrandi), les textes passent sous la
// mascotte au lieu de se serrer à côté d'elle : la rangée passe à la ligne (flexWrap), et les
// textes ne descendent jamais sous TEXT_MIN points de large.
import { space } from '@ruche/brand'
import { View } from 'react-native'
import { Mascot } from './Mascot'
import { type HeadingLevel, Text } from './Text'

/** La largeur sous laquelle les textes passent sous la mascotte, en points. */
const TEXT_MIN = 200

type Props = {
  /** Le salut, au nom du membre (« Bonjour Inès ! »). */
  hello: string
  /** Un titre sous le salut. Absent, c'est le salut qui est le titre. */
  title?: string
  body: string
  /** Le niveau du titre : 2, sous le titre de la page (« Fil »), par défaut. */
  level?: HeadingLevel
}

export function Greeting({ hello, title, body, level = 2 }: Props) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: space.lg,
      }}
    >
      {/* Décorative : le titre dit déjà tout, l'abeille n'a rien à ajouter au lecteur d'écran. */}
      <Mascot pose="wave" size="sm" decorative />
      {/* flexGrow et une base réelle (et non flex: 1, dont la base nulle empêcherait le passage à la
          ligne) : les textes prennent la place restante, et passent dessous sous TEXT_MIN. */}
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: TEXT_MIN, minWidth: 0, gap: space.xs }}>
        {/* breakAnywhere : un mot plus large que la colonne (texte à 200 %) se coupe plutôt que
            d'être rogné. */}
        {title ? (
          <>
            <Text variant="headline" tone="accent">
              {hello}
            </Text>
            <Text variant="title3" heading={level} breakAnywhere>
              {title}
            </Text>
          </>
        ) : (
          <Text variant="title3" tone="accent" heading={level} breakAnywhere>
            {hello}
          </Text>
        )}
        <Text tone="secondary">{body}</Text>
      </View>
    </View>
  )
}
