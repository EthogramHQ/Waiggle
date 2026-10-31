// Le bouton « Suivre » d'une page de membre ou de projet, avec le nombre d'abonnés à côté.
// C'est un interrupteur : le lecteur d'écran annonce « Suivre Léa, interrupteur, désactivé », puis
// « activé » une fois qu'on la suit. Le texte affiché change (« Suivre » en miel, puis « Suivi » en
// blanc avec une coche : l'action est faite, plus discrète ; toujours en blanc quand la page a déjà
// son action principale, voir `prominent`), et le nom lu le reprend toujours (« Suivi : Léa ») :
// c'est l'écran qui le donne, selon l'état.
// Variante `chip` (refonte, tranche R3) : une pastille de verre posée sur la photo d'une carte
// d'Explorer, « Suivre Nora » puis « Tu suis Nora ✓ ». Voir FollowChip, plus bas.
import { borders, layout, pressScale, radii, space } from '@ruche/brand'
import { useEffect, useRef } from 'react'
import { Pressable, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { FollowerCount } from './FollowerCount'
import { Icon } from './Icon'
import type { ImageSource } from './image'
import { spaceToggles } from './keyboard'
import { Notice, type NoticeAction } from './Notice'
import { Text } from './Text'
import { TAP_GUARD_MS } from './tapGuard'
import { spring } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  followed: boolean
  onPress: () => void
  /** Le nom lu par les lecteurs d'écran : ce qu'on suit (« Suivre Léa », « Suivre ce projet »). */
  label: string
  /** Le texte affiché, selon l'état (« Suivre » ou « Suivi »). */
  text: string
  /** Le nombre d'abonnés, déjà écrit (« 12 abonnés »). */
  caption?: string
  /** Un message si le dernier changement n'a pas pu être enregistré. */
  error?: string
  /**
   * Un lien sous le message d'erreur (« Me reconnecter » quand la session a expiré, tranche 6c).
   */
  errorAction?: NoticeAction | undefined
  /**
   * En miel quand suivre est l'action principale de la page (celle d'un membre) ; en blanc quand
   * une autre l'est déjà (« Tester la démo » sur un projet) : une seule action miel par écran.
   */
  prominent?: boolean
  /**
   * row : le nombre à droite du bouton ; stacked : le nombre au-dessus, le tout centré (l'en-tête
   * d'une page de membre, dans l'axe de l'avatar et du nom).
   */
  layout?: 'row' | 'stacked'
  /**
   * Inactif (annoncé « désactivé ») : un compte suspendu (tranche 7c) qui vient de ne plus suivre
   * ne peut pas suivre de nouveau. Le bouton reste à sa place, et le focus avec lui, au lieu de
   * disparaître sous le doigt. Il est alors toujours blanc, même quand il serait l'action principale.
   */
  disabled?: boolean
  /**
   * button : le bouton des pages de membre et de projet (par défaut). chip : la pastille de verre
   * posée sur la photo d'une carte (Explorer, R3) ; elle n'a ni nombre, ni message (pas de place sur
   * une photo : l'écran dit l'échec ailleurs), et `prominent` et `layout` n'y servent pas.
   */
  variant?: 'button' | 'chip'
  /** La photo de l'auteur, au début de la pastille (variante chip seulement) ; décorative. */
  avatar?: { name: string; source: ImageSource | null }
}

export function FollowButton({
  followed,
  onPress,
  label,
  text,
  caption,
  error,
  errorAction,
  prominent = true,
  layout = 'row',
  disabled = false,
  variant = 'button',
  avatar,
}: Props) {
  if (variant === 'chip') {
    return (
      <FollowChip
        followed={followed}
        onPress={onPress}
        label={label}
        text={text}
        disabled={disabled}
        avatar={avatar}
      />
    )
  }
  const stacked = layout === 'stacked'
  const button = (
    <Button
      label={text}
      spokenLabel={label}
      checked={followed}
      onPress={onPress}
      disabled={disabled}
      // Inactif, il passe en blanc : le miel pâle d'un bouton principal inactif attirerait encore
      // l'œil vers un geste impossible (relecture de design 7c).
      variant={followed || !prominent || disabled ? 'secondary' : 'primary'}
      icon={followed ? 'check' : 'plus'}
      size="compact"
    />
  )
  return (
    <View style={{ gap: space.sm, alignItems: stacked ? 'center' : 'stretch' }}>
      {stacked ? (
        // Le nombre au-dessus : il ne bouge pas quand le bouton passe de « Suivre » à « Suivi ».
        <>
          {caption ? <FollowerCount text={caption} /> : null}
          {button}
        </>
      ) : (
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md }}
        >
          {button}
          {caption ? <FollowerCount text={caption} /> : null}
        </View>
      )}
      {/* Notice est lue dès qu'elle apparaît (role « alert »), comme les autres erreurs. */}
      {error ? <Notice message={error} action={errorAction} /> : null}
    </View>
  )
}

