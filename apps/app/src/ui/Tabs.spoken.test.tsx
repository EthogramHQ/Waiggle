// Tests du nom lu d'un onglet (R10, la page d'une ruche) : « Projets · 5 » se voit, « Projets, 5
// projets » s'entend (`spokenLabel`). Sans lui, l'onglet garde son libellé pour nom, comme avant.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { Tabs } from './Tabs'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const render = () =>
  renderWithProviders(
    <Tabs<'activity' | 'projects'>
      label="Parties de la ruche"
      selected="activity"
      onSelect={() => {}}
      tabs={[
        { key: 'activity', label: 'Actualité', content: <Text>Ce que font les membres</Text> },
        {
          key: 'projects',
          label: 'Projets · 5',
          spokenLabel: 'Projets, 5 projets',
          content: <Text>Les projets</Text>,
        },
      ]}
    />,
  )

describe('the spoken name of a tab', () => {
  it('reads a tab by its spoken label while showing its label', async () => {
    await render()

    expect(screen.getByRole('tab', { name: 'Projets, 5 projets' })).toBeTruthy()
    expect(screen.getByText('Projets · 5')).toBeTruthy()
    expect(screen.queryByRole('tab', { name: 'Projets · 5' })).toBeNull()
  })

  it('keeps the label as the name of a tab without a spoken label', async () => {
    await render()

    expect(screen.getByRole('tab', { name: 'Actualité' })).toBeTruthy()
  })
})
