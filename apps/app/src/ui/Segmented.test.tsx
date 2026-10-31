// Tests du contrôle segmenté qui ne tient pas sur la largeur (relecture de design de R3, 4 : à 320
// points, « Outils 1 » passait seul sur une deuxième rangée). Les choix restent sur une rangée qui
// défile de côté, et la bande montre toujours le choix actif en entier. Le groupe de radios et le
// clavier sont testés dans components.test.tsx.
// La rangée unique elle-même se mesure dans le navigateur (Jest ne calcule aucune position).
import { space } from '@ruche/brand'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Segmented, scrollToShow } from './Segmented'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Tab = 'all' | 'projects' | 'members' | 'tools'
const options: { value: Tab; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: 'projects', label: 'Projets 12' },
  { value: 'members', label: 'Membres 3' },
  { value: 'tools', label: 'Outils 1' },
]

function SearchTabs({ start }: { start: Tab }) {
  const [value, setValue] = useState<Tab>(start)
  return (
    <Segmented label="Résultats" options={options} value={value} onChange={setValue} fill={false} />
  )
}

// Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 ne cherche que par rôle ou texte).
type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[] }

/** La bande qui défile (l'élément natif du ScrollView). */
const band = (): Node => {
  const visit = (node: Node | string): Node | null => {
    if (typeof node === 'string') return null
    if (node.type === 'RCTScrollView') return node
    for (const child of node.children) {
      const found = visit(child)
      if (found) return found
    }
    return null
  }
  const found = visit(screen.root as unknown as Node)
  if (!found) throw new Error('aucune bande qui défile')
  return found
}

/** L'appareil mesure la bande (200 de large) et les quatre choix, côte à côte (90 chacun). */
const layOut = async () => {
  await act(async () => {
    ;(band().props.onLayout as (event: unknown) => void)({
      nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 52 } },
    })
  })
  for (const [index, option] of options.entries()) {
    await fireEvent(screen.getByRole('radio', { name: option.label }), 'layout', {
      nativeEvent: { layout: { x: 2 + index * 92, y: 2, width: 90, height: 44 } },
    })
  }
}

describe('Segmented, wider than its room (R3)', () => {
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo')
  beforeEach(() => scrollTo.mockClear())

  it('keeps every choice a radio of the same group, the checked one included', async () => {
    await renderWithProviders(<SearchTabs start="all" />)

    expect(screen.getByLabelText('Résultats').props.accessibilityRole).toBe('radiogroup')
    expect(screen.getAllByRole('radio')).toHaveLength(4)
    expect(screen.getByRole('radio', { name: 'Tout', checked: true })).toBeTruthy()
  })

  it('scrolls a checked choice hidden past the edge into view, without gliding at first', async () => {
    await renderWithProviders(<SearchTabs start="tools" />)

    await layOut()

    // « Outils 1 » va de 278 à 368 : la bande s'arrête juste après lui.
    expect(scrollTo).toHaveBeenCalledWith({ x: 368 - 200 + space.xxs, animated: false })
  })

  it('does not move when the checked choice is already in view', async () => {
    await renderWithProviders(<SearchTabs start="all" />)

    await layOut()

    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('brings the newly checked choice into view', async () => {
    await renderWithProviders(<SearchTabs start="all" />)
    await layOut()

    await fireEvent.press(screen.getByRole('radio', { name: 'Membres 3' }))

    expect(screen.getByRole('radio', { name: 'Membres 3', checked: true })).toBeTruthy()
    // « Membres 3 » va de 186 à 276 : à moitié caché, il glisse juste dans la bande.
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 276 - 200 + space.xxs, animated: true })
  })

  it.each([
    ['in view', { x: 10, width: 50 }, 200, 0, null],
    ['past the right edge', { x: 180, width: 50 }, 200, 0, 230 - 200 + space.xxs],
    ['before the left edge', { x: 40, width: 50 }, 200, 100, 40 - space.xxs],
    ['not measured yet', undefined, 200, 0, null],
  ])('scrolls to show a choice %s', (_, place, viewport, offset, expected) => {
    expect(scrollToShow(place, viewport, offset)).toBe(expected)
  })
})
