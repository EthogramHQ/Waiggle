// Un message encadré : une erreur, une information ou une confirmation, avec son icône.
// accessibilityRole="alert" : les lecteurs d'écran lisent le message dès qu'il apparaît.
// Une action peut suivre le message, dans le même cadre (« Me reconnecter » après « Ta session a
// expiré », tranche 6c) : c'est un lien à part, hors de l'alerte, pour que l'alerte ne lise que le
// message et que le lien reste atteignable au clavier et par VoiceOver.
import { radii, space } from '@ruche/brand'
import { View } from 'react-native'
import { Icon, type IconName, type IconTone } from './Icon'
import { Text, type Tone } from './Text'
import { TextLink } from './TextLink'
import { useTheme } from './theme/ThemeProvider'

/** La taille de l'icône, en points : le lien d'une action s'aligne sur le texte, juste après. */
const ICON_SIZE = 20

/** Ce qu'on peut faire après le message : un lien vers une autre page (« Me reconnecter »). */
export type NoticeAction = { label: string; onPress: () => void }

type Props = {
  message: string
  tone?: 'error' | 'info' | 'success'
  /**
   * Une simple confirmation (« Note supprimée. ») : role « status », lu par les lecteurs d'écran
   * sans couper ce qu'ils disaient, là où une alerte les interrompt.
   */
  polite?: boolean
  /** Un lien sous le message, dans le cadre ; il mène ailleurs (rôle link). */
  action?: NoticeAction | undefined
}

export function Notice({ message, tone = 'error', polite = false, action }: Props) {
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
  const frame = { padding: space.md, borderRadius: radii.small, backgroundColor: look.background }
  // accessible : le message est lu d'un seul tenant (l'icône est décorative, seul le texte compte).
  const alert = (
    <View
      accessible
      {...(polite ? { role: 'status' as const } : { accessibilityRole: 'alert' as const })}
      style={[
        { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
        action ? null : frame,
      ]}
    >
      <Icon name={look.icon} size={ICON_SIZE} tone={look.iconTone} />
      <View style={{ flex: 1 }}>
        <Text variant="callout" tone={look.text}>
          {message}
        </Text>
      </View>
    </View>
  )
  if (!action) return alert
  // Avec une action : le cadre entoure le message et le lien. Le cadre lui-même n'est pas
  // « accessible » : sur iOS, il regrouperait ses enfants et VoiceOver n'atteindrait plus le lien.
  // Le lien s'aligne sur le texte du message (après l'icône de 20 points et l'écart).
  return (
    <View style={frame}>
      {alert}
      <View style={{ paddingLeft: ICON_SIZE + space.sm, alignItems: 'flex-start' }}>
        <TextLink label={action.label} onPress={action.onPress} tone={look.text} />
      </View>
    </View>
  )
}
