// La carte d'un signalement dans la file de modération (tranche 7a), ou d'un contenu retiré : la
// sorte de contenu (« Commentaire ») et le nombre de signalements, le texte signalé en citation,
// les motifs avec leur nombre, les précisions laissées par les membres, la date, un lien « Voir »,
// puis les décisions possibles (« Retirer », « Classer sans suite », « Rétablir »).
// Depuis la tranche 7b, la copie se lit champ par champ (« Titre », « Pitch », « Lien de démo »),
// avec l'état de ses images (toujours affichée, ou partie depuis) et, s'il y a lieu, une phrase qui
// dit que le contenu a changé entre deux signalements. Au-delà de quatre champs, elle se replie
// après le troisième (« Afficher tout »).
//
// Tout ce qu'un membre a écrit (le texte signalé, les précisions) s'affiche en texte brut : ni
// Markdown, ni lien qu'on pourrait toucher par mégarde (règle 22 de la relecture du plan). Le seul
// lien de la carte est « Voir », construit par l'écran à partir de la sorte et de l'identifiant.
// Jamais qui a signalé : la carte n'a aucune place pour un nom.
// Sans action (un contenu qui concerne l'administrateur lui-même), `status` dit pourquoi.
//
// Chaque carte a ses « Voir », « Retirer », « Classer sans suite » : le lecteur d'écran dit de
// quelle carte il s'agit grâce à une courte description (la sorte et le début du texte), reliée à
// chaque bouton par aria-describedby sur le web et lue comme indice sur téléphone (`description`).
//
// Une fois décidée (`decided`), la carte reste à sa place : ses boutons laissent la place au
// résultat (« Signalement classé sans suite. »), sur une ligne au moins aussi haute. Rien ne
// remonte ainsi sous le doigt : retirer la carte faisait arriver le « Classer » de la suivante à
// l'endroit exact qu'on venait de toucher (relecture de la tranche 7a).
//
// Tranche 7c : les précisions des membres passent sous leur propre libellé (`detailsLabel`), pour
// ne plus ressembler à la citation ; et la carte rappelle ce que la modération a déjà décidé pour le
// membre visé (`record` : « 2 retraits », « 1 suspension »), avant les boutons, pour décider en le
// sachant. Ce rappel reste une fois la carte décidée : il est toujours vrai.
//
// R9 (planches `R9-Moderation-Desktop` et `R9-Moderation-Telephone`) : le nombre de signalements
// devient un nombre, que la carte écrit « Signalé 2 fois », en rouge, à partir de deux (un seul
// signalement ne dit rien de plus que sa présence dans la file) ; la partie visée suit la sorte
// (« Projet · la photo 2 ») ; l'heure du signalement est relative (« il y a 12 min »), l'heure
// exacte au survol et dans le nom lu. Avec une adresse (`href`), la carte devient un **élément de
// la file** : une ligne compacte, dont le motif est le titre, et qui est un lien vers son détail
// (`?item=`), marqué « actuel » quand le détail le montre (`current`). Ses actions, s'il y en a,
// restent hors du lien : un bouton dans un lien est interdit en HTML, et le toucher ouvrirait aussi
// l'élément.
import { borders, layout, radii, space } from '@ruche/brand'
import { type Ref, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, View } from 'react-native'
import { describedBy } from './aria'
import { Button } from './Button'
import { ActionDescription } from './CommentAction'
import { Icon, type IconName } from './Icon'
import type { ImageSource } from './image'
import { enterActivates } from './keyboard'
import type { PressEvent } from './ListGroup'
import { Notice } from './Notice'
import { PICTURE_MAX_HEIGHT } from './OpenableImage'
import { ProjectCover } from './ProjectCover'
import { STATUS_PILL_HEIGHT, StatusPill } from './StatusPill'
import { Text } from './Text'
import { TextLink } from './TextLink'
import { useLargeText } from './textScale'
import { useTheme } from './theme/ThemeProvider'

/** Un champ de la copie : son libellé (« Pitch ») et sa valeur, telle que le membre l'a écrite. */
export type SnapshotField = { label: string; value: string }

/** Le nombre de champs d'une copie montrés avant « Afficher tout ». */
export const FOLDED_FIELDS = 3

