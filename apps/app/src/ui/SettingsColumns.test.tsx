// Tests de la mise en page des réglages sur ordinateur (SettingsColumns, R2, relecture de
// l'interface C7 et C8) : la colonne des rubriques, le titre de la rubrique ouverte (un titre de
// section, h2) et son contenu ; et le focus du clavier, posé sur ce titre quand on vient de choisir
// la rubrique dans la colonne (sinon il retomberait tout en haut de la nouvelle page).
import { screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { focusWithoutScroll } from './focus'
import { noteSectionChosen, SettingsColumns } from './SettingsColumns'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('./focus', () => ({
  ...jest.requireActual('./focus'),
  focusWithoutScroll: jest.fn(() => true),
}))

const Sample = ({ current = 'language' }: { current?: string }) => (
  <SettingsColumns nav={<Text>La colonne des rubriques</Text>} title="Langue" current={current}>
    <Text>Français ou anglais</Text>
  </SettingsColumns>
)

describe('SettingsColumns', () => {
  beforeEach(() => jest.mocked(focusWithoutScroll).mockClear())
  afterEach(() => jest.restoreAllMocks())

  it('shows the column, the title of the open section as a level 2 heading, and its content', async () => {
    await renderWithProviders(<Sample />)

    expect(screen.getByText('La colonne des rubriques')).toBeTruthy()
    // Un titre (le niveau 2 se relève dans le navigateur, pas par Jest : charte de design).
    expect(screen.getByRole('header', { name: 'Langue' })).toBeTruthy()
    expect(screen.getByText('Français ou anglais')).toBeTruthy()
  })

  it('puts the keyboard focus on the title when the section was just chosen in the column (web)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    noteSectionChosen('language')

    await renderWithProviders(<Sample />)

    expect(focusWithoutScroll).toHaveBeenCalledTimes(1)
  })

  it('leaves the focus alone when the page was opened otherwise (a link, a reload)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')

    await renderWithProviders(<Sample />)

    expect(focusWithoutScroll).not.toHaveBeenCalled()
  })

  it('does not take the focus for a section other than the one chosen', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    noteSectionChosen('profile')

    await renderWithProviders(<Sample current="security" />)

    expect(focusWithoutScroll).not.toHaveBeenCalled()
  })
})
