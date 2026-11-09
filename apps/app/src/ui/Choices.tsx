// Une question à choix unique (statut, visibilité…) : une rangée de pastilles dont une seule est
// cochée, en miel. Les lecteurs d'écran l'annoncent comme un groupe de boutons radio, ce qui permet
// aussi aux tests de retrouver chaque choix par son nom : getByRole('radio', { name: 'Testable' }).
// Au clavier (web), comme tout groupe de boutons radio (et comme Segmented) : Tab n'arrive que sur
// un choix, la barre d'espace le coche, et les flèches passent au choix voisin en le cochant.
// R6a (« Facile à refaire ? ») : un choix peut porter un rond de couleur devant son texte (`dot`),
// et une question facultative se vide par « Effacer » (`clearLabel`).
import { borders, type ColorName, layout, radii, space } from '@ruche/brand'
import { type ReactNode, type RefObject, useId, useRef } from 'react'
import { Platform, Pressable, View } from 'react-native'
import { describedBy, invalid } from './aria'
import { FieldError } from './FieldError'
import { focusWithoutScroll } from './focus'
import { Icon, type IconName } from './Icon'
import { spaceToggles } from './keyboard'
import { Text } from './Text'
import { TextLink } from './TextLink'
import { useTheme } from './theme/ThemeProvider'

type Option<T extends string> = {
  value: T
  label: string
  icon?: IconName
  /**
   * R6a : un rond de couleur devant le texte, par son rôle dans la marque (« success » vert,
   * « amber » jaune, « danger » rouge pour « Facile à refaire ? »). Décoratif : la couleur n'est
   * jamais seule, le texte dit tout, et le rond est caché aux lecteurs d'écran.
   */
  dot?: ColorName
}

// <T extends string> : un composant « générique ». T est le type des valeurs possibles
// ('idea' | 'building' | …) : TypeScript vérifie que les options et la valeur choisie concordent.
// Les props se lisent en deux cas : sans « Effacer », `onChange` ne reçoit jamais null, et une
// fonction qui ne prend qu'une valeur (`setStatus`) suffit ; avec « Effacer », elle doit accepter
// null. `NoInfer<T>` : T se déduit des options et de la valeur, jamais de la fonction, qui le
// reçoit tel quel.
type Base<T extends string> = {
  label: string
  options: Option<T>[]
  /** Le choix coché ; null : aucun encore (une question à laquelle il faut répondre soi-même). */
  value: T | null
  /**
   * R6a, correction C9 : reçoit l'entrée du groupe, son seul arrêt de Tab (le choix coché, sinon le
   * premier). Pour une fenêtre qui s'ouvre sur sa première question (`Dialog initialFocusRef`, le
   * retrait de la modération).
   */
  entryRef?: RefObject<View | null>
  /**
   * R6b : l'état invalide. Une réponse manque (« Choisis une famille. ») : la phrase s'affiche sous
   * les choix, et le groupe porte `aria-invalid` (web) et cite la phrase dans `aria-describedby`.
   */
  error?: string | undefined
}
type WithoutClear<T extends string> = Base<T> & {
  clearLabel?: undefined
  onChange: (value: NoInfer<T>) => void
}
type WithClear<T extends string> = Base<T> & {
  /**
   * R6a : le libellé d'un bouton qui vide la réponse (« Effacer »), pour une question facultative.
   * Il n'est montré que quand un choix est coché : sans rien à effacer, il disparaît, et le focus
   * passe au groupe. Facultatif ici aussi : un écran peut le donner selon le cas
   * (`{...(optional ? { clearLabel } : null)}`), avec une seule fonction qui accepte null.
   */
  clearLabel?: string
  /** Le choix touché, ou null quand « Effacer » vide la réponse. */
  onChange: (value: NoInfer<T> | null) => void
}
type Props<T extends string> = WithoutClear<T> | WithClear<T>

type KeyEvent = { key: string; preventDefault: () => void }