/** Une décision proposée sur la carte : un bouton nommé d'après elle. */
export type ReportCardAction = {
  label: string
  onPress: () => void
  /** « danger » : une décision qui retire quelque chose (bouton rouge pâle). */
  tone?: 'default' | 'danger'
  /** En cours d'envoi : le bouton ignore les appuis mais garde le focus. */
  loading?: boolean
  /** Pour y poser le focus du clavier depuis l'écran. */
  ref?: Ref<View>
}

type Props = {
  /** La sorte de contenu, déjà traduite (« Commentaire », « Profil »). */
  kind: string
  /**
   * R9 : la partie signalée, déjà traduite, en minuscules (« la photo 2 »), écrite après la sorte
   * (« Projet · la photo 2 »). `null` ou absente : le contenu entier.
   */
  part?: string | null | undefined
  /**
   * Le nombre de signalements (R9 : un nombre, la carte écrit « Signalé 2 fois », en rouge, à partir
   * de 2 ; rien pour un seul). Absent pour un contenu retiré.
   */
  count?: number | undefined
  /**
   * R9 : l'heure du (premier) signalement, déjà écrite : relative (« il y a 12 min »), montrée sur la
   * carte, et exacte (« aujourd'hui à 17:48 »), au survol et dans le nom lu.
   */
  reportedAt?: { relative: string; exact: string } | undefined
  /**
   * R9 : l'adresse du détail de cet élément (`/moderation?item=…`). Avec elle, la carte devient un
   * élément de la file : une ligne compacte, motif en titre, qui est un lien (un vrai `<a>` sur le
   * web) ; ses actions restent hors du lien.
   */
  href?: string | undefined
  /** R9 : vrai si le détail montre cet élément (`aria-current`, « sélectionné » sur téléphone). */
  current?: boolean
  /**
   * R9 : le geste sur l'élément, que l'écran branche sur son routeur (comme `ListRow`). Sur le web,
   * le navigateur ne recharge pas la page.
   */
  onSelect?: ((event?: PressEvent) => void) | undefined
  /** R9 : l'icône de la sorte de contenu, dans une tuile à gauche de l'élément de la file. */
  icon?: IconName | undefined
  /**
   * R9 : la ligne qui dit où et de qui, déjà écrite (« Gains Rapides (@gains_rapides), sur
   * Décollage ! »), sous la citation de l'élément de la file.
   */
  context?: string | undefined
  /** R9 : vrai pour un auteur inscrit depuis moins de 14 jours (pastille « Compte récent »). */
  recentAccount?: boolean
  /**
   * Ce qui a été signalé, en texte brut : un texte seul (le texte actuel d'un contenu retiré), ou,
   * depuis la tranche 7b, la copie champ par champ, chacun avec son libellé déjà traduit
   * (« Titre », « Lien de démo »), dans l'ordre donné.
   */
  snapshot: string | readonly SnapshotField[]
  /** Ce que montre la citation (« Copie au moment du signalement »). */
  snapshotLabel?: string
  /**
   * Une phrase sur la copie elle-même (« Le contenu a changé entre deux signalements… »), posée
   * avant elle : on la lit avant de juger le texte.
   */
  snapshotNote?: string | undefined
  /**
   * L'état de chaque image de la copie, en phrases déjà traduites (« Couverture : toujours
   * affichée ») : la file ne montre jamais l'image elle-même (règle 15 de la relecture du plan 7b).
   */
  images?: readonly string[]
  /**
   * R7b : la capture d'un message ou la photo d'un appel du coin des testeurs, que l'API ne donne
   * que tant qu'un signalement ouvert les vise. `name` : ce que lit le lecteur d'écran. L'image est
   * chargée en mémoire seulement (`cachePolicy`), jamais sur le disque de l'appareil de la modération.
   */
  pictures?: readonly { name: string; source: ImageSource }[]
  /** Les motifs avec leur nombre (« Arnaque ou spam ×2 »), ou le fondement d'un retrait. */
  reasons?: readonly string[]
  /** Les précisions des membres (ou l'explication d'un retrait), en texte brut. */
  details?: readonly string[]
  /**
   * Le libellé posé au-dessus des précisions (« Précisions des personnes qui ont signalé ») ; il
   * n'apparaît que s'il y a des précisions.
   */
  detailsLabel?: string | undefined
  /**
   * Ce que la modération a déjà décidé pour le membre visé, déjà traduit : un titre (« Déjà décidé
   * pour ce membre ») et ses lignes (« 2 retraits », « suspendu en ce moment »), lues en une
   * phrase séparée par des virgules. `onPress` : le titre devient un bouton souligné qui ouvre
   * l'historique des décisions de ce membre. Rien : pas de rappel (un auteur dont le compte est supprimé).
   */
  record?: { label: string; lines: readonly string[]; onPress?: () => void } | undefined
  /** Quand (« Premier signalement le 20 oct. », « Retiré le 21 oct. »). */
  when: string
  /** Une phrase sur l'état de la cible (« Te concerne… », « Déjà retiré »). */
  status?: string
  /**
   * Le nom du lien vers le contenu (« Voir », « Voir le projet »), et où il mène. Sans eux, pas de
   * lien : un projet retiré n'a plus de page à montrer.
   */
  viewLabel?: string | undefined
  onView?: (() => void) | undefined
  /** Les décisions possibles ; aucune si la liste est vide ou absente. */
  actions?: readonly ReportCardAction[]
  /**
   * Ce que lit le lecteur d'écran après le nom de chaque bouton et du lien (« Commentaire : Envoie-
   * moi le code… ») : de quelle carte il s'agit, quand toutes ont les mêmes boutons.
   */
  description?: string | undefined
  /**
   * Le résultat de la décision prise sur cette carte : il remplace les boutons. `ok` faux : rien
   * n'a été fait ici (une décision prise entre-temps par quelqu'un d'autre), en simple information.
   */
  decided?: { message: string; ok: boolean } | undefined
  /** Pour poser le focus du clavier sur ce résultat (le bouton touché a disparu). */
  decidedRef?: Ref<View> | undefined
  /** Le refus d'une décision (une panne) : au-dessus des boutons, qui restent pour réessayer. */
  error?: string | undefined
}

