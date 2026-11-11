// Une section repliable : un titre qu'on touche pour déplier ou replier son contenu. Sert aux
// parties facultatives d'un formulaire (« Ajouter la recette »), pour ne pas l'alourdir, et aux
// contenus secondaires d'une page (« Les autres prompts · 2 », R5a).
// Les lecteurs d'écran annoncent « replié » ou « déplié » : `aria-expanded`, que React Native
// traduit aussi en `accessibilityState.expanded` pour VoiceOver et TalkBack (Disclosure.test.tsx
// le vérifie : les deux disent toujours la même chose).
import { layout, radii, space } from '@ruche/brand'
import { type ReactNode, type Ref, useState } from 'react'
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
  /**
   * card (par défaut) : une carte blanche, son titre en gras, le contenu dedans. inline (R7b) : un
   * simple texte de légende suivi de sa petite flèche, rangé à gauche, et le contenu posé dessous
   * sans cadre : « 12 testeurs », sous le titre du coin des testeurs, qui déplie la liste (planche
   * validée 1) ; une carte y pèserait plus lourd que les onglets qui suivent. `icon` et `hint` ne
   * servent qu'à la carte.
   */
  variant?: 'card' | 'inline'
  /**
   * Le bouton qui déplie et replie (R7b, K5) : pour y rendre le focus quand le contenu perd son
   * dernier élément (le seul testeur retiré de « 1 testeur »), au lieu de le laisser se perdre.
   */
  toggleRef?: Ref<View>
  children: ReactNode
}

export function Disclosure({
  title,
  hint,
  icon = 'plus',
  initiallyOpen = false,
  variant = 'card',
  toggleRef,
  children,
}: Props) {
  const { colors, shadows } = useTheme()
  const [open, setOpen] = useState(initiallyOpen)
  if (variant === 'inline') {
    return (
      <View style={{ gap: space.xs }}>
        <Pressable
          ref={toggleRef}
          accessibilityRole="button"
          accessibilityLabel={title}
          aria-expanded={open}
          onPress={() => setOpen((previous) => !previous)}
          // Rangé à gauche par lui-même (pas par son parent : le contenu dessous garde toute la
          // largeur), 44 points de haut, et il se replie plutôt que de sortir du cadre à 200 %
          // (react-native-web interdit sinon à toute vue de rétrécir).
          style={{
            alignSelf: 'flex-start',
            maxWidth: '100%',
            flexShrink: 1,
            minHeight: layout.controlHeight.regular,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.xs,
          }}
        >
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Text variant="callout" tone="secondary">
              {title}
            </Text>
          </View>
          {/* La flèche ne rétrécit jamais (sur le web, un dessin rétrécit avec sa rangée). */}
          <View style={{ flexShrink: 0, transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
            <Icon name="caret-down" size={16} tone="secondary" />
          </View>
        </Pressable>
        {open ? (
          <Animated.View entering={FadeIn} style={{ gap: space.sm }}>
            {children}
          </Animated.View>
        ) : null}
      </View>
    )
  }
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
        ref={toggleRef}
        accessibilityRole="button"
        accessibilityLabel={title}
        aria-expanded={open}
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
