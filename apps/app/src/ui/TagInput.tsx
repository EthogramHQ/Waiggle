// La saisie d'une liste de mots : des pastilles qu'on retire d'une croix, et un champ « Ajouter… ».
// Une virgule ou la touche Entrée transforme ce qu'on tape en pastille. Ce qui est en cours de
// frappe compte déjà dans la liste : rien n'est perdu si on enregistre sans valider.
// Sert aux outils favoris du profil et aux outils d'un projet.
import { borders, layout, radii, space, textStyles } from '@ruche/brand'
import { useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { Icon } from './Icon'
import { Text } from './Text'
import { fontName } from './theme/fonts'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  label: string
  /** Les éléments de la liste (« Claude », « Python »). */
  values: string[]
  onChange: (values: string[]) => void
  /** Le texte du champ vide (« Ajouter un outil »). */
  placeholder: string
  /** Le nom d'un bouton de retrait, avec {{item}} : « Retirer Claude ». */
  removeLabel: (item: string) => string
  /** Une précision à droite du libellé (« 10 au plus »). */
  limit?: string
  error?: string | undefined
}

/** Découpe un texte tapé aux virgules : les morceaux complets, puis ce qui reste après la dernière. */
const splitDraft = (text: string) => {
  const parts = text.split(',')
  const draft = parts.pop() ?? ''
  return { complete: parts.map((p) => p.trim()).filter(Boolean), draft }
}

export function TagInput({
  label,
  values,
  onChange,
  placeholder,
  removeLabel,
  limit,
  error,
}: Props) {
  const { colors, shadows } = useTheme()
  const [draft, setDraft] = useState('')
  const body = textStyles.body

  // La liste « validée » : sans le mot en cours de frappe, qui est envoyé en dernier (voir type()).
  const pending = draft.trim()
  const committed = pending && values.at(-1) === pending ? values.slice(0, -1) : values

  const type = (text: string) => {
    const { complete, draft: rest } = splitDraft(text)
    setDraft(rest)
    const next = [...committed, ...complete]
    onChange(rest.trim() ? [...next, rest.trim()] : next)
  }
  const commit = () => {
    setDraft('')
    onChange(pending ? [...committed, pending] : committed)
  }
  const remove = (index: number) => onChange(values.filter((_, i) => i !== index))

  return (
    <View style={{ gap: space.sm }}>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radii.group,
          borderWidth: error ? borders.strong : borders.hairline,
          borderColor: error ? colors.dangerBorder : colors.groupBorder,
          boxShadow: shadows.soft,
          overflow: 'hidden',
        }}
      >
        <View style={{ padding: space.lg, gap: space.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
            <Text variant="caption" weight={600} tone={error ? 'danger' : 'muted'}>
              {label}
            </Text>
            {limit ? (
              <Text variant="caption" tone="muted">
                {limit}
              </Text>
            ) : null}
          </View>
          {committed.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {committed.map((item, i) => (
                <View
                  // biome-ignore lint/suspicious/noArrayIndexKey: deux pastilles peuvent porter le même mot avant d'être dédoublonnées
                  key={`${item}-${i}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.xs,
                    paddingLeft: space.lg,
                    minHeight: layout.touchTarget,
                    // Jamais plus large que la ligne : un nom très long passe à la ligne, et la croix
                    // pour le retirer reste visible et touchable.
                    maxWidth: '100%',
                    borderRadius: radii.pill,
                    backgroundColor: colors.honeySoft,
                  }}
                >
                  <View style={{ flexShrink: 1, minWidth: 0 }}>
                    <Text variant="callout" weight={600} breakAnywhere>
                      {item}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={removeLabel(item)}
                    onPress={() => remove(i)}
                    // La zone à toucher fait 44 points ; le rond dessiné à l'intérieur, 28.
                    style={{
                      width: layout.touchTarget,
                      height: layout.touchTarget,
                      flexShrink: 0,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <View
                      style={{
                        width: layout.chipControl,
                        height: layout.chipControl,
                        borderRadius: radii.pill,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.surface,
                      }}
                    >
                      <Icon name="x" size={14} tone="muted" />
                    </View>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            paddingHorizontal: space.lg,
            borderTopWidth: borders.hairline,
            borderTopColor: colors.groupSeparator,
          }}
        >
          <Icon name="plus-circle" size={20} tone="amber" />
          <TextInput
            accessibilityLabel={label}
            value={draft}
            onChangeText={type}
            onSubmitEditing={commit}
            onBlur={commit}
            placeholder={placeholder}
            placeholderTextColor={colors.textPlaceholder}
            autoCapitalize="none"
            submitBehavior="submit"
            style={{
              flex: 1,
              minHeight: layout.controlHeight.regular,
              fontFamily: fontName(body.family, body.weight),
              fontSize: body.size,
              color: colors.text,
              outlineWidth: 0,
            }}
          />
        </View>
      </View>
      {error ? (
        <View
          style={{
            flexDirection: 'row',
            gap: space.xs,
            alignItems: 'center',
            paddingHorizontal: space.sm,
          }}
        >
          <Icon name="warning-circle" size={16} tone="danger" />
          <View style={{ flex: 1 }}>
            <Text variant="caption" tone="danger">
              {error}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  )
}
