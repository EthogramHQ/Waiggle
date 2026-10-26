// Le bandeau d'un compte suspendu (tranche 7c), en haut de chaque page du membre suspendu : que son
// compte est suspendu, jusqu'à quand (le jour et l'heure de Paris, ou « jusqu'à nouvel ordre »),
// après un signalement ou non (jamais de qui), le fondement, l'explication de la modération, ce
// qu'il peut encore faire, et comment contester (article 17 du DSA ; relecture juridique J2, J3,
// J4).
//
// Il reçoit la suspension telle que l'API la donne et écrit lui-même ses phrases : la barre du haut
// (`TopNav`) n'a qu'à le poser, une seule fois pour toutes les pages. Ce n'est pas une alerte : il
// est là dès l'ouverture de la page, et se lit à son tour, sans couper le lecteur d'écran (rôle
// « status »).
import { radii, space } from '@ruche/brand'
import type { Suspension } from '@ruche/contracts'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { parisDateTime } from '../moderation/parisTime'
import { Icon } from './Icon'
import { Text } from './Text'
import { useHydrated } from './theme/hydration'
import { useTheme } from './theme/ThemeProvider'

/** La taille de l'icône : les lignes s'alignent sur le titre, juste après elle. */
const ICON_SIZE = 20

type Props = {
  /** La suspension en cours (`Me.suspension`). */
  suspension: Suspension
}

export function SuspensionBanner({ suspension }: Props) {
  const { t, i18n } = useTranslation()
  const { colors } = useTheme()
  // La date de fin s'écrit dans la langue du visiteur et selon l'année en cours : deux choses que
  // la page pré-rendue ne connaît pas. On attend d'être dans le navigateur (ui/theme/hydration.ts).
  const hydrated = useHydrated()
  if (!hydrated) return null

  const { endsAt, ground, explanation } = suspension
  // La fin à l'heure de Paris, quel que soit le fuseau de l'appareil (J4) : la même que dans
  // l'e-mail.
  const end = endsAt ? parisDateTime(endsAt, i18n.language) : null
  const lines = [
    end
      ? t(($) => $.suspension.until, { date: end.date, time: end.time })
      : t(($) => $.suspension.indefinite),
    // Après un signalement ou non, et le fondement, dans le même paragraphe : la décision en une
    // phrase, avant l'explication de la modération.
    `${
      suspension.afterReport ? t(($) => $.suspension.afterReport) : t(($) => $.suspension.direct)
    } ${t(($) => $.removal.grounds[ground])}`,
    t(($) => $.suspension.explanation, { explanation }),
    t(($) => $.suspension.canStill),
    t(($) => $.suspension.contest),
  ]

  return (
    <View
      role="status"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space.sm,
        padding: space.md,
        borderRadius: radii.small,
        // Le fond miel pâle des informations, comme le bandeau d'un contenu retiré : le texte normal
        // s'y lit (contrastPairs : text sur honeySoft).
        backgroundColor: colors.honeySoft,
      }}
    >
      {/* Le cadenas est décoratif : le titre dit tout. */}
      <View aria-hidden>
        <Icon name="lock-simple" size={ICON_SIZE} tone="amber" />
      </View>
      {/* flex 1 et minWidth 0 : les lignes passent à la ligne au lieu de sortir du cadre, même à
          200 % de texte et sur un petit téléphone. */}
      <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
        <Text variant="callout" weight={700}>
          {t(($) => $.suspension.title)}
        </Text>
        {lines.map((line, index) => (
          // Les phrases n'ont pas d'autre identité que leur place, et la liste ne change pas d'ordre.
          // biome-ignore lint/suspicious/noArrayIndexKey: une phrase n'a pas d'autre identité que sa place
          <Text key={index} variant="callout" breakAnywhere>
            {line}
          </Text>
        ))}
      </View>
    </View>
  )
}
