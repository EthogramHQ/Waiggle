// Une liste de réglages : un groupe blanc arrondi, des lignes séparées par un trait fin.
// Une ligne peut mener ailleurs (chevron), lancer une action (icône à droite), être un choix
// (coche) ou simplement afficher une information. Les réglages du compte en sont faits.
import { borders, layout, radii, space } from '@ruche/brand'
import { Children, Fragment, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { spaceToggles } from './keyboard'
import { Text } from './Text'
import { insetFocus } from './theme/document'
import { useTheme } from './theme/ThemeProvider'

type GroupProps = {
  /** Un petit titre au-dessus du groupe (« Langue », « Mes données »). */
  title?: string
  /**
   * Une explication sous le groupe ; plusieurs phrases, chacune son paragraphe (« Chaque réglage
   * s'enregistre dès que tu le touches. », puis la phrase sur les e-mails du compte).
   */
  footer?: string | readonly string[]
  children: ReactNode
  /** Annoncé comme un groupe de boutons radio (une liste de choix). */
  radio?: boolean
}

export function ListGroup({ title, footer, children, radio = false }: GroupProps) {
  const { colors, shadows } = useTheme()
  const rows = Children.toArray(children)
  const notes = footer === undefined ? [] : typeof footer === 'string' ? [footer] : footer
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
      {notes.length > 0 ? (
        <View style={{ paddingHorizontal: space.lg, gap: space.xs }}>
          {notes.map((note, index) => (
            // Deux phrases du pied peuvent être identiques : leur rang les distingue, et la liste
            // ne change pas d'ordre.
            // biome-ignore lint/suspicious/noArrayIndexKey: une phrase du pied n'a pas d'autre identité que sa place
            <Text key={index} variant="caption" tone="muted">
              {note}
            </Text>
          ))}
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
  /**
   * La précision dit pourquoi quelque chose a échoué : c'est une alerte, lue dès qu'elle paraît.
   * La valeur (un compteur d'échecs) pose l'alerte à neuf quand elle change : un nouvel échec est
   * relu, alors qu'une alerte restée en place ne le serait pas. Le reste de la ligne (un bouton
   * « Réessayer » qui a le focus) ne bouge pas.
   */
  detailAlert?: number
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
  /**
   * Une ligne qui attend (« Chargement… ») : une roue à droite, et les lecteurs d'écran
   * l'annoncent comme une attente en cours (rôle progressbar, aria-busy), avec son libellé.
   */
  busy?: boolean
  /**
   * Le nom lu d'une ligne qu'on touche, s'il doit dire plus que son libellé (« Nous écrire,
   * contact@… ») : le nom d'un bouton cache le texte qu'il contient, la précision comprise.
   */
  spokenLabel?: string
}

export function ListRow({
  label,
  icon,
  detail,
  detailRight = false,
  detailAlert,
  trailing,
  tone = 'default',
  onPress,
  selected,
  accessory,
  disabled = false,
  busy = false,
  spokenLabel,
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
      // Une attente : la ligne entière est lue d'un tenant, comme une barre de progression sans
      // fin connue, « occupée ». Un rôle est nécessaire : sur le web, le navigateur ignore le nom
      // d'un bloc qui n'en a pas.
      {...(busy && !onPress
        ? {
            accessible: true,
            accessibilityRole: 'progressbar' as const,
            accessibilityLabel: label,
            'aria-busy': true,
          }
        : null)}
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
        {detail && !detailRight && detailAlert !== undefined ? (
          // Une clé neuve à chaque échec : React remplace l'alerte au lieu de changer son texte.
          <View key={`alert-${detailAlert}`} accessible accessibilityRole="alert">
            <Text variant="callout" tone="muted">
              {detail}
            </Text>
          </View>
        ) : detail && !detailRight ? (
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
      {busy ? <ActivityIndicator color={colors.textMuted} aria-hidden /> : null}
      {right}
    </View>
  )

  if (!onPress) return content
  return (
    <Pressable
      accessibilityRole={isChoice ? 'radio' : 'button'}
      accessibilityLabel={spokenLabel ?? label}
      aria-disabled={disabled}
      {...(isChoice ? { 'aria-checked': selected === true } : null)}
      // Un choix (bouton radio) se coche avec la barre d'espace, sur le web : react-native-web ne
      // le fait que pour les boutons (keyboard.ts). Sans cela, la page « Signaler » (tranche 7a)
      // ne pouvait pas s'envoyer au clavier : aucun motif ne se cochait.
      {...(isChoice ? spaceToggles(onPress, disabled) : null)}
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
