// La carte d'un projet qui cherche des testeurs (refonte, tranche R3 : le carrousel « Ils cherchent
// des testeurs » d'Explorer). Sa photo, avec « Tester ↗ » posé dessus ; son titre et son auteur
// dessous. Deux liens frères, jamais l'un dans l'autre (relecture de l'interface, ui-4) :
// - la carte (photo, titre, auteur) ouvre la page du projet (`onOpen`, décision de Louis du
//   31/10/2026), nommée par le titre ;
// - « Tester » ouvre la démo par la page d'avertissement des liens externes : annoncé comme un site
//   externe (comme `TextLink external`), il est posé par-dessus la photo, à côté du lien de la carte
//   et non dedans.
import { layout, space } from '@ruche/brand'
import { View } from 'react-native'
import { Avatar } from './Avatar'
import { Pressed } from './Pressed'
import { type CoverImage, ProjectCover } from './ProjectCover'
import { TestLink } from './TestLink'
import { Text } from './Text'
import { useTapGuard } from './tapGuard'
import { useLayout } from './theme/layout'

type Props = {
  title: string
  /** Le nom affiché de l'auteur (« Sam Petit »). */
  author: string
  /** La photo de couverture ; sans photo, la lumière miel des couvertures. */
  image: CoverImage | null
  /** Ouvre la démo (l'écran passe par la page d'avertissement des liens externes). */
  onTest: () => void
  /**
   * Ouvre la page du projet : la photo et le titre deviennent un lien nommé par le titre. Sans
   * lui (le catalogue, un aperçu), la carte n'est pas touchable, seul « Tester » l'est.
   */
  onOpen?: () => void
}

// La largeur d'une carte : environ deux cartes et demie sur un téléphone (la troisième, coupée au
// bord, dit qu'on peut faire défiler), cinq sur un ordinateur. Tirée de la colonne latérale, pour
// rester proportionnée aux autres colonnes de l'appli : la moitié sur téléphone (160), les 4/5
// ailleurs (256).
const CARD_WIDTH = { compact: layout.sideColumn / 2, medium: layout.sideColumn * 0.8 }
// La photo, plus haute que large sur téléphone (4:3), plus panoramique sur ordinateur (5:3).
const COVER_RATIO = { compact: 3 / 4, medium: 3 / 5 }
// La pastille de l'auteur : deux fois le grand pas d'espacement, sous la taille d'une ligne.
const AUTHOR_DOT = space.xl

export function TesterCard({ title, author, image, onTest, onOpen }: Props) {
  const { sizeClass } = useLayout()
  const shape = sizeClass === 'compact' ? 'compact' : 'medium'
  const width = CARD_WIDTH[shape]
  const coverHeight = Math.round(width * COVER_RATIO[shape])
  const guard = useTapGuard()
  const test = guard(onTest)

  const body = (
    <View style={{ gap: space.sm }}>
      <ProjectCover height={coverHeight} radius="group" image={image} />
      <Text variant="headline" numberOfLines={2}>
        {title}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {/* Les initiales de l'auteur décorent : son nom est écrit à côté, on ne le lit qu'une fois. */}
        <View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Avatar name={author} source={null} label={author} size={AUTHOR_DOT} />
        </View>
        <View style={{ flexShrink: 1 }}>
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {author}
          </Text>
        </View>
      </View>
    </View>
  )

  return (
    <View style={{ width }}>
      {onOpen ? (
        // Le lien de la carte, nommé par le titre du projet ; l'anneau du clavier suit le rayon de
        // la photo.
        <Pressed label={title} role="link" radius="group" onPress={guard(onOpen)}>
          {body}
        </Pressed>
      ) : (
        body
      )}
      {/* Le calque de « Tester », frère du lien de la carte : posé à la place exacte de la photo,
          il laisse passer les tapes ailleurs que sur la pastille (box-none). */}
      {/* `pointerEvents` en propriété, jamais dans `style` : sur le web, react-native-web ne crée la
          règle qui rend ses enfants touchables (`>* { pointer-events: auto }`) qu'à partir de la
          propriété ; écrit dans le style, le calque entier prenait les clics de la photo. */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: coverHeight,
        }}
      >
        {/* La pastille miel commune (`TestLink`) : son nom lu (« Tester Carnet de cafés »), son
            avertissement de site externe et ses 44 points viennent d'elle. L'anneau du clavier se
            dessine autour de sa zone : le calque n'est pas rogné par la photo. Ici, elle se pose en
            bas à gauche, jamais plus large que la photo, même à 200 % de texte. */}
        <TestLink
          title={title}
          onPress={test}
          size="small"
          style={{
            position: 'absolute',
            left: space.xs,
            bottom: space.xs,
            maxWidth: width - 2 * space.xs,
          }}
        />
      </View>
    </View>
  )
}
