// Un champ de saisie avec son étiquette, une aide facultative, un compteur et un message d'erreur.
// Présentation « réglages » : un groupe blanc arrondi, l'étiquette en petit au-dessus de la valeur.
// Plusieurs champs placés dans un <FieldGroup> partagent le même groupe, séparés par un trait.
//
// L'étiquette est aussi donnée aux lecteurs d'écran (accessibilityLabel) : c'est ce qui permet à une
// personne aveugle de savoir quoi taper, et aux tests de retrouver le champ par son nom.
import { borders, layout, radii, space, textStyles } from '@ruche/brand'
import { Children, createContext, Fragment, type ReactNode, useContext, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, TextInput, type TextInputProps, View } from 'react-native'
import { Icon } from './Icon'
import { Text } from './Text'
import { fontName } from './theme/fonts'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  label: string
  value: string
  onChangeText: (text: string) => void
  hint?: string | undefined
  error?: string | undefined
  /** Affiche « 42 / 140 » à côté de l'étiquette (la limite : maxLength, ou `limit`). */
  showCount?: boolean
  /** Une limite seulement affichée : on peut la dépasser, l'erreur vient à l'enregistrement. */
  limit?: number
  /** Un petit texte à droite de l'étiquette (« 12 caractères minimum »). */
  aside?: string
  /** Une confirmation sous le champ, en vert (« Lien vérifié »). Une erreur passe avant. */
  success?: string | undefined
} & Pick<
  TextInputProps,
  | 'secureTextEntry'
  | 'autoComplete'
  | 'keyboardType'
  | 'textContentType'
  | 'multiline'
  | 'maxLength'
  | 'autoCapitalize'
  | 'placeholder'
>

// Vrai quand le champ est dans un FieldGroup : il ne dessine alors pas son propre groupe.
const InGroup = createContext(false)

/** Le cadre blanc d'un groupe de champs. */
function GroupFrame({
  children,
  state,
}: {
  children: ReactNode
  state: 'idle' | 'focus' | 'error'
}) {
  const { colors, shadows } = useTheme()
  const border = { idle: colors.groupBorder, focus: colors.focusRing, error: colors.dangerBorder }
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radii.group,
        borderWidth: state === 'idle' ? borders.hairline : borders.strong,
        borderColor: border[state],
        boxShadow: shadows.soft,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  )
}

/** Regroupe plusieurs champs dans un même cadre, séparés par un trait fin. */
export function FieldGroup({ children }: { children: ReactNode }) {
  const { colors } = useTheme()
  // Children.toArray : la liste des enfants, sans les vides (un champ affiché sous condition).
  const fields = Children.toArray(children)
  return (
    <InGroup.Provider value>
      <GroupFrame state="idle">
        {fields.map((field, i) => (
          <Fragment key={(field as { key?: string }).key ?? i}>
            {i > 0 ? (
              <View
                style={{
                  height: borders.hairline,
                  backgroundColor: colors.groupSeparator,
                  marginLeft: space.lg,
                }}
              />
            ) : null}
            {field}
          </Fragment>
        ))}
      </GroupFrame>
    </InGroup.Provider>
  )
}

export function TextField({
  label,
  value,
  onChangeText,
  hint,
  error,
  showCount = false,
  limit,
  aside,
  success,
  secureTextEntry = false,
  ...inputProps
}: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const inGroup = useContext(InGroup)
  const [focused, setFocused] = useState(false)
  // Un mot de passe est masqué, mais on peut l'afficher le temps de vérifier ce qu'on a tapé.
  const [revealed, setRevealed] = useState(false)
  const body = textStyles.body
  const max = limit ?? inputProps.maxLength
  const counter = showCount && max ? `${Array.from(value).length} / ${max}` : aside

  const row = (
    <View
      style={{
        paddingHorizontal: space.lg,
        paddingTop: space.md,
        paddingBottom: space.sm,
        gap: space.xxs,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
        <Text variant="caption" weight={600} tone={error ? 'danger' : focused ? 'accent' : 'muted'}>
          {label}
        </Text>
        {counter ? (
          <Text variant="caption" tone="muted" tabular>
            {counter}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoCapitalize="none"
          placeholderTextColor={colors.textPlaceholder}
          // Le champ utilise la police et la taille du texte courant.
          secureTextEntry={secureTextEntry && !revealed}
          style={{
            flex: 1,
            fontFamily: fontName(body.family, body.weight),
            fontSize: body.size,
            lineHeight: body.lineHeight,
            color: colors.text,
            minHeight: layout.touchTarget,
            paddingVertical: space.xs,
            // Sur le web, le navigateur dessine son propre contour : le groupe s'en charge déjà.
            outlineWidth: 0,
            ...(inputProps.multiline ? { minHeight: 96, textAlignVertical: 'top' } : null),
          }}
          {...inputProps} // les autres réglages (type de clavier, saisie automatique…) sont transmis tels quels
          // Un mot de passe, même affiché, ne passe jamais par le correcteur orthographique ni par le
          // dictionnaire du clavier : certains correcteurs envoient le texte à un service en ligne,
          // et un clavier pourrait le proposer plus tard en suggestion. Placé après inputProps pour
          // qu'aucun écran ne puisse le réactiver.
          {...(secureTextEntry
            ? {
                autoCorrect: false,
                spellCheck: false,
                ...(revealed && Platform.OS === 'android'
                  ? { keyboardType: 'visible-password' as const }
                  : null),
              }
            : null)}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? t('common.hidePassword') : t('common.showPassword')}
            onPress={() => setRevealed((previous) => !previous)}
            hitSlop={8}
            style={{
              width: layout.touchTarget,
              height: layout.touchTarget,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={revealed ? 'eye-slash' : 'eye'} size={22} tone="muted" />
          </Pressable>
        ) : null}
      </View>
      {/* Dans un groupe, le message reste dans la ligne du champ concerné. */}
      {inGroup ? <Message error={error} hint={hint} success={success} /> : null}
    </View>
  )

  if (inGroup) return row
  return (
    <View style={{ gap: space.sm }}>
      <GroupFrame state={error ? 'error' : focused ? 'focus' : 'idle'}>{row}</GroupFrame>
      <Message error={error} hint={hint} success={success} outside />
    </View>
  )
}

/** L'erreur si elle existe, sinon la confirmation, sinon l'aide, sinon rien. */
function Message({
  error,
  hint,
  success,
  outside = false,
}: {
  error?: string | undefined
  hint?: string | undefined
  success?: string | undefined
  outside?: boolean
}) {
  const padding = outside ? { paddingHorizontal: space.sm } : { paddingBottom: space.xs }
  if (error) {
    return (
      <View style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center', ...padding }}>
        <Icon name="warning-circle" size={16} tone="danger" />
        <View style={{ flex: 1 }}>
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        </View>
      </View>
    )
  }
  if (success) {
    return (
      <View style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center', ...padding }}>
        <Icon name="check-circle" size={16} tone="success" />
        <View style={{ flex: 1 }}>
          <Text variant="caption" weight={600} tone="success">
            {success}
          </Text>
        </View>
      </View>
    )
  }
  if (!hint) return null
  return (
    <View style={padding}>
      <Text variant="caption" tone="muted">
        {hint}
      </Text>
    </View>
  )
}
