// Le champ d'un mois et de son année (R6a, « Commencé en ») : facultatif, entre deux bornes écrites
// « AAAA-MM » comme la valeur (`min` : janvier 2000 ; `max` : le mois en cours, que l'écran calcule
// avec `startedMonthMax` de `@ruche/contracts`, une fois la page hydratée). « Effacer » le vide.
//
// Deux parties, chacune lisible et utilisable seule (relecture du plan, ui-I7) :
// - l'année, une valeur réglable (`adjustable` sur téléphone, `slider` sur le web) : on la change
//   d'un geste vers le haut ou le bas avec un lecteur d'écran, avec les flèches au clavier, ou en
//   touchant les chevrons dessinés de part et d'autre ; ses bornes sont lues avec elle ;
// - les douze mois, un groupe de choix comme `Choices` : un seul arrêt de Tab (le mois coché, sinon
//   le premier permis), les flèches passent au voisin en le cochant. Les mois après `max` dans
//   l'année de `max` (et avant `min` dans celle de `min`) sont inactifs.
//
// Changer d'année garde le mois, ramené dans les bornes (décembre 2025, puis 2026 : novembre 2026,
// si c'est le mois en cours). Choisir un mois sans valeur prend l'année affichée : celle de `max`
// au départ. Sans valeur, l'année se règle quand même : elle sert au mois qu'on choisira.
import { borders, layout, radii, space } from '@ruche/brand'
import { useId, useRef, useState } from 'react'
import { type AccessibilityActionEvent, Platform, Pressable, View } from 'react-native'
import { describedBy } from './aria'
import { focusWithoutScroll } from './focus'
import { Icon } from './Icon'
import { spaceToggles } from './keyboard'
import { Text } from './Text'
import { TextLink } from './TextLink'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** La question (« Commencé en »). */
  label: string
  /** « AAAA-MM », ou null : pas de mois donné. */
  value: string | null
  onChange: (value: string | null) => void
  /** Le premier mois permis, « AAAA-MM ». */
  min: string
  /** Le dernier mois permis, « AAAA-MM » (le mois en cours, calculé après l'hydratation). */
  max: string
  /** Les douze noms de mois, de janvier à décembre, dans la langue de l'appli (tirés d'`Intl`). */
  monthNames: string[]
  /** Le bouton qui vide le champ (« Effacer ») ; montré seulement quand un mois est choisi. */
  clearLabel: string
  /** Le nom du groupe des mois (« Mois ») ; la question par défaut. */
  monthLabel?: string
  /** Le nom de l'année réglable (« Année ») ; la question par défaut. */
  yearLabel?: string
  /** Une erreur, montrée sous les mois et liée à leur groupe. */
  error?: string
}

type KeyEvent = { key: string; preventDefault: () => void }

/** L'année et le mois (1 à 12) d'une valeur « AAAA-MM ». */
const parse = (month: string) => ({
  year: Number(month.slice(0, 4)),
  month: Number(month.slice(5, 7)),
})

