// Tests du focus en bas d'une liste (`FeedEnd`), tranche RF, relecture juridique du plan jur-RF2.
// Depuis RF, les listes finissent sans phrase (« C'est tout » et « Tu es à jour » retirés, T3 et
// T4) : `endLabel` est facultatif. Avant, quand la dernière page arrivait, le focus du clavier passait
// du bouton « Afficher la suite », qui disparaît, à la phrase de fin. Sans phrase, il ne doit pas
// retomber sur toute la page (`body`) : il va à la première carte arrivée avec cette dernière page,
// là où la lecture continue.
//
// L'interface attendue (nom choisi au plan des tests, que le composant doit suivre) : la liste donne à
// FeedEnd la vue de la première carte arrivée, `firstArrived` (une ref), et FeedEnd y pose le focus,
// sans faire défiler la page (preventScroll).
//
// Jest n'a pas de navigateur : on prête à la page web le peu que FeedEnd en lit (l'élément qui a le
// focus, et « ce bouton contient-il le focus ? »), et on écoute `focus` sur les vues natives.
import { fireEvent, screen } from '@testing-library/react-native'
import { createRef, type RefObject } from 'react'
import { Platform, View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { FeedEnd } from './FeedEnd'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const MORE = 'Afficher la suite'
const END = 'Tu as tout lu'

type State = 'more' | 'loading' | 'end'

/** Une liste : la carte arrivée avec la dernière page, puis le bas de la liste. */
const list = (state: State, arrived: RefObject<View | null>, endLabel?: string) => (
  <>
    <View ref={arrived} accessibilityRole="link" accessibilityLabel="Le carnet de jardin" />
    <FeedEnd
      state={state}
      moreLabel={MORE}
      onMore={() => {}}
      firstArrived={arrived}
      {...(endLabel ? { endLabel } : null)}
    />
  </>
)

/** La page web prêtée : un élément a le focus, et toute vue dit le contenir. */
type Patched = { contains?: unknown; focus?: unknown }
let proto: Patched
let hadContains: boolean
let originalContains: unknown

/**
 * Une page web prêtée, complète en apparence (piège de code-appli.md : un `document` partiel fait
 * tomber ThemeProvider) : tout ce qu'on y lit est un objet qui accepte tout, sauf l'élément qui a
 * le focus.
 */
const loose = (): unknown =>
  new Proxy(() => {}, {
    get: (_target, key) =>
      key === Symbol.toPrimitive ? () => '' : key === 'then' ? undefined : loose(),
    set: () => true,
    apply: () => loose(),
  })
const fakeDocument = () =>
  new Proxy({ activeElement: { focused: true } } as Record<string | symbol, unknown>, {
    get: (target, key) => (key in target ? target[key] : loose()),
    set: () => true,
  })

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'web')
  ;(globalThis as { document?: unknown }).document = fakeDocument()
})

afterEach(() => {
  if (proto) {
    if (hadContains) proto.contains = originalContains
    else delete proto.contains
  }
  delete (globalThis as { document?: unknown }).document
  jest.restoreAllMocks()
})

/**
 * Prépare les vues natives du rendu : « contient le focus » vaut oui (le bouton l'a), et chaque
 * `focus` est écouté. Rend l'espion, dont `mock.contexts` dit quelle vue a reçu le focus.
 */
const watchFocus = (arrived: RefObject<View | null>) => {
  const view = arrived.current as unknown as Patched | null
  if (!view) throw new Error('The arrived card is not mounted')
  proto = Object.getPrototypeOf(view) as Patched
  hadContains = Object.hasOwn(proto, 'contains')
  originalContains = proto.contains
  proto.contains = () => true
  if (typeof proto.focus !== 'function') proto.focus = () => {}
  return jest.spyOn(proto as { focus: () => void }, 'focus')
}

/** Le membre touche « Afficher la suite » au clavier : le bouton a le focus, puis l'appui. */
const pressMore = async () => {
  const button = screen.getByRole('button', { name: MORE })
  await fireEvent(button, 'focus')
  await fireEvent.press(button)
}

describe('FeedEnd focus when the last page arrives (jur-RF2)', () => {
  it('moves the focus to the first card that arrived, when the list ends without a sentence', async () => {
    const arrived = createRef<View>()
    const view = await renderWithProviders(list('more', arrived))
    const focus = watchFocus(arrived)

    await pressMore()
    await view.rerender(list('loading', arrived))
    await view.rerender(list('end', arrived))

    // Témoin : le bouton a disparu, la liste est finie.
    expect(screen.queryByRole('button', { name: MORE })).toBeNull()
    expect(focus.mock.contexts).toContain(arrived.current)
  })

  it('does not scroll the page to that card', async () => {
    const arrived = createRef<View>()
    const view = await renderWithProviders(list('more', arrived))
    const focus = watchFocus(arrived)

    await pressMore()
    await view.rerender(list('loading', arrived))
    await view.rerender(list('end', arrived))

    const call = focus.mock.calls[focus.mock.contexts.indexOf(arrived.current)] as unknown[]
    expect(call?.[0]).toEqual(expect.objectContaining({ preventScroll: true }))
  })

  it('still moves the focus to the end sentence when there is one (witness)', async () => {
    const arrived = createRef<View>()
    const view = await renderWithProviders(list('more', arrived, END))
    const focus = watchFocus(arrived)

    await pressMore()
    await view.rerender(list('loading', arrived, END))
    await view.rerender(list('end', arrived, END))

    expect(screen.getByText(END)).toBeTruthy()
    expect(focus).toHaveBeenCalled()
    expect(focus.mock.contexts).not.toContain(arrived.current)
  })

  it('leaves the focus alone when « Afficher la suite » did not have it', async () => {
    const arrived = createRef<View>()
    const view = await renderWithProviders(list('more', arrived))
    const focus = watchFocus(arrived)
    // Le focus est ailleurs : aucun bouton ne le contient.
    proto.contains = () => false

    // Un toucher du doigt, sans focus du clavier.
    await fireEvent.press(screen.getByRole('button', { name: MORE }))
    await view.rerender(list('loading', arrived))
    await view.rerender(list('end', arrived))

    expect(screen.queryByRole('button', { name: MORE })).toBeNull() // témoin
    // La carte arrivée ne prend pas le focus : le membre lisait ailleurs.
    expect(focus.mock.contexts).not.toContain(arrived.current)
  })
})