export function ReportCard(props: Props) {
  return props.href === undefined ? <FullCard {...props} /> : <QueueItem {...props} />
}

/**
 * Le haut de la carte : la sorte et la partie (« Projet · la photo 2 »). Une seule phrase traduite :
 * chaque langue y garde son ordre des mots.
 */
const useKindLine = (kind: string, part: string | null | undefined): string => {
  const { t } = useTranslation()
  return part ? t(($) => $.moderation.kindPart, { kind, part }) : kind
}

/** « Signalé 2 fois », à partir de deux signalements ; rien en dessous. */
const useReportedTimes = (count: number | undefined): string | null => {
  const { t } = useTranslation()
  return count !== undefined && count >= 2 ? t(($) => $.moderation.reportedTimes, { count }) : null
}

/** La carte entière (la file d'avant R9, les retirés) : tout se lit sur place. */
function FullCard({
  kind,
  part,
  count,
  reportedAt,
  snapshot,
  snapshotLabel,
  snapshotNote,
  images = [],
  pictures = [],
  reasons = [],
  details = [],
  detailsLabel,
  record,
  when,
  status,
  viewLabel,
  onView,
  actions = [],
  description,
  decided,
  decidedRef,
  error,
}: Props) {
  const { colors, shadows } = useTheme()
  const { t } = useTranslation()
  const kindLine = useKindLine(kind, part)
  const reportedTimes = useReportedTimes(count)
  // Une copie de plus de trois champs (un projet entier : titre, pitch, description, prompts…)
  // faisait une carte plus haute qu'un écran de téléphone : elle se replie après les trois premiers,
  // et « Afficher tout » montre le reste sur place (relecture de design 7b). Jamais pour cacher un
  // seul champ : le bouton prendrait autant de place que lui (un profil : nom, pseudo, bio, outils).
  const [unfolded, setUnfolded] = useState(false)
  const foldable = typeof snapshot !== 'string' && snapshot.length > FOLDED_FIELDS + 1
  const folded = foldable && !unfolded
  // L'identifiant du texte caché qui décrit la carte (aria-describedby), stable entre le pré-rendu
  // web et le navigateur (useId).
  const descriptionId = useId()
  const describes = description
    ? { describedById: descriptionId, hint: description }
    : { describedById: undefined, hint: undefined }
  return (
    <View
      style={{
        gap: space.md,
        padding: space.lg,
        backgroundColor: colors.surface,
        borderRadius: radii.group,
        borderWidth: borders.hairline,
        borderColor: colors.groupBorder,
        boxShadow: shadows.soft,
      }}
    >
      {/* La sorte et le nombre : de quoi trier d'un coup d'œil. À texte agrandi, ils passent à la
          ligne au lieu de se chevaucher. */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: space.sm,
          rowGap: space.xs,
        }}
      >
        <StatusPill label={kindLine} />
        {reportedTimes ? <ReportedTimes label={reportedTimes} /> : null}
        {/* L'heure, relative puis exacte : sans lien ni survol, tout s'écrit. */}
        {reportedAt ? (
          <Text variant="caption" tone="muted">
            {t(($) => $.moderation.detail.at, reportedAt)}
          </Text>
        ) : null}
      </View>

      <View style={{ gap: space.xs }}>
        {snapshotLabel ? (
          <Text variant="caption" tone="muted">
            {snapshotLabel}
          </Text>
        ) : null}
        {snapshotNote ? <InfoLine text={snapshotNote} /> : null}
        {/* Le texte signalé, souligné d'un trait de miel à gauche, comme une citation (NoteCard).
            En texte brut, sélectionnable (pour le copier dans un rapport), coupé n'importe où
            plutôt que de déborder (une adresse sans espace). Une copie en champs : chacun sous
            son libellé, dans la même citation ; un lien de démo y reste un texte. */}
        <View
          style={{
            gap: space.sm,
            borderLeftWidth: borders.quote,
            borderLeftColor: colors.honey,
            paddingLeft: space.md,
          }}
        >
          {typeof snapshot === 'string' ? (
            <Text selectable breakAnywhere>
              {snapshot}
            </Text>
          ) : (
            (folded ? snapshot.slice(0, FOLDED_FIELDS) : snapshot).map((field, index) => (
              // Deux champs peuvent porter le même libellé (deux prompts, deux photos) : leur rang
              // les distingue, et la copie ne change jamais d'ordre.
              // biome-ignore lint/suspicious/noArrayIndexKey: un champ de la copie n'a pas d'autre identité que sa place
              <View key={index} style={{ gap: space.xxs }}>
                <Text variant="caption" weight={600} tone="muted">
                  {field.label}
                </Text>
                <Text selectable breakAnywhere>
                  {field.value}
                </Text>
              </View>
            ))
          )}
          {/* « Afficher tout » / « Replier », au bout des champs montrés : le même bouton, qui
              garde le focus, et dit s'il est déplié (aria-expanded). Relié à la carte, comme ses
              autres boutons. */}
          {foldable ? (
            <View style={{ alignSelf: 'flex-start' }}>
              <TextLink
                role="button"
                label={unfolded ? t(($) => $.moderation.showLess) : t(($) => $.moderation.showAll)}
                expanded={unfolded}
                onPress={() => setUnfolded((previous) => !previous)}
                {...describes}
              />
            </View>
          ) : null}
        </View>
        {/* Les images : seulement leur état, jamais l'image (elle peut être illégale). Deux photos
            peuvent avoir la même phrase : leur rang les distingue (l'écran les numérote aussi). */}
        {images.map((image, index) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: l'état d'une image n'a pas d'autre identité que sa place
            key={index}
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}
          >
            <Icon name="image" size={18} tone="muted" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="callout" tone="secondary">
                {image}
              </Text>
            </View>
          </View>
        ))}
        {pictures.map(({ name, source }, index) => (
          // Une image nommée : l'image elle-même a un nom vide, sinon le navigateur lirait deux images
          // l'une dans l'autre.
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: une image de la copie n'a pas d'autre identité que sa place
            key={index}
            accessible
            accessibilityRole="image"
            accessibilityLabel={name}
          >
            <ProjectCover
              // La hauteur au plus des images du coin (`OpenableImage`), où le membre les a vues.
              height={PICTURE_MAX_HEIGHT}
              radius="small"
              image={{ source, label: '', cachePolicy: 'memory' }}
            />
          </View>
        ))}
      </View>

      {reasons.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
          {reasons.map((reason) => (
            <View
              key={reason}
              style={{
                // À texte agrandi, un motif long (« Harcèlement ou haine ×1 ») passe à la ligne dans
                // sa pastille au lieu de sortir de la carte.
                maxWidth: '100%',
                paddingHorizontal: space.sm,
                paddingVertical: space.xxs,
                borderRadius: radii.pill,
                backgroundColor: colors.surfaceGrouped,
              }}
            >
              <Text variant="caption" weight={600} tone="secondary">
                {reason}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {details.length > 0 ? (
        <View style={{ gap: space.xs }}>
          {detailsLabel ? (
            <Text variant="caption" tone="muted">
              {detailsLabel}
            </Text>
          ) : null}
          {details.map((detail, index) => (
            // Deux précisions peuvent être identiques (deux membres, la même phrase) : leur rang
            // les distingue, et la liste ne change pas d'ordre.
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: une précision n'a pas d'autre identité que sa place
              key={index}
              style={{
                borderLeftWidth: borders.quote,
                borderLeftColor: colors.line,
                paddingLeft: space.md,
              }}
            >
              <Text variant="callout" tone="secondary" selectable breakAnywhere>
                {detail}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* La date, et « Voir » au bout de la même ligne : le lien reste à l'écart des décisions,
          qui ont leur propre rangée. À texte agrandi, « Voir » passe à la ligne. */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          columnGap: space.md,
        }}
      >
        <Text variant="caption" tone="muted">
          {when}
        </Text>
        {viewLabel && onView ? (
          <TextLink label={viewLabel} onPress={onView} {...describes} />
        ) : null}
      </View>

      {/* Le rappel des décisions passées, sur fond groupé : une information sur le membre, pas sur
          ce contenu. Les lignes se suivent sur une rangée, et passent à la ligne à texte agrandi. */}
      {record ? (
        <View
          style={{
            gap: space.xxs,
            padding: space.md,
            borderRadius: radii.small,
            backgroundColor: colors.surfaceGrouped,
          }}
        >
          {/* Le titre ouvre l'historique filtré sur ce membre, quand l'écran le donne. Un bouton
              souligné, qui agit sur place (l'onglet de la même page) : le seul lien de la carte
              reste « Voir » (règle 22). Relié à la carte comme ses boutons : chaque carte porte le
              même titre. Une carte décidée n'a plus de bouton (son résultat en tient lieu) : le
              titre redevient un texte, sur une ligne de la même hauteur, pour que rien ne
              remonte sous le doigt. */}
          {record.onPress && !decided ? (
            <View style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
              <TextLink
                role="button"
                label={record.label}
                onPress={record.onPress}
                {...describes}
              />
            </View>
          ) : (
            <View
              style={{
                minHeight: record.onPress ? layout.touchTarget : undefined,
                justifyContent: 'center',
              }}
            >
              <Text variant="caption" weight={600} tone="muted">
                {record.label}
              </Text>
            </View>
          )}
          {/* Les nombres se lisent comme une phrase (« 2 retraits, 1 suspension ») : un seul
              texte, qui passe à la ligne à texte agrandi. */}
          <Text variant="callout" weight={600} tone="secondary">
            {record.lines.join(', ')}
          </Text>
        </View>
      ) : null}

      {status ? <InfoLine text={status} /> : null}

      <CardEnd
        actions={actions}
        decided={decided}
        decidedRef={decidedRef}
        error={error}
        description={description}
        descriptionId={descriptionId}
      />
    </View>
  )
}

/**
 * R9 : un élément de la file. Une ligne compacte (planches de la file) : la tuile de la sorte, la
 * sorte et la partie, l'heure, le motif en titre, le début de la copie, la ligne « de qui, où », et
 * les pastilles « Signalé 2 fois » et « Compte récent ». Le tout est un lien vers le détail ; les
 * actions, la panne et le résultat restent dessous, hors du lien.
 */
function QueueItem({
  kind,
  part,
  count,
  reportedAt,
  snapshot,
  reasons = [],
  status,
  href = '',
  current = false,
  onSelect,
  icon,
  context,
  recentAccount = false,
  actions = [],
  description,
  decided,
  decidedRef,
  error,
}: Props) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const kindLine = useKindLine(kind, part)
  const reportedTimes = useReportedTimes(count)
  const recent = recentAccount ? t(($) => $.moderation.authorCard.recent) : null
  // Le motif est le titre : c'est ce qu'on lit pour trier la file (« Arnaque ou spam »).
  const title = reasons.join(', ')
  // Le début de ce qui a été signalé : un texte seul, ou le premier champ de la copie.
  const excerpt = typeof snapshot === 'string' ? snapshot : (snapshot[0]?.value ?? '')
  const at = reportedAt ? t(($) => $.moderation.detail.at, reportedAt) : null
  // Le nom lu du lien : le titre d'abord, puis tout ce que la ligne montre, l'heure exacte comprise
  // (que l'œil ne voit qu'au survol). Le début de la copie n'y est pas : il est lu en description,
  // avec celle des boutons (« Commentaire : Gagne 500 €… »), après le nom.
  const name = [title, kindLine, reportedTimes, context, recent, status, at]
    .filter((piece): piece is string => Boolean(piece))
    .join(', ')
  const descriptionId = useId()
  const { large, probe } = useLargeText()
  const select = () => onSelect?.()
  // Sur le web, l'heure exacte s'affiche au survol de l'heure relative (attribut `title`, que
  // react-native-web ne transmet pas : posé à la main sur l'élément du navigateur).
  const timeRef = useRef<View>(null)
  const exact = reportedAt?.exact
  useEffect(() => {
    // Dans les tests (Jest), l'élément n'est pas celui d'un navigateur : rien à poser.
    const element = timeRef.current as unknown as Partial<HTMLElement> | null
    if (Platform.OS !== 'web' || !exact || typeof element?.setAttribute !== 'function') return
    element.setAttribute('title', exact)
  }, [exact])
  return (
    <View style={{ alignSelf: 'stretch', gap: space.sm }}>
      {probe}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={name}
        // Sur téléphone, VoiceOver et TalkBack ignorent `aria-current` : « sélectionné ».
        accessibilityState={{ selected: current }}
        accessibilityHint={Platform.OS === 'web' ? undefined : description}
        {...describedBy(description ? descriptionId : undefined)}
        // `href` et `aria-current` manquent aux types de React Native (sur téléphone, ils sont
        // ignorés ; sur le web, react-native-web dessine un vrai `<a>`).
        {...{ href, ...(current ? { 'aria-current': 'page' } : null) }}
        // Entrée ouvre l'élément une fois : le navigateur n'y ajoute pas son propre clic.
        {...enterActivates(select)}
        onPress={(event) => {
          // Le routeur change l'adresse ; le navigateur ne recharge pas la page (vrai `<a>`).
          if (Platform.OS === 'web') event?.preventDefault?.()
          onSelect?.(event)
        }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: space.md,
          padding: space.md,
          borderRadius: radii.group,
          // L'élément montré dans le détail : le miel pâle et un liseré, qui se voit même sans les
          // couleurs (un fond seul ne suffit pas sur la lumière d'ambiance). Le liseré existe
          // toujours, transparent : rien ne bouge quand on choisit un autre élément.
          borderWidth: borders.strong,
          borderColor: current ? colors.highlightEdge : 'transparent',
          backgroundColor: current
            ? colors.highlightSoft
            : pressed
              ? colors.surfaceGrouped
              : 'transparent',
        })}
      >
        {/* La tuile de la sorte n'est qu'un repère (la sorte est écrite à côté) : à texte très
            agrandi, elle laisse sa place au titre, qui se coupait au milieu d'un mot à 320 px. */}
        {icon && !large ? (
          <View
            style={{
              width: layout.touchTarget,
              height: layout.touchTarget,
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              borderRadius: radii.small,
              backgroundColor: current ? colors.surface : colors.surfaceGrouped,
            }}
          >
            <Icon name={icon} size={20} tone="secondary" />
          </View>
        ) : null}
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: space.xxs }}>
          {/* La sorte et la partie, l'heure au bout ; à texte agrandi, l'heure passe dessous. */}
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              columnGap: space.sm,
            }}
          >
            <View style={{ flexShrink: 1, maxWidth: '100%' }}>
              <Text variant="caption" weight={700}>
                {kindLine}
              </Text>
            </View>
            {reportedAt ? (
              <View ref={timeRef}>
                <Text variant="caption" tone="muted">
                  {reportedAt.relative}
                </Text>
              </View>
            ) : null}
          </View>
          <Text variant="headline">{title}</Text>
          {/* Le début de la copie, sur une ligne : le détail la donne entière. */}
          {excerpt ? (
            <View
              style={{
                borderLeftWidth: borders.quote,
                borderLeftColor: colors.honey,
                paddingLeft: space.sm,
              }}
            >
              <Text variant="callout" tone="secondary" numberOfLines={1}>
                {excerpt}
              </Text>
            </View>
          ) : null}
          {context ? (
            <Text variant="caption" tone="muted">
              {context}
            </Text>
          ) : null}
          {reportedTimes || recent ? (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: space.xs,
                paddingTop: space.xxs,
              }}
            >
              {reportedTimes ? <ReportedTimes label={reportedTimes} /> : null}
              {recent ? <StatusPill label={recent} /> : null}
            </View>
          ) : null}
          {status ? <InfoLine text={status} /> : null}
        </View>
      </Pressable>
      {/* Les actions, la panne et le résultat, sous le lien, alignés sur son contenu. Rien du tout
          sans eux : pas d'écart vide sous un élément de la file sans action. */}
      {actions.length > 0 || decided || error ? (
        <View style={{ gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.sm }}>
          <CardEnd
            actions={actions}
            decided={decided}
            decidedRef={decidedRef}
            error={error}
            description={description}
            descriptionId={descriptionId}
            ownsDescription={false}
          />
        </View>
      ) : null}
      {/* La description cachée, lue après le nom du lien et de chaque bouton. */}
      {description ? <ActionDescription id={descriptionId} text={description} /> : null}
    </View>
  )
}

