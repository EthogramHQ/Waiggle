// La fenêtre « Abandonner ? » lit le titre et le texte qu'on lui donne (R7a, U3b), et son titre
// reste un titre lu comme tel. Ce fichier double la première règle de `DiscardDialog.title.test.tsx`
// avec le rôle que les tests de l'appli donnent aux titres sous Jest : `header` (le nom du rôle
// natif ; RNTL ne traduit pas `heading`, que seul le web connaît).
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { DiscardDialog } from './DiscardDialog'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('DiscardDialog words', () => {
  it('reads the title it is given as the heading of the dialog', async () => {
    const title = fr.t(($) => $.project.updates.discardTitle)
    await renderWithProviders(
      <DiscardDialog
        visible
        title={title}
        message={fr.t(($) => $.project.updates.discardBody)}
        onKeep={jest.fn()}
        onDiscard={jest.fn()}
      />,
    )

    expect(screen.getByRole('header', { name: title })).toBeTruthy()
    expect(screen.queryByText(fr.t(($) => $.common.discardTitle))).toBeNull()
  })
})
