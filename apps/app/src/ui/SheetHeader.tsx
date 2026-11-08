// L'en-tête d'un écran de saisie sur téléphone, comme celui d'une feuille : « Annuler » à gauche, le
// titre au centre, l'action principale à droite (« Publier », « Enregistrer »). Ainsi l'action reste
// à portée de pouce, même quand le formulaire est long.
//
// Tranche R6a : c'est aussi la tête d'une feuille qui porte son action (`Sheet action`, sur
// téléphone). Elle reçoit alors le niveau et l'identifiant de son titre (qui nomme la feuille), le
// `ref` de « Annuler » (où le focus arrive à l'ouverture), et ce qui fait glisser la feuille, posé
// sur le titre seul : un glissé commencé sur « Publier » ou « Annuler » ne ferme rien (ui-M1). Sans
// « Annuler » (« Catégorie et outils » : le titre, puis « OK »), le titre se range à gauche.
import { space } from '@ruche/brand'
import { type Ref, useState } from 'react'
import { type LayoutChangeEvent, View } from 'react-native'
import { Button } from './Button'
import { Text } from './Text'
import { TextLink } from './TextLink'

/** L'action de la tête (« Publier », « Enregistrer », « OK »). */
export type SheetHeaderAction = {
  label: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  /**
   * Inactive, elle reste atteignable par Tab et dit pourquoi (« Rien à enregistrer pour
   * l'instant. ») : la prop du même nom de Button (tranche R6a), qui pose `aria-disabled`.
   */
  focusableWhenDisabled?: boolean
  /** Ce qui la décrit : l'identifiant d'un texte affiché (web) et le même texte (téléphone). */
  describedById?: string | undefined
  hint?: string | undefined
  /** Pour y poser le focus à l'ouverture d'une feuille sans « Annuler » (Sheet). */
  ref?: Ref<View>
}

type Props = {
  title: string
  /** Sans lui, pas de « Annuler » : le titre à gauche, l'action à droite. */
  cancel?: { label: string; onPress: () => void; disabled?: boolean; ref?: Ref<View> }
  action: SheetHeaderAction
  /**
   * Le niveau du titre : 1 par défaut (l'en-tête remplace celui de la page) ; 2 pour une feuille
   * ouverte par-dessus une page qui a déjà le sien.
   */
  heading?: 1 | 2
  /** L'identifiant du titre, qui nomme la feuille (`aria-labelledby`). */
  titleId?: string
  /** Pour Sheet : ce qui fait glisser la feuille vers le bas, posé autour du titre seul. */
  dragHandlers?: object
}

// La place minimale à laisser au titre pour qu'il reste lisible (sur deux lignes au plus).
const TITLE_MIN_WIDTH = 120

export function SheetHeader({
  title,
  cancel,
  action,
  heading: level = 1,
  titleId,
  dragHandlers,
}: Props) {
  // La disposition dépend de la place : on mesure la barre et la largeur naturelle de chaque côté
  // (« Annuler », « Enregistrer »). onLayout donne la largeur réelle d'un élément une fois dessiné ;
  // useState la garde, et l'en-tête se redessine avec la bonne disposition.
  const [widths, setWidths] = useState({ bar: 0, left: 0, right: 0 })
  const measure = (key: 'bar' | 'left' | 'right') => (event: LayoutChangeEvent) => {
    const width = Math.ceil(event.nativeEvent.layout.width)
    setWidths((current) => (current[key] === width ? current : { ...current, [key]: width }))
  }
  const { bar, right } = widths
  // Sans « Annuler », rien à gauche : le titre part du bord.
  const left = cancel ? widths.left : 0
  const side = Math.max(left, right)
  // Trois dispositions, de la plus élégante à la plus robuste :
  // - centered : les deux côtés ont la même largeur, le titre est centré sur toute la barre ;
  // - natural : chaque côté garde sa largeur, le titre prend ce qui reste (un peu décentré) ;
  // - stacked : même ainsi le titre n'aurait pas la place (petit écran, grand texte) : les deux
  //   boutons forment une rangée, et le titre passe sur sa propre ligne en dessous (à 320 points
  //   et 200 % de texte, ui-M1 de R6a).
  // Sans « Annuler », le titre n'est pas centré : il est à gauche, comme sur la planche.
  const layout =
    cancel && (bar === 0 || bar - 2 * side - 2 * space.md >= TITLE_MIN_WIDTH)
      ? 'centered'
      : bar === 0 || bar - left - right - 2 * space.md >= TITLE_MIN_WIDTH
        ? 'natural'
        : 'stacked'

  const cancelLink = cancel ? (
    <View onLayout={measure('left')} style={{ alignSelf: 'flex-start' }}>
      <TextLink
        label={cancel.label}
        onPress={cancel.onPress}
        role="button"
        disabled={cancel.disabled ?? false}
        {...(cancel.ref ? { ref: cancel.ref } : null)}
      />
    </View>
  ) : null
  // `focusableWhenDisabled` n'est passé que s'il est demandé : Button le reçoit (tranche R6a).
  const reachable = action.focusableWhenDisabled ? { focusableWhenDisabled: true } : null
  const actionButton = (
    <View onLayout={measure('right')} style={{ alignSelf: 'flex-start', flexShrink: 1 }}>
      <Button
        label={action.label}
        size="compact"
        onPress={action.onPress}
        loading={action.loading ?? false}
        disabled={action.disabled ?? false}
        describedById={action.describedById}
        hint={action.hint}
        {...(action.ref ? { ref: action.ref } : null)}
        {...reachable}
      />
    </View>
  )
  const heading = (
    // Le titre est aussi la prise pour glisser la feuille (avec la poignée, au-dessus).
    <View {...dragHandlers}>
      <Text
        variant="headline"
        align={cancel ? 'center' : 'left'}
        heading={level}
        // Sur sa ligne à lui (stacked), le titre prend les lignes qu'il lui faut : rien ne se coupe.
        {...(layout === 'stacked' ? null : { numberOfLines: 2 })}
        {...(titleId ? { nativeID: titleId } : null)}
      >
        {title}
      </Text>
    </View>
  )

  if (layout === 'stacked') {
    return (
      <View onLayout={measure('bar')} style={{ gap: space.sm }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: cancel ? 'space-between' : 'flex-end',
            gap: space.md,
          }}
        >
          {cancelLink}
          {actionButton}
        </View>
        {heading}
      </View>
    )
  }
  // minWidth: 0 autorise le titre à devenir plus étroit que son texte (il passe alors à la ligne).
  const sideStyle = { flexShrink: 0, minWidth: layout === 'centered' ? side : 0 }
  return (
    <View
      onLayout={measure('bar')}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}
    >
      {cancel ? <View style={{ ...sideStyle, alignItems: 'flex-start' }}>{cancelLink}</View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>{heading}</View>
      <View style={{ ...sideStyle, alignItems: 'flex-end' }}>{actionButton}</View>
    </View>
  )
}
