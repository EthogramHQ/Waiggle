// Tests de la phrase posée à la place des commentaires d'un projet public, pour un visiteur
// (tranche R12, `ui/MembersOnlyNotice`) : « Les commentaires sont réservés aux membres. », ni nombre
// ni extrait, et « Créer un compte », un bouton qui appelle la page (feuille « Compte requis »).
import { fireEvent, screen, within } from '@testing-library/react-native'
import { createI18n } from '../i18n'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { MembersOnlyNotice } from './MembersOnlyNotice'

const en = createI18n('en')
const onCreateAccount = jest.fn()
beforeEach(() => onCreateAccount.mockClear())

const T = {
  sentence: fr.t(($) => $.visitor.commentsMembersOnly),
  signUp: fr.t(($) => $.visitor.signUp),
}

describe('MembersOnlyNotice (R12)', () => {
  it('says the comments are for members, without a count or a field', async () => {
    await renderWithProviders(<MembersOnlyNotice onCreateAccount={onCreateAccount} />)

    expect(screen.getByText(T.sentence)).toBeTruthy()
    expect(screen.queryByText(/\d/)).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('offers « Créer un compte » next to the sentence, as a button', async () => {
    await renderWithProviders(<MembersOnlyNotice onCreateAccount={onCreateAccount} />)

    // Le bouton est dans le même cadre que la phrase (la page le cherche ainsi).
    let frame = screen.getByText(T.sentence).parent
    while (frame && within(frame).queryAllByRole('button', { name: T.signUp }).length === 0) {
      frame = frame.parent
    }
    expect(frame).not.toBeNull()
    // Un bouton, pas un lien souligné dans la phrase (une cible de 19 points sur la planche).
    expect(screen.queryByRole('link', { name: T.signUp })).toBeNull()
  })

  it('asks the page to open « Compte requis », once per tap', async () => {
    await renderWithProviders(<MembersOnlyNotice onCreateAccount={onCreateAccount} />)

    await fireEvent.press(screen.getByRole('button', { name: T.signUp }))

    expect(onCreateAccount).toHaveBeenCalledTimes(1)
  })

  it('speaks English', async () => {
    await renderWithProviders(<MembersOnlyNotice onCreateAccount={onCreateAccount} />, 'en')

    expect(screen.getByText(en.t(($) => $.visitor.commentsMembersOnly))).toBeTruthy()
    expect(screen.getByRole('button', { name: en.t(($) => $.visitor.signUp) })).toBeTruthy()
  })
})
