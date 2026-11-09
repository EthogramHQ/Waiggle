// Tests de la seconde feuille de publication, « Catégorie et outils » (R6a, planche
// R6-Publier-Outils, relecture du plan ui-I6 et ui-I10) : les seize catégories en un groupe nommé
// « Catégorie », les outils proposés avec leur nombre de projets, l'ajout d'un outil que personne
// n'a encore cité, et la fermeture : « OK » ferme en gardant les choix, Échap (ou le retour
// d'Android) aussi. Les choix remontent à chaque geste (`onChange`) : fermer ne les défait jamais.
//
// La feuille lit les outils par `useTools` (`tools/api.ts`), remplacé ici par une fausse liste.
import type { ProjectCategory, ToolCount } from '@ruche/contracts'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ProjectCategorySheet } from './ProjectCategorySheet'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les outils déjà cités par les projets des membres, du plus cité au moins cité (GET /v1/tools).
const mockTools: { data: { tools: ToolCount[] } | undefined } = { data: undefined }
jest.mock('../tools/api', () => ({ useTools: () => mockTools }))

const TEXT = {
  sheet: fr.t(($) => $.project.form.categoriesAndTools),
  category: fr.t(($) => $.project.form.category),
  ok: fr.t(($) => $.project.form.ok),
  tools: fr.t(($) => $.project.form.tools),
  name: (code: ProjectCategory) => fr.t(($) => $.project.category[code]),
  primary: (category: string) => fr.t(($) => $.project.form.categoryRank1, { category }),
  suggestion: (name: string, count: number) =>
    fr.t(($) => $.project.form.toolSuggestion, { name, count }),
  add: (name: string) => fr.t(($) => $.project.form.addTool, { name }),
  remove: (name: string) => fr.t(($) => $.project.form.removeTool, { name }),
}

type Choice = {
  primary: ProjectCategory | null
  secondary: ProjectCategory | null
  tools: string[]
}

/**
 * La feuille ouverte au-dessus d'un formulaire qui garde ses choix, comme la feuille de publication :
 * chaque `onChange` est noté, et `onClose` la referme.
 */
function Opened({
  start = { primary: null, secondary: null, tools: [] },
  changes,
  closes,
}: {
  start?: Choice
  changes: jest.Mock
  closes: jest.Mock
}) {
  const [open, setOpen] = useState(true)
  const [choice, setChoice] = useState<Choice>(start)
  return (
    <ProjectCategorySheet
      open={open}
      primary={choice.primary}
      secondary={choice.secondary}
      tools={choice.tools}
      onChange={(next) => {
        changes(next)
        setChoice(next)
      }}
      onClose={() => {
        closes()
        setOpen(false)
      }}
    />
  )
}

const lastChange = (changes: jest.Mock): Choice => changes.mock.calls.at(-1)?.[0] as Choice

/** La couche du Modal de la feuille : elle reçoit l'Échap relâchée (web) et le retour d'Android. */
const layer = () => {
  type Host = { props: Record<string, unknown>; parent: Host | null }
  let node = screen.getByLabelText(TEXT.sheet) as unknown as Host | null
  while (node && typeof node.props.onRequestClose !== 'function') node = node.parent
  if (!node) throw new Error('aucune couche autour de la feuille')
  return node.props.onRequestClose as () => void
}

beforeEach(() => {
  mockTools.data = {
    tools: [
      { slug: 'claude', label: 'Claude', projectCount: 41 },
      { slug: 'expo', label: 'Expo', projectCount: 12 },
      { slug: 'python', label: 'Python', projectCount: 1 },
    ],
  }
})

