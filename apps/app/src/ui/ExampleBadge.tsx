// La pastille « Exemple » (tranche R12b) : posée à côté du statut d'un projet, ou du nom d'un compte
// d'exemples, elle dit que le projet est fictif, créé par l'équipe pour montrer à quoi ressemble un
// projet. Même forme que la pastille du statut (`StatusPill`), mais dans un ton neutre : le miel
// reste au statut, et l'œil ne confond pas les deux.
import { radii, space } from '@ruche/brand'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { STATUS_PILL_HEIGHT } from './StatusPill'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /**
   * L'identifiant du texte, pour qu'un lien qui contient la pastille la désigne comme sa
   * description (`aria-describedby`, voir aria.ts), comme `StatusPill`.
   */
  nativeID?: string
}

export function ExampleBadge({ nativeID }: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        minHeight: STATUS_PILL_HEIGHT,
        justifyContent: 'center',
        paddingHorizontal: space.md,
        borderRadius: radii.pill,
        // Une surface claire bordée : lisible sur une carte comme sur une photo.
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.outline,
      }}
    >
      <Text variant="caption" weight={700} tone="muted" {...(nativeID ? { nativeID } : null)}>
        {t(($) => $.common.example)}
      </Text>
    </View>
  )
}
