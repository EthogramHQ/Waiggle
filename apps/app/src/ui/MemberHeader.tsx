// L'en-tête de la page d'un membre : son avatar, son nom et son pseudo, sa bio et ses outils
// favoris, chacun menant à la page de son étiquette (un « Autre », hors du catalogue, en texte
// simple : R6b). Le compte d'exemples de l'équipe (R12b) : « Exemple » à côté du nom, et dessous la
// phrase qui dit ses projets fictifs.
//
// Deux formes (R15, planche R15-Membre-1920) :
// - par défaut, l'en-tête de toujours, centré, au-dessus des projets (téléphone, tablette) ;
// - `layout="column"`, la colonne du profil à gauche de la page sur ordinateur : une bannière floue
//   tirée de sa photo, la photo qui en chevauche le bas, puis le nom, le pseudo, la bio, les outils
//   et les actions, rangés à gauche, comme une fiche qu'on lit de haut en bas.
// R16 : `MemberHeaderSkeleton`, le même en-tête pendant que la page charge (en bas du fichier).
import { borders, layout as layoutTokens, radii, readableWidth, space } from '@ruche/brand'
import type { ReactNode, Ref } from 'react'
import { Image, View } from 'react-native'
import { Avatar } from './Avatar'
import { DelayedShapes } from './DelayedShapes'
import { ExampleBadge } from './ExampleBadge'
import type { Focusable } from './focus'
import type { ImageSource } from './image'
import { TextLineShape } from './ListGroup'
import { ProjectCover } from './ProjectCover'
import { Shape, SkeletonSurface } from './Skeleton'
import { Stack } from './Stack'
import { Tag } from './Tag'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  name: string
  /** Son pseudo, déjà mis en forme par l'écran (« @lea »), affiché sous le nom. */
  handle?: string
  avatar: ImageSource | null
  bio: string
  /** Le titre de la liste des outils (« Outils favoris »). */
  toolsTitle: string
  /**
   * Les outils ; sans `onPress`, une simple pastille (le profil d'un compte suspendu, tranche 7c,
   * où seuls les noms des outils sont connus, pas leur étiquette). R6b : `inCatalogue: false`, un
   * « Autre » (pas encore au catalogue, sans page) : texte simple, jamais un lien, même avec
   * `onPress`, lu « Teachable Machine, autre outil, pas encore dans le catalogue » (voir `Tag`).
   */
  tools: { label: string; onPress?: (() => void) | undefined; inCatalogue?: boolean }[]
  /** Un bouton sous l'en-tête (« Modifier mon profil », sur sa propre page). */
  action?: ReactNode
  /**
   * Le niveau du nom : 1 (par défaut), le titre de la page du membre ; 2 quand l'en-tête est un
   * aperçu posé dans une page qui a déjà son titre ; 3 quand cet aperçu a lui-même sa légende en
   * niveau 2 (« Aperçu de ta page », dans la feuille « Mon profil », tranche R2).
   */
  heading?: 1 | 2 | 3
  /**
   * Pour poser le focus sur le nom (le titre) : l'aperçu « comme un visiteur » le lui donne à son
   * ouverture, le bouton touché ayant disparu (relecture de design R12, point 2). Sans elle, le nom
   * n'est pas une étape du focus.
   */
  nameRef?: Ref<Focusable> | undefined
  /**
   * R12b, le compte d'exemples de l'équipe : la phrase dite sous le nom (« Les projets de ce compte
   * sont fictifs… », déjà traduite par l'écran). Donnée, la pastille « Exemple » se pose aussi à
   * côté du nom ; absente (tout autre membre), ni l'une ni l'autre.
   */
  exampleNote?: string | undefined
  /**
   * R15 : `column`, la colonne du profil sur ordinateur (bannière floue, tout rangé à gauche).
   * Absente, l'en-tête centré de toujours. L'écran choisit (après l'hydratation, sur la largeur) :
   * l'en-tête ne mesure rien lui-même.
   */
  layout?: 'column' | undefined
}

/** La photo de la colonne (R15) : plus grande que celle de l'en-tête centré, elle ouvre la fiche. */
const COLUMN_AVATAR = 128
/** L'anneau de verre autour d'elle, qui la détache de la bannière floue (comme `AvatarCover`). */
const RING = space.sm
/** La hauteur de la bannière : la moitié haute de la photo la chevauche, l'autre en dépasse. */
const BANNER = 176
/** Le flou de la bannière : assez fort pour qu'on n'y lise plus rien, que des couleurs. */
const BLUR = 28

