// Le nom de l'appli écrit comme un logo : en minuscules, dans la police des titres (Funnel Display
// gras), le point du i en miel. Il vient de @ruche/brand : si l'appli change de nom, le mot suit.
// Touchable s'il mène quelque part (l'accueil). `logo` pose l'abeille devant le mot.
//
// Le point du i en miel, sans mesurer la police : deux textes identiques, l'un sur l'autre.
// - Dessous, le vrai texte, celui que lisent les lecteurs d'écran : « waiggle », le i en miel
//   (tige et point).
// - Dessus, une copie muette, transparente sauf un « ı » (i sans point) à l'encre, posé
//   exactement sur la tige du i : dans Funnel Display, « i » est « ı » plus un point, de même
//   chasse ; seul le point reste en miel. Les deux textes ont la même police, la même taille et
//   la même largeur : ils se mettent en page de la même façon, sur toutes les plateformes.
// Si le nom ne contient pas de « i », le mot s'écrit simplement, sans copie.
import { appName, textStyles } from '@ruche/brand'
import { Text as NativeText, View } from 'react-native'
import { Logo } from './Logo'
import { Pressed } from './Pressed'
import { Stack } from './Stack'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  size?: 'small' | 'large' | 'huge'
  onPress?: () => void
  /** Le logo sert de titre à la page : il est annoncé comme tel, avec cette phrase. */
  header?: string
  /** L'abeille du logo devant le mot, à la hauteur des lettres. */
  logo?: boolean
}

const variants = { small: 'heading', large: 'display', huge: 'hero' } as const

// Un logo déjà très grand n'a pas besoin de doubler avec le réglage de taille de l'appareil.
const maxScale = 1.2

export function Wordmark({ size = 'small', onPress, header, logo = false }: Props) {
  const { colors } = useTheme()
  const variant = variants[size]
  const word = appName.toLowerCase()
  const dot = word.indexOf('i')
  const before = word.slice(0, dot)
  const after = word.slice(dot + 1)
  const honey = { color: colors.honey }
  const hidden = { color: 'transparent' }

  const text = (
    // Les lecteurs d'écran lisent le nom tel qu'il s'écrit (« Waiggle »), pas en minuscules.
    <Text
      variant={variant}
      accessibilityLabel={header ?? appName}
      // Le logo qui sert de titre (l'accueil d'un visiteur) est le titre de la page : niveau 1.
      {...(header ? { heading: 1 as const } : null)}
      maxScale={maxScale}
    >
      {dot < 0 ? (
        word
      ) : (
        <>
          {before}
          <NativeText style={honey}>i</NativeText>
          {after}
        </>
      )}
    </Text>
  )

  const mark =
    dot < 0 ? (
      text
    ) : (
      <View>
        {text}
        {/* La copie muette, posée sur le texte : invisible et intouchable, sauf la tige du i. */}
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          aria-hidden
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <Text variant={variant} maxScale={maxScale}>
            <NativeText style={hidden}>{before}</NativeText>
            {'ı'}
            <NativeText style={hidden}>{after}</NativeText>
          </Text>
        </View>
      </View>
    )

  const content = logo ? (
    <Stack direction="row" gap="sm" align="center">
      {/* L'abeille à la hauteur d'une ligne du mot : le nom est déjà lu, elle est décorative. */}
      <Logo variant="bee" size={textStyles[variant].lineHeight} decorative />
      {mark}
    </Stack>
  ) : (
    mark
  )

  if (!onPress) return content
  return (
    <Pressed label={appName} onPress={onPress} role="link">
      {content}
    </Pressed>
  )
}
