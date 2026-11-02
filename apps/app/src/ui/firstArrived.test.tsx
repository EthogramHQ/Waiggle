// Tests de `useFirstArrived` et de la cible du focus de `FeedEnd` (tranche RF, jur-RF2) : la
// première carte arrivée avec la dernière page d'une liste, où le focus du clavier va quand
// « Afficher la suite » disparaît sans phrase de fin. `FeedEnd.test.tsx` vérifie que le focus va à
// la vue donnée ; ici, quelle vue la liste donne (le rang), et où le focus se pose dans une vraie
// page web, où la case d'une carte n'est pas elle-même atteignable au clavier (son lien l'est).
import { fireEvent, renderHook, screen } from '@testing-library/react-native'
import { createRef, type RefObject } from 'react'
import { Platform, View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { FeedEnd, useFirstArrived } from './FeedEnd'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('useFirstArrived', () => {
  type Props = { count: number; loading: boolean }
  const start = (initialProps: Props) =>
    renderHook(({ count, loading }: Props) => useFirstArrived(count, loading), { initialProps })

  it('points at nothing before any page was asked for', async () => {
    const { result } = await start({ count: 20, loading: false })
    expect(result.current.index).toBeNull()
  })

  it('points at the first item of the page that arrived', async () => {
    const { result, rerender } = await start({ count: 20, loading: false })
    await rerender({ count: 20, loading: true })
    await rerender({ count: 27, loading: false })
    // Les 20 premiers étaient là : la page arrivée commence au rang 20.
    expect(result.current.index).toBe(20)
  })

  it('follows the last page when several pages are read one after the other', async () => {
    const { result, rerender } = await start({ count: 20, loading: false })
    await rerender({ count: 20, loading: true })
    await rerender({ count: 40, loading: false })
    await rerender({ count: 40, loading: true })
    await rerender({ count: 45, loading: false })
    expect(result.current.index).toBe(40)
  })

  it('points at the last item when the last page arrives empty', async () => {
    const { result, rerender } = await start({ count: 20, loading: false })
    await rerender({ count: 20, loading: true })
    await rerender({ count: 20, loading: false })
    // Rien de neuf : la lecture reprend à la dernière carte, jamais à toute la page.
    expect(result.current.index).toBe(19)
  })
})

describe('FeedEnd focus target in a web page (jur-RF2)', () => {
  // Le peu d'un élément de page web que FeedEnd lit sur la case de la carte arrivée.
  type FakeElement = {
    focus: jest.Mock
    matches: (selector: string) => boolean
    querySelector: (selector: string) => FakeElement | null
    setAttribute: jest.Mock
  }
  const element = (inner: FakeElement | null = null, tabbable = false): FakeElement => ({
    focus: jest.fn(),
    matches: () => tabbable,
    querySelector: () => inner,
    setAttribute: jest.fn(),
  })

  type Patched = { contains?: unknown }
  let proto: Patched | undefined
  let hadContains = false
  let originalContains: unknown

  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web')
    // Une page prêtée : l'élément qui a le focus (FeedEnd demande au bouton s'il le contient).
    // Complète en apparence (un `document` partiel fait tomber ThemeProvider) : tout le reste est
    // un objet qui accepte tout, comme dans FeedEnd.test.tsx.
    const loose = (): unknown =>
      new Proxy(() => {}, {
        get: (_target, key) =>
          key === Symbol.toPrimitive ? () => '' : key === 'then' ? undefined : loose(),
        set: () => true,
        apply: () => loose(),
      })
    ;(globalThis as { document?: unknown }).document = new Proxy(
      { activeElement: {} } as Record<string | symbol, unknown>,
      { get: (target, key) => (key in target ? target[key] : loose()), set: () => true },
    )
  })

  afterEach(() => {
    if (proto) {
      if (hadContains) proto.contains = originalContains
      else delete proto.contains
    }
    delete (globalThis as { document?: unknown }).document
    jest.restoreAllMocks()
  })

  /** Le bas de liste, la case de la carte arrivée étant `arrived` (un élément de page prêté). */
  // Une vue native témoin : les vues que FeedEnd lit par `ref` partagent son prototype.
  const probe = createRef<View>()
  const end = (state: 'more' | 'loading' | 'end', arrived: RefObject<View | null>) => (
    <>
      <View ref={probe} />
      <FeedEnd
        state={state}
        moreLabel="Afficher la suite"
        onMore={() => {}}
        firstArrived={arrived}
      />
    </>
  )

  /** Le membre prend « Afficher la suite » au clavier, puis la dernière page arrive. */
  const readToTheEnd = async (arrived: RefObject<View | null>) => {
    const view = await renderWithProviders(end('more', arrived))
    const button = screen.getByRole('button', { name: 'Afficher la suite' })
    // Le bouton dit contenir le focus : c'est lui qui l'a (comme toute vue native du rendu).
    proto = Object.getPrototypeOf(probe.current) as Patched
    hadContains = Object.hasOwn(proto, 'contains')
    originalContains = proto.contains
    proto.contains = () => true
    await fireEvent(button, 'focus')
    await fireEvent.press(button)
    await view.rerender(end('loading', arrived))
    await view.rerender(end('end', arrived))
  }

  it('focuses the link inside the card, not the card frame', async () => {
    const link = element(null, true)
    const frame = element(link)
    await readToTheEnd({ current: frame as unknown as View })

    expect(link.focus).toHaveBeenCalledWith(expect.objectContaining({ preventScroll: true }))
    expect(frame.focus).not.toHaveBeenCalled()
  })

  it('focuses the frame itself when the card has nothing to reach with Tab, without making it a Tab stop', async () => {
    const frame = element(null)
    await readToTheEnd({ current: frame as unknown as View })

    expect(frame.setAttribute).toHaveBeenCalledWith('tabindex', '-1')
    expect(frame.focus).toHaveBeenCalledWith(expect.objectContaining({ preventScroll: true }))
  })
})
