// Le choix des catégories d'un projet (R6a, « Catégorie et outils ») : seize pastilles avec leur
// icône. La première touchée devient la catégorie principale, marquée « 1 » sur le miel ; la
// suivante, la catégorie seconde, marquée « 2 » sur le miel pâle. Toucher une catégorie choisie la
// retire (si c'est la principale, la seconde prend sa place) ; avec deux catégories déjà choisies,
// une troisième remplace la seconde (choix 2 de Louis). La règle vit dans `nextCategories`, une
// fonction pure (sans état ni affichage), que l'écran et les tests peuvent appeler seuls.
//
// Pour les lecteurs d'écran (relecture du plan, ui-I6) :
// - un groupe nommé par la question (« Catégorie »), qui dit de quoi parlent les seize cases ;
// - une case à cocher par catégorie (« Sciences et espace, catégorie principale » une fois
//   choisie : le rang est dans le nom, que l'écran prépare avec `rankLabels`) ;
// - les chiffres « 1 » et « 2 » sont dessinés, mais cachés : le nom dit déjà le rang ;
// - un rang qui change sans qu'on ait touché la case (la seconde qui remonte, la seconde remplacée)
//   est annoncé par une ligne d'état cachée à l'œil (`LiveStatus`).
// Au clavier (web) : Tab passe de case en case, la barre d'espace coche ou décoche (`spaceToggles` :
// react-native-web ne la fait réagir que sur les boutons).
import { borders, layout, radii, space } from '@ruche/brand'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { spaceToggles } from './keyboard'
import { LiveStatus } from './LiveStatus'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

/** Le choix en cours : la catégorie principale et la seconde, ou null quand il n'y en a pas. */
export type CategoryChoice<T extends string> = { primary: T | null; secondary: T | null }

/**
 * Le choix qui suit le toucher de `value`, à partir de `current` :
 * - une catégorie déjà choisie est retirée ; la principale retirée, la seconde monte à sa place ;
 * - sinon elle devient la principale s'il n'y en a pas, la seconde dans tous les autres cas (une
 *   troisième remplace donc la seconde).
 */
export function nextCategories<T extends string>(
  current: CategoryChoice<T>,
  value: T,
): CategoryChoice<T> {
  if (current.primary === value) return { primary: current.secondary, secondary: null }
  if (current.secondary === value) return { primary: current.primary, secondary: null }
  if (current.primary === null) return { primary: value, secondary: current.secondary }
  return { primary: current.primary, secondary: value }
}

type Option<T extends string> = { value: T; label: string; icon: IconName }

type Props<T extends string> = {
  /** La question (« Catégorie ») : le titre dessiné et le nom du groupe. */
  label: string
  /** La règle, sous la question (« Une principale, et une seconde si tu veux. »). */
  hint: string
  options: Option<T>[]
  primary: T | null
  secondary: T | null
  /** Le nouveau choix, après chaque toucher (calculé par `nextCategories`). */
  onChange: (choice: CategoryChoice<NoInfer<T>>) => void
  /**
   * Le nom lu d'une case choisie, à partir du nom de sa catégorie (« Sciences et espace, catégorie
   * principale ») ; une case libre garde le nom de sa catégorie seul.
   */
  rankLabels: { primary: (category: string) => string; secondary: (category: string) => string }
}

/**
 * La taille de l'icône d'une pastille, et du rond de son rang qui prend sa place une fois choisie :
 * la pastille garde la même largeur, choisie ou pas.
 */
const MARK = 18

export function CategoryPicker<T extends string>({
  label,
  hint,
  options,
  primary,
  secondary,
  onChange,
  rankLabels,
}: Props<T>) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  // Ce que la ligne d'état annonce : seulement les rangs qui changent d'eux-mêmes. Une case qu'on
  // coche ou décoche, le lecteur d'écran le dit déjà en lisant son nouvel état.
  const [announcement, setAnnouncement] = useState('')
  const nameOf = (value: T | null) => options.find((option) => option.value === value)?.label ?? ''

  const toggle = (value: T) => {
    const current = { primary, secondary }
    const next = nextCategories(current, value)
    if (current.primary === value && current.secondary !== null) {
      // La principale retirée : la seconde devient la principale.
      setAnnouncement(t(($) => $.project.form.categoryPromoted, { category: nameOf(next.primary) }))
    } else if (current.secondary !== null && next.secondary === value) {
      // Une troisième catégorie : elle remplace la seconde.
      setAnnouncement(
        t(($) => $.project.form.categoryReplaced, {
          category: nameOf(value),
          previous: nameOf(current.secondary),
        }),
      )
    } else {
      setAnnouncement('')
    }
    onChange(next)
  }

  return (
    <View style={{ gap: space.sm }}>
      <View style={{ gap: space.xxs }}>
        <Text variant="headline">{label}</Text>
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      </View>
      <View
        // Un groupe nommé, sans `accessible` : sur iOS, VoiceOver n'atteindrait plus les cases.
        role="group"
        accessibilityLabel={label}
        style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.sm, columnGap: space.xs }}
      >
        {options.map((option) => {
          const rank = option.value === primary ? 1 : option.value === secondary ? 2 : null
          const name =
            rank === 1
              ? rankLabels.primary(option.label)
              : rank === 2
                ? rankLabels.secondary(option.label)
                : option.label
          return (
            <Pressable
              key={option.value}
              accessibilityRole="checkbox"
              accessibilityLabel={name}
              aria-checked={rank !== null}
              onPress={() => toggle(option.value)}
              {...spaceToggles(() => toggle(option.value))}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.xs,
                // À texte agrandi sur un petit écran, un nom long passe à la ligne dans sa pastille
                // (react-native-web donne `flexShrink: 0` à toute vue).
                maxWidth: '100%',
                flexShrink: 1,
                minHeight: layout.touchTarget,
                paddingHorizontal: space.md,
                borderRadius: radii.pill,
                borderWidth: borders.strong,
                // La principale en miel ; la seconde en miel pâle, cerclée d'ambre (planche R6) ;
                // les autres en blanc, cerclées comme les choix de `Choices`.
                borderColor: rank === 1 ? colors.honey : rank === 2 ? colors.amber : colors.outline,
                backgroundColor:
                  rank === 1
                    ? colors.honey
                    : rank === 2 || pressed
                      ? colors.honeySoft
                      : colors.surface,
              })}
            >
              {rank === null ? (
                <Icon name={option.icon} size={MARK} tone="muted" />
              ) : (
                // Le rang dessiné : un rond d'encre et son chiffre, cachés aux lecteurs d'écran
                // (iOS, Android, web) ; le nom de la case dit déjà « catégorie principale ».
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  aria-hidden
                  style={{
                    width: MARK,
                    height: MARK,
                    flexShrink: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: radii.pill,
                    backgroundColor: colors.text,
                  }}
                >
                  <Text variant="micro" weight={700} tone="onInk" tabular maxScale={1}>
                    {String(rank)}
                  </Text>
                </View>
              )}
              <View style={{ flexShrink: 1 }}>
                <Text
                  variant="callout"
                  weight={rank === null ? 500 : 700}
                  tone={rank === 1 ? 'onHoney' : rank === 2 ? 'status' : 'default'}
                >
                  {option.label}
                </Text>
              </View>
            </Pressable>
          )
        })}
      </View>
      {/* Toujours montée, vide plutôt qu'absente : sinon sa première annonce serait muette. */}
      <LiveStatus message={announcement} visible={false} />
    </View>
  )
}
