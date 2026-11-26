// Tests de la rangée de « Mes retours » (ui/ScoutReportRow, R20) : ce qu'elle dit (sorte, gravité,
// mission, texte brut, statut, note de l'administrateur) et son menu « ⋯ », retrouvés par leur rôle
// et leur nom, jamais par leur style.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { ScoutReportRow } from './ScoutReportRow'

const NOW = new Date('2026-11-26T12:00:00.000Z')
const base = {
  kind: { label: 'Bug', icon: 'warning-circle' as const },
  text: 'Le bouton Publier se cache derrière le clavier',
  date: '2026-11-26T10:00:00.000Z',
  status: { label: 'Envoyé', tone: 'neutral' as const },
  now: NOW,
}

describe('ScoutReportRow', () => {
  it('shows the kind, the severity, the text and the status', async () => {
    await renderWithProviders(
      <ScoutReportRow {...base} severity={{ label: 'Bloquant', strong: true }} />,
    )

    expect(screen.getByText('Bug')).toBeTruthy()
    expect(screen.getByText('Bloquant')).toBeTruthy()
    expect(screen.getByText(base.text)).toBeTruthy()
    expect(screen.getByText('Envoyé')).toBeTruthy()
  })

  it('shows the mission it answers and the note of a fixed report', async () => {
    await renderWithProviders(
      <ScoutReportRow
        {...base}
        status={{ label: 'Corrigé', tone: 'strong' }}
        mission="Mission : Publie un projet avec une photo"
        note="« Corrigé le 28/11, merci ! »"
      />,
    )

    expect(screen.getByText('Mission : Publie un projet avec une photo')).toBeTruthy()
    expect(screen.getByText('« Corrigé le 28/11, merci ! »')).toBeTruthy()
    expect(screen.getByText('Corrigé')).toBeTruthy()
  })

  it('writes the text as typed, without reading it as Markdown', async () => {
    await renderWithProviders(
      <ScoutReportRow {...base} text="**gras** et [lien](https://exemple.fr)" />,
    )

    expect(screen.getByText('**gras** et [lien](https://exemple.fr)')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('has no menu button without actions', async () => {
    await renderWithProviders(<ScoutReportRow {...base} />)

    expect(screen.queryByRole('button', { name: 'Actions du retour' })).toBeNull()
  })

  it('opens its menu, whose action is a menu item', async () => {
    const onDelete = jest.fn()
    await renderWithProviders(
      <ScoutReportRow
        {...base}
        menu={{
          label: 'Actions du retour',
          items: [{ label: 'Supprimer ce retour', tone: 'danger', onPress: onDelete }],
        }}
      />,
    )

    const menu = screen.getByRole('button', { name: 'Actions du retour' })
    await fireEvent.press(menu)
    await fireEvent.press(await screen.findByRole('menuitem', { name: 'Supprimer ce retour' }))

    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
