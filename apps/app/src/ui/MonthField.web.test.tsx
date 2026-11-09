// Test du champ « Commencé en » sur le web, à texte agrandi (R6a) : à 320 px et 200 %, trois mois
// par rangée ne tenaient plus, et les noms se chevauchaient (« octobrnovembdécembre » dans l'essai
// du navigateur), react-native-web posant `min-width: 0` sur chaque vue. Un mois n'est donc jamais
// plus étroit que son nom : la rangée passe à deux mois, ou à un. Jest ne mesure aucune largeur ; on
// vérifie la règle (« la largeur du mot », `minWidth: 'auto'`), la mesure est dans l'essai.
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { MonthField } from './MonthField'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const monthNames = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

/** Le style dessiné d'un mois (un `Pressable` donne une fonction de son état ; on prend le repos). */
const restingStyle = (props: Record<string, unknown>) => {
  const style = props.style as unknown
  return StyleSheet.flatten(
    (typeof style === 'function' ? style({ pressed: false }) : style) as never,
  ) as Record<string, unknown>
}

describe('MonthField on the web', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('never draws a month narrower than its name, so the rows wrap at large text', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(
      <MonthField
        label="Commencé en"
        value="2025-09"
        onChange={() => {}}
        min="2000-01"
        max="2026-11"
        monthNames={monthNames}
        clearLabel="Effacer"
      />,
    )

    const september = screen.getByRole('radio', { name: 'septembre', checked: true })
    expect(restingStyle(september.props).minWidth).toBe('auto')
    // Témoin : un mois touché reste un mois de la grille (la règle vaut pour tous).
    await fireEvent.press(screen.getByRole('radio', { name: 'mars' }))
    expect(restingStyle(screen.getByRole('radio', { name: 'mars' }).props).minWidth).toBe('auto')
  })
})
