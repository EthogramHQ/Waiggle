// Le choix de l'icône d'une ruche (R10, planche R10-Creer, « Son icône ») : douze alvéoles en deux
// rangées de six (trois de quatre sur un écran étroit), sur le modèle de IconGrid. C'est un groupe de boutons radio nommé « Icône de la
// ruche » : une seule alvéole cochée (le miel plein et une coche dans son coin, pour qui ne
// distingue pas les couleurs), chacune nommée par son sens (« Maison », « Café »), jamais par son
// code (« house-line »). Au clavier (web) : Tab n'arrive que sur l'alvéole cochée (« tabIndex
// itinérant »), les flèches passent à la voisine en la cochant et en faisant le tour, la barre
// d'espace coche. Chaque alvéole garde 44 points de large au moins, même à 320 points d'écran.
import { borders, layout, space } from '@ruche/brand'
import { HIVE_ICONS, type HiveIcon } from '@ruche/contracts'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, View } from 'react-native'
import { Hexagon } from './HiveBadge'
import { Icon } from './Icon'
import { spaceToggles } from './keyboard'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** L'icône cochée (la création part de la maison, `house-line`). */
  value: HiveIcon
  onChange: (icon: HiveIcon) => void
  /**
   * Pendant l'envoi de la feuille : les alvéoles ne se changent plus (grisées, `aria-disabled`),
   * mais la cochée reste un arrêt de Tab, pour que le focus ne se perde pas s'il y était.
   */
  disabled?: boolean
}

type KeyEvent = { key: string; preventDefault: () => void }

/**
 * Les douze icônes, dans l'ordre du contrat (celui de la planche), groupées par deux. Les paires
 * passent à la ligne ensemble : six alvéoles par rangée quand il y a la place (deux rangées, comme
 * sur la planche), sinon quatre (trois rangées), jamais cinq puis une seule, et jamais une zone à
 * toucher rognée sous 44 points.
 */
const PAIR = 2
const pairs: HiveIcon[][] = []
for (let start = 0; start < HIVE_ICONS.length; start += PAIR) {
  pairs.push(HIVE_ICONS.slice(start, start + PAIR))
}
/** La largeur d'une paire : deux alvéoles et leur écart, au moins à 44 points, au plus à `pickerCell`. */
const pairWidth = (cell: number) => PAIR * cell + (PAIR - 1) * space.xs
/** La grille ne s'élargit pas au-delà de six alvéoles par rangée. */
const gridMaxWidth =
  layout.hive.pickerColumns * layout.hive.pickerCell + (layout.hive.pickerColumns - 1) * space.xs

