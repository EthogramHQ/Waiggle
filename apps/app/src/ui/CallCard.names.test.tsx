// Les noms lus de la carte d'un appel, au-delà des tests du plan (R7b) : une photo sans
// description garde un nom (« Photo jointe à l'appel »), et le nom du menu reprend le début d'un
// appel écrit sur plusieurs lignes, sur une seule ligne et coupé.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { CallCard } from './CallCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const AT = '2026-11-03T09:15:00.000Z'
const PHOTO = { uri: 'https://api.example/v1/projects/p1/testers/media/call-2' }

describe('CallCard names', () => {
  it('names an undescribed photo « Photo jointe à l’appel »', async () => {
    await renderWithProviders(
      <CallCard text="Testez la musique" at={AT} photo={{ source: PHOTO, description: '  ' }} />,
    )

    expect(
      screen.getByRole('image', { name: fr.t(($) => $.project.testers.calls.photoName) }),
    ).toBeTruthy()
  })

  it('names its menu by the start of a call written on several lines, on one line', async () => {
    const text = `Grosse mise à jour ce soir.\n\nEssayez les trois nouveaux niveaux dans l’ordre, et dites-moi tout.`
    await renderWithProviders(
      <CallCard text={text} at={AT} menu={[{ label: 'Signaler', onPress: () => {} }]} />,
    )

    const [button] = screen.getAllByRole('button')
    const name = String(button?.props.accessibilityLabel ?? '')
    expect(name).toContain('Grosse mise à jour ce soir. Essayez')
    expect(name).not.toMatch(/\n/)
    // Coupé : la fin de l'appel n'est pas dans le nom.
    expect(name).not.toContain('dites-moi tout')
    expect(name).toContain('…')
  })
})
