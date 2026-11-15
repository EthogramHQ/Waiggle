// Tests de la place collée de Screen quand elle arrive après le contenu (R10, relecture de
// l'interface 2 et du design 1 et 4). Les pastilles des ruches viennent d'une autre lecture que le
// Fil : elles peuvent arriver après lui, ou partir (la dernière ruche quittée). Le contenu ne doit
// alors ni être démonté (le focus du clavier et la place du lecteur d'écran se perdaient), ni se
// remonter : l'écran garde la même forme d'arbre, place remplie ou vide (`sticky={null}`).
//
// Sur ordinateur et tablette, la place se pose dans la rangée du titre, à sa droite (planche
// R4-Fil-Desktop) : la phrase sous le titre, qui change de hauteur d'une pastille à l'autre, ne la
// déplace plus. Jest ne mesure aucune position : on lit l'ordre de lecture (titre, place, phrase) ;
// la position se mesure dans le navigateur (`saut-pastilles.mjs`).
import { act, screen } from '@testing-library/react-native'
import { type ReactNode, useEffect } from 'react'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { Screen } from './Screen'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { props: Record<string, unknown>; children: (Node | string)[] }

/** Le rang, dans l'ordre de lecture, du texte donné. */
const rankOf = (text: string) => {
  const all: Node[] = []
  const visit = (node: Node | string) => {
    if (typeof node === 'string') return
    all.push(node)
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Node)
  return all.indexOf(screen.getByText(text) as unknown as Node)
}

/** Compte les montages du contenu de l'écran : un démontage suivi d'un montage en fait deux. */
const mounted = jest.fn()
function Content() {
  useEffect(() => {
    mounted()
  }, [])
  return <Text>Le fil</Text>
}

const page = (sticky: ReactNode, title?: string) => (
  <Screen
    width="page"
    {...(title ? { title, subtitle: 'Les projets des personnes que tu suis.' } : null)}
    sticky={sticky}
  >
    <Content />
  </Screen>
)

const pills = <Text>Les pastilles</Text>

beforeEach(() => mounted.mockClear())

describe('Screen sticky arriving late (R10)', () => {
  it('keeps the content mounted when the place arrives after it, on a phone', async () => {
    const view = await renderWithProviders(page(null))
    expect(mounted).toHaveBeenCalledTimes(1)

    await view.rerender(page(pills))

    expect(screen.getByText('Les pastilles')).toBeTruthy()
    expect(mounted).toHaveBeenCalledTimes(1)
  })

  it('keeps the content mounted when the place leaves', async () => {
    const view = await renderWithProviders(page(pills, 'Fil'))
    expect(mounted).toHaveBeenCalledTimes(1)

    await view.rerender(page(null, 'Fil'))

    expect(screen.queryByText('Les pastilles')).toBeNull()
    expect(mounted).toHaveBeenCalledTimes(1)
  })

  it('keeps the content mounted when the place arrives after it, on a computer', async () => {
    const restore = setDesktopWindow()
    try {
      const view = await renderWithProviders(page(null, 'Fil'))
      await view.rerender(page(pills, 'Fil'))

      expect(screen.getByText('Les pastilles')).toBeTruthy()
      expect(mounted).toHaveBeenCalledTimes(1)
    } finally {
      await act(async () => restore())
    }
  })

  it('puts the place in the row of the title on a computer, before the sentence under it', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(page(pills, 'Fil'))

      expect(screen.getAllByText('Les pastilles')).toHaveLength(1)
      expect(rankOf('Fil')).toBeLessThan(rankOf('Les pastilles'))
      // Dans la rangée du titre : avant la phrase, que sa hauteur ne pousse plus.
      expect(rankOf('Les pastilles')).toBeLessThan(rankOf('Les projets des personnes que tu suis.'))
      expect(rankOf('Les pastilles')).toBeLessThan(rankOf('Le fil'))
    } finally {
      await act(async () => restore())
    }
  })

  it('keeps the place under the title on a phone (témoin)', async () => {
    await renderWithProviders(page(pills, 'Fil'))

    expect(rankOf('Les projets des personnes que tu suis.')).toBeLessThan(rankOf('Les pastilles'))
  })
})
