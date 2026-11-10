// Tests de la frise des mises à jour (R7a, scénario « La frise », planches `R7-MAJ-Projet` et
// `R7-MAJ-Desktop`) : les mises à jour de la plus récente à la plus ancienne, en liste ; 20 par page
// puis « Afficher la suite » ; tout en bas, « Première version », à la date de publication du
// projet ; la corbeille de l'auteur sur chaque mise à jour. Le point miel de la dernière et le trait
// qui relie les ronds se vérifient sur les captures.
//
// L'interface attendue de `src/ui/UpdateTimeline.tsx` (plan R7a, « Appli », et relecture du plan,
// interface A4) :
// `UpdateTimeline({ updates: ProjectUpdate[]; publishedAt: string; toSource; onDelete?; deletingId?;
// hasMore; onMore; loadingMore; moreError? })`.
// Choix de TW-1, à confirmer par la session (le plan ne les fixait pas) :
// - `toSource` : comme `UpdateEntry`, la fonction de `useMediaSources()`, passée à chaque mise à jour ;
// - `onDelete?: (update: ProjectUpdate) => void` : la mise à jour dont on a touché la corbeille ;
// - `moreError?: boolean` : la suite n'a pas pu se charger ; la frise garde ce qu'elle montre, dit
//   `project.updates.moreError` et propose « Réessayer », qui rappelle `onMore`.
import type { ProjectUpdate } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { createRef } from 'react'
import { View } from 'react-native'
import { labelOf, lendWebPage, type PageState, turnThePage } from '../testing/arrivedFocus'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { rocketUpdate } from '../testing/updates'
import type { ImageSource } from './image'
import { UpdateTimeline } from './UpdateTimeline'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[] }

const toSource = (url: string | null | undefined): ImageSource | null => (url ? { uri: url } : null)
const PUBLISHED_AT = '2026-09-12T10:00:00.000Z'

/** Une mise à jour de la frise, nommée par son titre, sans photo (l'avant / après est en haut). */
const update = (title: string, rank: number): ProjectUpdate => ({
  ...rocketUpdate,
  id: `00000000-0000-4000-8000-${String(rank).padStart(12, '0')}`,
  title,
  photos: [],
  beforeAfter: false,
  createdAt: new Date(Date.UTC(2026, 9, 30 - rank)).toISOString(),
})
const three = ['Le décompte', 'Le mode nuit', 'Les étoiles'].map(update)

const more = fr.t(($) => $.project.updates.more)
const firstVersion = fr.t(($) => $.project.updates.firstVersion)
const moreError = fr.t(($) => $.project.updates.moreError)
const retry = fr.t(($) => $.common.retry)
const deleteLabel = (title: string) => fr.t(($) => $.project.updates.delete, { title })

type Props = Parameters<typeof UpdateTimeline>[0]
const renderTimeline = (props: Partial<Props> = {}) =>
  renderWithProviders(
    <UpdateTimeline
      updates={three}
      publishedAt={PUBLISHED_AT}
      toSource={toSource}
      hasMore={false}
      onMore={() => {}}
      loadingMore={false}
      {...props}
    />,
  )

/** Tous les éléments dessinés sous `node`, lui compris. */
const allNodes = (node: Node | string, found: Node[] = []): Node[] => {
  if (typeof node === 'string') return found
  found.push(node)
  for (const child of node.children) allNodes(child, found)
  return found
}
const roleOf = (node: Node) => node.props.role ?? node.props.accessibilityRole

/** La position d'un texte dans l'ordre du rendu (l'ordre de lecture). */
const orderOf = (text: string) => {
  const nodes = allNodes(screen.root as unknown as Node)
  return nodes.findIndex((node) => node.children.some((child) => child === text))
}

