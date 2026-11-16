// Le « Sommaire » d'une page légale (tranche R11, relecture du plan U2) : toucher une entrée en fait
// la partie en cours et amène le lecteur d'écran sur le titre de sa partie, pour qu'il reparte de
// là et non du sommaire. (Le saut dans la page et le suivi au défilement se mesurent dans le
// navigateur : Jest ne mesure aucune position.)
import { fireEvent, screen } from '@testing-library/react-native'
import { AccessibilityInfo } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { LegalDocument } from './LegalDocument'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const sections = [
  { id: 'purpose', title: 'À quoi sert l’appli', body: 'Des proches montrent leurs projets.' },
  { id: 'account', title: 'Ton compte', body: 'Un seul compte par personne.' },
  { id: 'changes', title: 'Les changements des règles', body: 'Une nouvelle date.' },
]

const selected = (name: string) =>
  screen.getByRole('link', { name }).props.accessibilityState?.selected === true

describe('LegalDocument, the Sommaire (R11)', () => {
  it('makes a touched entry current and moves the reader to the title of its part', async () => {
    const reader = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
    reader.mockClear()
    try {
      await renderWithProviders(
        <LegalDocument
          version="2026-11-16"
          summary={[{ icon: 'flag', text: 'Un contenu te gêne ? Signale-le.' }]}
          sections={sections}
          wide
          onLinkPress={jest.fn()}
        />,
      )
      // Témoin : la première partie est en cours à l'arrivée.
      expect(selected('À quoi sert l’appli')).toBe(true)

      await fireEvent.press(screen.getByRole('link', { name: 'Les changements des règles' }))

      expect(selected('Les changements des règles')).toBe(true)
      expect(selected('À quoi sert l’appli')).toBe(false)
      // Le lecteur d'écran est amené une fois sur un élément : le titre de la partie (sa `ref`).
      expect(reader).toHaveBeenCalledTimes(1)
      expect(reader.mock.calls[0]?.[0]).toBeTruthy()
      expect(reader.mock.calls[0]?.[1]).toBe('focus')
    } finally {
      reader.mockRestore()
    }
  })
})
