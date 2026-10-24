// La carte d'un signalement dans la file de modération (tranche 7a), ou d'un contenu retiré : la
// sorte de contenu (« Commentaire ») et le nombre de signalements, le texte signalé en citation,
// les motifs avec leur nombre, les précisions laissées par les membres, la date, un lien « Voir »,
// puis les décisions possibles (« Retirer », « Classer sans suite », « Rétablir »).
// Depuis la tranche 7b, la copie se lit champ par champ (« Titre », « Pitch », « Lien de démo »),
// avec l'état de ses images (toujours affichée, ou partie depuis) et, s'il y a lieu, une phrase qui
// dit que le contenu a changé entre deux signalements.
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
import { borders, layout, radii, space } from '@ruche/brand'
import { type Ref, useId } from 'react'
import { View } from 'react-native'
import { Button } from './Button'
import { ActionDescription } from './CommentAction'
import { Icon } from './Icon'
import { Notice } from './Notice'
import { StatusPill } from './StatusPill'
import { Text } from './Text'
import { TextLink } from './TextLink'
import { useTheme } from './theme/ThemeProvider'

/** Un champ de la copie : son libellé (« Pitch ») et sa valeur, telle que le membre l'a écrite. */
export type SnapshotField = { label: string; value: string }

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
  /** Le nombre de signalements, en toutes lettres (« 3 signalements ») ; rien pour un retiré. */
  count?: string
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
  /** Les motifs avec leur nombre (« Arnaque ou spam ×2 »), ou le fondement d'un retrait. */
  reasons?: readonly string[]
  /** Les précisions des membres (ou l'explication d'un retrait), en texte brut. */
  details?: readonly string[]
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

export function ReportCard({
  kind,
  count,
  snapshot,
  snapshotLabel,
  snapshotNote,
  images = [],
  reasons = [],
  details = [],
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
        <StatusPill label={kind} />
        {count ? (
          <Text variant="callout" weight={600} tone="secondary">
            {count}
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
            snapshot.map((field, index) => (
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
        </View>
        {/* Les images : seulement leur état, jamais l'image (elle peut être illégale). */}
        {images.map((image) => (
          <View
            key={image}
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

      {status ? <InfoLine text={status} /> : null}

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
      {description ? <ActionDescription id={descriptionId} text={description} /> : null}
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
