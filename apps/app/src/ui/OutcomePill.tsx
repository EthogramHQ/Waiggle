// La pastille de l'issue d'un retour de testeur (R7b, « Le coin des testeurs ») : la réponse à « Ça
// a marché ? », posée en tête d'une bulle de retour et dans la feuille « Nouvelle mise à jour ».
// Trois issues, chacune son icône et ses couleurs (planche R7b-Fil) :
// - « Oui » : une coche verte, le libellé à l'encre ;
// - « En partie » : un demi-cercle ambre, sur la crème miel ;
// - « Non » : une croix rouge, sur le rose d'une erreur.
//
// La couleur n'est jamais seule : le libellé dit l'issue, et l'icône change de forme avec elle
// (WCAG 1.4.1). Le libellé affiché est court (« Oui ») ; le composant qui la montre peut lui donner
// une phrase plus claire pour un lecteur d'écran (`spokenLabel`, « Ça a marché : Oui »), qui finit
// par ce qui est écrit (le nom lu contient le texte affiché). La pastille se lit d'un seul tenant :
// son nom, jamais le mot puis la phrase. Elle ne se touche pas.
//
// Les icônes sont la coche, le demi-cercle et la croix simples (`check`, `circle-half`, `x`, choix
// de la tranche : pas d'icône de plus à fabriquer).
import { type ColorName, radii, space } from '@ruche/brand'
import type { FeedbackOutcome } from '@ruche/contracts'
import { Platform, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { hiddenFrame } from './HiddenHeading'
import { type IconName, iconPaths } from './icons.generated'
import { Text, type TextTone } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  outcome: FeedbackOutcome
  /** Le libellé affiché (« Oui », « En partie », « Non ») : c'est l'écran qui le traduit. */
  label: string
  /** Ce que lit un lecteur d'écran à la place du libellé (« Ça a marché : Oui ») ; absent : le libellé. */
  spokenLabel?: string | undefined
}

/**
 * Ce que dessine chaque issue : son icône et ses trois rôles de couleur (packages/brand,
 * `outcome<X>Surface` pour le fond, `outcome<X>Icon` pour l'icône, au moins 3:1 sur lui,
 * `outcome<X>Text` pour le libellé, 4,5:1, par le ton du même nom de `Text`). `as const` : TypeScript garde les noms exacts des rôles.
 */
const looks = {
  yes: {
    icon: 'check',
    surface: 'outcomeYesSurface',
    fill: 'outcomeYesIcon',
    tone: 'outcomeYes',
  },
  partly: {
    icon: 'circle-half',
    surface: 'outcomePartlySurface',
    fill: 'outcomePartlyIcon',
    tone: 'outcomePartly',
  },
  no: {
    icon: 'x',
    surface: 'outcomeNoSurface',
    fill: 'outcomeNoIcon',
    tone: 'outcomeNo',
  },
} as const satisfies Record<
  FeedbackOutcome,
  { icon: IconName; surface: ColorName; fill: ColorName; tone: TextTone }
>

/** La hauteur de la pastille (celle d'un statut de projet, `StatusPill`) et la taille de l'icône. */
const PILL_HEIGHT = 26
const ICON_SIZE = 15

export function OutcomePill({ outcome, label, spokenLabel }: Props) {
  const { colors } = useTheme()
  const look = looks[outcome]
  const spoken = spokenLabel ?? label

  const drawn = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xxs,
        minHeight: PILL_HEIGHT,
        paddingHorizontal: space.sm,
        borderRadius: radii.pill,
        backgroundColor: colors[look.surface],
        // Rangée à gauche dans une bulle, à la largeur de son libellé ; à texte agrandi, dans une
        // colonne étroite, elle se replie plutôt que de déborder (piège de code-appli.md).
        alignSelf: 'flex-start',
        flexShrink: 1,
        maxWidth: '100%',
      }}
    >
      {/* L'icône, dessinée comme dans Icon, mais de la couleur propre à l'issue : les tons d'Icon sont
          ceux du texte. Décorative : le libellé dit tout. Dans une vue, pour ne jamais rétrécir sur
          le web à côté d'un libellé long. */}
      <View style={{ flexShrink: 0 }}>
        <Svg
          width={ICON_SIZE}
          height={ICON_SIZE}
          viewBox="0 0 256 256"
          fill={colors[look.fill]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          aria-hidden
        >
          {iconPaths[look.icon].map((d) => (
            <Path key={d} d={d} />
          ))}
        </Svg>
      </View>
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text variant="caption" weight={700} tone={look.tone}>
          {label}
        </Text>
      </View>
    </View>
  )

  // Sur le web, le nom d'une vue sans rôle n'est pas lu : sans phrase à part, le mot affiché se lit
  // tel quel ; avec une phrase, la pastille dessinée est cachée au lecteur d'écran, et la phrase est
  // écrite à côté, cachée à l'œil (comme `ToolField`).
  if (Platform.OS === 'web') {
    if (spoken === label) return drawn
    return (
      <>
        <View aria-hidden style={{ alignSelf: 'flex-start', flexShrink: 1, maxWidth: '100%' }}>
          {drawn}
        </View>
        <View style={hiddenFrame}>
          <Text>{spoken}</Text>
        </View>
      </>
    )
  }
  // Sur téléphone, VoiceOver et TalkBack lisent le nom donné au bloc.
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={spoken}
      style={{ alignSelf: 'flex-start', flexShrink: 1, maxWidth: '100%' }}
    >
      {drawn}
    </View>
  )
}
