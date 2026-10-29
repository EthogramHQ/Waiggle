// Une liste de réglages : un groupe blanc arrondi, des lignes séparées par un trait fin.
// Une ligne peut mener ailleurs (chevron), lancer une action (icône à droite), être un choix
// (coche) ou simplement afficher une information. Les réglages du compte en sont faits.
// En mode `radio` (une liste de choix : la langue, l'apparence, le motif d'un signalement), le
// groupe se parcourt au clavier comme tout groupe de boutons radio (et comme Segmented, Choices) :
// Tab ne s'y arrête qu'une fois, sur le choix coché (le premier tant qu'aucun ne l'est), les
// flèches cochent le choix voisin en faisant le tour, Espace et Entrée cochent le choix qui a le
// focus. Avant (point de liste de R1), la page « Signaler » demandait sept Tab pour traverser
// ses motifs.
import { borders, layout, radii, space } from '@ruche/brand'
import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  type ReactNode,
  useContext,
  useRef,
} from 'react'
import { ActivityIndicator, Platform, Pressable, View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { RadioMark } from './Radio'
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

/**
 * Ce qu'un groupe de choix donne à chacune de ses lignes : sa place dans le parcours au clavier.
 * Un « contexte » React : une valeur posée par un composant parent, que ses descendants lisent
 * (useContext) sans qu'on la passe de main en main. Une ligne hors d'un groupe radio n'en a pas.
 */
type RadioSlot = {
  /** 0 pour le seul choix que Tab atteint, -1 pour les autres (« tabIndex itinérant »). */
  tabIndex: 0 | -1
  /** Une flèche : cocher le choix voisin (1 : le suivant, -1 : le précédent) et lui donner le focus. */
  onArrow: (step: 1 | -1) => void
  /** Pour que le groupe retrouve l'élément de la ligne, et y pose le focus. */
  setNode: (node: View | null) => void
}

const RadioSlotContext = createContext<RadioSlot | null>(null)

type KeyEvent = { key: string; repeat?: boolean; preventDefault: () => void }
/** Le peu d'un événement de clic dont une ligne-lien a besoin (voir `onPress`). */
export type PressEvent = { preventDefault?: () => void }

export function ListGroup({ title, footer, children, radio = false }: GroupProps) {
  const { colors, shadows } = useTheme()
  const rows = Children.toArray(children)
  // Les éléments des choix, par rang de ligne, pour y poser le focus quand une flèche passe au
  // voisin.
  const nodes = useRef<(View | null)[]>([])
  // Les choix du groupe : les lignes qui ont un état (`selected`) et une action. Le groupe lit
  // leurs propriétés pour savoir laquelle est cochée, et appeler l'action d'une voisine.
  const choices = radio
    ? rows.map((row) =>
        isValidElement<RowBase>(row) && row.props.selected !== undefined && row.props.onPress
          ? row.props
          : null,
      )
    : []
  const checked = choices.findIndex((choice) => choice?.selected === true)
  const tabStop = checked === -1 ? choices.findIndex((choice) => choice !== null) : checked
  // Une flèche depuis la ligne `from` : le prochain choix actif dans ce sens, en faisant le tour
  // (après le dernier, le premier). Un choix inactif est sauté.
  const move = (from: number, step: 1 | -1) => {
    const count = choices.length
    for (let k = 1; k <= count; k++) {
      const index = (((from + step * k) % count) + count) % count
      const choice = choices[index]
      if (choice?.onPress && !choice.disabled) {
        choice.onPress()
        nodes.current[index]?.focus()
        return
      }
    }
  }
  const slot = (index: number): RadioSlot => ({
    tabIndex: index === tabStop ? 0 : -1,
    onArrow: (step) => move(index, step),
    setNode: (node) => {
      nodes.current[index] = node
    },
  })
  const notes = footer === undefined ? [] : typeof footer === 'string' ? [footer] : footer
  return (
    <View style={{ gap: space.sm }}>
      {title ? (
        <View style={{ paddingHorizontal: space.lg }}>
          {/* Un groupe est une section de la page : titre de niveau 2. */}
          <Text variant="caption" weight={600} tone="muted" heading={2}>
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
            {choices[i] ? (
              <RadioSlotContext.Provider value={slot(i)}>{row}</RadioSlotContext.Provider>
            ) : (
              row
            )}
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

// Les propriétés d'une ligne : une base commune, et `detailAlert` réservé aux lignes qui s'y
// prêtent (le type « ou bien… ou bien… » ci-dessous refuse les autres dès la compilation).
type RowProps = RowBase &
  (
    | { detailAlert?: undefined }
    | {
        /**
         * La précision dit pourquoi quelque chose a échoué : c'est une alerte, lue dès qu'elle
         * paraît. La valeur (un compteur d'échecs) pose l'alerte à neuf quand elle change : un
         * nouvel échec est relu, alors qu'une alerte restée en place ne le serait pas. Le reste de
         * la ligne (un bouton « Réessayer » qui a le focus) ne bouge pas.
         * Seulement sur une ligne sans `onPress` : le nom d'une ligne qu'on touche cache son
         * contenu, l'alerte comprise (elle ne serait pas lue). Et pas avec `detailRight` : seule
         * la précision placée sous le libellé devient une alerte.
         */
        detailAlert: number
        onPress?: undefined
        detailRight?: false
      }
  )

type RowBase = {
  label: string
  /** Une icône dans une pastille, à gauche du libellé. */
  icon?: IconName
  /** Une précision sous le libellé (l'adresse e-mail…), ou à droite avec `detailRight`. */
  detail?: string
  detailRight?: boolean
  /** Ce qu'il y a à droite : un chevron (mène ailleurs), une icône (action), une coche (choix). */
  trailing?: 'chevron' | 'check' | IconName | ReactNode
  tone?: 'default' | 'danger'
  /**
   * Le geste. Une ligne-lien (`href`) reçoit l'événement du clic : l'écran qui navigue par son
   * routeur empêche le navigateur de recharger la page (`preventDefault`).
   */
  onPress?: (event?: PressEvent) => void
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
  /**
   * L'adresse de la page où mène la ligne (les rubriques des réglages, R2) : la ligne devient un
   * lien, et sur le web un vrai `<a>` (ouvrir dans un nouvel onglet, Entrée). Le geste ordinaire
   * reste `onPress`, que l'écran branche sur son routeur.
   */
  href?: string
  /** Avec `href` : la ligne mène à la page ouverte (`aria-current="page"`). */
  current?: boolean
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
  href,
  current = false,
}: RowProps) {
  const { colors } = useTheme()
  // Sa place dans un groupe de choix (ListGroup radio), s'il y en a un.
  const slot = useContext(RadioSlotContext)
  const isChoice = selected !== undefined
  const right =
    trailing === 'chevron' ? (
      <Icon name="caret-right" size={18} tone="muted" />
    ) : trailing === 'check' || isChoice ? (
      <RadioMark selected={selected === true} />
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
        // Inactive, la ligne pâlit, comme un bouton, une case ou un rond inactifs : on voit
        // qu'elle ne répondra pas avant de la toucher.
        opacity: disabled ? 0.55 : 1,
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

  // Un choix (bouton radio) au clavier, sur le web : react-native-web ne fait réagir aux touches
  // que les boutons (keyboard.ts). Sans cela, la page « Signaler » (tranche 7a) ne pouvait pas
  // s'envoyer au clavier : aucun motif ne se cochait. Espace et Entrée cochent ; dans un groupe
  // radio, les flèches passent au voisin et seul un choix est dans le parcours de Tab.
  const choiceKeys = (press: () => void) =>
    Platform.OS === 'web'
      ? {
          ...(slot ? { tabIndex: slot.tabIndex } : null),
          onKeyDown: (event: KeyEvent) => {
            if (event.key === ' ' || event.key === 'Enter') {
              // preventDefault : l'espace ne fait pas défiler la page. Une touche gardée enfoncée
              // (repeat) ne coche pas dix fois.
              event.preventDefault()
              if (!event.repeat && !disabled) press()
              return
            }
            const step =
              event.key === 'ArrowDown' || event.key === 'ArrowRight'
                ? 1
                : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
                  ? -1
                  : 0
            if (step === 0 || !slot) return
            // preventDefault : la flèche ne fait pas défiler la page.
            event.preventDefault()
            slot.onArrow(step)
          },
        }
      : null

  return (
    <Pressable
      accessibilityRole={isChoice ? 'radio' : href ? 'link' : 'button'}
      accessibilityLabel={spokenLabel ?? label}
      aria-disabled={disabled}
      // Un lien avec adresse (web) : `href` et `aria-current` manquent aux types de React Native.
      {...(href && Platform.OS === 'web'
        ? { href, ...(current ? { 'aria-current': 'page' } : null) }
        : null)}
      {...(isChoice ? { 'aria-checked': selected === true } : null)}
      // Le groupe retrouve l'élément d'un choix pour y poser le focus (flèches).
      ref={isChoice ? slot?.setNode : undefined}
      {...(isChoice ? choiceKeys(onPress) : null)}
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