/** « AAAA-MM », le mois sur deux chiffres. */
const format = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`

/** Le mois ramené entre les bornes : les valeurs « AAAA-MM » se comparent comme des textes. */
const clamp = (month: string, min: string, max: string) =>
  month < min ? min : month > max ? max : month

export function MonthField({
  label,
  value,
  onChange,
  min,
  max,
  monthNames,
  clearLabel,
  monthLabel,
  yearLabel,
  error,
}: Props) {
  const { colors } = useTheme()
  const first = parse(min)
  const last = parse(max)
  const chosen = value === null ? null : parse(value)
  // L'année affichée sans valeur : celle qu'on a réglée, sinon celle de `max`. Gardée à part (null
  // tant qu'on n'y a pas touché) : `max` peut changer après l'hydratation, l'année suit alors.
  const [draftYear, setDraftYear] = useState<number | null>(null)
  const year = chosen?.year ?? draftYear ?? last.year

  // Les mois, pour y poser le focus (flèches, « Effacer »).
  const refs = useRef<(View | null)[]>([])
  const errorId = useId()

  const allowed = (month: number) => {
    const candidate = format(year, month)
    return candidate >= min && candidate <= max
  }
  const months = monthNames.map((name, index) => ({
    name,
    month: index + 1,
    enabled: allowed(index + 1),
  }))
  // Le seul mois que Tab atteint : le coché, sinon le premier permis.
  const checkedIndex = chosen && chosen.year === year ? chosen.month - 1 : -1
  const firstEnabled = Math.max(
    0,
    months.findIndex((month) => month.enabled),
  )
  const tabStop = checkedIndex === -1 ? firstEnabled : checkedIndex

  // --- L'année ---------------------------------------------------------------------------------
  const setYear = (next: number) => {
    if (next < first.year || next > last.year || next === year) return
    if (chosen) onChange(clamp(format(next, chosen.month), min, max))
    else setDraftYear(next)
  }
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') setYear(year + 1)
    else if (event.nativeEvent.actionName === 'decrement') setYear(year - 1)
  }
  // Sur le web, les touches d'un curseur : flèches, Début et Fin (les bornes).
  const yearKeys =
    Platform.OS === 'web'
      ? {
          tabIndex: 0 as const,
          onKeyDown: (event: KeyEvent) => {
            const moves: Record<string, number> = {
              ArrowUp: year + 1,
              ArrowRight: year + 1,
              ArrowDown: year - 1,
              ArrowLeft: year - 1,
              Home: first.year,
              End: last.year,
            }
            const target = moves[event.key]
            if (target === undefined) return
            // La page ne défile pas en même temps.
            event.preventDefault()
            setYear(target)
          },
          'aria-valuenow': year,
          'aria-valuemin': first.year,
          'aria-valuemax': last.year,
          'aria-valuetext': String(year),
        }
      : null

  // Un chevron dessiné : pour le doigt et la souris seulement. Le lecteur d'écran règle l'année
  // elle-même, le clavier aussi (flèches) : les chevrons sont cachés et hors du parcours de Tab.
  const chevron = (direction: 'previous' | 'next') => {
    const step = direction === 'previous' ? -1 : 1
    const possible = direction === 'previous' ? year > first.year : year < last.year
    return (
      <Pressable
        onPress={() => setYear(year + step)}
        disabled={!possible}
        focusable={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
        {...(Platform.OS === 'web' ? { tabIndex: -1 } : null)}
        style={({ pressed }) => ({
          width: layout.touchTarget,
          height: layout.touchTarget,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radii.pill,
          backgroundColor: pressed ? colors.honeySoft : 'transparent',
        })}
      >
        <Icon
          name={direction === 'previous' ? 'caret-left' : 'caret-right'}
          size={space.xl}
          tone={possible ? 'default' : 'disabled'}
        />
      </Pressable>
    )
  }

  // --- Les mois --------------------------------------------------------------------------------
  const choose = (month: number) => {
    if (!allowed(month)) return
    onChange(format(year, month))
  }
  // Les flèches passent au mois permis voisin (en faisant le tour), le cochent et lui donnent le
  // focus, comme dans `Choices`.
  const monthKeys = (index: number, enabled: boolean) => {
    if (Platform.OS !== 'web') return null
    const spaceBar = spaceToggles(() => choose(index + 1), !enabled) as {
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
        event.preventDefault()
        // Le voisin permis le plus proche dans ce sens ; il y en a toujours un (le mois lui-même).
        let next = index
        for (let tries = 0; tries < months.length; tries += 1) {
          next = (next + step + months.length) % months.length
          if (months[next]?.enabled) break
        }
        choose(next + 1)
        refs.current[next]?.focus()
      },
    }
  }

  // « Effacer » : le champ se vide, l'année affichée reste, et le focus va au premier mois permis,
  // le seul arrêt de Tab d'un groupe vide. Sans cela, le bouton qui disparaît emporterait le focus
  // (il retomberait en haut de la page) ; sans défilement, la page reste où elle est.
  const clear = () => {
    setDraftYear(year)
    onChange(null)
    focusWithoutScroll(refs.current[firstEnabled])
  }

  return (
    // Jamais plus large qu'un formulaire : sur un grand écran, trois mois par rangée resteraient
    // des pastilles de 400 points.
    <View style={{ gap: space.sm, alignSelf: 'stretch', maxWidth: layout.formWidth }}>
      {/* La question à gauche, « Effacer » à droite, sur une rangée toujours haute de 44 points :
          quand le bouton paraît ou disparaît, rien ne bouge dessous (comme `Choices`). */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          alignContent: 'center',
          justifyContent: 'space-between',
          columnGap: space.md,
          minHeight: layout.touchTarget,
        }}
      >
        <View style={{ flexShrink: 1, maxWidth: '100%' }}>
          <Text variant="caption" weight={600} tone="muted">
            {label}
          </Text>
        </View>
        {value === null ? null : (
          <TextLink role="button" label={clearLabel} tone="accent" onPress={clear} />
        )}
      </View>

      {/* L'année, réglable : « ‹ 2026 › ». */}
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={yearLabel ?? label}
        accessibilityValue={{ min: first.year, max: last.year, now: year }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAccessibilityAction}
        {...yearKeys}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: space.xs,
          borderRadius: radii.pill,
        }}
      >
        {chevron('previous')}
        <Text variant="headline" tabular>
          {String(year)}
        </Text>
        {chevron('next')}
      </View>

      {/* Les douze mois, trois par rangée. */}
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={monthLabel ?? label}
        {...describedBy(error ? errorId : undefined)}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}
      >
        {months.map(({ name, month, enabled }, index) => {
          const checked = index === checkedIndex
          return (
            <Pressable
              key={name}
              ref={(node) => {
                refs.current[index] = node
              }}
              accessibilityRole="radio"
              accessibilityLabel={name}
              aria-checked={checked}
              disabled={!enabled}
              onPress={() => choose(month)}
              {...monthKeys(index, enabled)}
              style={({ pressed }) => ({
                // Trois par rangée : une base réelle et de quoi grandir (jamais `flex: 1`, qui vaut
                // une base nulle sur le web) ; à texte agrandi, le nom passe à la ligne.
                flexGrow: 1,
                flexBasis: '30%',
                maxWidth: '100%',
                flexShrink: 1,
                minHeight: layout.touchTarget,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: space.sm,
                borderRadius: radii.pill,
                borderWidth: borders.strong,
                borderColor: checked ? colors.honey : colors.outline,
                // Un mois pas encore arrivé : un contour en tirets, sans fond, en plus du texte
                // pâle (la couleur seule ne dit pas « inactif »).
                borderStyle: enabled ? 'solid' : 'dashed',
                backgroundColor: checked
                  ? colors.honey
                  : !enabled
                    ? 'transparent'
                    : pressed
                      ? colors.honeySoft
                      : colors.surface,
              })}
            >
              <Text
                variant="callout"
                align="center"
                weight={checked ? 700 : 500}
                tone={checked ? 'onHoney' : enabled ? 'default' : 'disabled'}
              >
                {name}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {error ? (
        <Text variant="caption" tone="danger" nativeID={errorId}>
          {error}
        </Text>
      ) : null}
    </View>
  )
}