export function MemberHeader({
  name,
  handle,
  avatar,
  bio,
  toolsTitle,
  tools,
  action,
  heading = 1,
  nameRef,
  exampleNote,
  layout,
}: Props) {
  const column = layout === 'column'
  // Centré dans l'en-tête de toujours ; dans la colonne, aucun alignement imposé : le texte part
  // de la gauche (de la droite dans une langue qui s'écrit de droite à gauche).
  const textAlign = column ? undefined : 'center'
  // Le nom du membre est le titre de sa page (niveau 1), ou celui de l'aperçu (2). Dans la colonne,
  // plus grand : il porte la page à lui seul, comme sur la planche.
  const title = (
    <Text
      variant={column ? 'display' : 'title1'}
      align={textAlign}
      heading={heading}
      breakAnywhere
      {...(nameRef ? { focusRef: nameRef } : null)}
    >
      {name}
    </Text>
  )
  // La bio et la phrase du compte d'exemples : une longueur de ligne confortable (readableWidth),
  // centrées sous le nom dans l'en-tête de toujours ; dans la colonne, sur toute sa largeur.
  const readable = column ? null : ({ maxWidth: readableWidth, alignSelf: 'center' } as const)
  return (
    // Dans la colonne, tout s'étire (`stretch`) : les textes se replient sur la largeur de la
    // colonne et partent de la gauche (un alignement à gauche les réduirait à leur plus long mot).
    <Stack gap="lg" align={column ? 'stretch' : 'center'}>
      {column ? (
        <ColumnPhoto name={name} source={avatar} />
      ) : (
        <Avatar name={name} source={avatar} label={name} size={96} />
      )}
      {/* align="stretch" : le nom et la bio prennent toute la largeur et se replient, même un nom
          très long sans espace. */}
      <Stack gap="sm" align="stretch">
        {/* Le pseudo colle au nom (écart minimal) : il le précise, comme un second nom. */}
        <Stack gap="xxs" align="stretch">
          {/* R12b : le compte d'exemples, « Exemple » à côté du nom, sur une rangée qui passe à la
              ligne (centrée, ou à gauche dans la colonne). Le nom garde toute la largeur s'il est
              long (`maxWidth`, il se replie) et la pastille descend dessous ; une vue sans réglage
              l'entoure, pour que la rangée la centre en hauteur sur le nom (elle-même se range en
              haut, `alignSelf`). */}
          {exampleNote ? (
            <Stack
              direction="row"
              wrap
              justify={column ? 'start' : 'center'}
              align="center"
              gap="sm"
            >
              <View style={{ flexShrink: 1, maxWidth: '100%' }}>{title}</View>
              <View>
                <ExampleBadge />
              </View>
            </Stack>
          ) : (
            title
          )}
          {/* En discret (gris, plus petit) : le nom reste ce qu'on lit d'abord. Un pseudo n'a
              pas d'espace : breakAnywhere le coupe s'il dépasse, à texte agrandi. */}
          {handle ? (
            <Text variant="callout" tone="muted" align={textAlign} breakAnywhere selectable>
              {handle}
            </Text>
          ) : null}
        </Stack>
        {/* R12b : sous le nom, en discret (petit, gris), ce que la pastille ne dit pas : les
            projets du compte sont fictifs. Avant la bio, à la même largeur de lecture. */}
        {exampleNote ? (
          <View style={readable}>
            <Text variant="caption" tone="muted" align={textAlign}>
              {exampleNote}
            </Text>
          </View>
        ) : null}
        {bio ? (
          <View style={readable}>
            <Text tone="secondary" align={textAlign}>
              {bio}
            </Text>
          </View>
        ) : null}
      </Stack>
      {tools.length > 0 ? (
        <Stack gap="sm" align={column ? 'stretch' : 'center'}>
          <Text variant="caption" weight={600} tone="muted">
            {toolsTitle}
          </Text>
          <Stack direction="row" gap="sm" wrap justify={column ? 'start' : 'center'}>
            {tools.map((tool) => (
              <Tag
                key={tool.label}
                label={tool.label}
                {...(tool.onPress ? { onPress: tool.onPress } : null)}
                {...(tool.inCatalogue === false ? { inCatalogue: false } : null)}
              />
            ))}
          </Stack>
        </Stack>
      ) : null}
      {action}
    </Stack>
  )
}

