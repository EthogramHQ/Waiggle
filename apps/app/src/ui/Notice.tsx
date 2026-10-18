// Un message encadré : une erreur, une information ou une confirmation, avec son icône.
// accessibilityRole="alert" : les lecteurs d'écran lisent le message dès qu'il apparaît.
import { radii, space } from '@ruche/brand'
import { View } from 'react-native'
import { Icon, type IconName, type IconTone } from './Icon'
import { Text, type Tone } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = { message: string; tone?: 'error' | 'info' | 'success' }

export function Notice({ message, tone = 'error' }: Props) {
  const { colors } = useTheme()
  const looks: Record<
    NonNullable<Props['tone']>,
    { icon: IconName; iconTone: IconTone; text: Tone; background: string }
  > = {
    error: {
      icon: 'warning-circle',
      iconTone: 'danger',
      text: 'danger',
      background: colors.dangerSoft,
    },
    info: { icon: 'info', iconTone: 'amber', text: 'default', background: colors.honeySoft },
    success: {
      icon: 'check-circle',
      iconTone: 'success',
      text: 'default',
      background: colors.surfaceGrouped,
    },
  }
  const look = looks[tone]
  return (
    // accessible : le cadre est lu d'un seul tenant (l'icône est décorative, seul le texte compte).
    <View
      accessible
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        gap: space.sm,
        alignItems: 'flex-start',
        padding: space.md,
        borderRadius: radii.small,
        backgroundColor: look.background,
      }}
    >
      <Icon name={look.icon} size={20} tone={look.iconTone} />
      <View style={{ flex: 1 }}>
        <Text variant="callout" tone={look.text}>
          {message}
        </Text>
      </View>
    </View>
  )
}
