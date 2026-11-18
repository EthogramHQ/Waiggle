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
import { borders, layout, radii, type ShadowName, space } from '@ruche/brand'
import { type ReactNode, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import Animated from 'react-native-reanimated'
import { Avatar } from './Avatar'
import { useCoverSource } from './coverTransition'
import { ExampleBadge } from './ExampleBadge'
import type { ImageSource } from './image'
import { Pressed } from './Pressed'
import { type CoverImage, ProjectCover } from './ProjectCover'
import { Shape, SkeletonSurface } from './Skeleton'
import { Row } from './Stack'
import { StatusPill } from './StatusPill'
import { Surface } from './Surface'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

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
  /**
   * R17 (« La carte qui devient la page ») : l'identifiant du projet. Avec lui, la photo de la carte
   * vole jusqu'à la couverture de la page du projet (`useCoverSource`), et la carte rebondit au
   * Retour du navigateur (R14). Absent (le catalogue, un aperçu) : la carte ouvre simplement.
   */
  coverId?: string
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
  coverId,
}: Props) {
  // La carte qui devient la page (R4, R17). Un hook s'appelle toujours, dans le même ordre (règle
  // des hooks de React) : sans `coverId`, sous un identifiant vide qu'aucune page ne porte, et
  // `capture` ni `ref` ne servent.
  const cover = useCoverSource(coverId ?? '')
  const open = coverId ? () => cover.capture(onPress) : onPress
  // Les identifiants des textes qui décrivent le lien : le statut, « Exemple » s'il est là, puis
  // l'auteur, dans l'ordre où l'œil les lit.
  const { t } = useTranslation()
  const unique = useId()
  const statusId = `showcase-status-${unique}`
  const exampleId = `showcase-example-${unique}`
  const authorId = `showcase-author-${unique}`
  const describedIds = [statusId, example ? exampleId : null, authorId].filter(Boolean).join(' ')
  const { width, height } = SIZES[size]
  return (
    <Animated.View
      // `fill` : une part égale de la rangée (base nulle, puis toute la place libre), sans jamais
      // déborder (minWidth 0 : sans lui, un long titre élargirait sa carte aux dépens des voisines).
      // R14 : le rebond du Retour du navigateur, une échelle à 1 le reste du temps.
      style={[
        width === undefined
          ? { flexGrow: 1, flexBasis: 0, minWidth: 0 }
          : { width, maxWidth: '100%' },
        cover.bounceStyle,
      ]}
    >
      <Pressed
        label={title}
        role="link"
        onPress={open}
        describedBy={describedIds}
        // Sur téléphone, `describedBy` ne vaut rien (aria.ts) : « Exemple » passe par l'indice du
        // lien, comme dans TesterCard (relecture de l'interface de R12b).
        {...(example ? { hint: t(($) => $.common.example) } : null)}
        radius="sheet"
      >
        {/* La carte, à sa hauteur minimale, grandit avec son texte. R17 : la photo est sur une
            couche à elle, posée sous le statut et le panneau (comme dans ProjectCard) : c'est elle
            seule qui vole jusqu'à la page du projet, sans le verre ni le statut. */}
        <View style={{ minHeight: height, flexGrow: 1 }}>
          {/* La photo garde son nom lu, comme avant (le test « named for screen readers »). */}
          <View ref={coverId ? cover.ref : undefined} style={{ position: 'absolute', inset: 0 }}>
            <ProjectCover
              height={height}
              grow
              image={image}
              shadow={SHOWCASE_CARD_SHADOW}
              radius="sheet"
            />
          </View>
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
        </View>
      </Pressed>
    </Animated.View>
  )
}

/** Les formes de la carte vide : la ligne du titre, celle de l'auteur, en points. */
const SKELETON_LINE = 14

/**
 * R16 (« Les squelettes », planche R16-Visiteur) : la carte vide de la vitrine, à la place d'une
 * carte qui arrive, à ses mesures exactes (celles de `SIZES`, partagées avec la vraie carte) : la
 * bande garde sa hauteur, rien ne pousse le bas de la page. Une carte vide (`SkeletonSurface`, avec
 * sa lueur) et, en bas, un panneau plein à la place du verre : la ligne du titre, puis la photo et
 * le nom de l'auteur. Le statut n'a pas de forme : la planche n'en dessine pas.
 *
 * Ni rôle ni nom : le `Loading` de l'écran (« Chargement… ») enveloppe toute la bande, une fois.
 * `column` : le rang de la carte dans sa bande, le retard de sa lueur (150 ms par colonne).
 */
export function ShowcaseCardSkeleton({
  size = 'carousel',
  column = 0,
}: {
  size?: 'carousel' | 'fill'
  column?: number
}): ReactNode {
  const { colors } = useTheme()
  const { width, height } = SIZES[size]
  return (
    <View
      // Les mêmes largeurs que la vraie carte : fixe dans une bande, une part égale de la rangée.
      style={
        width === undefined
          ? { flexGrow: 1, flexBasis: 0, minWidth: 0 }
          : { width, maxWidth: '100%' }
      }
    >
      <SkeletonSurface height={height} column={column}>
        <View style={{ flexGrow: 1, justifyContent: 'flex-end', padding: space.sm }}>
          {/* Le verre, plein, aux coins et aux marges du panneau, bordé du filet du vrai verre
              (`panelBorder`), dans le rôle du panneau d'une carte vide (`skeletonPanel`), comme
              `ProjectCardSkeleton` : de nuit, la feuille (`sheet`) avait la couleur exacte de la
              carte vide et s'y confondait (planche R16-Nuit-390). */}
          <View
            style={{
              gap: space.sm,
              padding: space.md,
              borderRadius: radii.panel,
              borderWidth: borders.hairline,
              borderColor: colors.panelBorder,
              backgroundColor: colors.skeletonPanel,
            }}
          >
            <Shape height={SKELETON_LINE} width="70%" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
              <Shape height={AVATAR_SIZE} width={AVATAR_SIZE} round />
              <Shape height={SKELETON_LINE - 2} width="45%" />
            </View>
          </View>
        </View>
      </SkeletonSurface>
    </View>
  )
}
