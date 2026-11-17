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
import { borders, radii, readableWidth, space } from '@ruche/brand'
import type { ReactNode, Ref } from 'react'
import { Image, View } from 'react-native'
import { Avatar } from './Avatar'
import { ExampleBadge } from './ExampleBadge'
import type { Focusable } from './focus'
import type { ImageSource } from './image'
import { ProjectCover } from './ProjectCover'
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

// R16, socle : pièce vide, écrite par la tranche (plan R16).
/** L'en-tête vide d'un membre. Sans rôle ni nom à elle. */
export function MemberHeaderSkeleton(_props: Record<string, never>): ReactNode {
  return null
}
