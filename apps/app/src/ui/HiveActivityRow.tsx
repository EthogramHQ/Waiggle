// Une ligne de l'actualité d'une ruche (tranche R10, planches R10-Ruche, R10-Ruche-Nuit et
// R10-Ruche-Desktop) : « Léa a publié Le plan de table hier », « Tante Odile a mis à jour Biscotte
// au parc · v2 mardi », « Papi Jean a épinglé Décollage ! dimanche ». Le dessin reprend celui d'une
// ligne de la page Activité (`NotificationCard`) :
// - à gauche, la photo de qui a agi (un décor : la phrase le nomme déjà) ;
// - au milieu, la phrase, les noms et les titres en gras, puis la date en petit, dans la même
//   phrase ; dessous, pour un projet réservé à la ruche, la pastille « Réservé à Famille » ;
// - à droite, la vignette du projet (un décor, elle aussi).
//
// Toute la ligne est un seul lien vers le projet. Son nom lu reprend tout ce qu'elle écrit, en
// phrases : « Léa a publié Le plan de table. Réservé à Famille. il y a 5 min. » Pas de lien sur le
// nom ni sur le titre : un lien dans un lien ne se toucherait pas seul.
//
// La date lue est celle qu'on voit (« il y a 5 min ») : le nom d'un lien contient le texte affiché
// (WCAG 2.5.3), et la ligne ne porte qu'elle (une ligne de l'Activité dit la date complète).
import { radii, space } from '@ruche/brand'
import type { HiveActivityItem } from '@ruche/contracts'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import type { ImageSource } from './image'
import { splitMarks } from './marks'
import { sentence } from './NotificationCard'
import { Pressed } from './Pressed'
import { ProjectThumb } from './ProjectThumb'
import { useRelativeDate } from './RelativeTime'
import { Text } from './Text'
import { useTapGuard } from './tapGuard'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  item: HiveActivityItem
  /** Le nom de la ruche, pour « Réservé à Famille » ; null : retiré par la modération. */
  hiveName: string | null
  /** Ouvre le projet. */
  onPress: () => void
  /**
   * Fait d'une adresse de photo une source d'image : celle que rend `useMediaSources()`
   * (api/media.ts), donnée par l'écran (`src/ui` ne lit pas l'API). Absent : les initiales de qui a
   * agi, et le résumé flou de la photo du projet.
   */
  toSource?: (url: string | null | undefined) => ImageSource | null
}

/** La photo de qui a agi : 40 points, comme sur la page Activité et la planche. */
const LEADING = 40
/** L'icône de la pastille : une alvéole, à la taille d'une petite lettre. */
const PILL_ICON = 12

export function HiveActivityRow({ item, hiveName, onPress, toSource }: Props) {
  const { t } = useTranslation()
  // Une garde contre la double tape (600 ms, comme les cartes) : la seconde tape n'ouvre pas deux
  // fois la page du projet.
  const guard = useTapGuard()
  // Un hook plutôt que `RelativeTime` : la date se pose dans la phrase, comme un mot. Il suit
  // l'horloge partagée et attend l'hydratation du web avant de parler de « maintenant ».
  const { label: date } = useRelativeDate(item.at)
  const values = { name: item.actor.name, title: item.project.title, version: item.version ?? '' }
  // Le modèle de la phrase, ses {{…}} laissés en place : on le découpe en morceaux (gras ou non)
  // AVANT d'y mettre le nom et le titre, écrits par des membres (voir ui/marks.ts).
  const holes = { name: '{{name}}', title: '{{title}}', version: '{{version}}' }
  const template =
    item.kind === 'published'
      ? t(($) => $.hives.page.published, holes)
      : item.kind === 'pinned'
        ? t(($) => $.hives.page.pinnedLine, holes)
        : item.version
          ? t(($) => $.hives.page.updatedVersion, holes)
          : t(($) => $.hives.page.updated, holes)
  const parts = splitMarks(template, values)
  const phrase = parts.map((part) => part.text).join('')
  const reserved = item.reserved
    ? t(($) => $.hives.page.reserved, { hive: hiveName ?? t(($) => $.hives.unnamed) })
    : null
  const label = [phrase, reserved, date]
    .filter((part): part is string => Boolean(part))
    .map(sentence)
    .join(' ')
  const cover = item.project.cover
  const thumb = cover
    ? {
        source: toSource ? toSource(cover.url) : null,
        thumbhash: cover.thumbhash,
        label: item.project.title,
      }
    : null

  return (
    <Pressed label={label} onPress={guard(onPress)} role="link">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: space.md,
          padding: space.md,
          // L'anneau du focus du clavier suit ce rayon (Pressed le lit ici).
          borderRadius: radii.group,
        }}
      >
        {/* Un décor : la phrase nomme déjà qui a agi. Caché partout (web, iOS, Android). */}
        <View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ flexShrink: 0 }}
        >
          <Avatar
            name={item.actor.name}
            source={toSource ? toSource(item.actor.avatarUrl) : null}
            label=""
            size={LEADING}
          />
        </View>
        {/* minWidth 0 : un titre sans espace se coupe au lieu de pousser la vignette dehors. */}
        <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
          <Text variant="callout" breakAnywhere>
            {/* La phrase seule dans son texte, la date ensuite : elle passe à la ligne avec elle. */}
            <Text variant="callout">
              {parts.map((part, index) =>
                part.style === 'strong' ? (
                  // biome-ignore lint/suspicious/noArrayIndexKey: les morceaux d'une phrase ne bougent pas.
                  <Text key={index} variant="callout" weight={700}>
                    {part.text}
                  </Text>
                ) : (
                  part.text
                ),
              )}
            </Text>{' '}
            <Text variant="caption" tone="muted">
              {date}
            </Text>
          </Text>
          {reserved ? <ReservedPill label={reserved} /> : null}
        </View>
        {thumb ? (
          <View style={{ flexShrink: 0 }}>
            <ProjectThumb image={thumb} size="row" />
          </View>
        ) : null}
      </View>
    </Pressed>
  )
}

/**
 * « Réservé à Famille » : une pastille miel pâle, avec l'alvéole de la ruche, comme sur la planche.
 * Son texte se lit dans le nom du lien de la ligne ; l'icône est un décor.
 */
function ReservedPill({ label }: { label: string }) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        // À texte agrandi sur 320 points, la pastille passe à la ligne au lieu de déborder.
        maxWidth: '100%',
        flexShrink: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        paddingHorizontal: space.sm,
        paddingVertical: space.xxs,
        borderRadius: radii.pill,
        backgroundColor: colors.honeySoft,
      }}
    >
      <View
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flexShrink: 0 }}
      >
        <Icon name="hexagon" size={PILL_ICON} tone="status" />
      </View>
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text variant="caption" weight={700} tone="status">
          {label}
        </Text>
      </View>
    </View>
  )
}
