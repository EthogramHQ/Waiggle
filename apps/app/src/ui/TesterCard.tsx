// La carte d'un projet qui cherche des testeurs (refonte, tranche R3 : le carrousel « Ils cherchent
// des testeurs » d'Explorer). Sa photo, avec « Tester ↗ » posé dessus ; son titre et son auteur
// dessous. Deux liens frères, jamais l'un dans l'autre (relecture de l'interface, ui-4) :
// - la carte (photo, titre, auteur) ouvre la page du projet (`onOpen`, décision de Louis du
//   31/10/2026), nommée par le titre ;
// - « Tester » ouvre la démo par la page d'avertissement des liens externes : annoncé comme un site
//   externe (comme `TextLink external`), il est posé par-dessus la photo, à côté du lien de la carte
//   et non dedans.
import { layout, radii, space } from '@ruche/brand'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, View } from 'react-native'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import { enterActivates } from './keyboard'
import { Pressed } from './Pressed'
import { type CoverImage, ProjectCover } from './ProjectCover'
import { Text } from './Text'
import { TAP_GUARD_MS } from './tapGuard'
import { insetFocus } from './theme/document'
import { useLayout } from './theme/layout'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  title: string
  /** Le nom affiché de l'auteur (« Sam Petit »). */
  author: string
  /** La photo de couverture ; sans photo, la lumière miel des couvertures. */
  image: CoverImage | null
  /** Ouvre la démo (l'écran passe par la page d'avertissement des liens externes). */
  onTest: () => void
  /**
   * Ouvre la page du projet : la photo et le titre deviennent un lien nommé par le titre. Sans
   * lui (le catalogue, un aperçu), la carte n'est pas touchable, seul « Tester » l'est.
   */
  onOpen?: () => void
}

// La largeur d'une carte : environ deux cartes et demie sur un téléphone (la troisième, coupée au
// bord, dit qu'on peut faire défiler), cinq sur un ordinateur. Tirée de la colonne latérale, pour
// rester proportionnée aux autres colonnes de l'appli : la moitié sur téléphone (160), les 4/5
// ailleurs (256).
const CARD_WIDTH = { compact: layout.sideColumn / 2, medium: layout.sideColumn * 0.8 }
// La photo, plus haute que large sur téléphone (4:3), plus panoramique sur ordinateur (5:3).
const COVER_RATIO = { compact: 3 / 4, medium: 3 / 5 }
// La pastille de l'auteur : deux fois le grand pas d'espacement, sous la taille d'une ligne.
const AUTHOR_DOT = space.xl

/**
 * Hook : la garde contre la double tape (TAP_GUARD_MS, la même que les fenêtres), commune aux deux
 * liens de la carte. Une page s'ouvre sous le doigt, et la seconde tape l'ouvrirait une deuxième
 * fois (deux pages empilées, deux « Retour ») ; partagée, elle empêche aussi la seconde tape d'un
 * « Tester » de tomber, à côté, sur le lien de la carte. Un `ref` plutôt qu'un état : la seconde
 * tape arrive avant que React ait redessiné, et doit déjà trouver la garde levée.
 */
function useTapGuard() {
  const guarded = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Le minuteur s'arrête si la carte quitte l'écran avant la fin de la garde.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  return (action: () => void) => () => {
    if (guarded.current) return
    guarded.current = true
    timer.current = setTimeout(() => {
      guarded.current = false
    }, TAP_GUARD_MS)
    action()
  }
}

export function TesterCard({ title, author, image, onTest, onOpen }: Props) {
  const { t } = useTranslation()
  const { colors, shadows } = useTheme()
  const { sizeClass } = useLayout()
  const shape = sizeClass === 'compact' ? 'compact' : 'medium'
  const width = CARD_WIDTH[shape]
  const coverHeight = Math.round(width * COVER_RATIO[shape])
  const web = Platform.OS === 'web'
  const guard = useTapGuard()
  const test = guard(onTest)

  // Le nom lu : « Tester Carnet de cafés » (le texte affiché en tête, puis le projet : plusieurs
  // cartes, plusieurs « Tester »). Il quitte l'appli : sur le web, où l'indice n'existe pas, le nom
  // le dit (« …, ouvre un site externe ») ; sur téléphone, l'indice lu après le nom.
  const name = t(($) => $.explore.testProject, { title })
  const outside = t(($) => $.common.externalSite)

  const body = (
    <View style={{ gap: space.sm }}>
      <ProjectCover height={coverHeight} radius="group" image={image} />
      <Text variant="headline" numberOfLines={2}>
        {title}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {/* Les initiales de l'auteur décorent : son nom est écrit à côté, on ne le lit qu'une fois. */}
        <View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Avatar name={author} source={null} label={author} size={AUTHOR_DOT} />
        </View>
        <View style={{ flexShrink: 1 }}>
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {author}
          </Text>
        </View>
      </View>
    </View>
  )

  return (
    <View style={{ width }}>
      {onOpen ? (
        // Le lien de la carte, nommé par le titre du projet ; l'anneau du clavier suit le rayon de
        // la photo.
        <Pressed label={title} role="link" radius="group" onPress={guard(onOpen)}>
          {body}
        </Pressed>
      ) : (
        body
      )}
      {/* Le calque de « Tester », frère du lien de la carte : posé à la place exacte de la photo,
          il laisse passer les tapes ailleurs que sur la pastille (box-none). */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: coverHeight,
          pointerEvents: 'box-none',
        }}
      >
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={web ? `${name}, ${outside}` : name}
          accessibilityHint={web ? undefined : outside}
          // Entrée ouvre la démo sur le web, comme un vrai lien (voir keyboard.ts).
          {...enterActivates(test)}
          // La carte rogne ses bords : l'anneau du clavier se dessine à l'intérieur de la zone.
          {...insetFocus}
          onPress={test}
          style={{
            position: 'absolute',
            left: space.xs,
            bottom: space.xs,
            // 44 points à toucher autour de la pastille dessinée, plus petite (hitSlop est ignoré
            // sur le web) ; le rayon suit la pastille, pour l'anneau du clavier.
            minHeight: layout.touchTarget,
            minWidth: layout.touchTarget,
            // Jamais plus large que la photo, même à 200 % de texte.
            maxWidth: width - 2 * space.xs,
            justifyContent: 'center',
            borderRadius: radii.pill,
          }}
        >
          {({ pressed }) => (
            // La pastille miel : son texte encre (onHoney) se lit sur le miel, et le miel opaque
            // garde ce contraste sur n'importe quelle photo ; son halo la détache d'une photo claire.
            <View
              style={{
                alignSelf: 'flex-start',
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.xs,
                minHeight: layout.controlHeight.small,
                paddingHorizontal: space.md,
                borderRadius: radii.pill,
                backgroundColor: pressed ? colors.honeyPressed : colors.honey,
                boxShadow: `${shadows.highlight}, ${shadows.honey}`,
              }}
            >
              <Text variant="callout" weight={700} tone="onHoney" numberOfLines={1}>
                {t(($) => $.explore.test)}
              </Text>
              {/* La flèche est décorative : le nom lu dit déjà que le lien sort de l'appli. */}
              <View aria-hidden>
                <Icon name="arrow-up-right" size={space.lg} tone="onHoney" />
              </View>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  )
}
