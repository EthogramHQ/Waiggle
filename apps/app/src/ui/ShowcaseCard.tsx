// La carte d'un projet de la vitrine (tranche R12, planches R12-Visiteur-Accueil,
// R12-Visiteur-Desktop et R12-A-La-Une ; plan R12, décision 12) : la photo en plein cadre, le statut
// en haut à gauche (« Testable » en miel), et en bas un panneau de verre avec le titre et l'auteur.
// La même carte sert à l'accueil (« Des projets à voir ») et à « À la une », en tête d'Explorer.
//
// Toute la carte est un seul lien, nommé par le titre du projet : rien d'autre ne s'y touche (pas de
// « Tester », pas de lien vers l'auteur), un visiteur n'a qu'un geste, ouvrir le projet. L'auteur
// et le statut, écrits dans la carte, en sont la description (`aria-describedby` sur le web) : le
// lecteur d'écran dit le titre, puis « Testable, Papi Jean ».
//
// Sans photo, la couverture garde la lumière miel des projets sans visuel (`ProjectCover`), sans le
// titre écrit en grand dessus : il est déjà dans le panneau.
//
// Deux tailles :
// - `carousel` : une largeur fixe, pour une bande qui défile de côté (l'accueil sur téléphone, « À
//   la une ») ;
// - `fill` : la carte partage la rangée avec ses voisines, à parts égales (l'accueil sur ordinateur).
// Dans les deux cas, la hauteur donnée est un minimum : un titre de deux lignes ou un texte agrandi
// font grandir la carte au lieu de faire passer le panneau par-dessus le statut.
//
// Elle ne connaît pas l'API : l'écran lui donne des textes prêts (le statut traduit) et la photo.
//
// R12b (« Les exemples ») : le projet d'un compte d'exemples (`example`) porte la pastille
// « Exemple » à côté de son statut ; elle décrit le lien elle aussi, entre le statut et l'auteur
// (« Testable, Exemple, WaiggleBot »), pour qu'un lecteur d'écran ne prenne pas le projet pour un
// vrai.
import { layout, type ShadowName, space } from '@ruche/brand'
import { useId } from 'react'
import { View } from 'react-native'
import { Avatar } from './Avatar'
import { ExampleBadge } from './ExampleBadge'
import type { ImageSource } from './image'
import { Pressed } from './Pressed'
import { type CoverImage, ProjectCover } from './ProjectCover'
import { Row } from './Stack'
import { StatusPill } from './StatusPill'
import { Surface } from './Surface'
import { Text } from './Text'

type Props = {
  /** Le titre du projet : écrit dans le panneau, et nom du lien. */
  title: string
  /** L'auteur : son nom, et sa photo (null : ses initiales). */
  author: { name: string; avatar: ImageSource | null }
  /** La couverture (la première photo du projet) ; null : la lumière miel. */
  image: CoverImage | null
  /** Le statut, déjà traduit ; `strong` : en miel plein (« Testable », qui appelle au test). */
  status: { label: string; strong: boolean }
  /** Ouvre la page du projet. */
  onPress: () => void
  /** carousel : largeur fixe, dans une bande qui défile ; fill : une part égale de la rangée. */
  size?: 'carousel' | 'fill'
  /**
   * R12b : l'auteur est un compte d'exemples (`example: true` du contrat) ; la carte porte alors
   * « Exemple » à côté du statut. Absent ou faux : rien.
   */
  example?: boolean
}

/**
 * Les mesures des deux tailles, en points : la largeur d'une carte de bande (deux cartes et le bord
 * de la troisième sur un téléphone de 390 points, comme la planche) et la hauteur minimale.
 */
const SIZES = {
  carousel: { width: layout.sideColumn / 2 + space.sm, height: 220 },
  fill: { width: undefined, height: 300 },
} as const

/**
 * La place d'une carte de bande (R12, onglet « Vitrine de l'accueil ») : `ShowcaseSlot` et
 * `ShowcaseFreeSlot` prennent la même, pour que la place libre et la colonne d'une carte gardent la
 * largeur et la hauteur de la carte.
 */
export const SHOWCASE_CARD_SIZE = SIZES.carousel

/**
 * L'ombre de la carte, un nom de `packages/brand/src/shadows.ts` : un `Carousel` de ces cartes la
 * reçoit (`cardShadow`) pour lui garder sa place dessous (relecture de design R12, point 3).
 */
export const SHOWCASE_CARD_SHADOW = 'card' as const satisfies ShadowName

/** La photo de l'auteur, à la hauteur de la ligne de son nom (caption). */
const AVATAR_SIZE = 18

export function ShowcaseCard({
  title,
  author,
  image,
  status,
  onPress,
  size = 'carousel',
  example = false,
}: Props) {
  // Les identifiants des textes qui décrivent le lien : le statut, « Exemple » s'il est là, puis
  // l'auteur, dans l'ordre où l'œil les lit.
  const unique = useId()
  const statusId = `showcase-status-${unique}`
  const exampleId = `showcase-example-${unique}`
  const authorId = `showcase-author-${unique}`
  const describedIds = [statusId, example ? exampleId : null, authorId].filter(Boolean).join(' ')
  const { width, height } = SIZES[size]
  return (
    <View
      // `fill` : une part égale de la rangée (base nulle, puis toute la place libre), sans jamais
      // déborder (minWidth 0 : sans lui, un long titre élargirait sa carte aux dépens des voisines).
      style={
        width === undefined
          ? { flexGrow: 1, flexBasis: 0, minWidth: 0 }
          : { width, maxWidth: '100%' }
      }
    >
      <Pressed
        label={title}
        role="link"
        onPress={onPress}
        describedBy={describedIds}
        radius="sheet"
      >
        <ProjectCover
          height={height}
          grow
          image={image}
          shadow={SHOWCASE_CARD_SHADOW}
          radius="sheet"
        >
          {/* Le statut en haut, le panneau en bas ; la place entre eux est la photo. */}
          <View
            style={{
              flexGrow: 1,
              justifyContent: 'space-between',
              padding: space.sm,
              gap: space.sm,
            }}
          >
            {/* Le statut et « Exemple » côte à côte ; sur une carte étroite ou à texte agrandi,
                « Exemple » passe sous le statut plutôt que de déborder. */}
            <Row gap="xs" align="start" wrap>
              <StatusPill label={status.label} strong={status.strong} nativeID={statusId} />
              {example ? <ExampleBadge nativeID={exampleId} /> : null}
            </Row>
            <Surface variant="panel" radius="panel" padding="md" gap="xs">
              <Text variant="callout" weight={700} numberOfLines={2}>
                {title}
              </Text>
              <Row gap="xs" align="center">
                {/* La photo décore le nom, lu juste à côté : sans nom lu à part. */}
                <Avatar name={author.name} source={author.avatar} label="" size={AVATAR_SIZE} />
                {/* Un nom de membre ne se coupe jamais par « … » : deux lignes au plus, et la
                    colonne du nom rétrécit à côté de la photo (charte du design, 1/11). */}
                <View style={{ flexShrink: 1, minWidth: 0 }}>
                  <Text variant="caption" tone="secondary" numberOfLines={2} nativeID={authorId}>
                    {author.name}
                  </Text>
                </View>
              </Row>
            </Surface>
          </View>
        </ProjectCover>
      </Pressed>
    </View>
  )
}
