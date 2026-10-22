// La carte d'un signalement dans la file de modération (tranche 6d), ou d'un contenu retiré : la
// sorte de contenu (« Commentaire ») et le nombre de signalements, le texte signalé en citation,
// les motifs avec leur nombre, les précisions laissées par les membres, la date, un lien « Voir »,
// puis les décisions possibles (« Retirer », « Classer sans suite », « Rétablir »).
//
// Tout ce qu'un membre a écrit (le texte signalé, les précisions) s'affiche en texte brut : ni
// Markdown, ni lien qu'on pourrait toucher par mégarde (règle 22 de la relecture du plan). Le seul
// lien de la carte est « Voir », construit par l'écran à partir de la sorte et de l'identifiant.
// Jamais qui a signalé : la carte n'a aucune place pour un nom.
// Sans action (un contenu qui concerne l'administrateur lui-même), `status` dit pourquoi.
import { borders, radii, space } from '@ruche/brand'
import type { Ref } from 'react'
import { View } from 'react-native'
import { Button } from './Button'
import { Icon } from './Icon'
import { StatusPill } from './StatusPill'
import { Text } from './Text'
import { TextLink } from './TextLink'
import { useTheme } from './theme/ThemeProvider'

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
  /** Le texte signalé (ou le texte actuel d'un contenu retiré), en texte brut. */
  snapshot: string
  /** Ce que montre la citation (« Texte au moment du signalement ; images actuelles »). */
  snapshotLabel?: string
  /** Les motifs avec leur nombre (« Arnaque ou spam ×2 »), ou le fondement d'un retrait. */
  reasons?: readonly string[]
  /** Les précisions des membres (ou l'explication d'un retrait), en texte brut. */
  details?: readonly string[]
  /** Quand (« Premier signalement le 20 oct. », « Retiré le 21 oct. »). */
  when: string
  /** Une phrase sur l'état de la cible (« Te concerne… », « Déjà retiré »). */
  status?: string
  /** Le nom du lien vers le contenu (« Voir »), et où il mène. */
  viewLabel: string
  onView: () => void
  /** Les décisions possibles ; aucune si la liste est vide ou absente. */
  actions?: readonly ReportCardAction[]
}

export function ReportCard({
  kind,
  count,
  snapshot,
  snapshotLabel,
  reasons = [],
  details = [],
  when,
  status,
  viewLabel,
  onView,
  actions = [],
}: Props) {
  const { colors, shadows } = useTheme()
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
        {/* Le texte signalé, souligné d'un trait de miel à gauche, comme une citation (NoteCard).
            En texte brut, sélectionnable (pour le copier dans un rapport), coupé n'importe où
            plutôt que de déborder (une adresse sans espace). */}
        <View
          style={{
            borderLeftWidth: borders.quote,
            borderLeftColor: colors.honey,
            paddingLeft: space.md,
          }}
        >
          <Text selectable breakAnywhere>
            {snapshot}
          </Text>
        </View>
      </View>

      {reasons.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
          {reasons.map((reason) => (
            <View
              key={reason}
              style={{
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

      <Text variant="caption" tone="muted">
        {when}
      </Text>

      {status ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
          <Icon name="info" size={18} tone="amber" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="callout" weight={600}>
              {status}
            </Text>
          </View>
        </View>
      ) : null}

      {/* « Voir », puis les décisions. Elles passent à la ligne quand la place manque (téléphone,
          texte agrandi) ; l'écart garde chaque bouton à distance de son voisin. */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: space.md,
        }}
      >
        <TextLink label={viewLabel} onPress={onView} />
        {actions.map((action) => (
          <Button
            key={action.label}
            label={action.label}
            onPress={action.onPress}
            variant={action.tone === 'danger' ? 'danger' : 'secondary'}
            size="compact"
            loading={action.loading ?? false}
            {...(action.ref ? { ref: action.ref } : null)}
          />
        ))}
      </View>
    </View>
  )
}
