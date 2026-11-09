// Tests de la seconde feuille de publication, « Catégorie et outils » (R6a, planche
// R6-Publier-Outils, relecture du plan ui-I6 et ui-I10) : les catégories en un groupe nommé
// « Catégorie », les outils proposés avec leur nombre de projets, l'ajout d'un outil absent, et la
// fermeture : « OK » ferme en gardant les choix, Échap (ou le retour d'Android) aussi. Les choix
// remontent à chaque geste (`onChange`) : fermer ne les défait jamais.
//
// R6b (scénario « Choisir ses outils », relecture du plan, décisions 7, 11 et 15) :
// - les catégories et leurs noms viennent de l'API (GET /v1/categories), plus des traductions :
//   pendant le chargement, une attente ; en panne, « Les catégories n'ont pas pu se charger. » et
//   « Réessayer » ;
// - les outils viennent du catalogue (GET /v1/tools), cherchés par nom et par alias (`matchTools`) ;
//   un nom absent s'ajoute « comme autre outil », avec une aide qui dit qu'il sera relu, ou, pour un
//   projet privé, qu'il n'est ni montré ni relu (jur-T3) ; la feuille reçoit pour cela la visibilité
//   du projet (`visibility`, prop ajoutée en R6b) ;
// - sous la catégorie « Autre », une aide dit que les administrateurs pourront ranger le projet
//   (jur-T4).
// Les lectures passent par un faux réseau (`api/client`) : peu importe le hook qui les fait.
import type { CatalogueTool, ProjectCategory, ProjectVisibility, ToolList } from '@ruche/contracts'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { useState } from 'react'
import { request } from '../api/client'
import { categoryList, categoryName } from '../testing/categories'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ProjectCategorySheet } from './ProjectCategorySheet'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))

const TEXT = {
  sheet: fr.t(($) => $.project.form.categoriesAndTools),
  category: fr.t(($) => $.project.form.category),
  ok: fr.t(($) => $.project.form.ok),
  tools: fr.t(($) => $.project.form.tools),
  suggestion: (name: string, count: number) =>
    fr.t(($) => $.project.form.toolSuggestion, { name, count }),
  add: (name: string) => fr.t(($) => $.project.form.addTool, { name }),
  addOther: (name: string) => fr.t(($) => $.project.form.addOtherTool, { name }),
  otherSpoken: (name: string) => fr.t(($) => $.tool.otherSpoken, { name }),
  otherHint: fr.t(($) => $.project.form.otherToolsHint),
  otherHintPrivate: fr.t(($) => $.project.form.otherToolsHintPrivate),
  otherCategoryHint: fr.t(($) => $.project.form.otherCategoryHint),
  categoriesError: fr.t(($) => $.project.form.categoriesError),
  retry: fr.t(($) => $.common.retry),
  remove: (name: string) => fr.t(($) => $.project.form.removeTool, { name }),
}

/** Un outil du catalogue (GET /v1/tools). */
const tool = (
  slug: string,
  name: string,
  projectCount: number,
  aliases: string[] = [],
): CatalogueTool => ({ slug, name, family: 'assistant', aliases, projectCount })
const CATALOGUE: ToolList = {
  tools: [
    tool('claude', 'Claude', 41),
    tool('expo', 'Expo', 12),
    tool('python', 'Python', 1),
    tool('chatgpt', 'ChatGPT', 30, ['Chat GPT']),
  ],
  others: [],
}

