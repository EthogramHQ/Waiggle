// Tests du titre caché à l'œil (relecture R3 : le Fil de téléphone n'avait aucun titre de niveau 1).
// Le titre doit rester lu (rôle « header », son nom, son niveau sur le web), et ne rien dessiner
// ni occuper : cadre hors du flux, d'un point, qui rogne.
import { screen } from '@testing-library/react-native'
import { Platform, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { HiddenHeading } from './HiddenHeading'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; parent: Node | null }

const styleOf = (node: Node) =>
  (StyleSheet.flatten(node.props.style as never) as Record<string, unknown> | undefined) ?? {}

describe('HiddenHeading', () => {
  it('is read out as a heading with its text', async () => {
    await renderWithProviders(<HiddenHeading text="Fil" />)

    expect(screen.getByRole('header', { name: 'Fil' })).toBeTruthy()
  })

  it('is a level-1 heading by default on the web, and takes the level it is given', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(
        <>
          <HiddenHeading text="Fil" />
          <HiddenHeading text="Section" level={2} />
        </>,
      )

      expect(screen.getByRole('header', { name: 'Fil' }).props['aria-level']).toBe(1)
      expect(screen.getByRole('header', { name: 'Section' }).props['aria-level']).toBe(2)
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('takes no room and shows nothing: out of the flow, one point wide, clipped', async () => {
    await renderWithProviders(<HiddenHeading text="Fil" />)

    const frame = (screen.getByRole('header', { name: 'Fil' }) as unknown as Node).parent
    if (!frame) throw new Error('le titre n’a pas de cadre')
    expect(styleOf(frame)).toMatchObject({
      position: 'absolute',
      width: 1,
      height: 1,
      overflow: 'hidden',
    })
    // Et il ne prend jamais une tape destinée à ce qui est dessous.
    expect(frame.props.pointerEvents).toBe('none')
  })

  // Le cadre ne doit pas cacher le titre aux lecteurs d'écran : ni masqué, ni transparent.
  it('is not hidden from screen readers', async () => {
    await renderWithProviders(<HiddenHeading text="Fil" />)

    const frame = (screen.getByRole('header', { name: 'Fil' }) as unknown as Node).parent as Node
    expect(styleOf(frame).display).not.toBe('none')
    expect(styleOf(frame).opacity).toBeUndefined()
    expect(frame.props.accessibilityElementsHidden).toBeUndefined()
    expect(frame.props['aria-hidden']).toBeUndefined()
  })
})
