// Tests de la pastille « Exemple » sur la carte de la vitrine (tranche R12b, « Les exemples ») :
// la carte d'un projet d'un compte d'exemples porte « Exemple » à côté de son statut, et, sur le
// web, le lien de la carte (seul élément lu) est décrit par elle, entre le statut et l'auteur. Une
// carte ordinaire n'a rien de plus.
import { screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ShowcaseCard } from './ShowcaseCard'

const card = (example?: boolean) => (
  <ShowcaseCard
    title="Le carnet des plantes"
    author={{ name: 'WaiggleBot', avatar: null }}
    image={null}
    status={{ label: 'Testable', strong: true }}
    onPress={jest.fn()}
    {...(example === undefined ? null : { example })}
  />
)

const EXAMPLE = fr.t(($) => $.common.example)

describe('ShowcaseCard with a project of the examples account (R12b)', () => {
  it('shows « Exemple » beside the status', async () => {
    await renderWithProviders(card(true))

    expect(screen.getByText('Testable')).toBeTruthy()
    expect(screen.getAllByText(EXAMPLE)).toHaveLength(1)
  })

  it('shows nothing more for an ordinary member', async () => {
    await renderWithProviders(card())

    // Témoin : la carte est là.
    expect(screen.getByText('Testable')).toBeTruthy()
    expect(screen.queryAllByText(EXAMPLE)).toHaveLength(0)
    expect(
      screen.getByRole('link', { name: 'Le carnet des plantes' }).props.accessibilityHint,
    ).toBeUndefined()
  })

  it('has « Exemple » read on a phone, as the hint of the link', async () => {
    await renderWithProviders(card(true))

    expect(
      screen.getByRole('link', { name: 'Le carnet des plantes' }).props.accessibilityHint,
    ).toBe(EXAMPLE)
  })

  it('is described on the web by its status, « Exemple », then its author', async () => {
    const restore = jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(card(true))

      const link = screen.getByRole('link', { name: 'Le carnet des plantes' })
      const ids = String((link.props as Record<string, unknown>)['aria-describedby'] ?? '').split(
        ' ',
      )
      const idOf = (text: string) => screen.getByText(text).props.nativeID as unknown
      expect(ids).toEqual([idOf('Testable'), idOf(EXAMPLE), idOf('WaiggleBot')])
    } finally {
      restore.restore()
    }
  })
})
