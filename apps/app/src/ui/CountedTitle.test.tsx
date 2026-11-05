// Tests du titre avec nombre (R3, page d'un membre) : le nombre affiché après le titre, « 50+ » au
// plafond d'une liste, et un nom lu sans signe (« Mes projets, 3 projets »).
import { screen } from '@testing-library/react-native'
import { Platform, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { CountedTitle } from './CountedTitle'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Les morceaux d'un texte réunis, tels qu'ils sont écrits (espaces insécables comprises). */
const rawText = (node: unknown): string =>
  typeof node === 'string' || typeof node === 'number'
    ? String(node)
    : Array.isArray(node)
      ? node.map(rawText).join('')
      : node && typeof node === 'object' && 'props' in node
        ? rawText((node as { props: { children?: unknown } }).props.children)
        : ''

/** Le texte affiché d'un titre, ses morceaux réunis et ses blancs ramenés à des espaces simples. */
const shown = (name: string) =>
  rawText(screen.getByRole('header', { name }).props.children).replace(/\s+/g, ' ')

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

  // R5b : le titre des commentaires, « Commentaires 6 », sur la page et dans la feuille (relecture
  // de l'interface ui-I3). Une espace ordinaire entre le titre et le nombre : à 200 % et 320 px, le
  // nombre passe à la ligne entier, au lieu que le bloc insécable « Commentaires · 6 » coupe le mot
  // (repris des listes « À reprendre »). Sans commentaire, le titre seul.
  describe("with separator 'space'", () => {
    it("with separator 'space' the count can wrap whole to the next line", async () => {
      await renderWithProviders(
        <CountedTitle
          title="Commentaires"
          count={6}
          spokenCount="6 commentaires"
          separator="space"
        />,
      )

      const header = screen.getByRole('header', { name: 'Commentaires, 6 commentaires' })
      // Le texte tel qu'il est écrit, sans ramener les blancs : une seule espace ordinaire (U+0020),
      // où la ligne peut se couper, et aucun « · ».
      const raw = rawText(header.props.children)
      expect(raw).toBe('Commentaires 6')
      expect(raw.charCodeAt('Commentaires'.length)).toBe(0x20)
    })

    it('with no comment the title is « Commentaires » with no number', async () => {
      await renderWithProviders(
        <CountedTitle
          title="Commentaires"
          count={0}
          spokenCount="0 commentaire"
          separator="space"
        />,
      )

      // Ni « 0 » à voir, ni « 0 commentaire » à entendre : le titre seul.
      expect(shown('Commentaires')).toBe('Commentaires')
      expect(screen.queryByText(/0/)).toBeNull()
    })
  })

  it('carries the nativeID it is given, so that a dialog can be named by it', async () => {
    await renderWithProviders(
      <CountedTitle
        title="Commentaires"
        count={6}
        spokenCount="6 commentaires"
        separator="space"
        nativeID="comments-title"
      />,
    )

    expect(
      screen.getByRole('header', { name: 'Commentaires, 6 commentaires' }).props.nativeID,
    ).toBe('comments-title')
  })

  it("takes the size of a sheet title with variant 'title2'", async () => {
    // La feuille des commentaires a le grand titre des feuilles (Text « title2 ») : le titre avec
    // son nombre prend la même taille, le nombre compris.
    await renderWithProviders(
      <>
        <Text variant="title2">Référence</Text>
        <CountedTitle
          title="Commentaires"
          count={6}
          spokenCount="6 commentaires"
          separator="space"
          variant="title2"
        />
      </>,
    )

    const reference = StyleSheet.flatten(screen.getByText('Référence').props.style)
    const header = screen.getByRole('header', { name: 'Commentaires, 6 commentaires' })
    expect(StyleSheet.flatten(header.props.style).fontSize).toBe(reference.fontSize)
    expect(StyleSheet.flatten(screen.getByText(/6$/).props.style).fontSize).toBe(reference.fontSize)
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
