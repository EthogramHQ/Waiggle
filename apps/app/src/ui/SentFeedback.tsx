// « Mes retours envoyés » (R11, Réglages → Mes données ; planche R11-Mes-Retours) : les messages
// qu'un membre a écrits comme testeur, une carte par projet. Deux pièces :
//
// - `SentFeedbackGroup`, la carte d'un projet : en tête, la vignette du projet, son titre (un titre
//   de niveau 2 : on parcourt la page projet par projet) et le nom de son auteur ; à droite, le lien
//   « Ouvrir le coin » quand le coin est encore ouvert, ou la pastille « Coin fermé » au cadenas, et
//   sous l'en-tête la phrase qui dit qui voit quoi (« Seuls tes messages restent ici. »). Un projet
//   qu'on ne voit plus (`gone`) n'a ni vignette, ni auteur, ni lien : un œil barré, en gris ;
// - `SentFeedbackMessage`, un message dans la carte : l'issue d'un retour (`OutcomePill`) et sa
//   date, « Supprimer » à droite, puis le texte et la capture, entière et qu'on ouvre en grand
//   (`OpenableImage`). Un trait fin le sépare de ce qui précède.
//
// - La vignette et l'œil sont des décors : le titre écrit à côté nomme déjà le projet.
// - « Supprimer » se répète à chaque message : son nom lu dit lequel (`deleteSpokenLabel`, « Supprimer
//   le message : … »), le texte affiché reste court ; de même « Ouvrir le coin » nomme son projet.
// - Rien ne se coupe par « … » : un titre long passe sur plusieurs lignes ; à 320 points et 200 % de
//   texte, l'action de l'en-tête et « Supprimer » descendent sous ce qui les précède, rangés à
//   droite, plutôt que d'écraser le titre (rangées qui passent à la ligne, base réelle).
import { borders, layout, radii, space } from '@ruche/brand'
import type { FeedbackOutcome } from '@ruche/contracts'
import type { ReactNode, Ref } from 'react'
import { View } from 'react-native'
import { Button } from './Button'
import type { Focusable } from './focus'
import { Icon, SMALL_ICON } from './Icon'
import type { ImageSource } from './image'
import { OpenableImage, PICTURE_MAX_HEIGHT } from './OpenableImage'
import { OutcomePill } from './OutcomePill'
import { ProjectCover } from './ProjectCover'
import { RelativeTime } from './RelativeTime'
import { Surface } from './Surface'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

// La vignette, comme dans les feuilles du coin (`SheetProjectHead`) : 40 points.
const THUMB = 40
// La place que la vignette et le texte demandent avant de laisser l'action passer dessous (même
// calcul que `SheetProjectHead`) : à la taille de texte ordinaire, l'action tient sur la ligne du
// titre, sur un téléphone de 390 points.
const TEXT_BASIS = 160

type GroupProps = {
  /** Le titre du projet, ou la phrase d'un projet qu'on ne voit plus. */
  title: string
  /** Le nom de l'auteur du projet ; absent : rien sous le titre. */
  subtitle?: string | null
  /** La première photo du projet ; null : la lumière miel d'un projet sans photo. */
  thumb?: ImageSource | null
  /** Un projet qu'on ne voit plus : un œil barré à la place de la vignette, le titre en gris. */
  gone?: boolean
  /** « Ouvrir le coin » : le texte affiché, le nom lu qui dit quel coin, et où il mène. */
  open?: { label: string; spokenLabel: string; onPress: () => void } | null
  /** Le coin est fermé : la pastille (« Coin fermé ») et la phrase de qui voit quoi. */
  closed?: { label: string; note: string } | null
  /** Les messages (`SentFeedbackMessage`), du plus récent au plus ancien. */
  children: ReactNode
}

