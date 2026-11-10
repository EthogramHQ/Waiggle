// La carte immersive d'un projet, celle du fil : la couverture en plein cadre et, en bas, un panneau
// de verre avec l'auteur, la date, le titre, l'accroche, « Tester ↗ », le statut et le total des
// réactions (« ✦ 49 »). Elle ne connaît pas l'API : on lui donne des textes déjà prêts, ce qui permet
// de l'utiliser aussi comme aperçu pendant qu'on écrit un projet.
//
// Dans une liste, la carte mène au projet (`onPress`). R4 (relecture de l'interface ui-B1) : le
// panneau sort de ce lien. La carte est faite de calques posés l'un sur l'autre :
// - le lien du projet, un calque plein (la photo, le verre, le titre et l'accroche), nommé par le
//   titre : on peut toucher la carte presque partout ;
// - au-dessus, l'auteur (un lien vers sa page) et la date, en haut du verre ;
// - au-dessus, « Tester ↗ » (un lien vers la démo, annoncé comme un site externe), le statut et le
//   total, en bas du verre.
// Trois liens frères, jamais l'un dans l'autre (un lien dans un lien est ambigu pour un lecteur
// d'écran, et interdit sur le web), lus dans l'ordre auteur → projet → Tester. Le verre du lien
// garde, en haut et en bas, une place vide de la hauteur de ces deux rangées, mesurée.
//
// Un emplacement `overlay` pose un contrôle sur la photo, en haut (la pastille « Suivre Nora »
// d'Explorer, R3) : à côté du lien de la carte, jamais dedans (relecture de l'interface, ui-4).
//
// R6a : la catégorie principale du projet (`category`), une étiquette de verre avec son icône, en
// haut à gauche de la photo ; avec un `overlay`, celui-ci passe dessous, dans la même colonne. Sans
// photo, elle se pose dans le verre, au-dessus du titre. Un projet d'avant R6a n'en a pas : rien ne
// se dessine. L'étiquette est hors du lien de la carte et laisse passer le doigt vers lui
// (`pointerEvents="none"`) ; elle est cachée aux lecteurs d'écran, qui l'entendent dans la
// description du lien (« Catégorie : Sciences et espace », relecture du plan ui-I5).
//
// Sur ordinateur, une carte qui est un lien s'incline vers la souris, avec un reflet sur sa photo
// (`useTilt`, R4) ; elle se remet à plat avant que sa photo soit mesurée au toucher.
//
// R7a : un projet remonté par sa mise à jour (`updated`, planche R7-MAJ-Fil). Deux formes :
// - `full`, dans « Abonnements » : la pastille « Mis à jour · v1.2 » à la place de la date de
//   l'auteur ; la première ligne de « Ce qui a changé » (sa pastille de famille, puis son texte,
//   coupé à deux lignes) à la place de l'accroche, puis « et 2 autres changements » dessous, dans
//   un texte à part, jamais coupé (sinon le nombre tomberait dans « … ») ; et la date relative de la
//   mise à jour en bas à droite, après le total des réactions, hors du lien. La famille, que la
//   pastille ne dit qu'en couleur, est lue dans la description du lien (« Nouveau : Un compte à
//   rebours… », relecture du plan, interface B4) ;
// - `badge`, ailleurs (Découvrir, recherche, page d'un membre) : la pastille seule, dans la rangée
//   du bas, à côté du statut ; la date de publication et l'accroche restent (décision du 10/11/2026).
import { layout, pressScale, radii, space } from '@ruche/brand'
import type { UpdateFamily } from '@ruche/contracts'
import { type ReactNode, type Ref, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type LayoutChangeEvent, Platform, Pressable, View, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { Avatar } from './Avatar'
import { describedBy } from './aria'
import { Icon, type IconName } from './Icon'
import type { ImageSource } from './image'
import { enterActivates } from './keyboard'
import { Pressed } from './Pressed'
import { type CoverImage, ProjectCover } from './ProjectCover'
import { RelativeTime } from './RelativeTime'
import { StatusPill } from './StatusPill'
import { Surface } from './Surface'
import { Tag } from './Tag'
import { TestLink } from './TestLink'
import { Text } from './Text'
import { useTapGuard } from './tapGuard'
import { spring } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'
import { useTilt } from './tilt'
import { UpdateFamilyBadge } from './UpdateFamilyBadge'

/** La hauteur d'une carte du fil, en points (le squelette du fil prend la même : `Skeleton`). */
export const PROJECT_CARD_HEIGHT = 476

/**
 * Ce que la carte montre d'une mise à jour (R7a), des textes déjà prêts (`SummaryCard`) :
 * - `full` (« Abonnements ») : `label` (« Mis à jour · v1.2 ») à la place de la date de l'auteur,
 *   `line` à la place de l'accroche, `more` (« et 2 autres changements », null pour une seule
 *   ligne) dessous, et la date `at` (ISO du contrat) en bas à droite ;
 * - `badge` (ailleurs) : `label` seul, dans la rangée du bas ; la date et l'accroche restent.
 * Une union plutôt qu'un booléen à côté d'une ligne obligatoire (relecture du plan, interface A7) :
 * TypeScript refuse une carte `badge` qui porterait une ligne, ou une `full` qui n'en aurait pas.
 */
export type ProjectCardUpdate =
  | {
      kind: 'full'
      label: string
      line: { family: UpdateFamily; text: string }
      more: string | null
      at: string
    }
  | { kind: 'badge'; label: string }

type Props = {
  title: string
  pitch: string
  /** L'auteur ; avec `onPress`, son nom et sa photo mènent à sa page (un lien à part). */
  author: { name: string; avatar: ImageSource | null; onPress?: () => void }
  /** La photo de couverture ; sans elle, la lumière miel. */
  image?: CoverImage | null
  /**
   * Quand : un texte (« 12 oct. ») ou un nœud déjà prêt, `RelativeTime` dans le fil. Sur le web,
   * `RelativeTime` est une vue (un texte et sa version complète, cachée à l'œil) : il se pose ici,
   * à côté des autres textes, jamais dans un texte.
   */
  when: ReactNode
  status: { label: string; strong: boolean }
  /**
   * « Tester ↗ », s'il y a une démo : un lien vers un site externe, posé à côté du lien de la carte
   * (même quand la carte en est un), jamais dedans. `label` est le texte affiché (« Tester ») ; le
   * nom lu ajoute le projet (« Tester Carnet de cafés »). Sans `onPress` : la pastille est
   * seulement dessinée, ni lien ni arrêt de Tab (l'aperçu de la feuille de publication, R6a,
   * design-C5).
   */
  tryIt?: { label: string; onPress?: (() => void) | undefined }
  /** Une pastille de plus, à côté du statut (« Privé »). */
  badge?: string
  /** Le total des réactions (« ✦ 49 », lu « 49 réactions ») ; rien à 0. */
  reactionTotal?: number
  /** Toute la carte devient un lien vers le projet ; son nom est le titre du projet. */
  onPress?: () => void
  /** La hauteur de la carte ; elle grandit si le texte agrandi ne tient pas dedans. */
  height?: number
  /**
   * Un contrôle posé sur la photo, en haut à gauche (`FollowButton variant="chip"`). Il est rendu à
   * côté du lien de la carte, pas dedans : un bouton dans un lien serait ambigu pour les lecteurs
   * d'écran, et le toucher n'ouvre pas le projet.
   */
  overlay?: ReactNode
  /**
   * R6a : la catégorie principale du projet, son nom traduit et son icône (`optionOf` de
   * `projects/categories.ts`, lue de l'API) ; absente pour un projet d'avant R6a.
   */
  category?: { label: string; icon: IconName }
  /**
   * La vue qui entoure la photo, pour qui veut la mesurer (`measureInWindow`) : la photo de la carte
   * qui s'agrandit en page du projet (le mouvement de R4).
   */
  coverRef?: Ref<View>
  /** R7a : le projet remonté par sa mise à jour (voir `ProjectCardUpdate`). */
  updated?: ProjectCardUpdate
  /**
   * L'heure qu'il est, pour figer la date de la mise à jour (`updated.at`) : le catalogue et les
   * captures ; l'horloge de l'appareil sinon (comme `RelativeTime`).
   */
  now?: Date
}

/** La marge entre le bord de la carte et le verre, puis celle du verre autour de son contenu. */
const INSET = space.sm
const PANEL_PADDING = space.lg
/** L'écart entre les rangées du verre (`gap` du panneau). */
const ROW_GAP = space.sm

/**
 * Le cadre qui cache un texte à l'œil sans le cacher au lecteur d'écran (la recette « sr-only » du
 * web, comme `HiddenHeading` et `RelativeTime`) : une case d'un point, hors du flux, qui rogne tout.
 */
const hiddenFrame = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: 1,
  height: 1,
  overflow: 'hidden',
  ...(Platform.OS === 'web' ? { clipPath: 'inset(50%)', whiteSpace: 'nowrap' } : null),
} as unknown as ViewStyle