describe('UpdateTimeline', () => {
  // Scénario : « la frise, de la plus récente à la plus ancienne ».
  it('lists the updates from the most recent to the oldest', async () => {
    await renderTimeline()

    const positions = three.map((one) => orderOf(one.title ?? ''))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  // Une liste sémantique : le lecteur d'écran dit « liste, 3 éléments » (plan, « Appli »).
  it('is a list with one item per update', async () => {
    await renderTimeline()

    const nodes = allNodes(screen.root as unknown as Node)
    // La première liste rencontrée est celle de la frise (une mise à jour peut ranger ses lignes
    // dans sa propre liste, plus bas) ; on compte ses éléments du premier niveau seulement.
    const list = nodes.find((node) => roleOf(node) === 'list')
    expect(list).toBeDefined()
    const topItems = (node: Node | string): number =>
      typeof node === 'string'
        ? 0
        : node.children.reduce(
            (count: number, child) =>
              count +
              (typeof child !== 'string' && roleOf(child) === 'listitem' ? 1 : topItems(child)),
            0,
          )
    expect(topItems(list as Node)).toBe(three.length)
  })

  // Relecture du plan, interface A4 : `it('shows « Première version » only at the end of the
  // timeline')`.
  it('shows « Première version » only at the end of the timeline', async () => {
    const { rerender } = await renderTimeline({ hasMore: true })

    expect(screen.getByRole('button', { name: more })).toBeTruthy() // témoin
    expect(screen.queryByText(firstVersion)).toBeNull()

    await rerender(
      <UpdateTimeline
        updates={three}
        publishedAt={PUBLISHED_AT}
        toSource={toSource}
        hasMore={false}
        onMore={() => {}}
        loadingMore={false}
      />,
    )
    expect(screen.getByText(firstVersion)).toBeTruthy()
    expect(orderOf(firstVersion)).toBeGreaterThan(orderOf('Les étoiles'))
  })

  // Scénario : « la frise montre 20 mises à jour, puis « Afficher la suite » ».
  it('asks for the next page once on « Afficher la suite »', async () => {
    const onMore = jest.fn()
    await renderTimeline({ hasMore: true, onMore })

    await fireEvent.press(screen.getByRole('button', { name: more }))

    expect(onMore).toHaveBeenCalledTimes(1)
  })

  it('offers no « Afficher la suite » at the end', async () => {
    await renderTimeline({ hasMore: false })

    expect(screen.getByText(firstVersion)).toBeTruthy() // témoin
    expect(screen.queryByRole('button', { name: more })).toBeNull()
  })

  it('does not ask again while the next page is loading', async () => {
    const onMore = jest.fn()
    await renderTimeline({ hasMore: true, loadingMore: true, onMore })

    expect(screen.getByText('Les étoiles')).toBeTruthy() // témoin : la frise est là
    const button = screen.queryByRole('button', { name: more })
    if (button) await fireEvent.press(button)

    expect(onMore).not.toHaveBeenCalled()
  })

  // Relecture du plan, interface A4 : `it('keeps the shown updates and offers to retry when the
  // next page fails')`.
  it('keeps the shown updates and offers to retry when the next page fails', async () => {
    const onMore = jest.fn()
    await renderTimeline({ hasMore: true, moreError: true, onMore })

    for (const one of three) expect(screen.getByText(one.title ?? '')).toBeTruthy()
    expect(screen.getByText(moreError)).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: retry }))
    expect(onMore).toHaveBeenCalledTimes(1)
  })

  // Scénario : « l'auteur a une corbeille sur chaque mise à jour ».
  it('gives the author a trash button on each update, which names it', async () => {
    const onDelete = jest.fn()
    await renderTimeline({ onDelete })

    for (const one of three) {
      expect(screen.getByRole('button', { name: deleteLabel(one.title ?? '') })).toBeTruthy()
    }
    await fireEvent.press(screen.getByRole('button', { name: deleteLabel('Le mode nuit') }))
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledWith(three[1])
  })

  it('gives no trash button to another member', async () => {
    await renderTimeline()

    expect(screen.getByText('Le mode nuit')).toBeTruthy() // témoin
    expect(screen.queryByRole('button', { name: deleteLabel('Le mode nuit') })).toBeNull()
  })

  // Scénario : « pendant la suppression, une seconde tape n'envoie rien ».
  it('does not delete again the update being deleted', async () => {
    const onDelete = jest.fn()
    await renderTimeline({ onDelete, deletingId: three[1]?.id })

    expect(screen.getByText('Le mode nuit')).toBeTruthy() // témoin : la mise à jour est là
    const trash = screen.queryByRole('button', { name: deleteLabel('Le mode nuit') })
    if (trash) await fireEvent.press(trash)

    expect(onDelete).not.toHaveBeenCalled()
  })
})

// Relecture du plan, interface A4 : `it('moves focus to the first arrived update after « Afficher
// la suite »')`. Le geste du membre est rejoué par `turnThePage` (testing/arrivedFocus.tsx).
describe('UpdateTimeline, focus', () => {
  let restore: () => void
  beforeEach(() => {
    restore = lendWebPage()
  })
  afterEach(() => {
    restore()
    jest.restoreAllMocks()
  })

  const draw = (names: string[], state: PageState) => (
    <UpdateTimeline
      updates={names.map(update)}
      publishedAt={PUBLISHED_AT}
      toSource={toSource}
      hasMore={state !== 'end'}
      loadingMore={state === 'loading'}
      onMore={() => {}}
    />
  )

  it('moves focus to the first arrived update after « Afficher la suite »', async () => {
    const first = ['Carnet 1', 'Carnet 2', 'Carnet 3']
    const focused = await turnThePage(draw, first, [...first, 'Carnet 4', 'Carnet 5'])

    expect(focused).toEqual(['Carnet 4'])
  })

  // Relecture du plan, interface A4 : `it('moves focus to the next update after a deletion')`.
  it('moves focus to the next update after a deletion', async () => {
    const names = ['Carnet 1', 'Carnet 2', 'Carnet 3']
    const page = (shown: string[]) => (
      <>
        <View ref={probe} />
        <UpdateTimeline
          updates={shown.map((name) => update(name, names.indexOf(name)))}
          publishedAt={PUBLISHED_AT}
          toSource={toSource}
          hasMore={false}
          loadingMore={false}
          onMore={() => {}}
          onDelete={() => {}}
        />
      </>
    )
    const probe = createRef<View>()
    const view = await renderWithProviders(page(names))
    // Toutes les vues natives partagent le prototype de la vue témoin : on y écoute `focus`.
    const proto = Object.getPrototypeOf(probe.current) as { focus?: () => void }
    const hadFocus = Object.hasOwn(proto, 'focus')
    if (typeof proto.focus !== 'function') proto.focus = () => {}
    const focus = jest.spyOn(proto as { focus: () => void }, 'focus')
    try {
      const trash = screen.getByRole('button', { name: deleteLabel('Carnet 2') })
      await fireEvent(trash, 'focus')
      await fireEvent.press(trash)
      // La suppression réussit : la mise à jour quitte la frise.
      await view.rerender(page(['Carnet 1', 'Carnet 3']))

      const focused = focus.mock.contexts
        .map(labelOf)
        .filter((label) => label?.startsWith('Carnet'))
      expect(focused).toEqual(['Carnet 3'])
    } finally {
      focus.mockRestore()
      if (!hadFocus) delete proto.focus
    }
  })
})
