// Une ligne de la page Activité (refonte, tranche R8, planches `R8-Activite`, `R8-Activite-Plus`
// et leur nuit). Elle remplace la carte encadrée de la tranche 6b : plus de cadre, une ligne posée
// sur la page, comme une conversation.
//
// - À gauche, qui ou quoi : la photo de profil d'un membre (`Avatar`), ou une icône dans un rond
//   (neutre, miel pour les réactions, rouge pour la modération).
// - Au milieu, la phrase, en morceaux (`parts`) : les noms et les titres en gras, une version en
//   police à chasse fixe (« v1.2 »), puis la date, en petit, dans la même phrase. Dessous, selon la
//   sorte : l'extrait d'un commentaire dans une bulle, les icônes des réactions reçues dans une
//   pastille, ou une ligne de détail (la première ligne d'une mise à jour, « Voir la raison… »).
// - À droite, de quoi elle parle : la vignette du projet (`ProjectThumb`) ou la tuile d'un outil
//   (`InitialTile`).
// - Nouvelle (arrivée depuis la dernière visite) : un fond de miel très pâle (`highlightSoft`) et un
//   liseré miel (`highlightEdge`). Le mot « Nouveau » ne se voit pas, mais il se lit : la couleur
//   seule ne dirait rien à qui n'y voit pas.
//
// Avec `onPress`, toute la ligne est un lien (vers le projet, le commentaire, l'outil) : les
// lecteurs d'écran entendent son nom, qui reprend tout ce qu'elle écrit. Avec `onPress: null` (les
// abonnés à son compte, sans nom), elle ne mène nulle part : ni lien ni bouton, ses textes se lisent
// l'un après l'autre.
import { borders, radii, space } from '@ruche/brand'
import type { ReactionKind } from '@ruche/contracts'
import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Avatar } from './Avatar'
import { hiddenFrame } from './HiddenHeading'
import { Icon, type IconName } from './Icon'
import { InitialTile } from './InitialTile'
import type { ImageSource } from './image'
import { Pressed } from './Pressed'
import type { CoverImage } from './ProjectCover'
import { ProjectThumb } from './ProjectThumb'
import { ReactionIcon } from './ReactionCapsule'
import { useRelativeDate } from './RelativeTime'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

/** Ce qui se pose à gauche : la photo d'un membre, ou l'icône de la sorte de notification. */
export type NotificationLeading =
  | {
      kind: 'avatar'
      /** Le nom du membre : ses initiales, sans photo. */
      name: string
      /** Sa photo, toute prête (`useMediaSources` de l'écran) ; null : les initiales. */
      image: ImageSource | null
    }
  | {
      kind: 'icon'
      icon: IconName
      /** `honey` : les réactions ; `danger` : une décision de la modération ; `neutral` sinon. */
      tone: 'neutral' | 'honey' | 'danger'
    }

/** Un morceau de la phrase : du texte simple, en gras (`strong`), ou une version (`version`). */
export type NotificationPart = { text: string; style?: 'strong' | 'version' }

/** Ce qui se pose à droite : la vignette d'un projet, ou la tuile d'un outil. */
export type NotificationThumb =
  | {
      kind: 'project'
      /** La photo de couverture, toute prête ; null : la lumière miel d'un projet sans photo. */
      image: CoverImage | null
      /** Le titre du projet (la vignette est un décor : la phrase le nomme déjà). */
      title: string
    }
  | { kind: 'tool'; name: string }

type Props = {
  leading: NotificationLeading
  /** La phrase, déjà traduite et découpée (`ui/marks.ts`). */
  parts: NotificationPart[]
  /**
   * Quand. Une date ISO (`{ date }`) se dit par rapport à maintenant (« il y a 2 h », « hier ») et
   * se lit en entier (« 20 octobre à 14:00 ») ; `now` fige l'heure (catalogue, tests). Un texte
   * (« 18 oct. ») s'écrit tel quel : une décision de la modération garde sa date absolue (jur-J2).
   */
  when: string | { date: string; now?: Date }
  /** L'extrait d'un commentaire ou d'un appel, dans une bulle. */
  quote?: string | null
  /** Les réactions reçues, en icônes dans une pastille (le nombre est dans la phrase). */
  reactions?: ReactionKind[]
  /** Une ligne de plus, en petit (la première ligne d'une mise à jour, « Voir la raison… »). */
  detail?: string | null
  /** La vignette du projet, ou la tuile de l'outil ; rien sinon. */
  thumb?: NotificationThumb | null
  /** Arrivée depuis la dernière visite : fond miel pâle, et « Nouveau » lu. */
  isNew: boolean
  /** Où elle mène ; `null` : elle ne se touche pas (ni lien ni bouton). */
  onPress: (() => void) | null
  /**
   * La vue qui reçoit le focus quand la ligne arrive avec la page suivante (`useFirstArrived` de
   * l'écran) : le lien lui-même, que le lecteur d'écran du téléphone lit en entier, ou la ligne
   * quand elle ne mène nulle part.
   */
  ref?: Ref<View>
}