type ChipProps = Pick<Props, 'followed' | 'onPress' | 'label' | 'text' | 'avatar'> & {
  disabled: boolean
}

/**
 * La pastille « Suivre Nora » posée sur la photo d'une carte (Explorer, tranche R3). Un interrupteur,
 * comme le bouton : toucher suit, retoucher arrête de suivre (relecture juridique jur-J8 : le geste
 * se défait du même doigt, sans aller sur la page du membre).
 * - Le nom lu est le texte affiché, sans la coche : « Tu suis Nora », état « activé ». La coche et
 *   l'icône « ajouter » sont dessinées (Icon est caché aux lecteurs d'écran).
 * - Dessinée sur 36 points, dans un cadre de 44 que le doigt touche : `hitSlop` n'existe pas sur le
 *   web (même cadre que Tag et le petit Button).
 * - Une garde contre la double tape : la pastille est posée là où l'on touche la carte, et la
 *   seconde tape d'une double tape défaisait aussitôt l'abonnement. Pendant TAP_GUARD_MS après un
 *   appui, les appuis suivants sont ignorés ; une tape plus tard est un vrai geste, qui passe.
 * - Le verre de la pastille (`glass`) laisse voir la photo : son couple de contraste est mesuré sur
 *   une photo noire et sur une photo blanche (`contrastPairs`, packages/brand).
 * - Rayon `small` (18, la moitié de sa hauteur) plutôt que `pill` : sur une ligne, c'est une
 *   pilule ; si un nom long passe à la ligne (texte agrandi), le verre ne coupe pas les lettres.
 */
function FollowChip({ followed, onPress, label, text, disabled, avatar }: ChipProps) {
  const { colors, shadows } = useTheme()
  // Le même enfoncement que les boutons, animé par Reanimated (voir Button.tsx).
  const scale = useSharedValue(1)
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  // useRef : une valeur gardée d'un rendu à l'autre sans redessiner le composant. La garde n'a rien
  // à afficher : un état (useState) ferait redessiner la carte à chaque tape pour rien.
  const guarded = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // À la sortie de l'écran, le minuteur en cours est retiré.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const press = () => {
    if (disabled || guarded.current) return
    guarded.current = true
    timer.current = setTimeout(() => {
      guarded.current = false
      timer.current = null
    }, TAP_GUARD_MS)
    onPress()
  }

  return (
    // maxWidth et flexShrink : jamais plus large que la photo ; un nom long passe à la ligne.
    <Animated.View style={[{ maxWidth: '100%', flexShrink: 1, alignSelf: 'flex-start' }, animated]}>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={label}
        // Les états passent par aria-… : react-native-web ignore accessibilityState.
        aria-checked={followed}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={press}
        // La barre d'espace active un interrupteur sur le web (voir keyboard.ts).
        {...spaceToggles(press, disabled)}
        onPressIn={() => {
          scale.value = spring(pressScale, 'firm')
        }}
        onPressOut={() => {
          scale.value = spring(1)
        }}
        // Le cadre de 44 points ; arrondi comme la pastille, pour que l'anneau du focus clavier
        // (règle :focus-visible de app/+html.tsx) en suive la forme.
        style={{
          minHeight: layout.touchTarget,
          justifyContent: 'center',
          borderRadius: radii.small,
        }}
      >
        {({ pressed }) => (
          <View
            style={{
              minHeight: layout.chipHeight,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              paddingLeft: avatar ? space.xs : space.md,
              paddingRight: space.md,
              paddingVertical: space.xs,
              borderRadius: radii.small,
              borderWidth: borders.hairline,
              borderColor: colors.glassBorder,
              // Appuyée, un verre plus couvrant (panel), comme le bouton de verre.
              backgroundColor: pressed ? colors.panel : colors.glass,
              boxShadow: `${shadows.highlight}, ${shadows.float}`,
              opacity: disabled ? 0.55 : 1,
            }}
          >
            {/* La photo est décorative : le nom lu dit déjà qui l'on suit. Cachée aux lecteurs
                d'écran (iOS, Android, web). Sa taille remplit la pastille, moins retrait et bord. */}
            {avatar ? (
              <View
                style={{ flexShrink: 0 }}
                aria-hidden
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Avatar
                  name={avatar.name}
                  source={avatar.source}
                  label=""
                  size={layout.chipHeight - 2 * (space.xs + borders.hairline)}
                />
              </View>
            ) : null}
            {/* minWidth: 0 : sans lui, la rangée ne descend pas sous la largeur du texte. */}
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              {/* Deux lignes au plus : un nom très long, à texte agrandi, couvrirait la photo et
                  le panneau du bas (six lignes à 320 points). Le nom entier reste lu, et écrit
                  dans le panneau de la carte. */}
              <Text variant="callout" weight={700} selectable={false} numberOfLines={2}>
                {text}
              </Text>
            </View>
            <View style={{ flexShrink: 0 }}>
              <Icon name={followed ? 'check' : 'user-plus'} size={16} />
            </View>
          </View>
        )}
      </Pressable>
    </Animated.View>
  )
}
