// Tests du titre avec nombre (R3, page d'un membre) : le nombre affiché après le titre, « 50+ » au
// plafond d'une liste, et un nom lu sans signe (« Mes projets, 3 projets »).
import { screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { CountedTitle } from './CountedTitle'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Le texte affiché d'un titre, ses morceaux réunis et ses blancs ramenés à des espaces simples. */
const shown = (name: string) => {
  const flatten = (node: unknown): string =>
    typeof node === 'string'
      ? node
      : Array.isArray(node)
        ? node.map(flatten).join('')
        : node && typeof node === 'object' && 'props' in node
          ? flatten((node as { props: { children?: unknown } }).props.children)
          : ''
  return flatten(screen.getByRole('header', { name }).props.children).replace(/\s+/g, ' ')
}

describe('CountedTitle', () => {
  it('is a heading read with the number in words, without the dot', async () => {
    await renderWithProviders(
      <CountedTitle title="Mes projets" count={3} spokenCount="3 projets" />,
    )

    expect(screen.getByRole('header', { name: 'Mes projets, 3 projets' })).toBeTruthy()
  })

  it('shows the number after the title, behind a dot', async () => {
    await renderWithProviders(<CountedTitle title="Projets" count={2} spokenCount="2 projets" />)

    expect(shown('Projets, 2 projets')).toBe('Projets · 2')
  })

  it('shows « 50+ » at the cap of the list, and reads « 50 projets ou plus »', async () => {
    await renderWithProviders(
      <CountedTitle title="Mes projets" count={50} more spokenCount="50 projets ou plus" />,
    )

    expect(shown('Mes projets, 50 projets ou plus')).toBe('Mes projets · 50+')
  })

  it('keeps the number on the line of the title (no breaking space around the dot)', async () => {
    await renderWithProviders(<CountedTitle title="Projets" count={12} spokenCount="12 projets" />)

    const header = screen.getByRole('header', { name: 'Projets, 12 projets' })
    const count = screen.getByText(/12$/)
    expect(header).toBeTruthy()
    expect(count.props.children).toBe(' · 12')
  })

  it('is a section heading by default, and takes another level when asked (web)', async () => {
    // Le niveau (`aria-level`) n'existe que sur le web, où il donne une vraie balise <h2>, <h3>.
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(
        <>
          <CountedTitle title="Projets" count={1} spokenCount="1 projet" />
          <CountedTitle title="Outils" count={4} spokenCount="4 outils" level={3} />
        </>,
      )

      expect(screen.getByRole('header', { name: 'Projets, 1 projet' }).props['aria-level']).toBe(2)
      expect(screen.getByRole('header', { name: 'Outils, 4 outils' }).props['aria-level']).toBe(3)
    } finally {
      jest.restoreAllMocks()
    }
  })
})
