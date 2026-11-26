// Tests de la rangée d'un retour d'Éclaireuse dans la page de tri (R20, planches R20-Tri et
// R20-Tri-Telephone) : un bouton dont le nom lu reprend ce qui est écrit, dans l'ordre ; le retour
// ouvert est « actuel » ; Entrée l'ouvre au clavier ; sur le fond crème du retour ouvert, la date et
// la mission passent au gris soutenu (le gris discret y tombe sous 4,5:1 la nuit) ; la gravité et
// le statut s'écrivent en toutes lettres.
import { palettes } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform, StyleSheet, type TextStyle } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { ScoutTriageRow, SeverityPill, StatusLabel } from './ScoutTriageRow'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const now = new Date('2026-11-26T10:00:00.000Z')
const row = {
  kind: { label: 'Bug', icon: 'warning' as const },
  severity: { label: 'Bloquant', strong: true },
  text: 'Le fil ne se recharge plus après une heure',
  author: { name: 'Inès', avatar: null },
  date: '2026-11-25T09:00:00.000Z',
  status: { label: 'Nouveau', tone: 'soft' as const },
  mission: 'Mission',
  now,
}
const spoken = 'Bug, Bloquant, Le fil ne se recharge plus après une heure, Inès, Mission, Nouveau'

describe('ScoutTriageRow', () => {
  it('is a button read in the order of what is written, which opens the report', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<ScoutTriageRow {...row} onPress={onPress} />)

    const button = screen.getByRole('button', { name: spoken })
    expect(button.props['aria-current']).toBeUndefined()
    await fireEvent.press(button)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('leaves out of its name what it does not show', async () => {
    await renderWithProviders(
      <ScoutTriageRow
        {...row}
        severity={undefined}
        mission={undefined}
        kind={{ label: 'Idée', icon: 'lightbulb' }}
        onPress={() => {}}
      />,
    )

    expect(
      screen.getByRole('button', {
        name: 'Idée, Le fil ne se recharge plus après une heure, Inès, Nouveau',
      }),
    ).toBeTruthy()
  })

  it('marks the opened report as current', async () => {
    await renderWithProviders(<ScoutTriageRow {...row} selected onPress={() => {}} />)

    const button = screen.getByRole('button', { name: spoken })
    expect(button.props['aria-current']).toBe('true')
    expect(button.props.accessibilityState).toEqual(expect.objectContaining({ selected: true }))
  })

  it('opens the report with Enter on the web', async () => {
    const onPress = jest.fn()
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<ScoutTriageRow {...row} onPress={onPress} />)

      await fireEvent(screen.getByRole('button', { name: spoken }), 'keyDown', {
        key: 'Enter',
        repeat: false,
        preventDefault: () => {},
      })

      expect(onPress).toHaveBeenCalledTimes(1)
    } finally {
      jest.restoreAllMocks()
    }
  })

  // `textMuted` sur `honeySoft` : 4,44:1 la nuit. Le retour ouvert écrit donc sa mission en
  // `textSecondary`, le couple mesuré dans `contrastPairs`.
  it('writes its mission in the stronger grey on the cream of the opened report', async () => {
    const colorOf = () =>
      StyleSheet.flatten(screen.getByText('Mission').props.style as TextStyle | undefined)?.color
    const view = await renderWithProviders(<ScoutTriageRow {...row} onPress={() => {}} />)
    expect(colorOf()).toBe(palettes.day.textMuted)

    await view.rerender(<ScoutTriageRow {...row} selected onPress={() => {}} />)
    expect(colorOf()).toBe(palettes.day.textSecondary)
  })

  it('writes the severity and the status in words', async () => {
    await renderWithProviders(
      <>
        <SeverityPill label="Gênant" strong={false} />
        <StatusLabel label="Lu" tone="neutral" />
        <StatusLabel label="Corrigé" tone="strong" />
      </>,
    )

    expect(screen.getByText('Gênant')).toBeTruthy()
    expect(screen.getByText('Lu')).toBeTruthy()
    expect(screen.getByText('Corrigé')).toBeTruthy()
  })
})
