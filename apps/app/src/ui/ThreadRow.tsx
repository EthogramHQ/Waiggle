// Une ligne de la liste des fils de retours, pour l'auteur (R7b, « Le coin des testeurs », planches
// R7b-Coin-Retours et R7b-Desktop) : la photo du testeur, son nom, la date du dernier message, et
// l'extrait de ce message sur deux lignes au plus (« Toi : … » quand c'est l'auteur qui a écrit en
// dernier).
//
// - Non lu : un point miel cerclé d'ambre au bout de l'extrait (le miel seul ne se verrait pas sur
//   la carte blanche : c'est le liseré qui le dessine), et le nom et l'extrait en gras. Le lecteur
//   d'écran l'entend dans le nom : « Léa Moreau, non lu ». La couleur n'est jamais seule.
// - « Ne teste plus » (`former`) : le testeur est parti ou a été retiré ; sa photo pâlit, une ligne
//   le dit sous l'extrait. Son fil reste lisible.
// - Choisie (`current`, sur ordinateur, quand le fil s'ouvre à droite) : le miel doux, et l'état
//   « page en cours » pour les lecteurs d'écran (`aria-current`, ou « sélectionné » sur téléphone).
//
// Toute la ligne est un lien vers le fil. Son nom est court (le nom, et « non lu ») ; l'extrait, la
// date et « Ne teste plus » la décrivent, lus juste après (`aria-describedby` sur le web, l'indice
// sur téléphone) : on parcourt la liste nom par nom, sans entendre chaque extrait en entier d'abord.
// Elle se pose dans un `ListGroup`, qui rogne ce qui dépasse : l'anneau du clavier se dessine dedans.

import { layout, radii, space } from '@ruche/brand'
import type { TesterRole } from '@ruche/contracts'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, View } from 'react-native'
import { Avatar } from './Avatar'
import { describedBy } from './aria'
import { Icon } from './Icon'
import type { ImageSource } from './image'
import { enterActivates } from './keyboard'
import { RelativeTime, useRelativeDate } from './RelativeTime'
import { Text } from './Text'
import { insetFocus } from './theme/document'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** Le nom du testeur. */
  name: string
  /** Sa photo, prête à dessiner ; null : ses initiales. */
  avatar: ImageSource | null
  /** La date du dernier message, au format ISO du contrat. */
  lastAt: string
  /** Qui a écrit le dernier message : l'auteur (« Toi : … ») ou le testeur. */
  lastFrom: TesterRole
  /** Le début du dernier message, tel que l'API le rend ; null : un retour sans texte. */
  excerpt: string | null
  /** Un message du testeur que l'auteur n'a pas encore lu. */
  unread: boolean
  /** Le testeur ne fait plus partie des testeurs : « Ne teste plus ». */
  former: boolean
  /** Le fil ouvert à côté (ordinateur). */
  current?: boolean
  onPress: () => void
}

/** La photo de la ligne (planche : 44 points, la hauteur d'une zone à toucher). */
const AVATAR = layout.touchTarget
/** Le point non lu, et son liseré (planche : 10 points, cerclé de 1,5). */
const DOT = 10
const DOT_RING = 1.5
/** La photo d'un testeur parti pâlit (planche R7b-Coin-Retours). */
const FORMER_OPACITY = 0.72

export function ThreadRow({
  name,
  avatar,
  lastAt,
  lastFrom,
  excerpt,
  unread,
  former,
  current = false,
  onPress,
}: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  // L'identifiant du texte caché qui décrit la ligne (web) : unique dans la page.
  const hintId = useId()
  const { full } = useRelativeDate(lastAt)

  const shown =
    excerpt === null
      ? t(($) => $.project.testers.thread.noText)
      : lastFrom === 'author'
        ? t(($) => $.project.testers.thread.you, { excerpt })
        : excerpt
  const label = unread ? t(($) => $.project.testers.thread.rowName, { name }) : name
  const formerLabel = t(($) => $.project.testers.thread.former)
  // La description : ce que la ligne écrit sous le nom, dans l'ordre de l'œil, puis la date entière.
  const hint = [shown, former ? formerLabel : null, full].filter(Boolean).join(' · ')

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={Platform.OS === 'web' ? undefined : hint}
      {...describedBy(hintId)}
      // Le fil ouvert à côté : la page en cours sur le web, « sélectionné » sur téléphone (react-
      // native-web ignore `accessibilityState`, et React Native ne connaît pas `aria-current`).
      {...(Platform.OS === 'web'
        ? current
          ? { 'aria-current': 'true' }
          : null
        : { accessibilityState: { selected: current } })}
      // Un lien s'ouvre avec Entrée sur le web (react-native-web ne le fait que pour un bouton).
      {...enterActivates(onPress)}
      onPress={onPress}
      // Le groupe rogne ce qui dépasse : l'anneau de focus se dessine à l'intérieur de la ligne.
      {...insetFocus}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space.md,
        minHeight: AVATAR + 2 * space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        ...(pressed
          ? { backgroundColor: colors.surfaceGrouped }
          : current
            ? { backgroundColor: colors.highlightSoft }
            : null),
      })}
    >
      {/* La photo est décorative : le nom est dans le lien. Elle ne rétrécit pas près d'un long nom. */}
      <View
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ flexShrink: 0, opacity: former ? FORMER_OPACITY : 1 }}
      >
        <Avatar name={name} source={avatar} label={name} size={AVATAR} />
      </View>
      {/* Ce qui est écrit : le nom du lien (`accessibilityLabel`, `aria-label`) l'emporte déjà sur
          son contenu pour les lecteurs d'écran, qui ne l'entendent pas deux fois. */}
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: space.xxs }}>
        {/* Le nom, puis la date à droite ; à texte agrandi, la date passe à la ligne. */}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            columnGap: space.sm,
          }}
        >
          <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 }}>
            <Text variant="callout" weight={unread ? 700 : 600} breakAnywhere>
              {name}
            </Text>
          </View>
          <View style={{ flexShrink: 0, maxWidth: '100%' }}>
            <RelativeTime date={lastAt} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
          <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }}>
            <Text
              variant="callout"
              weight={unread ? 600 : undefined}
              tone={unread ? 'default' : 'muted'}
              numberOfLines={2}
              breakAnywhere
            >
              {shown}
            </Text>
          </View>
          {unread ? (
            // Le point, centré sur la première ligne de l'extrait.
            <View
              style={{
                flexShrink: 0,
                width: DOT + 2 * DOT_RING,
                height: DOT + 2 * DOT_RING,
                marginTop: space.xs,
                borderRadius: radii.pill,
                borderWidth: DOT_RING,
                borderColor: colors.unreadDotRing,
                backgroundColor: colors.unreadDot,
              }}
            />
          ) : null}
        </View>
        {former ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <View style={{ flexShrink: 0 }}>
              <Icon name="sign-out" size={14} tone="muted" />
            </View>
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <Text variant="caption" tone="muted">
                {formerLabel}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
      {/* La description de la ligne, cachée à l'œil (display: none) mais lue par aria-describedby. */}
      {Platform.OS === 'web' ? (
        <View nativeID={hintId} style={{ display: 'none' }}>
          <Text>{hint}</Text>
        </View>
      ) : null}
    </Pressable>
  )
}