export function SentFeedbackGroup({
  title,
  subtitle,
  thumb = null,
  gone = false,
  open,
  closed,
  children,
}: GroupProps) {
  const { colors } = useTheme()
  const aside = open ? (
    <Button
      label={open.label}
      spokenLabel={open.spokenLabel}
      role="link"
      variant="secondary"
      size="small"
      onPress={open.onPress}
    />
  ) : closed ? (
    // La pastille ne se touche pas : un état, lu par son texte (le cadenas est un décor).
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        paddingHorizontal: space.sm,
        paddingVertical: space.xxs,
        borderRadius: radii.pill,
        backgroundColor: colors.surfaceGrouped,
        maxWidth: '100%',
      }}
    >
      <View aria-hidden style={{ flexShrink: 0 }}>
        <Icon name="lock-simple" size={SMALL_ICON} tone="secondary" />
      </View>
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text variant="caption" weight={600} tone="secondary">
          {closed.label}
        </Text>
      </View>
    </View>
  ) : null

  return (
    <Surface variant="grouped" padding="lg" gap="md">
      {/* Une rangée qui passe à la ligne quand la place manque : seule l'action descend. */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: space.md,
          rowGap: space.xs,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: TEXT_BASIS,
            minWidth: 0,
            maxWidth: '100%',
            minHeight: layout.touchTarget,
          }}
        >
          <View
            // Caché aux lecteurs d'écran, partout, et intouchable : un décor.
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={{ width: THUMB, flexShrink: 0 }}
          >
            {gone ? (
              <View
                style={{
                  width: THUMB,
                  height: THUMB,
                  borderRadius: radii.code,
                  backgroundColor: colors.surfaceGrouped,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="eye-slash" size={SMALL_ICON} tone="muted" />
              </View>
            ) : (
              <ProjectCover
                height={THUMB}
                radius="code"
                image={thumb ? { source: thumb, label: '' } : null}
              />
            )}
          </View>
          <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }}>
            <Text variant="callout" weight={700} tone={gone ? 'muted' : 'default'} heading={2}>
              {title}
            </Text>
            {subtitle ? (
              <Text variant="caption" tone="muted">
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        {aside ? (
          // À droite, sur la ligne du titre comme dessous ; jamais rétrécie.
          <View style={{ marginLeft: 'auto', flexShrink: 0, maxWidth: '100%' }}>{aside}</View>
        ) : null}
      </View>
      {closed ? (
        <Text variant="caption" tone="muted">
          {closed.note}
        </Text>
      ) : null}
      <View>{children}</View>
    </Surface>
  )
}

type MessageProps = {
  /** L'issue d'un retour (« En partie ») et sa phrase lue ; null : une réponse, sans issue. */
  outcome: { value: FeedbackOutcome; label: string; spokenLabel: string } | null
  /** La date d'envoi, au format ISO du contrat. */
  at: string
  /** L'heure qu'il est, pour figer la date (catalogue, tests). */
  now?: Date
  /** Le texte du message ; null : une capture seule. */
  text: string | null
  /** La capture : son adresse, ses dimensions (contrat) et son nom lu, une phrase fixe. */
  capture: { source: ImageSource; width?: number; height?: number; description: string } | null
  /** Une marque sous l'en-tête du message (« Retiré par la modération ») ; absente : rien. */
  note?: string | null
  /** « Supprimer », affiché, et le nom lu qui dit quel message (son extrait). */
  deleteLabel: string
  deleteSpokenLabel: string
  onDelete: () => void
  /** Pour y poser le focus quand le message d'avant disparaît. */
  deleteRef?: Ref<Focusable>
}

export function SentFeedbackMessage({
  outcome,
  at,
  now,
  text,
  capture,
  note,
  deleteLabel,
  deleteSpokenLabel,
  onDelete,
  deleteRef,
}: MessageProps) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        gap: space.sm,
        paddingTop: space.md,
        marginTop: space.md,
        borderTopWidth: borders.hairline,
        borderTopColor: colors.line,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: space.md,
          rowGap: space.xs,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: space.sm,
            rowGap: space.xs,
            flexShrink: 1,
            maxWidth: '100%',
          }}
        >
          {outcome ? (
            <OutcomePill
              outcome={outcome.value}
              label={outcome.label}
              spokenLabel={outcome.spokenLabel}
            />
          ) : null}
          <RelativeTime date={at} {...(now ? { now } : null)} />
        </View>
        <View style={{ marginLeft: 'auto', flexShrink: 0, maxWidth: '100%' }}>
          <Button
            ref={deleteRef}
            label={deleteLabel}
            spokenLabel={deleteSpokenLabel}
            icon="trash"
            variant="danger"
            size="small"
            onPress={onDelete}
          />
        </View>
      </View>
      {note ? (
        <Text variant="caption" weight={600} tone="secondary">
          {note}
        </Text>
      ) : null}
      {text ? (
        <Text variant="callout" readable>
          {text}
        </Text>
      ) : null}
      {capture ? (
        <OpenableImage
          source={capture.source}
          label={capture.description}
          size={capture}
          maxWidth={PICTURE_MAX_HEIGHT}
          radius="code"
        />
      ) : null}
    </View>
  )
}
