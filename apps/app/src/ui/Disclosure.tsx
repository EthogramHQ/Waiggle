// Une section repliable : un titre qu'on touche pour déplier ou replier son contenu. Sert aux
// parties facultatives d'un formulaire (« Ajouter la recette »), pour ne pas l'alourdir, et aux
// contenus secondaires d'une page (« Les autres prompts · 2 », R5a).
// Les lecteurs d'écran annoncent « replié » ou « déplié » : sur le web par `aria-expanded`, sur
// téléphone par `accessibilityState.expanded` (react-native-web ignore le second, VoiceOver et
// TalkBack ne lisent pas toujours le premier : on donne les deux, comme pour les autres états).
import { radii, space } from '@ruche/brand'
import { type ReactNode, useState } from 'react'
import { Pressable, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  title: string
  hint?: string
  /**
   * L'icône de la pastille miel, devant le titre (« + » par défaut). `null` : pas de pastille, une
   * simple ligne et sa flèche, pour un contenu secondaire qui ne doit pas appeler l'œil (« Les
   * autres prompts », sous le prompt de départ).
   */
  icon?: IconName | null
  /** Déplié dès l'affichage (par exemple quand la section contient déjà quelque chose). */
  initiallyOpen?: boolean
  children: ReactNode
}

export function Disclosure({ title, hint, icon = 'plus', initiallyOpen = false, children }: Props) {
  const { colors, shadows } = useTheme()
  const [open, setOpen] = useState(initiallyOpen)
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radii.group,
        borderWidth: 1,
        borderColor: colors.groupBorder,
        boxShadow: shadows.soft,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        aria-expanded={open}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((previous) => !previous)}
        // Sans pastille, la ligne garde plus de 44 points à toucher : son titre et ses marges.
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg }}
      >
        {icon ? (
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: radii.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.honeySoft,
            }}
          >
            <Icon name={icon} size={20} tone="amber" />
          </View>
        ) : null}
        {/* minWidth 0 : à 200 % de texte, le titre passe à la ligne au lieu de pousser la flèche
            hors du cadre. */}
        <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
          <Text weight={700}>{title}</Text>
          {hint ? (
            <Text variant="caption" tone="muted">
              {hint}
            </Text>
          ) : null}
        </View>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="caret-down" size={20} tone="muted" />
        </View>
      </Pressable>
      {open ? (
        // FadeIn : le contenu apparaît en fondu (Reanimated s'occupe de l'animation).
        <Animated.View
          entering={FadeIn}
          style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.lg }}
        >
          {children}
        </Animated.View>
      ) : null}
    </View>
  )
}
