// Tests du champ compact qui grandit (R5b, scénario « Écrire et envoyer » : « le champ grandit avec
// son texte jusqu'à 5 lignes, puis défile ») et de son compteur sous le champ (relecture du plan
// R5b, ui-I2). Le champ du bas de la feuille des commentaires est `compact` (son libellé est lu, pas
// affiché au-dessus) ; avec `multiline` et `maxLines`, il commence haut d'une ligne, suit la hauteur
// de son texte, et s'arrête à `maxLines` lignes : au-delà, son texte défile. Avec `countFrom` et
// `limit`, le compteur « 900 / 1000 » n'apparaît qu'à partir de `countFrom` caractères.
//
// La hauteur est ici une règle de comportement (une ligne, puis N), pas une apparence : le test lit la
// hauteur que le champ se donne, et la hauteur du texte que le téléphone lui envoie
// (`onContentSizeChange`). Sur téléphone, le champ peut aussi laisser la saisie grandir d'elle-même
// entre sa hauteur minimale et sa hauteur maximale : le test accepte les deux façons.
import { textStyles } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { TextField } from './TextField'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const LABEL = 'Écrire un commentaire'
/** La hauteur d'une ligne du texte courant, celle de la saisie. */
const LINE = textStyles.body.lineHeight

/** Le champ compact, son texte gardé comme dans un écran. */
function Compact({ maxLines = 5 }: { maxLines?: number }) {
  const [value, setValue] = useState('')
  return (
    <TextField
      label={LABEL}
      value={value}
      onChangeText={setValue}
      compact
      multiline
      maxLines={maxLines}
    />
  )
}

type Box = { height?: unknown; minHeight?: unknown; maxHeight?: unknown }

/**
 * La hauteur du champ quand son texte fait `content` points de haut : la sienne s'il s'en donne
 * une (`height`), sinon celle du texte, bornée par ses hauteurs minimale et maximale.
 */
const heightFor = (content: number) => {
  const style = (StyleSheet.flatten(screen.getByLabelText(LABEL).props.style) ?? {}) as Box
  if (typeof style.height === 'number') return style.height
  const min = typeof style.minHeight === 'number' ? style.minHeight : 0
  const max = typeof style.maxHeight === 'number' ? style.maxHeight : Number.POSITIVE_INFINITY
  return Math.min(Math.max(content, min), max)
}

/** Le texte du champ fait `lines` lignes : la mesure que le téléphone envoie à la saisie. */
const contentOf = async (lines: number) => {
  await fireEvent(screen.getByLabelText(LABEL), 'contentSizeChange', {
    nativeEvent: { contentSize: { width: 300, height: lines * LINE } },
  })
  return lines * LINE
}

describe('TextField, compact and growing', () => {
  it('a compact field starts one line high and grows up to maxLines', async () => {
    await renderWithProviders(<Compact maxLines={5} />)

    // Vide : une ligne (avec ses marges, moins de deux lignes ; 44 points au moins pour le doigt).
    const empty = heightFor(await contentOf(1))
    expect(empty).toBeGreaterThanOrEqual(LINE)
    expect(empty).toBeLessThan(2 * LINE)

    // Trois lignes : le champ grandit avec son texte.
    await fireEvent.changeText(screen.getByLabelText(LABEL), 'Une\ndeux\ntrois')
    const three = heightFor(await contentOf(3))
    expect(three).toBeGreaterThanOrEqual(3 * LINE)
    expect(three).toBeLessThan(4 * LINE)

    // Dix lignes : il s'arrête à cinq, et son texte défile.
    await fireEvent.changeText(screen.getByLabelText(LABEL), 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj')
    const ten = heightFor(await contentOf(10))
    expect(ten).toBeGreaterThanOrEqual(5 * LINE)
    expect(ten).toBeLessThan(6 * LINE)
    expect(screen.getByLabelText(LABEL).props.scrollEnabled).not.toBe(false)
  })

  it('stops at the number of lines it is given', async () => {
    await renderWithProviders(<Compact maxLines={2} />)

    await fireEvent.changeText(screen.getByLabelText(LABEL), 'a\nb\nc\nd')
    const four = heightFor(await contentOf(4))

    expect(four).toBeGreaterThanOrEqual(2 * LINE)
    expect(four).toBeLessThan(3 * LINE)
  })

  it('a compact field is still named by its label', async () => {
    await renderWithProviders(<Compact />)

    // Le libellé n'est plus écrit au-dessus du champ, mais il reste son nom lu.
    expect(screen.getByLabelText(LABEL)).toBeTruthy()
    expect(heightFor(await contentOf(1))).toBeLessThan(2 * LINE) // témoin : il est bien compact
  })
})

describe('TextField, its counter', () => {
  /** Un champ limité à 1 000 caractères, dont le compteur n'apparaît qu'à partir de 900. */
  const counted = (value: string) => (
    <TextField
      label={LABEL}
      value={value}
      onChangeText={() => {}}
      multiline
      limit={1000}
      countFrom={900}
    />
  )

  it('shows no counter under countFrom characters', async () => {
    await renderWithProviders(counted('a'.repeat(899)))

    expect(screen.getByLabelText(LABEL)).toBeTruthy() // témoin : le champ est là
    expect(screen.queryByText(/\/\s*1000/)).toBeNull()
  })

  it('shows « 900 / 1000 » from countFrom characters', async () => {
    const view = await renderWithProviders(counted('a'.repeat(899)))

    await view.rerender(counted('a'.repeat(900)))

    expect(screen.getByText(/^900\s\/\s1000$/)).toBeTruthy()
  })

  it('lets the text go past the limit, and counts it', async () => {
    // `limit` n'est pas `maxLength` : on peut dépasser, et voir l'erreur (l'écran la dit).
    await renderWithProviders(counted('a'.repeat(1001)))

    expect(screen.getByLabelText(LABEL).props.maxLength).toBeUndefined()
    expect(screen.getByText(/^1001\s\/\s1000$/)).toBeTruthy()
  })
})
