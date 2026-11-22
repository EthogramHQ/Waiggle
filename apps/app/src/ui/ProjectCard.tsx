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
//
// R12b (« Les exemples ») : le projet d'un compte d'exemples (`example`) porte la pastille
// « Exemple » juste après son statut, dans la rangée du bas. Comme le statut, elle est hors du lien
// de la carte : un lecteur d'écran la lit à son tour, sur le web comme sur téléphone (un lien de
// téléphone ne se lit que par son nom et son indice, jamais par les textes qu'il contient).
//
// R14 (« Les projets d'un membre ») : deux tailles et un auteur facultatif.
// - `size="compact"`, la petite carte de la mosaïque d'un membre (`ProjectMosaic`) : moins haute
//   (`PROJECT_CARD_COMPACT_HEIGHT`, deux compactes empilées font une grande), un verre plus serré,
//   le titre, le statut, les pastilles et les réactions. Ni catégorie, ni « Tester », ni la ligne
//   d'une mise à jour (son repère seul, dans la rangée du bas) ; l'accroche, sur deux lignes,
//   seulement sans photo (sur la lumière miel, elle remplit la carte ; sur une photo, elle la
//   cacherait). La carte grandit avec le texte agrandi : sa hauteur est un minimum.
// - sans `author` (on est sur la page du membre : son nom n'a pas à revenir sur chaque carte), ni
//   rangée de l'auteur ni sa place dans le verre.
// Dans une case de la mosaïque (`CardStretchContext`), la carte s'étire à la hauteur de la case :
// les cartes d'une rangée prennent la hauteur de la plus haute.
//
// R16 (« Les squelettes ») : `ProjectCardSkeleton`, la carte vide qui tient sa place pendant le
// chargement, à sa hauteur, avec son panneau en bas (voir en fin de fichier). Et la catégorie en
// attente (`category="pending"`) : tant que son nom charge, la carte en garde la place, vide.
//
// R18 (« Les finitions », planche R18-Carte-Sans-Photo validée le 22/11/2026), sur téléphone
// seulement (sous `breakpoints.medium` ; tablette et ordinateur ne changent pas, choix 8) :
// - une carte sans photo serre son verre (choix 1 et 2) : sa hauteur est celle de son contenu, et la
//   lumière miel n'est plus qu'un liseré (la marge `INSET`) autour du verre, au lieu d'un grand vide
//   de 476 points au-dessus de lui. Une compacte sans photo fait de même ; dans une case de la
//   mosaïque, elle s'étire encore à la hauteur de sa rangée (choix 6) : à côté d'une compacte à
//   photo, 230 points ; à côté d'une autre sans photo, leur contenu ;
// - à texte agrandi (dès 150 %, `useLargeText`), le titre passe à quatre lignes au plus, et aucun de
//   ses mots ne se coupe : son agrandissement s'arrête quand le plus long mot remplit la ligne (la
//   garde `wholeWords` de `Text`, choix 3), avec ou sans photo. L'accroche reste sur deux lignes
//   (choix 4).
// Le squelette garde 476 et 230, la hauteur d'une carte à photo, le cas courant (choix 7).
import { borders, layout, pressScale, radii, space } from '@ruche/brand'
import type { UpdateFamily } from '@ruche/contracts'
import { keepPunctuation } from '@ruche/i18n'
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  type Ref,
  useContext,
  useId,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { type LayoutChangeEvent, Platform, Pressable, View, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { Avatar } from './Avatar'
import { describedBy } from './aria'
import { coverPanelMark } from './coverTransition'
import { ExampleBadge } from './ExampleBadge'
import { HighlightedText } from './HighlightedText'
import { Icon, type IconName } from './Icon'
import type { ImageSource } from './image'
import { enterActivates } from './keyboard'
import { Pressed } from './Pressed'
import { type CoverImage, ProjectCover } from './ProjectCover'
import { GridCardsContext, GridColumnContext } from './ProjectGrid'
import { RelativeTime } from './RelativeTime'
import { Shape, SkeletonSurface } from './Skeleton'
import { StatusPill } from './StatusPill'
import { Surface } from './Surface'
import { Tag } from './Tag'
import { TestLink } from './TestLink'
import { Text } from './Text'
import { useTapGuard } from './tapGuard'
import { useLargeText } from './textScale'
import { useLayout } from './theme/layout'
import { spring } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'
import { useTilt } from './tilt'
import { UpdateFamilyBadge } from './UpdateFamilyBadge'

/** La hauteur d'une carte du fil, en points (le squelette du fil prend la même : `Skeleton`). */
export const PROJECT_CARD_HEIGHT = 476

/** R14 : l'écart entre deux cartes d'une mosaïque (`ProjectMosaic`), en rangée comme en colonne. */
export const PROJECT_CARD_GAP = space.lg

/**
 * R14 : la hauteur d'une carte compacte (230 points). Deux compactes empilées, avec l'écart entre
 * elles, ont exactement la hauteur d'une grande carte : le bloc d'en tête de la mosaïque (la grande
 * carte, deux compactes à côté) tombe juste, sans vide sous l'une ou l'autre colonne.
 */
export const PROJECT_CARD_COMPACT_HEIGHT = (PROJECT_CARD_HEIGHT - PROJECT_CARD_GAP) / 2

/**
 * R14 : vrai dans une case qui étire sa carte à sa propre hauteur (une case de `ProjectMosaic`, qui
 * prend la hauteur de la plus haute carte de sa rangée). Un contexte React transmet une valeur à
 * tous les composants posés dessous, sans la passer de props en props : l'écran qui dessine la carte
 * (`SummaryCard`) n'a rien à savoir. Ailleurs (le fil), la carte garde sa hauteur.
 */
export const CardStretchContext = createContext(false)

/** Les deux tailles de la carte : celle du fil (`full`) et la petite de la mosaïque (`compact`). */
export type ProjectCardSize = 'full' | 'compact'

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
  /**
   * L'auteur ; avec `onPress`, son nom et sa photo mènent à sa page (un lien à part). Absent (R14,
   * la page du membre lui-même) : ni rangée de l'auteur, ni date, ni place gardée dans le verre.
   */
  author?: { name: string; avatar: ImageSource | null; onPress?: () => void } | undefined
  /** La photo de couverture ; sans elle, la lumière miel. */
  image?: CoverImage | null
  /**
   * Quand : un texte (« 12 oct. ») ou un nœud déjà prêt, `RelativeTime` dans le fil. Sur le web,
   * `RelativeTime` est une vue (un texte et sa version complète, cachée à l'œil) : il se pose ici,
   * à côté des autres textes, jamais dans un texte. Elle se lit dans la rangée de l'auteur : sans
   * auteur, rien.
   */
  when?: ReactNode
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
  /**
   * R12b : l'auteur est un compte d'exemples (`example: true` du contrat) ; « Exemple » suit alors
   * le statut. Absent ou faux : rien.
   */
  example?: boolean
  /** Le total des réactions (« ✦ 49 », lu « 49 réactions ») ; rien à 0. */
  reactionTotal?: number
  /** Toute la carte devient un lien vers le projet ; son nom est le titre du projet. */
  onPress?: () => void
  /**
   * La hauteur de la carte ; elle grandit si le texte agrandi ne tient pas dedans. Par défaut, celle
   * de sa taille (`PROJECT_CARD_HEIGHT`, `PROJECT_CARD_COMPACT_HEIGHT`) ; R18 : sur téléphone, une
   * carte sans photo n'en a pas (celle de son contenu), sauf si on la donne ici.
   */
  height?: number
  /**
   * R14 : la grande carte du fil (par défaut) ou la petite de la mosaïque d'un membre. R15 : sans
   * elle, la compacte dans une grille de compactes (`GridCardsContext`) sur ordinateur.
   */
  size?: ProjectCardSize
  /**
   * R14 : le style animé du rebond de la carte au Retour du navigateur (`bounceStyle` de
   * `useCoverSource`), posé sur une vue à lui : l'enfoncement et l'inclinaison gardent chacun la
   * leur (un même style animé ne garderait qu'une transformation).
   */
  bounceStyle?: ComponentProps<typeof Animated.View>['style']
  /**
   * Un contrôle posé sur la photo, en haut à gauche (`FollowButton variant="chip"`). Il est rendu à
   * côté du lien de la carte, pas dedans : un bouton dans un lien serait ambigu pour les lecteurs
   * d'écran, et le toucher n'ouvre pas le projet.
   */
  overlay?: ReactNode
  /**
   * R6a : la catégorie principale du projet, son nom traduit et son icône (`optionOf` de
   * `projects/categories.ts`, lue de l'API) ; absente pour un projet d'avant R6a.
   * R16 : `'pending'`, le projet a une catégorie mais son nom n'est pas encore arrivé (la liste des
   * catégories charge) : la carte garde la place exacte de l'étiquette, vide, sans rien dire.
   */
  category?: { label: string; icon: IconName } | 'pending'
  /**
   * La vue qui entoure la photo, pour qui veut la mesurer (`measureInWindow`) : la photo de la carte
   * qui s'agrandit en page du projet (le mouvement de R4).
   */
  coverRef?: Ref<View>
  /** R7a : le projet remonté par sa mise à jour (voir `ProjectCardUpdate`). */
  updated?: ProjectCardUpdate
  /**
   * R16 (planches R16-Recherche-1440 et -1920) : la carte d'un résultat de recherche. `words`, les
   * mots cherchés, surlignés de miel dans le titre et l'extrait (`HighlightedText`) ; `excerpt`, le
   * passage de la description qui a correspondu, déjà prêt (« « … le carnet de balades… » »),
   * montré à la place de l'accroche, même sur une compacte avec photo : il dit pourquoi le projet
   * est trouvé. `excerpt` à null (le titre a correspondu) : l'accroche, comme ailleurs.
   */
  match?: { words: readonly string[]; excerpt: string | null }
  /**
   * L'heure qu'il est, pour figer la date de la mise à jour (`updated.at`) : le catalogue et les
   * captures ; l'horloge de l'appareil sinon (comme `RelativeTime`).
   */
  now?: Date
}

