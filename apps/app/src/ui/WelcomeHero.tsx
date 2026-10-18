// La scène d'accueil des grands écrans : la constellation de tuiles autour d'une bulle de verre qui
// porte le logo et la phrase d'accroche. En bas, une pastille rappelle que l'appli est un logiciel
// libre, avec un lien vers son code (la licence AGPL demande de l'offrir à ceux qui l'utilisent).
import { radii, space } from '@ruche/brand'
import { View } from 'react-native'
import { Constellation } from './Constellation'
import { Text } from './Text'
import { TextLink } from './TextLink'
import { useTheme } from './theme/ThemeProvider'
import { Wordmark } from './Wordmark'

type Props = {
  tagline: string
  source: { note: string; link: string; onPress: () => void }
}

const BUBBLE = 360 // diamètre de la bulle, en points

export function WelcomeHero({ tagline, source }: Props) {
  const { colors, shadows } = useTheme()
  return (
    <View style={{ gap: space.xl }}>
      <Constellation height={560}>
        <View
          style={{
            width: BUBBLE,
            height: BUBBLE,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            gap: space.md,
            padding: space.xxxl,
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.panelBorder,
            boxShadow: `${shadows.highlight}, ${shadows.card}`,
          }}
        >
          <Wordmark size="huge" />
          <Text tone="secondary" align="center">
            {tagline}
          </Text>
        </View>
      </Constellation>
      <View
        style={{
          alignSelf: 'flex-start',
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: space.sm,
          paddingHorizontal: space.lg,
          paddingVertical: space.sm,
          borderRadius: radii.pill,
          backgroundColor: colors.glass,
          borderWidth: 1,
          borderColor: colors.glassBorder,
        }}
      >
        <Text variant="callout" tone="secondary">
          {source.note}
        </Text>
        <TextLink label={source.link} onPress={source.onPress} />
      </View>
    </View>
  )
}