describe('ProjectCategorySheet', () => {
  it('opens « Catégorie et outils » with the categories in a group named « Catégorie »', async () => {
    await renderWithProviders(<Opened changes={jest.fn()} closes={jest.fn()} />)

    expect(screen.getByLabelText(TEXT.sheet)).toBeTruthy()
    const group = screen.getByLabelText(TEXT.category).props as Record<string, unknown>
    expect(group.role ?? group.accessibilityRole).toBe('group')
    expect(screen.getAllByRole('checkbox')).toHaveLength(16)
    expect(screen.getByRole('combobox', { name: TEXT.tools })).toBeTruthy()
  })

  it('gives the chosen categories back at once, and « OK » closes keeping them', async () => {
    const changes = jest.fn()
    const closes = jest.fn()
    await renderWithProviders(<Opened changes={changes} closes={closes} />)

    await fireEvent.press(screen.getByRole('checkbox', { name: TEXT.name('science') }))
    await fireEvent.press(screen.getByRole('checkbox', { name: TEXT.name('learning') }))
    expect(lastChange(changes)).toEqual({ primary: 'science', secondary: 'learning', tools: [] })

    await fireEvent.press(screen.getByRole('button', { name: TEXT.ok }))

    expect(closes).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText(TEXT.sheet)).toBeNull()
    // Fermer ne défait rien : aucun choix n'est renvoyé après « OK ».
    expect(lastChange(changes)).toEqual({ primary: 'science', secondary: 'learning', tools: [] })
  })

  it('keeps the choices when closed by Escape or the Android back button', async () => {
    const changes = jest.fn()
    const closes = jest.fn()
    await renderWithProviders(
      <Opened
        start={{ primary: 'cooking', secondary: null, tools: ['Expo'] }}
        changes={changes}
        closes={closes}
      />,
    )
    await fireEvent.press(screen.getByRole('checkbox', { name: TEXT.name('family') }))

    // Échap relâchée et le retour d'Android arrivent à la couche de la feuille (onRequestClose).
    await act(() => layer()())

    expect(closes).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText(TEXT.sheet)).toBeNull()
    expect(changes).toHaveBeenCalledTimes(1)
    expect(lastChange(changes)).toEqual({
      primary: 'cooking',
      secondary: 'family',
      tools: ['Expo'],
    })
  })

  it('proposes the tools already used, with their number of projects, and adds the one touched', async () => {
    const changes = jest.fn()
    await renderWithProviders(
      <Opened
        start={{ primary: 'science', secondary: null, tools: [] }}
        changes={changes}
        closes={jest.fn()}
      />,
    )

    await fireEvent.changeText(screen.getByRole('combobox', { name: TEXT.tools }), 'cl')
    // Seuls les outils qui contiennent ce qui est tapé, avec leur nombre de projets.
    expect(screen.getByRole('option', { name: TEXT.suggestion('Claude', 41) })).toBeTruthy()
    expect(screen.queryByRole('option', { name: TEXT.suggestion('Python', 1) })).toBeNull()
    await fireEvent.press(screen.getByRole('option', { name: TEXT.suggestion('Claude', 41) }))

    expect(lastChange(changes)).toEqual({ primary: 'science', secondary: null, tools: ['Claude'] })
    expect(screen.getByRole('button', { name: TEXT.remove('Claude') })).toBeTruthy()
  })

  it('adds a tool nobody has used yet, as it is typed', async () => {
    const changes = jest.fn()
    await renderWithProviders(
      <Opened
        start={{ primary: 'science', secondary: 'learning', tools: ['Expo'] }}
        changes={changes}
        closes={jest.fn()}
      />,
    )

    await fireEvent.changeText(
      screen.getByRole('combobox', { name: TEXT.tools }),
      'Teachable Machine',
    )
    await fireEvent.press(screen.getByRole('option', { name: TEXT.add('Teachable Machine') }))

    expect(lastChange(changes)).toEqual({
      primary: 'science',
      secondary: 'learning',
      tools: ['Expo', 'Teachable Machine'],
    })
  })

  it('still lets a tool be added while the list of tools is not there yet (témoin)', async () => {
    mockTools.data = undefined
    const changes = jest.fn()
    await renderWithProviders(<Opened changes={changes} closes={jest.fn()} />)

    await fireEvent.changeText(screen.getByRole('combobox', { name: TEXT.tools }), 'Claude')
    await fireEvent.press(screen.getByRole('option', { name: TEXT.add('Claude') }))

    expect(lastChange(changes)).toEqual({ primary: null, secondary: null, tools: ['Claude'] })
  })
})
