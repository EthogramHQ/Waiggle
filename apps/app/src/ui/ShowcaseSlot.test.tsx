// Les places de la vitrine dans la Modération (R12, planche R12-Vitrine) : la colonne d'un projet mis
// en avant (sa carte, sa note « Modifié… », son bouton « Retirer » nommé par le projet et décrit par
// la note), et la place libre, un dessin sans geste.
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { ShowcaseCard } from './ShowcaseCard'
import { ShowcaseFreeSlot, ShowcaseSlot } from './ShowcaseSlot'

const noop = () => {}

const slot = (onPress: () => void, note?: string) => (
  <ShowcaseSlot
    card={
      <ShowcaseCard
        title="Décollage !"
        author={{ name: 'Papi Jean', avatar: null }}
        image={null}
        status={{ label: 'Testable', strong: true }}
        onPress={noop}
      />
    }
    note={note}
    remove={{
      label: 'Retirer',
      spokenLabel: 'Retirer Décollage ! de l’accueil',
      onPress,
    }}
  />
)

describe('ShowcaseSlot', () => {
  it('shows the card and a « Retirer » button named after the project', async () => {
    const onPress = jest.fn()
    await renderWithProviders(slot(onPress))

    expect(screen.getByRole('link', { name: 'Décollage !' })).toBeTruthy()
    const remove = screen.getByRole('button', { name: 'Retirer Décollage ! de l’accueil' })
    expect(screen.getByText('Retirer')).toBeTruthy()
    await fireEvent.press(remove)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('writes the note under the card, and has the button described by it (phone)', async () => {
    await renderWithProviders(slot(noop, 'Modifié depuis la mise en avant'))

    expect(screen.getByText('Modifié depuis la mise en avant')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Retirer Décollage ! de l’accueil' }).props
        .accessibilityHint,
    ).toBe('Modifié depuis la mise en avant')
  })

  it('has the button described by the note on the web (aria-describedby)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(slot(noop, 'Modifié depuis la mise en avant'))

      const button = screen.getByRole('button', { name: 'Retirer Décollage ! de l’accueil' })
      const note = screen.getByText('Modifié depuis la mise en avant')
      expect(button.props['aria-describedby']).toBe(note.props.nativeID)
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('describes nothing without a note (témoin)', async () => {
    await renderWithProviders(slot(noop))

    expect(
      screen.getByRole('button', { name: 'Retirer Décollage ! de l’accueil' }).props
        .accessibilityHint,
    ).toBeUndefined()
  })
})

describe('ShowcaseFreeSlot', () => {
  it('says « Une place libre », with nothing to press', async () => {
    await renderWithProviders(<ShowcaseFreeSlot label="Une place libre" />)

    expect(screen.getByText('Une place libre')).toBeTruthy()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})