export function HiveIconPicker({ value, onChange, disabled = false }: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  // Les alvéoles, pour y poser le focus quand une flèche passe à la voisine.
  const refs = useRef<(View | null)[]>([])
  // Le seul arrêt de Tab : l'alvéole cochée (il y en a toujours une).
  const checkedIndex = HIVE_ICONS.indexOf(value)
  const tabStop = checkedIndex === -1 ? 0 : checkedIndex
  const choose = (icon: HiveIcon) => {
    if (!disabled) onChange(icon)
  }

  // Web seulement : les flèches (les quatre) cochent la voisine dans l'ordre de lecture et lui
  // donnent le focus, en faisant le tour ; l'espace passe par spaceToggles, que react-native-web ne
  // fait réagir que sur les boutons. Comme IconGrid : une flèche vers le bas passe à la suivante,
  // pas à l'alvéole du dessous (le groupe se lit comme une seule liste).
  const keys = (index: number, icon: HiveIcon) => {
    if (Platform.OS !== 'web') return null
    const spaceBar = spaceToggles(() => choose(icon), disabled) as {
      onKeyDown?: (event: KeyEvent) => void
    }
    return {
      tabIndex: index === tabStop ? (0 as const) : (-1 as const),
      onKeyDown: (event: KeyEvent) => {
        const step =
          event.key === 'ArrowRight' || event.key === 'ArrowDown'
            ? 1
            : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
              ? -1
              : 0
        if (step === 0) {
          spaceBar.onKeyDown?.(event)
          return
        }
        // preventDefault : la flèche ne fait pas défiler la page, même inactive.
        event.preventDefault()
        if (disabled) return
        const next = (index + step + HIVE_ICONS.length) % HIVE_ICONS.length
        const neighbour = HIVE_ICONS[next]
        if (neighbour) onChange(neighbour)
        refs.current[next]?.focus()
      },
    }
  }

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t(($) => $.hives.createSheet.icon)}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: space.xs,
        maxWidth: gridMaxWidth,
      }}
    >
      {pairs.map((pair) => (
        <View
          key={pair.join()}
          // Une paire : ses deux alvéoles s'y partagent la largeur, de 44 points à `pickerCell`.
          style={{
            flexDirection: 'row',
            gap: space.xs,
            flexGrow: 1,
            flexBasis: pairWidth(layout.touchTarget),
            maxWidth: pairWidth(layout.hive.pickerCell),
          }}
        >
          {pair.map((icon) => {
            const index = HIVE_ICONS.indexOf(icon)
            const checked = icon === value
            return (
              <Pressable
                key={icon}
                ref={(node) => {
                  refs.current[index] = node
                }}
                accessibilityRole="radio"
                accessibilityLabel={t(($) => $.hives.icons[icon])}
                aria-checked={checked}
                disabled={disabled}
                onPress={() => choose(icon)}
                {...keys(index, icon)}
                style={{
                  flexGrow: 1,
                  flexBasis: 0,
                  minWidth: layout.touchTarget,
                  maxWidth: layout.hive.pickerCell,
                  height: layout.hive.pickerHeight,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {({ pressed }) => (
                  <>
                    {/* L'hexagone remplit l'alvéole : le plus grand qui y tient, centré, même
                        quand la rangée se resserre (le dessin garde ses proportions). */}
                    <View
                      style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        bottom: 0,
                        left: 0,
                      }}
                    >
                      <Hexagon
                        fill={
                          checked
                            ? disabled
                              ? colors.honeyDisabled
                              : pressed
                                ? colors.honeyPressed
                                : colors.honey
                            : pressed && !disabled
                              ? colors.highlight
                              : colors.honeySoft
                        }
                      />
                    </View>
                    {/* L'icône : brune sur le miel plein (onHoneyTile sur honey), couleur des
                        pastilles de statut sur le miel pâle (statusText sur honeySoft), deux
                        couples de contrastPairs ; grisée pendant l'envoi. Dans sa propre vue, pour
                        se peindre par-dessus l'hexagone sur le web (voir HiveBadge). */}
                    <View>
                      <Icon
                        name={icon}
                        size={Math.round(layout.hive.regular * layout.hive.iconRatio)}
                        color={
                          disabled ? 'onHoneyDisabled' : checked ? 'onHoneyTile' : 'statusText'
                        }
                      />
                    </View>
                    {checked ? (
                      // La coche, sur le coin bas droit : l'état coché se voit sans la couleur.
                      // Un rond brun (la couleur de l'icône) et la coche en miel, le même couple
                      // retourné ; un liseré de la couleur de la feuille le détache de l'alvéole.
                      <View
                        style={{
                          position: 'absolute',
                          right: 0,
                          bottom: 0,
                          width: layout.hive.pickerCheck,
                          height: layout.hive.pickerCheck,
                          borderRadius: layout.hive.pickerCheck / 2,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: disabled ? colors.onHoneyDisabled : colors.onHoneyTile,
                          borderWidth: borders.badge,
                          borderColor: colors.sheet,
                        }}
                      >
                        <Icon
                          name="check"
                          size={layout.hive.pickerCheck - 2 * borders.badge - space.xs}
                          color={disabled ? 'honeyDisabled' : 'honey'}
                        />
                      </View>
                    ) : null}
                  </>
                )}
              </Pressable>
            )
          })}
        </View>
      ))}
    </View>
  )
}
