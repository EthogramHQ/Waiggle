// Tests de « Tu es à jour » (R4, F-Fil5, planche R4-Fil-AJour) : la sphère de miel posée dans le
// fil avant le premier élément déjà vu. Ce qu'un membre et un lecteur d'écran en perçoivent :
// - un titre de section (niveau 2), car il coupe le fil en deux listes (relecture de l'interface,
//   ui-B6) ;
// - pas de phrase qui redise le titre (« Tu as tout vu… », retirée en RF, T1), donc jamais de
//   « dernière visite » au tout premier passage (relecture juridique jur-J1) ;
// - « Explorer d'autres projets » en bouton secondaire, jamais le miel principal : le message reste
//   « tu peux t'arrêter » (jur-J9), et l'indication « Les nouveautés s'afficheront en haut du fil. » ;
// - rien d'annoncé, et le focus jamais pris : la sphère se rencontre en faisant défiler, elle
//   n'interrompt pas la lecture (ui-B6, comme `FeedEnd`).
import { palettes } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { focusAndReveal, focusWithoutScroll } from './focus'
import { UpToDate } from './UpToDate'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Les deux façons de poser le focus du clavier (ui/focus.ts) sont observées : « Tu es à jour » ne
// doit jamais s'en servir.
jest.mock('./focus', () => ({
  ...jest.requireActual('./focus'),
  focusWithoutScroll: jest.fn(() => true),
  focusAndReveal: jest.fn(),
}))

const title = fr.t(($) => $.feed.upToDate.title)
const action = fr.t(($) => $.feed.upToDate.action)
const hint = fr.t(($) => $.feed.upToDate.hint)

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; children: (Node | string)[] }

/** Tous les nœuds sous `node`, lui compris. */
const everyNode = (node: Node | string): Node[] =>
  typeof node === 'string' ? [] : [node, ...node.children.flatMap(everyNode)]

/** Les couleurs de fond de l'élément et de tout ce qu'il contient (même mesure que FollowButton). */
const backgrounds = (node: Node): unknown[] =>
  everyNode(node)
    .map(
      (each) =>
        (StyleSheet.flatten(each.props.style as never) as { backgroundColor?: unknown } | undefined)
          ?.backgroundColor,
    )
    .filter((value) => value !== undefined)

beforeEach(() => {
  jest.mocked(focusWithoutScroll).mockClear()
  jest.mocked(focusAndReveal).mockClear()
})
afterEach(() => jest.restoreAllMocks())

describe('UpToDate', () => {
  it('says « Tu es à jour » as a level 2 heading (web)', async () => {
    // Le niveau (`aria-level`) n'existe que sur le web, où il donne une vraie balise <h2>.
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(<UpToDate onExplore={jest.fn()} />)

    expect(screen.getByRole('header', { name: title }).props['aria-level']).toBe(2)
  })

  // RF (T1) : le titre, puis l'indication des nouveautés ; aucune phrase qui le redise, et donc
  // jamais de « dernière visite » (jur-J1).
  it('says only its title and the hint about news, never « Tu as tout vu »', async () => {
    await renderWithProviders(<UpToDate onExplore={jest.fn()} />)

    expect(screen.getByText(hint)).toBeTruthy()
    expect(screen.queryByText(/Tu as tout vu/, { includeHiddenElements: true })).toBeNull()
    expect(screen.queryByText(/dernière visite/, { includeHiddenElements: true })).toBeNull()
  })

  it('offers « Explorer d’autres projets », which leads to explore', async () => {
    const onExplore = jest.fn()
    await renderWithProviders(<UpToDate onExplore={onExplore} />)

    await fireEvent.press(screen.getByRole('button', { name: action }))

    expect(onExplore).toHaveBeenCalledTimes(1)
  })

  // jur-J9 : un bouton secondaire, jamais le miel d'une action principale.
  it('makes « Explorer d’autres projets » a secondary button, never the main honey (jur-J9)', async () => {
    await renderWithProviders(<UpToDate onExplore={jest.fn()} />)

    const button = screen.getByRole('button', { name: action }) as unknown as Node
    expect(backgrounds(button)).not.toContain(palettes.day.honey)
  })

  // ui-B6 : la sphère se rencontre en défilant ; rien n'est lu à voix haute de lui-même.
  it('announces nothing: no alert, no live region, nothing read aloud', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility')
    announce.mockClear()
    await renderWithProviders(<UpToDate onExplore={jest.fn()} />)

    expect(screen.getByRole('header', { name: title })).toBeTruthy() // témoin
    expect(screen.queryByRole('alert')).toBeNull()
    const live = everyNode(screen.root as unknown as Node).filter((node) => {
      const region = node.props.accessibilityLiveRegion ?? node.props['aria-live']
      return region === 'polite' || region === 'assertive'
    })
    expect(live).toHaveLength(0)
    expect(announce).not.toHaveBeenCalled()
  })

  it('never takes the keyboard focus (web)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(<UpToDate onExplore={jest.fn()} />)

    expect(screen.getByRole('header', { name: title })).toBeTruthy() // témoin
    expect(focusWithoutScroll).not.toHaveBeenCalled()
    expect(focusAndReveal).not.toHaveBeenCalled()
    const autoFocused = everyNode(screen.root as unknown as Node).filter(
      (node) => node.props.autoFocus === true,
    )
    expect(autoFocused).toHaveLength(0)
  })

  it('speaks the language of the app', async () => {
    await renderWithProviders(<UpToDate onExplore={jest.fn()} />, 'en')

    expect(screen.getByRole('header', { name: 'You’re all caught up' })).toBeTruthy()
  })
})
