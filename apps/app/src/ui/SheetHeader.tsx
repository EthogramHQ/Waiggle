// L'en-tête d'un écran de saisie sur téléphone, comme celui d'une feuille : « Annuler » à gauche, le
// titre au centre, l'action principale à droite (« Publier », « Enregistrer »). Ainsi l'action reste
// à portée de pouce, même quand le formulaire est long.
import { space } from '@ruche/brand'
import { useState } from 'react'
import { type LayoutChangeEvent, View } from 'react-native'
import { Button } from './Button'
import { Text } from './Text'
import { TextLink } from './TextLink'

type Props = {
  title: string
  cancel: { label: string; onPress: () => void }
  action: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean }
}

// La place minimale à laisser au titre pour qu'il reste lisible (sur deux lignes au plus).
const TITLE_MIN_WIDTH = 120

export function SheetHeader({ title, cancel, action }: Props) {
  // La disposition dépend de la place : on mesure la barre et la largeur naturelle de chaque côté
  // (« Annuler », « Enregistrer »). onLayout donne la largeur réelle d'un élément une fois dessiné ;
  // useState la garde, et l'en-tête se redessine avec la bonne disposition.
  const [widths, setWidths] = useState({ bar: 0, left: 0, right: 0 })
  const measure = (key: 'bar' | 'left' | 'right') => (event: LayoutChangeEvent) => {
    const width = Math.ceil(event.nativeEvent.layout.width)
    setWidths((current) => (current[key] === width ? current : { ...current, [key]: width }))
  }
  const { bar, left, right } = widths
  const side = Math.max(left, right)
  // Trois dispositions, de la plus élégante à la plus robuste :
  // - centered : les deux côtés ont la même largeur, le titre est centré sur toute la barre ;
  // - natural : chaque côté garde sa largeur, le titre prend ce qui reste (un peu décentré) ;
  // - stacked : même ainsi le titre n'aurait pas la place (petit écran, grand texte) : les deux
  //   boutons forment une rangée, et le titre passe sur sa propre ligne en dessous.
  const layout =
    bar === 0 || bar - 2 * side - 2 * space.md >= TITLE_MIN_WIDTH
      ? 'centered'
      : bar - left - right - 2 * space.md >= TITLE_MIN_WIDTH
        ? 'natural'
        : 'stacked'

  const cancelLink = (
    <View onLayout={measure('left')} style={{ alignSelf: 'flex-start' }}>
      <TextLink label={cancel.label} onPress={cancel.onPress} role="button" />
    </View>
  )
  const actionButton = (
    <View onLayout={measure('right')} style={{ alignSelf: 'flex-start', flexShrink: 1 }}>
      <Button
        label={action.label}
        size="compact"
        onPress={action.onPress}
        loading={action.loading ?? false}
        disabled={action.disabled ?? false}
      />
    </View>
  )
  const heading = (
    // Cet en-tête remplace celui de la page sur téléphone : son titre est celui de la page (niveau 1).
    <Text variant="headline" align="center" heading={1} numberOfLines={2}>
      {title}
    </Text>
  )

  if (layout === 'stacked') {
    return (
      <View onLayout={measure('bar')} style={{ gap: space.sm }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
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
      <View style={{ ...sideStyle, alignItems: 'flex-start' }}>{cancelLink}</View>
      <View style={{ flex: 1, minWidth: 0 }}>{heading}</View>
      <View style={{ ...sideStyle, alignItems: 'flex-end' }}>{actionButton}</View>
    </View>
  )
}
