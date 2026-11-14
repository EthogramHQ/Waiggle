// La place du focus à la fermeture de la fenêtre « Retirer » (R9, relecture du design, C8) : l'écran
// la donne (`returnFocusTo`, le résultat « Contenu retiré. » qui remplace le bouton touché), et la
// feuille la passe à `Sheet`, qui y pose le focus en se fermant puis encore à la fin de son fondu
// (ui/Sheet.tsx). Ce que l'écran donne est testé dans screens/ModerationScreen.removeFocus.test.tsx.
import { screen } from '@testing-library/react-native'
import type { ComponentProps } from 'react'
import { passTapGuard } from '../testing/dialog'
import { scamCommentItem } from '../testing/moderation'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import type { Sheet } from '../ui/Sheet'
import { useDecide } from './api'
import { RemoveSheet } from './RemoveSheet'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('./api', () => ({ useDecide: jest.fn() }))

type SheetProps = ComponentProps<typeof Sheet>
// La vraie feuille, enveloppée : on garde ses dernières props (nom en `mock`, permis par jest.mock).
const mockSheet: { props: SheetProps | null } = { props: null }
jest.mock('../ui/Sheet', () => {
  const actual = jest.requireActual('../ui/Sheet')
  return {
    ...actual,
    Sheet: (props: SheetProps) => {
      mockSheet.props = props
      return actual.Sheet(props)
    },
  }
})

beforeEach(() => {
  mockSheet.props = null
  jest
    .mocked(useDecide)
    .mockReset()
    .mockReturnValue({ decide: jest.fn() } as unknown as ReturnType<typeof useDecide>)
})

describe('the place of the focus when « Retirer » closes', () => {
  it('passes the place chosen by the screen to the sheet', async () => {
    const outcome = { name: 'Contenu retiré.' }
    const returnFocusTo = () => outcome
    await renderWithProviders(
      <RemoveSheet
        item={scamCommentItem}
        open
        onClose={jest.fn()}
        onDone={jest.fn()}
        returnFocusTo={returnFocusTo}
      />,
    )
    await passTapGuard()
    // Témoin : la feuille est ouverte.
    expect(screen.getByText(fr.t(($) => $.moderation.removeSheet.message))).toBeTruthy()
    expect(mockSheet.props?.returnFocusTo?.()).toBe(outcome)
  })
})