/**
 * Un morceau du nom lu, fini par un point, sauf s'il finit déjà par un signe (« ce soir… »,
 * « Bravo ! ») : un lecteur d'écran lirait sinon « ce soir… . ». Les espaces de fin comptent pour
 * rien (l'espace fine avant « ! » non plus : on regarde le dernier caractère visible).
 */
export const sentence = (part: string): string => {
  const trimmed = part.trimEnd()
  return /[.!?…»]$/u.test(trimmed) ? trimmed : `${trimmed}.`
}

/** La phrase en texte simple, telle qu'un lecteur d'écran la dit (sans gras ni police). */
export const partsText = (parts: NotificationPart[]): string =>
  parts.map((part) => part.text).join('')

/** Le rond de l'icône et la photo d'un membre : la planche les veut à 40 points. */
const LEADING = 40
/** Les icônes des réactions, dans leur pastille. */
const REACTION_ICON = 16
/** Le coin de la bulle tourné vers qui parle, plus serré que les trois autres (planche : 6). */
const BUBBLE_TAIL = 6

export function NotificationCard({ when, ...props }: Props) {
  if (typeof when === 'string') return <Row {...props} dateShown={when} dateName={when} />
  return <RelativeRow {...props} when={when} />
}

/** Une ligne datée par rapport à maintenant : le texte court se montre, la date complète se lit. */
function RelativeRow({
  when,
  ...props
}: Omit<Props, 'when'> & { when: { date: string; now?: Date } }) {
  // Un hook plutôt que `RelativeTime` : la date se pose dans la phrase, comme un mot (sur le web,
  // `RelativeTime` est une vue, qui ne se glisse pas dans un texte). Il suit la même horloge
  // partagée, et attend l'hydratation du web avant de parler de « maintenant ».
  const { label, full } = useRelativeDate(when.date, when.now)
  return <Row {...props} dateShown={label} dateName={full} />
}

type RowProps = Omit<Props, 'when'> & {
  /** La date telle qu'on la voit (« il y a 12 min »). */
  dateShown: string
  /** La date telle que le nom du lien la dit (« 12 novembre à 14:00 »). */
  dateName: string
}