/** Une réponse du faux réseau : une donnée, une panne, ou une attente sans fin. */
type Reply = () => Promise<unknown>
const pending: Reply = () => new Promise(() => {})
const failing: Reply = () => Promise.reject(new Error('500'))
const network = {
  categories: (() => Promise.resolve(categoryList('fr'))) as Reply,
  tools: (() => Promise.resolve(CATALOGUE)) as Reply,
}
const categoryReads = () =>
  jest.mocked(request).mock.calls.filter(([path]) => String(path).startsWith('/v1/categories'))
    .length

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
  visibility = 'public',
  changes,
  closes,
}: {
  start?: Choice
  visibility?: ProjectVisibility
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
      visibility={visibility}
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

/** La feuille ouverte, ses catégories lues (16 cases). */
const renderOpened = async (props: Partial<Parameters<typeof Opened>[0]> = {}) => {
  const changes = props.changes ?? jest.fn()
  const closes = props.closes ?? jest.fn()
  await renderWithProviders(<Opened {...props} changes={changes} closes={closes} />)
  await screen.findAllByRole('checkbox')
  return { changes, closes }
}

/** La couche du Modal de la feuille : elle reçoit l'Échap relâchée (web) et le retour d'Android. */
const layer = () => {
  type Host = { props: Record<string, unknown>; parent: Host | null }
  let node = screen.getByLabelText(TEXT.sheet) as unknown as Host | null
  while (node && typeof node.props.onRequestClose !== 'function') node = node.parent
  if (!node) throw new Error('aucune couche autour de la feuille')
  return node.props.onRequestClose as () => void
}

beforeEach(() => {
  network.categories = () => Promise.resolve(categoryList('fr'))
  network.tools = () => Promise.resolve(CATALOGUE)
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation((async (path: string) => {
      const reply = path.startsWith('/v1/categories')
        ? network.categories
        : path.startsWith('/v1/tools')
          ? network.tools
          : null
      if (!reply) return { ok: false, error: 'internal' }
      try {
        return { ok: true, data: await reply() }
      } catch {
        return { ok: false, error: 'internal' }
      }
    }) as typeof request)
})

describe('ProjectCategorySheet', () => {
  it('opens « Catégorie et outils » with the categories in a group named « Catégorie »', async () => {
    await renderOpened()

    expect(screen.getByLabelText(TEXT.sheet)).toBeTruthy()
    const group = screen.getByLabelText(TEXT.category).props as Record<string, unknown>
    expect(group.role ?? group.accessibilityRole).toBe('group')
    expect(screen.getAllByRole('checkbox')).toHaveLength(16)
    expect(screen.getByRole('combobox', { name: TEXT.tools })).toBeTruthy()
  })

  it('names the categories as the API does, a category created by an administrator included', async () => {
    const list = categoryList('fr')
    // Une catégorie créée par un administrateur, avant « Autre » : son nom n'existe que dans l'API.
    list.categories.splice(15, 0, {
      code: 'knitting',
      name: 'Tricot',
      icon: 'heart',
      projectCount: 0,
    })
    network.categories = () => Promise.resolve(list)
    await renderOpened()

    expect(screen.getAllByRole('checkbox')).toHaveLength(17)
    expect(screen.getByRole('checkbox', { name: 'Tricot' })).toBeTruthy()
    const names = screen.getAllByRole('checkbox').map((box) => box.props.accessibilityLabel)
    expect(names.at(-1)).toBe(categoryName('other'))
  })

  it('shows the categories loading, then an error with « Réessayer »', async () => {
    network.categories = pending
    await renderWithProviders(<Opened changes={jest.fn()} closes={jest.fn()} />)

    // Le chargement : une attente, aucune case.
    expect(await screen.findAllByRole('progressbar')).not.toHaveLength(0)
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    // Les outils restent utilisables pendant ce temps.
    expect(screen.getByRole('combobox', { name: TEXT.tools })).toBeTruthy()
  })

  it('says the categories could not load, and « Réessayer » reads them again', async () => {
    network.categories = failing
    await renderWithProviders(<Opened changes={jest.fn()} closes={jest.fn()} />)

    expect(await screen.findByText(TEXT.categoriesError)).toBeTruthy()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    const retry =
      screen.queryByRole('button', { name: TEXT.retry }) ??
      screen.getByRole('link', { name: TEXT.retry })
    network.categories = () => Promise.resolve(categoryList('fr'))
    await fireEvent.press(retry)

    expect(await screen.findAllByRole('checkbox')).toHaveLength(16)
    expect(categoryReads()).toBe(2)
    expect(screen.queryByText(TEXT.categoriesError)).toBeNull()
  })

  it('gives the chosen categories back at once, and « OK » closes keeping them', async () => {
    const { changes, closes } = await renderOpened()

    await fireEvent.press(screen.getByRole('checkbox', { name: categoryName('science') }))
    await fireEvent.press(screen.getByRole('checkbox', { name: categoryName('learning') }))
    expect(lastChange(changes)).toEqual({ primary: 'science', secondary: 'learning', tools: [] })

    await fireEvent.press(screen.getByRole('button', { name: TEXT.ok }))

    expect(closes).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText(TEXT.sheet)).toBeNull()
    // Fermer ne défait rien : aucun choix n'est renvoyé après « OK ».
    expect(lastChange(changes)).toEqual({ primary: 'science', secondary: 'learning', tools: [] })
  })

  it('keeps the choices when closed by Escape or the Android back button', async () => {
    const { changes, closes } = await renderOpened({
      start: { primary: 'cooking', secondary: null, tools: ['Expo'] },
    })
    await fireEvent.press(screen.getByRole('checkbox', { name: categoryName('family') }))

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

  it('tells, under the Other category, that the administrators may sort the project', async () => {
    await renderOpened()
    // Témoin : sans « Autre », pas d'aide.
    expect(screen.queryByText(containing(TEXT.otherCategoryHint))).toBeNull()

    await fireEvent.press(screen.getByRole('checkbox', { name: categoryName('other') }))

    expect(screen.getByText(containing(TEXT.otherCategoryHint))).toBeTruthy()
  })

  it('proposes the catalogue tools with their number of projects, and adds the one touched', async () => {
    const { changes } = await renderOpened({
      start: { primary: 'science', secondary: null, tools: [] },
    })

    await fireEvent.changeText(screen.getByRole('combobox', { name: TEXT.tools }), 'cl')
    // Seuls les outils qui contiennent ce qui est tapé, avec leur nombre de projets.
    expect(await screen.findByRole('option', { name: TEXT.suggestion('Claude', 41) })).toBeTruthy()
    expect(screen.queryByRole('option', { name: TEXT.suggestion('Python', 1) })).toBeNull()
    await fireEvent.press(screen.getByRole('option', { name: TEXT.suggestion('Claude', 41) }))

    expect(lastChange(changes)).toEqual({ primary: 'science', secondary: null, tools: ['Claude'] })
    expect(screen.getByRole('button', { name: TEXT.remove('Claude') })).toBeTruthy()
  })

  it('finds a catalogue tool by its alias, and never offers it as an other tool', async () => {
    await renderOpened()

    await fireEvent.changeText(screen.getByRole('combobox', { name: TEXT.tools }), 'chat gpt')

    expect(await screen.findByRole('option', { name: TEXT.suggestion('ChatGPT', 30) })).toBeTruthy()
    expect(screen.queryByRole('option', { name: TEXT.addOther('chat gpt') })).toBeNull()
    expect(screen.queryByRole('option', { name: TEXT.add('chat gpt') })).toBeNull()
  })

  it('adds a name absent from the catalogue as an other tool, marked and explained', async () => {
    const { changes } = await renderOpened({
      start: { primary: 'science', secondary: 'learning', tools: ['Expo'] },
    })
    // Témoin : aucune aide tant qu'aucun « Autre » n'est choisi.
    expect(screen.queryByText(containing(TEXT.otherHint))).toBeNull()

    await fireEvent.changeText(
      screen.getByRole('combobox', { name: TEXT.tools }),
      'Teachable Machine',
    )
    await fireEvent.press(
      await screen.findByRole('option', { name: TEXT.addOther('Teachable Machine') }),
    )

    expect(lastChange(changes)).toEqual({
      primary: 'science',
      secondary: 'learning',
      tools: ['Expo', 'Teachable Machine'],
    })
    expect(screen.getByText(containing(TEXT.otherHint))).toBeTruthy()
    expect(screen.getByLabelText(TEXT.otherSpoken('Teachable Machine'))).toBeTruthy()
    // Expo, du catalogue, n'est pas marqué.
    expect(screen.queryByLabelText(TEXT.otherSpoken('Expo'))).toBeNull()
  })

  it('tells, for a private project, that an other tool is neither shown nor reviewed', async () => {
    await renderOpened({
      start: { primary: 'science', secondary: null, tools: ['Teachable Machine'] },
      visibility: 'private',
    })

    await waitFor(() => expect(screen.getByText(containing(TEXT.otherHintPrivate))).toBeTruthy())
    // Jamais l'aide des projets que les membres voient : rien n'est relu.
    expect(screen.queryByText(containing(TEXT.otherHint))).toBeNull()
  })

  it('still lets a tool be added, without the other mark, while the catalogue is not there yet', async () => {
    network.tools = pending
    const { changes } = await renderOpened()

    await fireEvent.changeText(screen.getByRole('combobox', { name: TEXT.tools }), 'Claude')
    await fireEvent.press(screen.getByRole('option', { name: TEXT.add('Claude') }))

    expect(lastChange(changes)).toEqual({ primary: null, secondary: null, tools: ['Claude'] })
    expect(screen.queryByLabelText(TEXT.otherSpoken('Claude'))).toBeNull()
    expect(screen.queryByText(containing(TEXT.otherHint))).toBeNull()
  })
})
