// La pile d'avatars (Miel 2, tranche R1) : quelques ronds chevauchés qui disent « des membres » (les
// membres d'une ruche, les testeurs d'un projet), et une pastille « +N » pour les autres.
// À quoi elle ne sert jamais : dire qui a réagi ou qui suit. Des visages en pile poussent à compter
// et à comparer ; les réactions et les abonnés restent des nombres et des listes nommées.
// Pour un lecteur d'écran, la pile est une seule image, nommée par l'écran (« 5 membres ») : les
// visages et la pastille sont cachés, sinon il égrènerait chaque nom avant d'arriver à la suite.
// Sans nom (`label` absent), la pile est un simple décor, cachée tout entière : c'est le cas dans
// le bouton des nouveautés du fil (R4), dont le nom dit déjà tout (« 3 nouveaux projets »).
import { borders, initialsWeight, space } from '@ruche/brand'
import { Platform, View } from 'react-native'
import { Avatar, initialsOf } from './Avatar'
import type { ImageSource } from './image'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

/**
 * Le diamètre d'un rond de la pile, en points, selon sa taille : 28 d'ordinaire, 24 dans un
 * bouton de 44 points (avec son liseré, la pile y fait 28 de haut et laisse l'air de la pilule).
 */
const SIZES = { regular: 28, small: 24 } as const
/** De combien chaque rond passe sous le précédent, en points. */
const OVERLAP = space.sm

/** Un membre de la pile : son nom (pour ses initiales) et sa photo, s'il en a une. */
export type StackMember = { name: string; source: ImageSource | null }

type Props = {
  members: readonly StackMember[]
  /**
   * Ce que lit un lecteur d'écran pour toute la pile (« 5 membres ») : l'écran le compose. Absent,
   * la pile est décorative : rien n'en est lu (le contrôle qui la porte a déjà son nom).
   */
  label?: string
  /** Combien de visages au plus avant la pastille « +N » (3 par défaut). */
  max?: number
  /** regular : 28 points ; small : 24, pour se poser dans un bouton. */
  size?: keyof typeof SIZES
}

/**
 * Cache un élément et tout ce qu'il contient aux lecteurs d'écran, sur chaque plateforme :
 * Android (importantForAccessibility), iOS (accessibilityElementsHidden) et le web (aria-hidden).
 */
const hiddenFromReaders = {
  importantForAccessibility: 'no-hide-descendants' as const,
  accessibilityElementsHidden: true,
  ...(Platform.OS === 'web' ? { 'aria-hidden': true } : null),
}

/**
 * Les initiales d'un membre sans photo, à la taille de la pile. L'Avatar commun les écrit en 13
 * points à cette taille : « MD » touchait alors le bord du rond, et le rond suivant, qui le
 * chevauche, en mangeait la fin. Ici, un cran plus petit (micro), toujours en graisse très forte.
 */
function Initials({ name, size }: { name: string; size: number }) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.honey,
      }}
    >
      <Text variant="micro" weight={initialsWeight} tone="onHoney" maxScale={1}>
        {initialsOf(name)}
      </Text>
    </View>
  )
}

export function AvatarStack({ members, label, max = 3, size = 'regular' }: Props) {
  const { colors } = useTheme()
  const diameter = SIZES[size]
  const shown = members.slice(0, max)
  const others = members.length - shown.length
  // Chaque rond est cerné de la couleur de la surface : il se détache de celui qu'il chevauche.
  const ring = {
    borderWidth: borders.badge,
    borderColor: colors.surface,
    borderRadius: diameter,
  }
  // Nommée, la pile est une image ; sans nom, un décor caché tout entier aux lecteurs d'écran.
  const reading =
    label === undefined
      ? hiddenFromReaders
      : {
          accessible: true,
          // Un rôle d'image : sur le web, le navigateur ignore le nom d'un bloc qui n'en a pas.
          accessibilityRole: 'image' as const,
          accessibilityLabel: label,
        }
  return (
    <View
      {...reading}
      // alignSelf : la pile garde sa largeur naturelle, même dans une colonne qui s'étire.
      style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' }}
    >
      {shown.map((member, index) => (
        <View
          // Deux membres peuvent porter le même nom : le rang sert de clé.
          // biome-ignore lint/suspicious/noArrayIndexKey: la pile n'est jamais réordonnée sur place.
          key={index}
          {...hiddenFromReaders}
          style={[ring, index > 0 ? { marginLeft: -OVERLAP } : null]}
        >
          {member.source ? (
            <Avatar name={member.name} source={member.source} label={member.name} size={diameter} />
          ) : (
            <Initials name={member.name} size={diameter} />
          )}
        </View>
      ))}
      {others > 0 ? (
        <View
          {...hiddenFromReaders}
          style={[
            ring,
            {
              marginLeft: -OVERLAP,
              minWidth: diameter + 2 * borders.badge,
              height: diameter + 2 * borders.badge,
              paddingHorizontal: space.xs,
              alignItems: 'center',
              justifyContent: 'center',
              // La « Crème » : le miel doux, sous un chiffre brun (statusText, contrastPairs).
              backgroundColor: colors.honeySoft,
            },
          ]}
        >
          {/* maxScale 1 : le chiffre reste dans sa pastille ; le nom de l'image dit tout. */}
          <Text variant="mono" tone="status" maxScale={1} tabular>
            {`+${others}`}
          </Text>
        </View>
      ) : null}
    </View>
  )
}
