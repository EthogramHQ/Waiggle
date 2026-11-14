// Un champ à choix dans un menu (R9, planche R9-Moderation-Detail-Telephone : « Fondement · La loi
// ⌄ ») : une ligne à l'allure d'un champ, avec son libellé à gauche, le choix actuel (ou « À
// choisir ») et un chevron. Touchée, elle ouvre un menu de choix (ActionMenu, rôle `menuitemradio`
// sur le web), où le choix actuel porte une coche. Rien n'est choisi d'avance : la ligne dit alors
// ce qui reste à faire, en gris.
//
// Pour les lecteurs d'écran, c'est un bouton qui dit qu'il ouvre un menu (`aria-haspopup`) et s'il
// est ouvert (`aria-expanded`), nommé « Fondement, La loi » : le choix s'entend avant d'ouvrir, et
// le nom lu commence par le libellé affiché (WCAG 2.5.3). Le focus revient sur la ligne quand le
// menu se ferme (ActionMenu s'en charge).
//
// Différent de Choices (pastilles toutes visibles) : ici, les choix ont des libellés longs, ou la
// place manque (une feuille de téléphone), et la question tient sur une ligne.
import { borders, layout, radii, space } from '@ruche/brand'
import { type Ref, useId } from 'react'
import { Platform, Pressable, View } from 'react-native'
import { ActionMenu, type ActionMenuItem } from './ActionMenu'
import { FieldError } from './FieldError'
import { Icon } from './Icon'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

export type MenuFieldOption<T extends string> = { value: T; label: string }

// <T extends string> : un composant « générique » ; T est le type des valeurs possibles
// ('illegal' | 'rules') : TypeScript vérifie que la valeur et les choix concordent.
type Props<T extends string> = {
  /** La question (« Fondement »), à gauche de la ligne ; aussi le début du nom lu. */
  label: string
  /** Le choix actuel ; null : rien de choisi encore. */
  value: T | null
  /** Les choix du menu, dans l'ordre affiché. */
  options: MenuFieldOption<T>[]
  onChange: (value: T) => void
  /** Ce que la ligne montre tant que rien n'est choisi (« À choisir »). */
  placeholder: string
  /** Une réponse manque : la phrase s'affiche sous la ligne, et son cadre passe au rouge. */
  error?: string | undefined
  /**
   * Reçoit la ligne (le bouton qui ouvre le menu), pour une feuille qui s'ouvre sur sa première
   * question (`Sheet initialFocusRef`, le retrait de la modération).
   */
  triggerRef?: Ref<View>
}

export function MenuField<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
  error,
  triggerRef,
}: Props<T>) {
  const { colors } = useTheme()
  // useId : un identifiant stable (pré-rendu et navigateur), qui relie la ligne à sa phrase d'erreur.
  const errorId = useId()
  const chosen = options.find((option) => option.value === value) ?? null
  const shown = chosen?.label ?? placeholder
  const spoken = `${label}, ${shown}`
  // Les choix du menu : celui de la ligne coché ; tous deviennent des choix (`checked` posé).
  const items: ActionMenuItem[] = options.map((option) => ({
    label: option.label,
    checked: option.value === value,
    onPress: () => onChange(option.value),
  }))

  return (
    <View style={{ gap: space.xs, alignSelf: 'stretch' }}>
      <ActionMenu
        items={items}
        label={label}
        {...(triggerRef ? { ref: triggerRef } : null)}
        renderTrigger={({ onPress, expanded, ref }) => (
          <Pressable
            ref={ref}
            accessibilityRole="button"
            accessibilityLabel={spoken}
            aria-expanded={expanded}
            {...(Platform.OS === 'web'
              ? {
                  'aria-haspopup': 'menu',
                  ...(error ? { 'aria-invalid': true, 'aria-describedby': errorId } : null),
                }
              : null)}
            {...(error && Platform.OS !== 'web' ? { accessibilityHint: error } : null)}
            onPress={onPress}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              minHeight: layout.touchTarget,
              paddingHorizontal: space.lg,
              paddingVertical: space.sm,
              borderRadius: radii.group,
              borderWidth: error ? borders.strong : borders.hairline,
              borderColor: error ? colors.dangerBorder : colors.groupBorder,
              backgroundColor: pressed ? colors.honeySoft : colors.surfaceGrouped,
            })}
          >
            {/* Le libellé, puis le choix : à texte agrandi, le choix passe à la ligne au lieu de
                sortir du cadre (flexShrink et la largeur bornée). */}
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'baseline',
                columnGap: space.md,
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: 0,
                minWidth: 0,
              }}
            >
              <Text variant="caption" weight={600} tone="muted">
                {label}
              </Text>
              <View style={{ flexShrink: 1, maxWidth: '100%' }}>
                <Text weight={chosen ? 600 : 400} tone={chosen ? 'default' : 'muted'}>
                  {shown}
                </Text>
              </View>
            </View>
            <View style={{ flexShrink: 0 }}>
              <Icon name="caret-down" size={20} color="textMuted" />
            </View>
          </Pressable>
        )}
      />
      {/* Toujours montée, vide sans erreur : la phrase qui arrive est annoncée (aria-live). */}
      <FieldError id={errorId} message={error} />
    </View>
  )
}
