// Le nom de l'appli écrit comme un logo : en minuscules, dans la police des titres (Funnel Display
// gras), le point du i en miel. Il vient de @ruche/brand : si l'appli change de nom, le mot suit.
// Touchable s'il mène quelque part (l'accueil). `logo` pose l'abeille devant le mot.
//
// Le point du i en miel, sans mesurer la police (la place de la ligne de base change d'une
// plateforme à l'autre) :
// - le vrai texte, « waiggle », celui que lisent les lecteurs d'écran et qu'on copie, donne sa
//   place au mot ; ses lettres sont transparentes ;
// - par-dessus, une copie muette en trois morceaux : « wa », le i, « ggle ». Le i est un « i » en
//   miel recouvert d'un « ı » (i sans point) à l'encre : dans Funnel Display, « i » est « ı » plus
//   un point, de même chasse ; seul le point reste en miel. Le i a sa propre boîte : sans elle,
//   l'approche (le crénage) entre « a » et « i » n'est pas celle entre « a » et « ı », et la tige
//   en miel dépassait d'un point de l'encre (vu sur les captures). La copie perd ces deux
//   approches, imperceptibles à l'œil.
// Si le nom ne contient pas de « i », le mot s'écrit simplement, sans copie.
//
// R16 (« Les polices ne déplacent plus rien ») : sur le web, le mot réserve sa largeur finale avant
// l'arrivée de Funnel Display (voir `reservedWidth`) ; les liens de la barre ne glissent plus.
import { appName, type TextVariant, textStyles } from '@ruche/brand'
import { Text as NativeText, Platform, type TextStyle, View } from 'react-native'
import { Logo } from './Logo'
import { Pressed } from './Pressed'
import { Stack } from './Stack'
import { Text } from './Text'
import { wordmarkCopy } from './theme/document'
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

/**
 * La largeur du mot écrit en Funnel Display 700, sans interlettrage, en fraction de sa taille (em) :
 * « waiggle » à 100 px mesure 383,84 px dans Chromium, crénage compris (mesuré le 18/11/2026 sur le
 * fichier de `@expo-google-fonts/funnel-display` 0.4.1, par `getBoundingClientRect` d'un texte
 * seul). Elle ne vaut que pour ce mot : un autre nom d'appli ne réserve rien, plutôt qu'une largeur
 * fausse.
 */
const MEASURED = { word: 'waiggle', em: 3.8384 } as const

/**
 * La largeur que le mot réserve sur le web, avant que sa police arrive. La page s'affiche d'abord
 * dans la police de secours (`font-display: swap`, R13), un peu plus étroite pour ce mot : quand
 * Funnel Display arrive, le mot s'élargissait de 3 points et poussait les liens de la barre
 * (mesure de R16). Le vrai mot (transparent) reçoit donc dès le départ une largeur minimale, celle
 * qu'il aura : la mesure ci-dessus, plus l'interlettrage de la variante, ajouté après chaque lettre.
 * En `em`, la réserve suit la taille réelle du texte, même quand une formule CSS la fait varier
 * avec la largeur de l'écran (le logo d'accueil, `Text`). `inline-block` : une largeur ne s'applique
 * pas à un morceau de texte en ligne. Sur téléphone, les polices sont chargées avant le premier
 * dessin : rien à réserver.
 */
const reservedWidth = (word: string, variant: TextVariant): TextStyle | null => {
  if (Platform.OS !== 'web' || word !== MEASURED.word) return null
  const em = MEASURED.em + Array.from(word).length * textStyles[variant].tracking
  // `display` et une largeur en `em` manquent aux types de React Native ; react-native-web les
  // passe tels quels au navigateur.
  return { display: 'inline-block', minWidth: `${em.toFixed(4)}em` } as unknown as TextStyle
}

export function Wordmark({ size = 'small', onPress, header, logo = false }: Props) {
  const { colors } = useTheme()
  const variant = variants[size]
  const word = appName.toLowerCase()
  const dot = word.indexOf('i')
  const before = word.slice(0, dot)
  const after = word.slice(dot + 1)
  const honey = { color: colors.honey }
  const hidden = { color: 'transparent', ...reservedWidth(word, variant) }

  const text = (
    // Les lecteurs d'écran lisent le nom tel qu'il s'écrit (« Waiggle »), pas en minuscules.
    <Text
      variant={variant}
      accessibilityLabel={header ?? appName}
      // Le logo qui sert de titre (l'accueil d'un visiteur) est le titre de la page : niveau 1.
      {...(header ? { heading: 1 as const } : null)}
      maxScale={maxScale}
    >
      {dot < 0 ? word : <NativeText style={hidden}>{word}</NativeText>}
    </Text>
  )

  const piece = (children: string) => (
    <Text variant={variant} maxScale={maxScale}>
      {children}
    </Text>
  )

  const mark =
    dot < 0 ? (
      text
    ) : (
      <View>
        {text}
        {/* La copie muette, posée sur le texte : intouchable, cachée aux lecteurs d'écran, et
            retirée en contraste élevé de Windows, où le vrai mot redevient visible
            (wordmarkCopy, theme/document.ts). */}
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          aria-hidden
          {...wordmarkCopy}
          style={{ position: 'absolute', top: 0, left: 0, flexDirection: 'row' }}
        >
          {piece(before)}
          <View>
            <Text variant={variant} maxScale={maxScale}>
              <NativeText style={honey}>i</NativeText>
            </Text>
            {/* L'encre deux fois : le bord adouci d'une seule couche laisse voir un liseré de
                miel le long de la tige ; deux couches le couvrent presque entièrement. */}
            <View style={{ position: 'absolute', top: 0, left: 0 }}>{piece('ı')}</View>
            <View style={{ position: 'absolute', top: 0, left: 0 }}>{piece('ı')}</View>
          </View>
          {piece(after)}
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