/** Ce qui ne se lit pas : caché aux lecteurs d'écran, sur le web comme sur téléphone. */
const decorative = {
  'aria-hidden': true,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const

/**
 * Les hauteurs mesurées : les deux rangées posées sur le verre, le titre, la carte entière, et la
 * colonne du haut de la photo (catégorie, « Suivre » ; 0 sans elle).
 */
type Measures = {
  author: number
  bottom: number
  title: number | null
  card: number
  top: number
}

/** Hook : une mesure (`onLayout`) qui ne redessine que si la hauteur a changé. */
const useMeasures = (height: number) => {
  // Avant toute mesure, les rangées valent une zone à toucher (leur hauteur au texte ordinaire) :
  // le verre a déjà la bonne forme au pré-rendu du web, et rien ne saute ensuite.
  const [measures, setMeasures] = useState<Measures>({
    author: layout.touchTarget,
    bottom: layout.touchTarget,
    title: null,
    card: height,
    top: 0,
  })
  const measure = (key: keyof Measures) => (event: LayoutChangeEvent) => {
    const value = Math.round(event.nativeEvent.layout.height)
    setMeasures((current) => (current[key] === value ? current : { ...current, [key]: value }))
  }
  return [measures, measure] as const
}

export function ProjectCard({
  title,
  pitch,
  author,
  image,
  when,
  status,
  tryIt,
  badge,
  reactionTotal = 0,
  onPress,
  height = PROJECT_CARD_HEIGHT,
  overlay,
  category,
  coverRef,
  updated,
  now,
}: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const web = Platform.OS === 'web'
  const [measures, measure] = useMeasures(height)
  // Une garde commune aux trois liens : la seconde tape d'une double tape (« Tester », puis la
  // carte juste à côté) n'ouvre pas une deuxième page.
  const guard = useTapGuard()
  // L'inclinaison sous la souris, seulement pour une carte qui est un lien (un aperçu ne bouge
  // pas). Au toucher, la carte se remet à plat avant `onPress`, qui mesure sa photo (la carte qui
  // devient la page) : le cadre mesuré est celui de la carte à plat.
  const tilt = useTilt(Boolean(onPress))
  const open = onPress
    ? guard(() => {
        tilt.flatten()
        onPress()
      })
    : undefined
  const openAuthor = author.onPress ? guard(author.onPress) : undefined
  const test = tryIt?.onPress ? guard(tryIt.onPress) : undefined
  // L'accroche décrit le lien de la carte sur le web (lue après son nom) : useId donne le même
  // identifiant au pré-rendu et dans le navigateur.
  const pitchId = useId()
  // R6a : la catégorie décrit aussi le lien (« Catégorie : Sciences et espace »), après l'accroche.
  // Sur le web, par un texte caché que désigne `aria-describedby` ; sur téléphone, par l'indice du
  // lien (`accessibilityHint`), lu après son nom.
  const categoryId = useId()
  const categoryDescription = category
    ? t(($) => $.card.category, { category: category.label })
    : null
  // R7a : la mise à jour entière (`full`) remplace l'accroche ; recopiée dans une constante, que
  // TypeScript garde rétrécie jusque dans le dessin.
  const change = updated?.kind === 'full' ? updated : null
  // Sa ligne décrit le lien à la place de l'accroche, avec sa famille (« Nouveau : Un compte à
  // rebours… »), puis « et 2 autres changements » : la pastille de famille ne la dit qu'en couleur.
  const changeId = useId()
  const changeDescription = change
    ? [
        t(($) => $.update.lineRead, {
          family: t(($) => $.update.family[change.line.family]),
          text: change.line.text,
        }),
        change.more,
      ]
        .filter(Boolean)
        .join(' ')
    : null
  // Ce qui décrit le lien : sur le web, les textes que désigne `aria-describedby` (le navigateur
  // les lit à la suite) ; sur téléphone, l'indice du lien. L'accroche, elle, est déjà un texte de
  // la carte (son `nativeID`) : l'indice du téléphone ne la reprend pas, comme avant R7a.
  const describedIds = [change ? changeId : pitchId, categoryDescription ? categoryId : null]
    .filter(Boolean)
    .join(' ')
  const hint = [changeDescription, categoryDescription].filter(Boolean).join('. ')
  const hasPhoto = Boolean(image)
  // La colonne du haut de la photo : la catégorie (avec photo) et l'emplacement (« Suivre »).
  const topColumn = Boolean(overlay) || (hasPhoto && Boolean(category))
  // L'étiquette dessinée : décor pour les lecteurs d'écran (la description du lien la dit), et le
  // doigt passe au travers, vers la carte (`pointerEvents` en propriété : sur le web, seule cette
  // forme devient du CSS).
  const categoryTag = category ? (
    <View
      pointerEvents="none"
      {...decorative}
      style={{ alignSelf: 'flex-start', maxWidth: '100%' }}
    >
      <Tag label={category.label} icon={category.icon} kind="category" onGlass />
    </View>
  ) : null

  // La carte s'enfonce un peu sous le doigt, comme les boutons (`Pressed`), mais toute entière :
  // l'auteur et « Tester », posés dessus, s'enfoncent avec elle et restent à leur place.
  const scale = useSharedValue(1)
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  // Les bords des rangées posées sur le verre : ceux du contenu du verre.
  const edge = INSET + PANEL_PADDING
  // La rangée de l'auteur se pose au-dessus du titre, qui est mesuré : elle attend sa mesure
  // (invisible le temps d'un rendu) pour ne jamais se dessiner sur le titre.
  const authorBottom = edge + measures.bottom + ROW_GAP + (measures.title ?? 0) + ROW_GAP

  // --- Le calque du lien : la photo, le verre, le titre et l'accroche -------------------------
  const body = (
    <View
      onLayout={measure('card')}
      style={{
        minHeight: height,
        justifyContent: 'flex-end',
        padding: INSET,
        // Le verre ne monte jamais sous la colonne du haut (catégorie, « Suivre ») : à texte
        // agrandi sur une carte basse, la carte grandit plutôt (relecture de design R3, C2).
        paddingTop: INSET + (topColumn && measures.top > 0 ? measures.top + ROW_GAP : 0),
      }}
    >
      {/* La photo remplit la carte, même agrandie par le texte. Elle décore : le lien porte déjà
          le nom du projet. */}
      <View ref={coverRef} style={{ position: 'absolute', inset: 0 }} {...decorative}>
        <ProjectCover height={measures.card} image={image ?? null} shadow="card" />
      </View>
      {tilt.active ? (
        // Le reflet qui suit la souris : une lueur blanche, rognée au rayon de la photo, posée
        // sous le verre (qui la floute à son tour). Il décore, et le doigt passe au travers
        // (`pointerEvents` en propriété : sur le web, seule cette forme devient du CSS).
        <View
          pointerEvents="none"
          {...decorative}
          style={{ position: 'absolute', inset: 0, borderRadius: radii.sheet, overflow: 'hidden' }}
        >
          <Animated.View
            style={[
              {
                position: 'absolute',
                inset: 0,
                // Un dégradé du centre vers les bords (CSS du web, seul endroit où la lueur existe).
                backgroundImage: `radial-gradient(closest-side, ${colors.glare}, transparent)`,
              } as ViewStyle,
              tilt.glareStyle,
            ]}
          />
        </View>
      ) : null}
      <Surface variant="panel" padding="lg" gap="sm">
        {/* La place de la rangée de l'auteur, posée par-dessus. */}
        <View style={{ height: measures.author }} />
        <View onLayout={measure('title')} style={{ gap: ROW_GAP }}>
          {/* Sans photo, la catégorie se pose au-dessus du titre (mesurée avec lui : la rangée de
              l'auteur reste au-dessus d'elle). */}
          {hasPhoto ? null : categoryTag}
          <Text variant="title3" numberOfLines={2}>
            {title}
          </Text>
          {change ? (
            <UpdateChange line={change.line} more={change.more} />
          ) : (
            <Text variant="callout" tone="secondary" numberOfLines={2} nativeID={pitchId}>
              {pitch}
            </Text>
          )}
        </View>
        {/* La place de la rangée du bas (« Tester », statut, total), posée par-dessus. */}
        <View style={{ height: measures.bottom }} />
      </Surface>
    </View>
  )

  const cardLayer = open ? (
    // Le lien de la carte, nommé par le titre et décrit par l'accroche. L'anneau du clavier suit
    // le rayon de la couverture (« sheet »).
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={title}
      {...describedBy(describedIds)}
      {...(hint && !web ? { accessibilityHint: hint } : null)}
      // Entrée ouvre le projet sur le web, comme un vrai lien (voir keyboard.ts).
      {...enterActivates(open)}
      onPress={open}
      onPressIn={() => {
        scale.value = spring(pressScale, 'firm')
      }}
      onPressOut={() => {
        scale.value = spring(1)
      }}
      style={{ borderRadius: radii.sheet }}
    >
      {body}
    </Pressable>
  ) : (
    body
  )

  // --- La rangée de l'auteur ------------------------------------------------------------------
  const who = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <Avatar name={author.name} source={author.avatar} label={author.name} size={28} />
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text variant="callout" weight={700} numberOfLines={1}>
          {author.name}
        </Text>
      </View>
    </View>
  )
  const authorRow = (
    <View
      onLayout={measure('author')}
      // box-none : la rangée laisse passer le doigt hors de ses liens, vers la carte dessous. En
      // propriété, pas en style : sur le web, react-native-web n'en fait du CSS que sous cette forme
      // (en style, `pointer-events: box-none` n'existe pas en CSS, et la vue prenait les clics :
      // essai du 01/11, le statut touché n'ouvrait pas le projet).
      pointerEvents="box-none"
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: space.sm,
        minHeight: layout.touchTarget,
      }}
    >
      {/* Le nom ne prend que sa place ; trop long, il rétrécit (une ligne, coupée). */}
      <View style={{ flexShrink: 1, minWidth: 0, maxWidth: '100%' }}>
        {openAuthor ? (
          <Pressed label={author.name} role="link" onPress={openAuthor}>
            {who}
          </Pressed>
        ) : (
          who
        )}
      </View>
      {/* La date, à droite (marge automatique), ou sous le nom quand la place manque. R7a : un
          projet remonté par sa mise à jour y porte « Mis à jour · v1.2 » à la place (la date de la
          mise à jour passe en bas) ; la pastille rétrécit et passe à la ligne plutôt que de
          déborder, à 320 points et texte agrandi. */}
      <View style={{ marginLeft: 'auto', flexShrink: 1, maxWidth: '100%' }}>
        {change ? (
          <StatusPill label={change.label} />
        ) : typeof when === 'string' ? (
          <Text variant="caption" tone="muted">
            {when}
          </Text>
        ) : (
          when
        )}
      </View>
    </View>
  )

  // --- Le total des réactions -----------------------------------------------------------------
  const reactionsLabel = t(($) => $.card.reactions, { count: reactionTotal })
  const drawnTotal = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
      <Icon name="sparkle-fill" size={space.lg} tone="honey" />
      <Text variant="callout" weight={700} tabular>
        {String(reactionTotal)}
      </Text>
    </View>
  )
  const total =
    reactionTotal > 0 ? (
      <View>
        {web ? (
          // Sur le web, le nom d'un texte sans rôle n'est pas lu : le « 49 » dessiné est caché au
          // lecteur d'écran, et « 49 réactions » est écrit à côté, caché à l'œil (relecture ui-B3).
          <>
            <View aria-hidden>{drawnTotal}</View>
            <View style={hiddenFrame}>
              <Text variant="caption">{reactionsLabel}</Text>
            </View>
          </>
        ) : (
          // Sur téléphone, VoiceOver et TalkBack lisent le nom donné au groupe : « 49 réactions ».
          <View accessible accessibilityRole="text" accessibilityLabel={reactionsLabel}>
            {drawnTotal}
          </View>
        )}
      </View>
    ) : null
  // R7a : la date de la mise à jour, au bout de la rangée du bas (planche R7-MAJ-Fil). Un texte,
  // hors du lien de la carte, lu après lui ; sa version complète se lit au lecteur d'écran.
  const changedAt = change ? <RelativeTime date={change.at} now={now} /> : null
  // Le bout de la rangée, à droite (marge automatique) : la date seule. Le total des réactions est
  // rangé avec les pastilles (des-A2) ; le doigt passe au travers, vers la carte.
  const end = changedAt ? (
    <View
      pointerEvents="none"
      style={{ marginLeft: 'auto', alignItems: 'center', maxWidth: '100%', flexShrink: 1 }}
    >
      {changedAt}
    </View>
  ) : null

  // --- « Tester ↗ » ---------------------------------------------------------------------------
  // La pastille miel commune (`TestLink`), à la hauteur d'une zone à toucher (`compact`) comme sur
  // la planche du fil. Son nom lu, « Tester Carnet de cafés » (plusieurs cartes, plusieurs
  // « Tester »), et son avertissement de site externe viennent d'elle.
  const tester = tryIt ? (
    <TestLink title={title} label={tryIt.label} onPress={test} size="compact" />
  ) : null

  // --- La rangée du bas : « Tester », le statut, la pastille, le total -------------------------
  const bottomRow = (
    <View
      onLayout={measure('bottom')}
      pointerEvents="box-none"
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: space.sm,
        minHeight: layout.touchTarget,
      }}
    >
      {tester}
      {/* Les pastilles ne se touchent pas : le doigt passe au travers, vers la carte. */}
      {/* R7a, `badge` (Découvrir…) : le repère « Mis à jour » vient ici, à côté du statut ; la date
          de publication reste en haut, car Découvrir est rangé par elle (décision du 10/11/2026). */}
      {/* R7a, des-A2 : le statut, les repères et le total des réactions sont chacun un enfant de la
          rangée (et non un groupe qui passe à la ligne d'un bloc) : ils se rangent côte à côte tant
          qu'il y a de la place, et la rangée ne compte plus trois lignes à 320 px. */}
      <View pointerEvents="none" style={{ flexShrink: 1, maxWidth: '100%' }}>
        <StatusPill label={status.label} strong={status.strong} />
      </View>
      {badge ? (
        <View pointerEvents="none" style={{ flexShrink: 1, maxWidth: '100%' }}>
          <StatusPill label={badge} />
        </View>
      ) : null}
      {updated?.kind === 'badge' ? (
        <View pointerEvents="none" style={{ flexShrink: 1, maxWidth: '100%' }}>
          <StatusPill label={updated.label} />
        </View>
      ) : null}
      {total ? (
        <View pointerEvents="none" style={{ flexShrink: 1 }}>
          {total}
        </View>
      ) : null}
      {end}
    </View>
  )

  return (
    // La carte et, par-dessus, ses rangées : des voisins dans un même cadre, qui s'enfoncent
    // ensemble sous le doigt. L'ordre de l'arbre est celui de la lecture (et du clavier) :
    // l'auteur, la carte, « Tester », puis l'emplacement (« Suivre Nora »).
    // Autour, la vue qui s'incline sous la souris (sur ordinateur) : une vue à part, car
    // l'enfoncement et l'inclinaison sont deux transformations animées, et un même style animé
    // n'en garderait qu'une.
    <Animated.View {...tilt.handlers} style={[{ alignSelf: 'stretch' }, tilt.cardStyle]}>
      <Animated.View style={[{ alignSelf: 'stretch' }, pressStyle]}>
        {/* La rangée de l'auteur vient avant le lien dans l'arbre, mais se dessine au-dessus de lui
          (zIndex). box-none : le calque laisse passer le doigt hors de la rangée. */}
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: edge,
            right: edge,
            bottom: authorBottom,
            zIndex: 1,
            opacity: measures.title === null ? 0 : 1,
          }}
        >
          {authorRow}
        </View>
        {cardLayer}
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: edge, right: edge, bottom: edge, zIndex: 1 }}
        >
          {bottomRow}
        </View>
        {topColumn ? (
          // La colonne du haut de la photo : la catégorie, puis l'emplacement dessous (« Suivre
          // Nora »). box-none : la colonne laisse passer le doigt hors du contrôle, vers la carte
          // qui est dessous. Ses bords suivent ceux du panneau de verre du bas.
          <View
            onLayout={measure('top')}
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              top: INSET,
              left: INSET,
              right: INSET,
              zIndex: 1,
              gap: space.xs,
            }}
          >
            {hasPhoto ? categoryTag : null}
            {overlay}
          </View>
        ) : null}
        {changeDescription || categoryDescription ? (
          // La description du lien, lue seulement par lui (`aria-describedby` lit aussi un texte
          // caché) : cachée à l'œil et au parcours du lecteur d'écran, qui ne l'entend pas deux fois.
          <View style={hiddenFrame} {...decorative}>
            {changeDescription ? (
              <Text variant="caption" nativeID={changeId}>
                {changeDescription}
              </Text>
            ) : null}
            {categoryDescription ? (
              <Text variant="caption" nativeID={categoryId}>
                {categoryDescription}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Animated.View>
    </Animated.View>
  )
}

/**
 * R7a : la première ligne d'une mise à jour, à la place de l'accroche : la pastille de sa famille,
 * puis, dans une colonne à côté, son texte (coupé à deux lignes, comme l'accroche) et « et 2 autres
 * changements » dessous. Ce dernier est un texte à part, sans limite de lignes : coupé avec la
 * ligne, le nombre tomberait dans « … » (relecture du plan, interface A7). La colonne aligne les
 * deux textes sur le même bord, après la pastille. Le tout est dans le lien de la carte, qui en
 * porte la lecture (sa description) : rien ici n'est lu à part.
 */
function UpdateChange({
  line,
  more,
}: {
  line: { family: UpdateFamily; text: string }
  more: string | null
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
      <UpdateFamilyBadge family={line.family} size="small" />
      {/* La colonne prend la place qui reste (une base réelle, jamais `flex: 1`, et `minWidth: 0`
          pour qu'un mot très long se coupe au lieu de pousser la carte). */}
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: space.xs }}>
        <Text variant="callout" tone="secondary" numberOfLines={2} breakAnywhere>
          {line.text}
        </Text>
        {more ? (
          <Text variant="caption" tone="muted" weight={700}>
            {more}
          </Text>
        ) : null}
      </View>
    </View>
  )
}