/**
 * La fin de la carte : la panne d'une décision, puis les boutons des décisions, ou le résultat à
 * leur place ; et la description cachée qui relie chaque bouton à sa carte.
 */
function CardEnd({
  actions,
  decided,
  decidedRef,
  error,
  description,
  descriptionId,
  ownsDescription = true,
}: {
  actions: readonly ReportCardAction[]
  decided: Props['decided']
  decidedRef: Props['decidedRef']
  error: string | undefined
  description: string | undefined
  descriptionId: string
  /** Faux : la carte pose elle-même la description cachée (l'élément de la file, dont le lien la lit aussi). */
  ownsDescription?: boolean
}) {
  const describes = description
    ? { describedById: descriptionId, hint: description }
    : { describedById: undefined, hint: undefined }
  return (
    <>
      {/* Une panne : le message reste au-dessus des boutons jusqu'à la réponse suivante. */}
      {error && !decided ? <Notice message={error} /> : null}

      {/* Le résultat, à la place des boutons : sa ligne fait au moins leur hauteur (44 points),
          et rien de ce qui suit ne remonte. */}
      {decided ? (
        <View style={{ minHeight: layout.touchTarget, justifyContent: 'center' }}>
          <Notice
            message={decided.message}
            tone={decided.ok ? 'success' : 'info'}
            polite
            {...(decidedRef ? { ref: decidedRef } : null)}
          />
        </View>
      ) : actions.length > 0 ? (
        // Les décisions. Elles passent à la ligne quand la place manque (texte agrandi) ; l'écart
        // garde chaque bouton à distance de son voisin.
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md }}
        >
          {actions.map((action) => (
            <Button
              key={action.label}
              label={action.label}
              onPress={action.onPress}
              variant={action.tone === 'danger' ? 'danger' : 'secondary'}
              size="compact"
              loading={action.loading ?? false}
              {...describes}
              {...(action.ref ? { ref: action.ref } : null)}
            />
          ))}
        </View>
      ) : null}
      {description && ownsDescription ? (
        <ActionDescription id={descriptionId} text={description} />
      ) : null}
    </>
  )
}

/**
 * « Signalé 2 fois » : une pastille rouge pâle, avec un drapeau, pour un contenu que plusieurs
 * membres ont signalé. Le texte dit le nombre : la couleur n'est jamais seule.
 */
function ReportedTimes({ label }: { label: string }) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        maxWidth: '100%',
        // La hauteur de la pastille de statut (« Compte récent »), posée à côté : même ligne.
        minHeight: STATUS_PILL_HEIGHT,
        gap: space.xxs,
        paddingHorizontal: space.sm,
        paddingVertical: space.xxs,
        borderRadius: radii.pill,
        backgroundColor: colors.dangerSoft,
      }}
    >
      <View style={{ flexShrink: 0 }}>
        <Icon name="flag" size={14} tone="danger" />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text variant="caption" weight={700} tone="danger">
          {label}
        </Text>
      </View>
    </View>
  )
}

/**
 * Une phrase à lire avant de décider, précédée d'une pastille d'information : l'état de la cible
 * (« Te concerne… »), ou une copie qui a changé entre deux signalements.
 */
function InfoLine({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
      <Icon name="info" size={18} tone="amber" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="callout" weight={600}>
          {text}
        </Text>
      </View>
    </View>
  )
}