// Deux « surcharges » (overloads) : deux façons d'appeler le même composant. TypeScript essaie la
// première, puis la seconde ; chacune donne son type au paramètre d'une fonction écrite sur place
// (`onChange={(next) => …}`), ce qu'une simple union ne sait pas faire.
export function Choices<T extends string>(props: WithoutClear<T>): ReactNode
export function Choices<T extends string>(props: WithClear<T>): ReactNode
export function Choices<T extends string>(props: Props<T>) {
  const { label, options, value, onChange, clearLabel, entryRef, error } = props
  const { colors } = useTheme()
  // Relie la phrase d'erreur au groupe (aria-describedby) ; stable au pré-rendu web.
  const errorId = useId()
  // Les choix, pour y poser le focus quand une flèche passe au voisin.
  const refs = useRef<(View | null)[]>([])
  // Le seul choix que Tab atteint (« tabIndex itinérant ») : le choix coché, ou le premier quand
  // rien ne l'est encore. Sans cela, Tab s'arrêterait sur chaque pastille du groupe.
  const checkedIndex = options.findIndex((option) => option.value === value)
  const tabStop = checkedIndex === -1 ? 0 : checkedIndex

  // Sur le web seulement : les flèches cochent le choix voisin et lui donnent le focus (en faisant
  // le tour). La barre d'espace passe par spaceToggles (keyboard.ts), comme les autres radios :
  // react-native-web ne la fait réagir que sur les boutons.
  const keys = (index: number, option: Option<T>) => {
    if (Platform.OS !== 'web') return null
    const spaceBar = spaceToggles(() => onChange(option.value)) as {
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
        // preventDefault : la flèche ne fait pas défiler la page.
        event.preventDefault()
        const next = (index + step + options.length) % options.length
        const neighbour = options[next]
        if (neighbour) onChange(neighbour.value)
        refs.current[next]?.focus()
      },
    }
  }

  // « Effacer » : la réponse est vidée, puis le focus va au premier choix, le seul arrêt de Tab d'un
  // groupe où rien n'est coché. Sans cela, le bouton qui disparaît emporterait le focus avec lui
  // (il retomberait en haut de la page) ; sans défilement, la page reste où elle est.
  const clear = () => {
    // `props.clearLabel` dit à TypeScript que cette `onChange`-là accepte null (le bouton n'existe
    // qu'avec un `clearLabel`).
    if (props.clearLabel !== undefined) props.onChange(null)
    focusWithoutScroll(refs.current[0])
  }

  const caption = (
    <Text variant="caption" weight={600} tone="muted">
      {label}
    </Text>
  )

  return (
    <View style={{ gap: space.sm }}>
      {clearLabel === undefined ? (
        caption
      ) : (
        // La question à gauche, « Effacer » à droite, sur une rangée toujours haute de 44 points :
        // quand le bouton paraît ou disparaît, les choix dessous ne bougent pas.
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            // Avec flexWrap, une ligne seule resterait collée en haut des 44 points : centrée.
            alignContent: 'center',
            justifyContent: 'space-between',
            columnGap: space.md,
            minHeight: layout.touchTarget,
          }}
        >
          <View style={{ flexShrink: 1, maxWidth: '100%' }}>{caption}</View>
          {checkedIndex === -1 ? null : (
            <TextLink role="button" label={clearLabel} tone="accent" onPress={clear} />
          )}
        </View>
      )}
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        {...invalid(Boolean(error))}
        {...describedBy(error ? errorId : undefined)}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}
      >
        {options.map((option, index) => {
          const checked = option.value === value
          return (
            <Pressable
              key={option.value}
              ref={(node) => {
                refs.current[index] = node
                if (entryRef && index === tabStop) entryRef.current = node
              }}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              aria-checked={checked}
              onPress={() => onChange(option.value)}
              {...keys(index, option)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.xs,
                // À texte agrandi sur un petit écran, un choix long (« Les règles de Waiggle »)
                // passe à la ligne dans sa pastille au lieu de sortir de l'écran : sur le web,
                // react-native-web donne `flexShrink: 0` à toute vue (relecture de design 7c).
                maxWidth: '100%',
                flexShrink: 1,
                minHeight: layout.touchTarget,
                paddingHorizontal: space.lg,
                borderRadius: radii.pill,
                borderWidth: borders.strong,
                borderColor: checked ? colors.honey : colors.outline,
                backgroundColor: checked
                  ? colors.honey
                  : pressed
                    ? colors.honeySoft
                    : colors.surface,
              })}
            >
              {option.icon ? (
                <Icon name={option.icon} size={18} tone={checked ? 'onHoney' : 'muted'} />
              ) : null}
              {option.dot ? (
                // Le rond de couleur, caché aux lecteurs d'écran (iOS, Android, web) : le texte dit
                // déjà tout. Coché, sur le miel, il est cerclé d'encre, sinon le jaune s'y perdrait
                // (contrastPairs, `colors.ts`).
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  aria-hidden
                  style={{
                    width: layout.choiceDot,
                    height: layout.choiceDot,
                    // Le rond garde sa taille quand le texte passe à la ligne.
                    flexShrink: 0,
                    borderRadius: radii.pill,
                    borderWidth: borders.strong,
                    borderColor: checked ? colors.onHoney : colors[option.dot],
                    backgroundColor: colors[option.dot],
                  }}
                />
              ) : null}
              {/* Le texte rétrécit et passe à la ligne à côté du rond (texte agrandi à 200 %). */}
              <View style={{ flexShrink: 1 }}>
                <Text
                  variant="callout"
                  weight={checked ? 700 : 500}
                  tone={checked ? 'onHoney' : 'default'}
                >
                  {option.label}
                </Text>
              </View>
            </Pressable>
          )
        })}
      </View>
      <FieldError id={errorId} message={error} />
    </View>
  )
}
