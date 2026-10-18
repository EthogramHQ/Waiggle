// Une liste de réglages : un groupe blanc arrondi, des lignes séparées par un trait fin.
// Une ligne peut mener ailleurs (chevron), lancer une action (icône à droite), être un choix
// (coche) ou simplement afficher une information. Les réglages du compte en sont faits.
import { borders, layout, radii, space } from '@ruche/brand'
import { Children, Fragment, type ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'
import { insetFocus } from './theme/document'
import { useTheme } from './theme/ThemeProvider'

type GroupProps = {
  /** Un petit titre au-dessus du groupe (« Langue », « Mes données »). */
  title?: string
  /** Une explication sous le groupe. */
  footer?: string
  children: ReactNode
  /** Annoncé comme un groupe de boutons radio (une liste de choix). */
  radio?: boolean
}

export function ListGroup({ title, footer, children, radio = false }: GroupProps) {
  const { colors, shadows } = useTheme()
  const rows = Children.toArray(children)
  return (
    <View style={{ gap: space.sm }}>
      {title ? (
        <View style={{ paddingHorizontal: space.lg }}>
          <Text variant="caption" weight={600} tone="muted" accessibilityRole="header">
            {title}
          </Text>
        </View>
      ) : null}
      <View
        {...(radio ? { accessibilityRole: 'radiogroup' as const } : null)}
        {...(radio && title ? { accessibilityLabel: title } : null)}
        style={{
          backgroundColor: colors.surface,
          borderRadius: radii.group,
          borderWidth: borders.hairline,
          borderColor: colors.groupBorder,
          boxShadow: shadows.soft,
          overflow: 'hidden',
        }}
      >
        {rows.map((row, i) => (
          <Fragment key={(row as { key?: string }).key ?? i}>
            {i > 0 ? (
              <View
                style={{
                  height: borders.hairline,
                  backgroundColor: colors.groupSeparator,
                  marginLeft: space.lg,
                }}
              />
            ) : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <View style={{ paddingHorizontal: space.lg }}>
          <Text variant="caption" tone="muted">
            {footer}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

type RowProps = {
  label: string
  /** Une icône dans une pastille, à gauche du libellé. */
  icon?: IconName
  /** Une précision sous le libellé (l'adresse e-mail…), ou à droite avec `detailRight`. */
  detail?: string
  detailRight?: boolean
  /** Ce qu'il y a à droite : un chevron (mène ailleurs), une icône (action), une coche (choix). */
  trailing?: 'chevron' | 'check' | IconName | ReactNode
  tone?: 'default' | 'danger'
  onPress?: () => void
  /** Pour un choix : coché ou non (la ligne devient un bouton radio). */
  selected?: boolean
  /** Le contenu de droite qui n'est pas une icône (un contrôle segmenté, par exemple). */
  accessory?: ReactNode
  /** Inactive (par exemple pendant que son action est en cours). */
  disabled?: boolean
}

export function ListRow({
  label,
  icon,
  detail,
  detailRight = false,
  trailing,
  tone = 'default',
  onPress,
  selected,
  accessory,
  disabled = false,
}: RowProps) {
  const { colors } = useTheme()
  const isChoice = selected !== undefined
  const right =
    trailing === 'chevron' ? (
      <Icon name="caret-right" size={18} tone="muted" />
    ) : trailing === 'check' || isChoice ? (
      <Check selected={selected === true} />
    ) : typeof trailing === 'string' ? (
      <Icon name={trailing as IconName} size={20} tone={tone === 'danger' ? 'danger' : 'muted'} />
    ) : (
      (trailing ?? null)
    )

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: layout.controlHeight.regular,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
      }}
    >
      {icon ? (
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceGrouped,
          }}
        >
          <Icon name={icon} size={20} tone="secondary" />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: space.xxs }}>
        <Text weight={600} tone={tone === 'danger' ? 'danger' : 'default'}>
          {label}
        </Text>
        {detail && !detailRight ? (
          <Text variant="callout" tone="muted">
            {detail}
          </Text>
        ) : null}
      </View>
      {detail && detailRight ? (
        <Text variant="callout" tone="muted">
          {detail}
        </Text>
      ) : null}
      {accessory}
      {right}
    </View>
  )

  if (!onPress) return content
  return (
    <Pressable
      accessibilityRole={isChoice ? 'radio' : 'button'}
      accessibilityLabel={label}
      aria-disabled={disabled}
      {...(isChoice ? { 'aria-checked': selected === true } : null)}
      disabled={disabled}
      onPress={onPress}
      // Le groupe rogne ce qui dépasse : l'anneau de focus se dessine à l'intérieur de la ligne.
      {...insetFocus}
      style={({ pressed }) => (pressed ? { backgroundColor: colors.surfaceGrouped } : null)}
    >
      {content}
    </Pressable>
  )
}

/** La coche ronde d'un choix : pleine de miel quand il est choisi, vide sinon. */
function Check({ selected }: { selected: boolean }) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        width: 26,
        height: 26,
        borderRadius: radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: selected ? colors.honey : 'transparent',
        borderWidth: selected ? 0 : borders.strong,
        borderColor: colors.lineStrong,
      }}
    >
      {selected ? <Icon name="check" size={16} tone="onHoney" /> : null}
    </View>
  )
}
