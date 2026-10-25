// Tests de l'aide gardée sous l'erreur d'un champ (`keepHint`, tranche 7b) : sur la page
// « Signaler », la phrase de bonne foi reste à lire quand « Dis-nous pourquoi » manque. À part de
// components.test.tsx, que l'autre agent de la tranche peut modifier en même temps.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { TextField } from './TextField'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const hint = 'N’ajoute pas d’informations personnelles inutiles.'
const error = 'Dis-nous pourquoi ce contenu te semble illégal.'

describe('TextField, its hint and its error', () => {
  it('gives the place of its hint to the error, by default', async () => {
    await renderWithProviders(
      <TextField label="Précision" value="" onChangeText={() => {}} hint={hint} error={error} />,
    )

    expect(screen.getByText(error)).toBeTruthy()
    expect(screen.queryByText(hint)).toBeNull()
  })

  it('keeps its hint under the error when asked, and reads both', async () => {
    await renderWithProviders(
      <TextField
        label="Précision"
        value=""
        onChangeText={() => {}}
        hint={hint}
        error={error}
        keepHint
      />,
    )

    expect(screen.getByText(error)).toBeTruthy()
    expect(screen.getByText(hint)).toBeTruthy()
    // Sur téléphone, l'indice lu après le nom du champ dit les deux, l'erreur d'abord.
    expect(screen.getByLabelText('Précision').props.accessibilityHint).toBe(`${error} ${hint}`)
  })

  it('keeps its hint under a confirmation too, and reads both', async () => {
    // Relecture de l'interface 7b : l'aide restait affichée sous la confirmation, sans être lue.
    const success = 'Lien vérifié'
    await renderWithProviders(
      <TextField
        label="Précision"
        value=""
        onChangeText={() => {}}
        hint={hint}
        success={success}
        keepHint
      />,
    )

    expect(screen.getByText(success)).toBeTruthy()
    expect(screen.getByText(hint)).toBeTruthy()
    expect(screen.getByLabelText('Précision').props.accessibilityHint).toBe(`${success} ${hint}`)
  })

  it('shows its hint alone when there is no error', async () => {
    await renderWithProviders(
      <TextField label="Précision" value="" onChangeText={() => {}} hint={hint} keepHint />,
    )

    expect(screen.getByText(hint)).toBeTruthy()
  })
})