/**
 * R15 : le haut de la colonne du profil. Une bannière, la photo floutée jusqu'à n'être plus que ses
 * couleurs (sans photo, la lumière miel des couvertures) ; par-dessus son bas, à gauche, la photo nette dans un anneau
 * de verre. La bannière est un décor tiré de la photo : cachée aux lecteurs d'écran, qui lisent la
 * photo nette, nommée.
 */
function ColumnPhoto({ name, source }: { name: string; source: ImageSource | null }) {
  const { colors } = useTheme()
  return (
    <View>
      <View
        style={{
          height: BANNER,
          borderRadius: radii.tile,
          overflow: 'hidden',
          backgroundColor: colors.honeySoft,
        }}
      >
        {source ? (
          // Agrandie un peu (scale) : le flou laisse sinon un bord clair sur les côtés.
          <Image
            source={source}
            blurRadius={BLUR}
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              transform: [{ scale: 1.3 }],
            }}
          />
        ) : (
          // Sans photo, la lumière miel des couvertures sans image (relecture de design de R15) :
          // le miel pâle seul, sur la crème du jour, se lisait comme un cadre vide ou une image
          // cassée. La couverture décore (sans titre, elle ne dit rien) ; la bannière la rogne.
          <ProjectCover height={BANNER} radius="none" image={null} />
        )}
      </View>
      {/* La photo remonte sur la bannière (marge négative) de la moitié de sa hauteur, rangée à
          gauche avec un peu d'air : elle chevauche le bord, comme sur la planche. */}
      <View
        style={{
          alignSelf: 'flex-start',
          marginTop: -(COLUMN_AVATAR / 2 + RING),
          marginLeft: space.lg,
          padding: RING,
          borderRadius: radii.pill,
          backgroundColor: colors.glass,
          borderWidth: borders.hairline,
          borderColor: colors.glassBorder,
        }}
      >
        <Avatar name={name} source={source} label={name} size={COLUMN_AVATAR} />
      </View>
    </View>
  )
}

/** Les étiquettes d'outils vides : trois, à la hauteur dessinée d'une étiquette (`Tag`). */
const SKELETON_TOOLS = [72, 88, 64] as const
/** La largeur du bouton vide sous l'en-tête (« Suivre Léa »), quand il ne prend pas toute la ligne. */
const SKELETON_ACTION = 152
/** La largeur de la ligne vide des abonnés, celle de « 12 abonnés » écrit en `callout`. */
const SKELETON_FOLLOWERS = 88

/**
 * R16 (plan, choix 4 et 10 ; planches R16-Membre-1440 et 390) : l'en-tête d'un membre pendant que
 * sa page charge, dans ses deux formes (`layout`, comme `MemberHeader`) : la colonne du profil sur
 * ordinateur, l'en-tête centré ailleurs. Les mêmes places et les mêmes hauteurs que l'en-tête qui
 * arrive : la photo, le nom, puis en formes vides le pseudo, deux lignes de bio, le titre et trois
 * étiquettes d'outils, et le bouton d'action (`action={false}` pour l'omettre).
 *
 * Ouverte depuis une carte, la page connaît déjà le nom et la photo (l'aperçu, `useMemberPreview`) :
 * donnés (`name`, `avatar`), ils s'affichent pour de vrai, le nom en titre de la page. L'écran pose
 * alors cet en-tête **hors** de son `Loading` (le nom se lit, il n'attend rien). Sans eux, tout est
 * formes, sans rôle ni nom à elles : le `Loading` de l'écran les nomme.
 *
 * Hors du `Loading`, les formes vides attendraient moins que lui : elles se montreraient tout de
 * suite, et une page arrivée en moins de 160 ms ferait clignoter un en-tête à moitié vide (scénario
 * R16, « Quand on le voit »). `delayShapes` les fait donc attendre avec lui (`DelayedShapes`), le
 * nom et la photo restant montrés d'emblée. Par défaut, dès que le nom est connu : c'est justement
 * le cas où l'écran pose l'en-tête hors de son `Loading`.
 */
