// Le focus du clavier quand le bouton « 1 nouveau commentaire » s'en va (R21), sur le web : après un
// toucher, l'écran remet le nombre à 0 et le bouton disparaît. Si l'écran n'a posé le focus nulle
// part (il est retombé sur toute la page), il revient à la place du bouton, sans faire défiler la
// page ; s'il l'a posé ailleurs (le premier nouveau commentaire), on ne le lui reprend pas.
//
// Jest n'a pas de navigateur : on prête à la page web l'élément qui a le focus (`activeElement`) et
// son corps (`body`), et l'on écoute `focus` sur les vues natives (voir testing/arrivedFocus.tsx).
import { fireEvent, screen } from '@testing-library/react-native'
import { createRef, type ReactElement } from 'react'
import { Platform, View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { NewCommentsButton } from './NewCommentsButton'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Un objet qui accepte tout ce qu'on lui demande : le reste de la page prêtée. */
const loose = (): unknown =>
  new Proxy(() => {}, {
    get: (_target, key) =>
      key === Symbol.toPrimitive ? () => '' : key === 'then' ? undefined : loose(),
    set: () => true,
    apply: () => loose(),
  })

// Le corps de la page : ThemeProvider y écrit la couleur du fond (`style`).
const body = { style: {} }
/** La page prêtée : `activeElement` dit où est le focus (le corps : il s'est perdu). */
const page: { activeElement: unknown; body: unknown } = { activeElement: body, body }

type Patched = { focus?: unknown }

describe('NewCommentsButton, focus on the web', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web')
    page.activeElement = body
    ;(globalThis as { document?: unknown }).document = new Proxy(
      page as unknown as Record<string | symbol, unknown>,
      { get: (target, key) => (key in target ? target[key] : loose()), set: () => true },
    )
  })
  afterEach(() => {
    delete (globalThis as { document?: unknown }).document
    jest.restoreAllMocks()
  })

  /** Rend le bouton à `count`, et ce qui écoute `focus` sur toutes les vues natives du rendu. */
  async function setup(count: number) {
    // Une vue témoin : toutes les vues natives du rendu partagent son prototype.
    const probe = createRef<View>()
    const ui = (n: number, onPress = () => {}): ReactElement => (
      <>
        <View ref={probe} />
        <NewCommentsButton count={n} onPress={onPress} />
      </>
    )
    const view = await renderWithProviders(ui(count))
    const proto = Object.getPrototypeOf(probe.current) as Patched
    const hadFocus = Object.hasOwn(proto, 'focus')
    const original = proto.focus
    if (typeof proto.focus !== 'function') proto.focus = () => {}
    const focus = jest.spyOn(proto as { focus: (options?: object) => void }, 'focus')
    const cleanup = () => {
      focus.mockRestore()
      if (hadFocus) proto.focus = original
      else delete proto.focus
    }
    return { view, ui, focus, cleanup }
  }

  it('brings the focus back to its place, without scrolling, when the touched button goes', async () => {
    const { view, ui, focus, cleanup } = await setup(1)
    try {
      await fireEvent.press(screen.getByRole('button', { name: '1 nouveau commentaire' }))
      await view.rerender(ui(0))

      // Témoin : le bouton est bien parti.
      expect(screen.queryByRole('button')).toBeNull()
      expect(focus).toHaveBeenCalledTimes(1)
      expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    } finally {
      cleanup()
    }
  })

  it('leaves the focus where the screen put it', async () => {
    const { view, ui, focus, cleanup } = await setup(2)
    try {
      await fireEvent.press(screen.getByRole('button', { name: '2 nouveaux commentaires' }))
      // L'écran a donné le focus au premier nouveau commentaire.
      page.activeElement = { comment: true }
      await view.rerender(ui(0))

      expect(focus).not.toHaveBeenCalled()
    } finally {
      cleanup()
    }
  })

  it('moves nothing when the number drops to 0 without a touch', async () => {
    const { view, ui, focus, cleanup } = await setup(1)
    try {
      // Le membre a défilé lui-même jusqu'aux nouveaux : l'écran remet le nombre à 0.
      await view.rerender(ui(0))

      expect(screen.queryByRole('button')).toBeNull()
      expect(focus).not.toHaveBeenCalled()
    } finally {
      cleanup()
    }
  })
})