/**
 * La marge entre le bord de la carte et le verre, puis celle du verre autour de son contenu ; plus
 * serrée sur la carte compacte, qui ne fait que 136 points de large à 320 (deux par rangée).
 */
const INSET = space.sm
const PANEL_PADDING = space.lg
const COMPACT_PANEL_PADDING = space.md
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
 * Les hauteurs mesurées : les deux rangées posées sur le verre, le titre et la colonne du haut de la
 * photo (catégorie, « Suivre » ; 0 sans elle). La carte entière ne l'est plus (R15 : sa couverture
 * grandit avec elle, voir le corps).
 */
type Measures = {
  author: number
  bottom: number
  title: number | null
  top: number
}

/** Hook : une mesure (`onLayout`) qui ne redessine que si la hauteur a changé. */
const useMeasures = () => {
  // Avant toute mesure, les rangées valent une zone à toucher (leur hauteur au texte ordinaire) :
  // le verre a déjà la bonne forme au pré-rendu du web, et rien ne saute ensuite.
  const [measures, setMeasures] = useState<Measures>({
    author: layout.touchTarget,
    bottom: layout.touchTarget,
    title: null,
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
  example = false,
  reactionTotal = 0,
  onPress,
  height: givenHeight,
  size: givenSize,
  bounceStyle,
  overlay,
  category: givenCategory,
  coverRef,
  updated,
  now,
  match,
}: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const web = Platform.OS === 'web'
  // R15 (planches R15-Membre-1920) : sur ordinateur, le titre d'une compacte en `heading` (22) ; sur
  // téléphone et tablette, `headline` (18), où une compacte n'a que 110 à 230 points de texte.
  const { sizeClass } = useLayout()
  const wide = sizeClass === 'wide'
  // R18 : le téléphone (sous `breakpoints.medium`), où la carte sans photo serre son verre et où le
  // titre gagne des lignes à texte agrandi. Avant l'hydratation du web, `useLayout` répond déjà
  // « téléphone » (largeur 0) : le pré-rendu dessine cette forme.
  const phone = sizeClass === 'compact'
  // Le texte agrandi (dès 150 %) : le système le dit sur téléphone ; sur le web, une ligne cachée
  // (`probe`) le mesure. Seul le téléphone s'en sert : l'ordinateur ne pose pas la ligne.
  const largeText = useLargeText()
  const longTitle = phone && largeText.large
  // Sans taille donnée, la grille décide (relecture de design de R15, planche R15-Explorer-1920) :
  // sous `GridCardsContext` à `compact` (« Récents » d'Explorer), sur ordinateur, la compacte, et
  // non la grande carte du Fil resserrée (470 points de haut : aucune rangée entière dans une
  // fenêtre de 940). Sur téléphone et tablette, « Récents » garde ses grandes cartes, une ou deux
  // par rangée, avec « Tester ».
  const gridCards = useContext(GridCardsContext)
  const size: ProjectCardSize = givenSize ?? (gridCards === 'compact' && wide ? 'compact' : 'full')
  const compact = size === 'compact'
  const hasPhoto = Boolean(image)
  // R18 (choix 1 et 6) : sur téléphone, une carte sans photo, grande ou compacte, n'a pas de hauteur
  // minimale ; elle prend celle de son verre, plus le liseré de lumière autour. Une hauteur donnée
  // par l'appelant reste un minimum.
  const hugsContent = phone && !hasPhoto && givenHeight === undefined
  const height =
    givenHeight ??
    (hugsContent ? null : compact ? PROJECT_CARD_COMPACT_HEIGHT : PROJECT_CARD_HEIGHT)
  const panelPadding = compact ? COMPACT_PANEL_PADDING : PANEL_PADDING
  // Une compacte que sa grille a choisie (R15, « Récents » d'Explorer), et non une case de la
  // mosaïque d'un membre, où l'écran donne la taille.
  const chosenByGrid = compact && givenSize === undefined
  // R14 : la carte compacte ne montre pas la catégorie (la page du projet l'a) ; le reste du dessin
  // l'ignore donc comme si elle était absente. R16 : une catégorie en attente n'a encore ni nom ni
  // icône ; seule sa place compte (`categoryPending`).
  const category = compact || givenCategory === 'pending' ? undefined : givenCategory
  const categoryPending = !compact && givenCategory === 'pending'
  // Dans une case de la mosaïque, chaque étage de la carte grandit jusqu'à la hauteur de la case.
  // Une compacte choisie par sa grille aussi (R15) : les cartes d'une rangée de « Récents » ont la
  // même hauteur, celle de la plus haute, au lieu de bas en escalier (un titre de trois lignes).
  const stretched = useContext(CardStretchContext) || chosenByGrid
  const grow = stretched ? ({ flexGrow: 1 } as const) : null
  const [measures, measure] = useMeasures()
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
  const openAuthor = author?.onPress ? guard(author.onPress) : undefined
  // « Tester » : pas sur une case de la mosaïque d'un membre (R14, la page du projet l'a). Une
  // compacte de « Récents » le garde : Explorer est l'endroit où l'on vient essayer des projets, et
  // « Tester » y est l'action de chaque carte (décisions du 31/10 et du 17/11/2026).
  const shownTryIt = compact && !chosenByGrid ? undefined : tryIt
  const test = shownTryIt?.onPress ? guard(shownTryIt.onPress) : undefined
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
  // TypeScript garde rétrécie jusque dans le dessin. R14 : la carte compacte n'en garde que le
  // repère (voir `mark`).
  const change = !compact && updated?.kind === 'full' ? updated : null
  // Le repère « Mis à jour » posé dans la rangée du bas, à côté du statut : celui d'une `badge`, et
  // celui d'une `full` qui n'a pas de rangée de l'auteur où se poser (carte compacte ou sans auteur).
  const mark = updated && !(change && author) ? updated.label : null
  // R16 : l'extrait qui a correspondu à une recherche, à la place de l'accroche.
  const excerpt = match?.excerpt ?? null
  // R14 : sur une carte compacte avec photo, pas d'accroche (elle couvrirait la photo). R16 :
  // l'extrait d'une recherche, si : c'est lui qui dit pourquoi le projet est trouvé (planche
  // R16-Recherche-1440), au prix d'un verre un peu plus haut.
  const showPitch = !compact || !image || excerpt !== null
  // Le titre : sa variante, ses lignes et sa garde, les mêmes surligné (recherche) ou non.
  // R18 (choix 3) : sur téléphone, quatre lignes à texte agrandi (la compacte en avait trois, la
  // grande deux), et jamais un mot coupé (`wholeWords`) ; l'ordinateur ne change pas (choix 8).
  const titleProps = {
    variant: compact ? (wide ? 'heading' : 'headline') : 'title3',
    numberOfLines: longTitle ? 4 : compact ? 3 : 2,
    ...(phone ? { wholeWords: title } : null),
  } as const
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
  const describedIds = [
    change ? changeId : showPitch ? pitchId : null,
    categoryDescription ? categoryId : null,
  ]
    .filter(Boolean)
    .join(' ')
  const hint = [changeDescription, categoryDescription].filter(Boolean).join('. ')
  // La colonne du haut de la photo : la catégorie (avec photo) et l'emplacement (« Suivre »).
  // Une catégorie en attente y garde déjà sa place (R16) : la colonne existe avant l'étiquette, et
  // « Suivre », dessous, ne descend pas quand elle arrive.
  const topColumn = Boolean(overlay) || (hasPhoto && (Boolean(category) || categoryPending))
  // L'étiquette dessinée : décor pour les lecteurs d'écran (la description du lien la dit), et le
  // doigt passe au travers, vers la carte (`pointerEvents` en propriété : sur le web, seule cette
  // forme devient du CSS).
  // R16 (« La page ne bouge plus en arrivant ») : tant que son nom charge, la même vue, vide, à la
  // hauteur de l'étiquette (la zone à toucher autour de sa pastille, celle de `Tag`). Sans texte
  // inventé, ni rôle, ni nom : une place, rien à lire. À l'arrivée, l'étiquette s'y pose ; sur une
  // carte sans photo, le verre ne grandit plus de 52 points (l'étiquette et l'écart sous elle), et
  // l'auteur, posé au-dessus du titre mesuré, ne remonte plus. Sa largeur ne compte pas : la
  // place est vide, et l'étiquette, en début de ligne, ne pousse rien à côté d'elle.
  const categoryTag = category ? (
    <View
      pointerEvents="none"
      {...decorative}
      style={{ alignSelf: 'flex-start', maxWidth: '100%' }}
    >
      <Tag label={category.label} icon={category.icon} kind="category" onGlass />
    </View>
  ) : categoryPending ? (
    <View
      testID="category-pending"
      pointerEvents="none"
      {...decorative}
      style={{ alignSelf: 'flex-start', minHeight: layout.touchTarget }}
    />
  ) : null

  // La carte s'enfonce un peu sous le doigt, comme les boutons (`Pressed`), mais toute entière :
  // l'auteur et « Tester », posés dessus, s'enfoncent avec elle et restent à leur place.
  const scale = useSharedValue(1)
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  // Les bords des rangées posées sur le verre : ceux du contenu du verre.
  const edge = INSET + panelPadding
  // La rangée de l'auteur se pose au-dessus du titre, qui est mesuré : elle attend sa mesure
  // (invisible le temps d'un rendu) pour ne jamais se dessiner sur le titre.
  const authorBottom = edge + measures.bottom + ROW_GAP + (measures.title ?? 0) + ROW_GAP

  // --- Le calque du lien : la photo, le verre, le titre et l'accroche -------------------------
  const body = (
    <View
      style={{
        // R18 : sans hauteur (carte sans photo sur téléphone), celle du verre et de ses marges.
        ...(height === null ? null : { minHeight: height }),
        justifyContent: 'flex-end',
        padding: INSET,
        // Le verre ne monte jamais sous la colonne du haut (catégorie, « Suivre ») : à texte
        // agrandi sur une carte basse, la carte grandit plutôt (relecture de design R3, C2).
        paddingTop: INSET + (topColumn && measures.top > 0 ? measures.top + ROW_GAP : 0),
        ...grow,
      }}
    >
      {/* La photo remplit la carte, même agrandie par le texte ou étirée dans sa rangée. Elle
          décore : le lien porte déjà le nom du projet.
          R15 : sa hauteur n'est plus mesurée. Elle part de la hauteur minimale de la carte et
          grandit (`grow`) jusqu'au bas du cadre posé sur toute la carte. Une hauteur mesurée par
          `onLayout` restait périmée sur le web : react-native-web ne remesure une vue que si sa
          boîte de contenu change (un `ResizeObserver`, qui ignore les marges intérieures), et la
          carte grandit justement par sa marge du haut quand la colonne de « Suivre » arrive. Dans
          « Récents », la photo s'arrêtait 52 points au-dessus du bas de la carte.
          R18 : sans hauteur, la lumière part de 0 et grandit jusqu'au bas de la carte serrée : elle
          ne dépasse jamais sous elle, et se voit en liseré autour du verre. */}
      <View ref={coverRef} style={{ position: 'absolute', inset: 0 }} {...decorative}>
        <ProjectCover height={height ?? 0} grow image={image ?? null} shadow="card" />
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
      {/* R18 (relecture de design) : une carte sans photo qui serre son verre, étirée par sa
          rangée, le fait grandir jusqu'au bas de la case (`fit="fill"`) : le liseré de lumière
          reste le même tout autour, et les titres de la rangée s'alignent en haut. Sans cela, le
          verre restait collé au bas (`justifyContent: 'flex-end'` du calque) et la carte la plus
          courte avait plus de lumière au-dessus. Les cartes à photo gardent leur verre en bas. */}
      <Surface
        variant="panel"
        padding={compact ? 'md' : 'lg'}
        gap="sm"
        fit={hugsContent && stretched ? 'fill' : undefined}
      >
        {/* La place de la rangée de l'auteur, posée par-dessus ; sans auteur, aucune. */}
        {author ? <View style={{ height: measures.author }} /> : null}
        <View onLayout={measure('title')} style={{ gap: ROW_GAP }}>
          {/* Sans photo, la catégorie se pose au-dessus du titre (mesurée avec lui : la rangée de
              l'auteur reste au-dessus d'elle). */}
          {hasPhoto ? null : categoryTag}
          {/* Le titre de la compacte, plus petit (celui des petites cartes, `TesterCard`) : à 390
              points, une compacte n'a que 110 points de texte, où le titre du fil se coupait au
              milieu d'un mot (« Décollage » / « ! », essai du catalogue). Trois lignes : sans
              accroche, le titre est le seul texte qui nomme une compacte avec photo, et deux
              lignes coupaient les titres de plus de 25 signes à 390 (relecture de design R14). */}
          {/* R16 : dans un résultat de recherche, les mots cherchés y sont surlignés ; le titre
              reste un seul texte, lu d'un tenant. */}
          {/* R18 (choix 3) : sur téléphone, à texte agrandi, quatre lignes au plus ; et la garde
              des mots entiers (`wholeWords`) : « Les / anniversa… » ne se coupait plus au mot, mais
              au milieu. Sur le web, la garde est une formule de taille posée d'avance (le texte
              agrandi par le navigateur ne se lit pas au rendu). */}
          {match ? (
            <HighlightedText {...titleProps} text={title} words={match.words} />
          ) : (
            // R18 : l'espace tapée devant ? ! : ; devient insécable, à l'affichage seulement (le nom
            // du lien, plus bas, garde le titre tel qu'enregistré).
            <Text {...titleProps}>{keepPunctuation(title)}</Text>
          )}
          {change ? (
            <UpdateChange line={change.line} more={change.more} />
          ) : showPitch && match && excerpt !== null ? (
            <HighlightedText
              variant="callout"
              tone="secondary"
              numberOfLines={2}
              nativeID={pitchId}
              text={excerpt}
              words={match.words}
            />
          ) : showPitch ? (
            <Text variant="callout" tone="secondary" numberOfLines={2} nativeID={pitchId}>
              {pitch ? keepPunctuation(pitch) : pitch}
            </Text>
          ) : null}
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
      style={{ borderRadius: radii.sheet, ...grow }}
    >
      {body}
    </Pressable>
  ) : (
    body
  )

  // --- La rangée de l'auteur (sans auteur, aucune) --------------------------------------------
  const who = author ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <Avatar name={author.name} source={author.avatar} label={author.name} size={28} />
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text variant="callout" weight={700} numberOfLines={1}>
          {author.name}
        </Text>
      </View>
    </View>
  ) : null
  const authorRow = author ? (
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
  ) : null

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
  const tester = shownTryIt ? (
    <TestLink title={title} label={shownTryIt.label} onPress={test} size="compact" />
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
      {/* R12b : « Exemple » juste après le statut, qu'il nuance (le projet est fictif). */}
      {example ? (
        <View pointerEvents="none" style={{ flexShrink: 1, maxWidth: '100%' }}>
          <ExampleBadge />
        </View>
      ) : null}
      {badge ? (
        <View pointerEvents="none" style={{ flexShrink: 1, maxWidth: '100%' }}>
          <StatusPill label={badge} />
        </View>
      ) : null}
      {/* R14 : la carte compacte, ou sans auteur, y pose aussi le repère d'une mise à jour entière
          (sa ligne et « et 2 autres » restent à la page du projet). */}
      {mark ? (
        <View pointerEvents="none" style={{ flexShrink: 1, maxWidth: '100%' }}>
          <StatusPill label={mark} />
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
    // n'en garderait qu'une. R14 : tout autour, celle du rebond au Retour du navigateur, pour la
    // même raison ; toujours là, même sans rebond, pour que l'arbre garde sa forme (une vue ajoutée
    // en route remonterait la carte, et le lien perdrait son focus).
    <Animated.View style={[{ alignSelf: 'stretch' }, grow, bounceStyle]}>
      <Animated.View {...tilt.handlers} style={[{ alignSelf: 'stretch' }, grow, tilt.cardStyle]}>
        {/* R17 (relecture du design C2) : la vue qui contient la photo et tout le texte de la
            carte porte `data-cover-panel` ; pendant un passage, elle reste au-dessus de la photo
            qui vole (ui/coverTransition.tsx). */}
        <Animated.View {...coverPanelMark()} style={[{ alignSelf: 'stretch' }, grow, pressStyle]}>
          {/* La rangée de l'auteur vient avant le lien dans l'arbre, mais se dessine au-dessus de
            lui (zIndex). box-none : le calque laisse passer le doigt hors de la rangée. */}
          {authorRow ? (
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
          ) : null}
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
          {/* R18 : sur le web, la ligne cachée qui mesure le texte agrandi (`useLargeText`),
              posée seulement sur téléphone, le seul à s'en servir. */}
          {phone ? largeText.probe : null}
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

// ---------------------------------------------------------------------------------------------
// R16 (« Les squelettes ») : la carte vide
// ---------------------------------------------------------------------------------------------

/** Les formes de la carte vide, en points : une ligne de texte, le titre, la photo de l'auteur. */
const SKELETON_LINE = 14
const SKELETON_TITLE = 22
const SKELETON_AVATAR = 28
/** « Tester » : la hauteur d'un contrôle compact (`TestLink size="compact"`) et à peu près sa largeur. */
const SKELETON_TESTER = { height: layout.controlHeight.compact, width: 96 }
/** Le statut : une pastille plus basse, et le total des réactions, un petit trait au bout. */
const SKELETON_PILL = { height: 2 * SKELETON_LINE, width: 72 }
const SKELETON_TOTAL = 28

/**
 * La carte de projet vide (planches R16-Fil et R16-Membre ; plan R16, choix 4) : à la place d'une
 * `ProjectCard` qui arrive, de sa hauteur exacte (`PROJECT_CARD_HEIGHT` ou
 * `PROJECT_CARD_COMPACT_HEIGHT`, les mêmes constantes que la carte, jamais recopiées) : quand la
 * vraie carte la remplace, rien ne saute. C'est une carte vide (`SkeletonSurface`, crème de jour,
 * la feuille de nuit, avec sa lueur) et, en bas, un panneau plein à la place du verre, aux mêmes
 * marges, avec les rangées de la vraie carte :
 * - la grande : l'auteur et la date, le titre, deux lignes d'accroche, puis « Tester », le statut et
 *   le total des réactions ;
 * - la compacte (la mosaïque d'un membre, « Récents » d'Explorer) : le titre, puis le statut et le
 *   total.
 *
 * Elle n'a ni rôle ni nom : un seul `Loading` (« Chargement… ») enveloppe toutes les cartes vides
 * d'une zone, et un lecteur d'écran ne l'entend qu'une fois, pas une fois par carte.
 *
 * Sans `size`, elle choisit comme la carte : la compacte dans une grille de compactes sur
 * ordinateur (`GridCardsContext`), la grande ailleurs. Sans `column`, elle prend celle de sa case
 * dans une `ProjectGrid` (`GridColumnContext`), 0 hors d'une grille : sa lueur passe 150 ms plus
 * tard d'une colonne à la suivante, et traverse ainsi la rangée.
 */
export function ProjectCardSkeleton({
  size: givenSize,
  column,
  author = true,
}: {
  size?: ProjectCardSize
  /** Le rang de la carte dans sa rangée (0 pour la première) : le retard de sa lueur. */
  column?: number
  /**
   * La rangée de l'auteur, dans la grande carte. Faux sur la page d'un membre, où la vraie carte
   * n'en a pas (R14, `author` absent) : le panneau vide garde la même forme que celui qui arrive.
   */
  author?: boolean
}): ReactNode {
  const { colors } = useTheme()
  const wide = useLayout().sizeClass === 'wide'
  const gridCards = useContext(GridCardsContext)
  const gridColumn = useContext(GridColumnContext)
  const compact =
    (givenSize ?? (gridCards === 'compact' && wide ? 'compact' : 'full')) === 'compact'
  return (
    <SkeletonSurface
      height={compact ? PROJECT_CARD_COMPACT_HEIGHT : PROJECT_CARD_HEIGHT}
      column={column ?? gridColumn}
    >
      {/* Le panneau en bas, à la marge du verre de la vraie carte. */}
      <View style={{ flexGrow: 1, justifyContent: 'flex-end', padding: INSET }}>
        {/* Le verre, plein : sans flou (rien derrière à flouter), bordé du filet du vrai verre
            (`panelBorder`), dans le rôle du panneau d'une carte vide (`skeletonPanel`) : la crème de
            jour, et de nuit un ton un peu plus clair que la carte (planche R16-Fil-1440-Nuit), là où
            la feuille de nuit avait la couleur exacte de la carte vide et s'y confondait. */}
        <View
          style={{
            gap: ROW_GAP,
            padding: compact ? COMPACT_PANEL_PADDING : PANEL_PADDING,
            borderRadius: radii.panel,
            borderWidth: borders.hairline,
            borderColor: colors.panelBorder,
            backgroundColor: colors.skeletonPanel,
          }}
        >
          {author && !compact ? (
            // L'auteur à gauche, la date à droite, à la hauteur d'une zone à toucher.
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                minHeight: layout.touchTarget,
              }}
            >
              <Shape height={SKELETON_AVATAR} width={SKELETON_AVATAR} round />
              <View style={{ flexGrow: 1 }}>
                <Shape height={SKELETON_LINE} width="45%" />
              </View>
              <Shape height={SKELETON_LINE} width={SKELETON_TOTAL * 2} />
            </View>
          ) : null}
          <Shape height={SKELETON_TITLE} width={compact ? '80%' : '70%'} />
          {compact ? null : (
            <>
              <Shape height={SKELETON_LINE} width="92%" />
              <Shape height={SKELETON_LINE} width="65%" />
            </>
          )}
          {/* La rangée du bas : « Tester » (grande carte), le statut, puis le total au bout. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              ...(compact ? null : { minHeight: layout.touchTarget }),
            }}
          >
            {compact ? null : (
              <Shape height={SKELETON_TESTER.height} width={SKELETON_TESTER.width} round />
            )}
            <View style={{ flexGrow: 1 }}>
              <Shape height={SKELETON_PILL.height} width={SKELETON_PILL.width} round />
            </View>
            <Shape height={SKELETON_LINE} width={SKELETON_TOTAL} />
          </View>
        </View>
      </View>
    </SkeletonSurface>
  )
}