export function MemberHeaderSkeleton({
  layout,
  name,
  avatar = null,
  heading = 1,
  action = true,
  delayShapes = name !== undefined,
}: {
  layout?: 'column' | undefined
  /** Le nom déjà connu (l'aperçu) ; absent, une forme vide. */
  name?: string | undefined
  /** Sa photo déjà connue, avec le nom ; sans elle, ses initiales. */
  avatar?: ImageSource | null | undefined
  /** Le niveau du nom, quand il est connu (comme `MemberHeader`). */
  heading?: 1 | 2 | 3
  /**
   * Le nombre d'abonnés et le bouton vides sous l'en-tête : `false` quand la vraie page n'en a pas.
   */
  action?: boolean
  /**
   * Les formes vides (pseudo, bio, outils, abonnés et bouton) attendent 160 ms avant de se montrer,
   * comme le `Loading` de la page ; vrai par défaut quand `name` est donné (voir plus haut).
   */
  delayShapes?: boolean
}): ReactNode {
  const column = layout === 'column'
  const center = !column
  // Les formes qui attendent, ou telles quelles (l'en-tête tout vide, déjà sous le `Loading`).
  const shapes = (node: ReactNode) => (delayShapes ? <DelayedShapes>{node}</DelayedShapes> : node)
  const photo =
    name === undefined ? (
      column ? (
        <ColumnPhotoShape />
      ) : (
        <Shape height={96} width={96} round />
      )
    ) : column ? (
      <ColumnPhoto name={name} source={avatar} />
    ) : (
      <Avatar name={name} source={avatar} label={name} size={96} />
    )
  return (
    <Stack gap="lg" align={column ? 'stretch' : 'center'}>
      {photo}
      <Stack gap="sm" align="stretch">
        <Stack gap="xxs" align="stretch">
          {name === undefined ? (
            <TextLineShape variant={column ? 'display' : 'title1'} width="70%" center={center} />
          ) : (
            <Text
              variant={column ? 'display' : 'title1'}
              align={center ? 'center' : undefined}
              heading={heading}
              breakAnywhere
            >
              {name}
            </Text>
          )}
          {shapes(<TextLineShape variant="callout" width="35%" center={center} />)}
        </Stack>
        {/* La bio : deux lignes, à la largeur de lecture de la vraie bio. */}
        {shapes(
          <View
            style={center ? { width: '100%', maxWidth: readableWidth, alignSelf: 'center' } : null}
          >
            <TextLineShape variant="body" width="95%" center={center} />
            <TextLineShape variant="body" width="75%" center={center} />
          </View>,
        )}
      </Stack>
      {shapes(
        <Stack gap="sm" align={column ? 'stretch' : 'center'}>
          <TextLineShape variant="caption" width={96} center={center} />
          <Stack direction="row" gap="sm" wrap justify={column ? 'start' : 'center'}>
            {SKELETON_TOOLS.map((width) => (
              <Shape key={width} height={layoutTokens.chipHeight} width={width} round />
            ))}
          </Stack>
        </Stack>,
      )}
      {action
        ? shapes(
            // Le nombre d'abonnés (« 12 abonnés », une ligne de `callout`) au-dessus du bouton,
            // comme sur la vraie page : sans lui, tout ce qui suit l'en-tête (« Projets » sur
            // téléphone) descendait à l'arrivée. L'écart `xs` garde la hauteur de ce qui arrive sur
            // la page d'un autre membre : la ligne (21), `md` (12) puis « Suivre » en taille
            // `compact` (44), soit 77 points, comme la ligne, 4 et le bouton vide (52). Sur sa
            // propre page (`sm`, puis « Modifier mon profil » en taille `regular`), 4 points de
            // plus.
            // Étirée sur toute la ligne (`alignSelf`), même dans l'en-tête centré : le bouton vide
            // y prend toute la largeur, et la ligne des abonnés se centre elle-même (`center`).
            <View style={{ alignSelf: 'stretch', gap: space.xs }}>
              <TextLineShape variant="callout" width={SKELETON_FOLLOWERS} center={center} />
              <Shape
                height={layoutTokens.controlHeight.regular}
                width={column ? SKELETON_ACTION : '100%'}
                round
              />
            </View>,
          )
        : null}
    </Stack>
  )
}

/**
 * La bannière et la photo de la colonne, vides : une carte vide de la hauteur de la bannière (sa
 * lueur comprise), et le rond de la photo qui en chevauche le bas, dans son anneau, comme
 * `ColumnPhoto`.
 */
function ColumnPhotoShape() {
  const { colors } = useTheme()
  return (
    <View>
      <SkeletonSurface height={BANNER} radius="tile" />
      <View
        style={{
          alignSelf: 'flex-start',
          marginTop: -(COLUMN_AVATAR / 2 + RING),
          marginLeft: space.lg,
          padding: RING,
          borderRadius: radii.pill,
          backgroundColor: colors.glass,
          borderWidth: borders.hairline,
          borderColor: colors.glassBorder,
        }}
      >
        <Shape height={COLUMN_AVATAR} width={COLUMN_AVATAR} round />
      </View>
    </View>
  )
}