function Row({
  leading,
  parts,
  quote,
  reactions,
  detail,
  thumb,
  isNew,
  onPress,
  dateShown,
  dateName,
  ref,
}: RowProps) {
  const { t } = useTranslation()
  const { colors, shadows } = useTheme()
  const newWord = t(($) => $.notifications.new)
  const content = (
    <View
      // La ligne qui ne mène nulle part reçoit elle-même le focus d'arrivée ; un lien le prend.
      ref={onPress ? undefined : ref}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space.md,
        padding: space.md,
        borderRadius: radii.group,
        // Le miel pâle d'une nouvelle (relecture du plan : jamais `honeySoft`, trop proche du rond
        // miel posé dessus). Sans fond sinon : la ligne est posée sur la page.
        backgroundColor: isNew ? colors.highlightSoft : 'transparent',
        // Et son liseré miel (relecture de design de R8) : sur la lumière miel d'Activité, le miel
        // pâle seul ne se voyait presque pas (1,16:1 sur téléphone, 1,04:1 sur ordinateur). Une
        // ligne vue garde un bord de même épaisseur, transparent : ses textes restent alignés sur
        // ceux d'une nouvelle.
        borderWidth: borders.strong,
        borderColor: isNew ? colors.highlightEdge : 'transparent',
      }}
    >
      <Leading leading={leading} />
      {/* minWidth 0 : un mot très long (un titre sans espace) se coupe au lieu de déborder. */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="callout" breakAnywhere>
          {/* La phrase seule dans son propre texte (sans la date qui suit) : on la retrouve, et
              les lecteurs d'écran la lisent, sans la date collée au dernier mot. */}
          <Text variant="callout">
            {parts.map((part, index) =>
              // Le rang pour clé : deux morceaux peuvent porter le même texte (« de », « sur »).
              part.style === 'strong' ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: les morceaux d'une phrase ne bougent pas.
                <Text key={index} variant="callout" weight={700}>
                  {part.text}
                </Text>
              ) : part.style === 'version' ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: les morceaux d'une phrase ne bougent pas.
                <Text key={index} variant="mono" tone="muted">
                  {part.text}
                </Text>
              ) : (
                part.text
              ),
            )}
          </Text>{' '}
          {/* La date, dans la phrase : elle passe à la ligne avec elle, sans colonne à part. Sur une
              ligne qui n'est pas un lien, aucun nom de lien ne dit la date complète : le texte
              court la donne lui-même au lecteur d'écran du téléphone (« 19 octobre à 20:00 »,
              comme avant R8 ; test d'écran de R4). */}
          <Text
            variant="caption"
            tone="muted"
            {...(onPress ? null : { accessibilityLabel: dateName })}
          >
            {dateShown}
          </Text>
        </Text>
        {quote ? (
          // L'extrait, dans une bulle blanche dont le coin du haut, à gauche, pointe vers qui parle.
          <View
            style={{
              alignSelf: 'flex-start',
              maxWidth: '100%',
              marginTop: space.sm,
              paddingHorizontal: space.md,
              paddingVertical: space.sm,
              borderRadius: radii.small,
              borderTopLeftRadius: BUBBLE_TAIL,
              backgroundColor: colors.surface,
              boxShadow: shadows.soft,
            }}
          >
            {/* En entier : l'API le raccourcit déjà, et à texte agrandi, une coupe après deux
                lignes en cacherait la moitié. */}
            <Text variant="callout" breakAnywhere>
              {quote}
            </Text>
          </View>
        ) : null}
        {reactions && reactions.length > 0 ? (
          // Les icônes des réactions reçues, dans une pastille. Un décor : la phrase dit déjà
          // combien (« 12 réactions sur… ») ; les icônes en donnent l'humeur d'un coup d'œil.
          <View
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.xs,
              marginTop: space.sm,
              minHeight: space.xxl + space.xs,
              paddingHorizontal: space.sm,
              borderRadius: radii.pill,
              backgroundColor: colors.surface,
              boxShadow: shadows.soft,
            }}
          >
            {reactions.map((kind) => (
              <ReactionIcon key={kind} kind={kind} size={REACTION_ICON} amber />
            ))}
          </View>
        ) : null}
        {detail ? (
          <View style={{ marginTop: space.xxs }}>
            <Text variant="caption" tone="secondary" breakAnywhere>
              {detail}
            </Text>
          </View>
        ) : null}
        {isNew ? (
          // « Nouveau », caché à l'œil (le fond le dit) mais lu, dans le lien comme hors de lui.
          <View style={hiddenFrame} pointerEvents="none">
            <Text>{newWord}</Text>
          </View>
        ) : null}
      </View>
      {thumb ? <Thumb thumb={thumb} /> : null}
    </View>
  )
  if (!onPress) return content
  // Le nom du lien : tout ce que la ligne écrit, en phrases, puis « Nouveau ».
  const label = [partsText(parts), dateName, quote, detail, isNew ? newWord : null]
    .filter((part): part is string => Boolean(part))
    .map(sentence)
    .join(' ')
  return (
    <Pressed label={label} onPress={onPress} role="link" ref={ref}>
      {content}
    </Pressed>
  )
}

/** Le rond de gauche : la photo du membre, ou l'icône dans sa teinte. */
function Leading({ leading }: { leading: NotificationLeading }) {
  const { colors } = useTheme()
  return (
    // Un décor : la phrase nomme déjà le membre (« Papi Jean a commenté… »), sa photo n'ajoute rien
    // à lire. Caché partout : `aria-hidden` (web et tests), et ses équivalents d'iOS et d'Android.
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexShrink: 0 }}
    >
      {leading.kind === 'avatar' ? (
        <Avatar name={leading.name} source={leading.image} label={leading.name} size={LEADING} />
      ) : (
        <View
          style={{
            width: LEADING,
            height: LEADING,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor:
              leading.tone === 'honey'
                ? colors.honeySoft
                : leading.tone === 'danger'
                  ? colors.dangerSoft
                  : colors.surfaceGrouped,
          }}
        >
          <Icon
            name={leading.icon}
            size={20}
            tone={
              leading.tone === 'honey' ? 'amber' : leading.tone === 'danger' ? 'danger' : 'default'
            }
          />
        </View>
      )}
    </View>
  )
}

/** La vignette de droite : la photo du projet, ou la tuile de l'outil. Un décor, elle aussi. */
function Thumb({ thumb }: { thumb: NotificationThumb }) {
  return (
    <View style={{ flexShrink: 0 }}>
      {thumb.kind === 'project' ? (
        <ProjectThumb image={thumb.image} size="row" />
      ) : (
        <InitialTile name={thumb.name} size="row" />
      )}
    </View>
  )
}
