// Tests de la case à cocher avec un détail et une erreur à la fois (R7b) : l'erreur se lit avant le
// détail, sur le web (ordre des identifiants d'`aria-describedby`) comme sur téléphone (l'indice).
// Fichier à part de Checkbox.test.tsx : la règle a été décidée à l'assemblage, après ses tests.
import { screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Checkbox } from './Checkbox'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const label = 'Sam · Oui'
const detail = '« Tout marche », 2 nov.'
const error = 'Choisis au moins un retour.'

const Both = () => (
  <Checkbox label={label} detail={detail} error={error} value={false} onValueChange={() => {}} />
)

describe('Checkbox with a detail and an error', () => {
  it('reads the error before the detail on a phone', async () => {
    await renderWithProviders(<Both />)

    const box = screen.getByRole('checkbox', { name: label })
    expect(box.props.accessibilityHint).toBe(`${error} ${detail}`)
  })

  it('points to the error, then to the detail, on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<Both />)

      const box = screen.getByRole('checkbox', { name: label })
      const ids = String(box.props['aria-describedby'] ?? '').split(' ')
      const idOf = (text: string) => {
        const node = screen.getByText(text)
        return node.props.nativeID ?? node.props.id
      }
      expect(ids).toEqual([idOf(error), idOf(detail)])
    } finally {
      jest.restoreAllMocks()
    }
  })
})
