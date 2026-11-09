// La fenêtre « Supprimer « … » ? » d'un projet (R6a, projects/DeleteProjectDialog.tsx), seule : sa
// vignette à corbeille, une seule suppression sur une double tape, l'échec lu dans la fenêtre restée
// ouverte, et le focus rendu au contrôle qui l'a ouverte après Échap. La page du projet la teste
// aussi depuis son menu « … » (ProjectScreen.page.test.tsx).
import { act, fireEvent, screen, within } from '@testing-library/react-native'
import type { RefObject } from 'react'
import { Platform } from 'react-native'
import type { ApiResult } from '../api/errors'
import { passTapGuard } from '../testing/dialog'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import type { Focusable } from '../ui/focus'
import { iconPaths } from '../ui/icons.generated'
import { deleteProject } from './api'
import { DeleteProjectDialog } from './DeleteProjectDialog'

jest.mock('./api', () => ({ deleteProject: jest.fn() }))
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/projects/p1',
}))

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const all = () => hostsOf(screen.root as unknown as Host)

const project = { id: 'p1', title: 'Le ciel de ce soir', cover: null }
const title = fr.t(($) => $.project.page.deleteTitle, { title: project.title })
/** Le contenu de la fenêtre : le plus petit bloc qui porte son titre et « Annuler ». */
const theWindow = () => {
  let block = screen.getByRole('header', { name: title }).parent
  while (block && within(block).queryByRole('button', { name: 'Annuler' }) === null) {
    block = block.parent
  }
  if (!block) throw new Error('no window')
  return within(block)
}

const render = async (
  extra: Partial<Parameters<typeof DeleteProjectDialog>[0]> = {},
  visible = true,
) => {
  const onCancel = jest.fn()
  const onDeleted = jest.fn()
  const view = await renderWithProviders(
    <DeleteProjectDialog
      project={project}
      visible={visible}
      onCancel={onCancel}
      onDeleted={onDeleted}
      {...extra}
    />,
  )
  return { onCancel, onDeleted, ...view }
}

beforeEach(() => {
  jest.mocked(deleteProject).mockReset()
})

describe('DeleteProjectDialog', () => {
  it('shows the thumbnail with its trash badge, hidden from screen readers, under a title naming the project', async () => {
    await render()

    expect(screen.getByRole('header', { name: title })).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.project.page.deleteConfirm))).toBeTruthy()
    // La corbeille du badge est dessinée (son tracé), dans une vignette cachée aux lecteurs.
    const trash = all().filter((node) => node.props.d === iconPaths.trash[0])
    expect(trash).toHaveLength(1)
    expect(all().some((node) => node.props['aria-hidden'] === true)).toBe(true)
  })

  it('says the decision and the report copy stay a year for a removed project', async () => {
    await render({ project: { ...project, removed: true } })

    expect(screen.getByText(fr.t(($) => $.project.page.deleteConfirmRemoved))).toBeTruthy()
    expect(screen.queryByText(fr.t(($) => $.project.page.deleteConfirm))).toBeNull()
  })

  it('deletes once on a double tap, staying open and busy while it deletes', async () => {
    let finish: (result: ApiResult<null>) => void = () => {}
    jest.mocked(deleteProject).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const { onDeleted, onCancel, queryClient } = await render()
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries')
    await passTapGuard()

    const confirm = theWindow().getByRole('button', { name: 'Supprimer' })
    await fireEvent.press(confirm)
    await fireEvent.press(confirm)
    expect(deleteProject).toHaveBeenCalledTimes(1)
    expect(deleteProject).toHaveBeenCalledWith('p1')
    // Pendant l'envoi, « Annuler » attend et la fenêtre reste là.
    await fireEvent.press(theWindow().getByRole('button', { name: 'Annuler' }))
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByRole('header', { name: title })).toBeTruthy()

    await act(async () => finish({ ok: true, data: null }))
    expect(onDeleted).toHaveBeenCalledTimes(1)
    // Le fil se relit sans le projet.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['feed'] })
  })

  it('reads a failure in the window, which stays open, and lets the author try again', async () => {
    jest.mocked(deleteProject).mockResolvedValue({ ok: false, error: 'unavailable' })
    const { onDeleted } = await render()
    await passTapGuard()

    await fireEvent.press(theWindow().getByRole('button', { name: 'Supprimer' }))

    expect(theWindow().getByRole('alert')).toHaveTextContent(
      fr.t(($) => $.project.form.deleteError),
    )
    expect(onDeleted).not.toHaveBeenCalled()
    // Réessayer : la fenêtre renvoie la suppression.
    jest.mocked(deleteProject).mockResolvedValue({ ok: true, data: null })
    await fireEvent.press(theWindow().getByRole('button', { name: 'Supprimer' }))
    expect(deleteProject).toHaveBeenCalledTimes(2)
    expect(onDeleted).toHaveBeenCalledTimes(1)
  })

  it('gives the focus back to « Supprimer » after Escape (web)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    // Le contrôle qui a ouvert la fenêtre : le « Supprimer » de la page, vu par sa méthode focus.
    const focus = jest.fn()
    const opener = { current: { focus } as unknown as Focusable } as RefObject<Focusable | null>
    // Une page web prêtée : la fenêtre y écoute la touche enfoncée (`keydown`, à la capture).
    const listeners: Array<(event: object) => void> = []
    // Toute méthode y existe (une fausse fonction) ; <html>, <body> et <head> sont faits pareil.
    const node = (): Record<string | symbol, unknown> =>
      new Proxy({ style: { setProperty: jest.fn(), removeProperty: jest.fn() } } as never, {
        get(target: Record<string | symbol, unknown>, key) {
          if (key === 'then') return undefined
          if (!(key in target)) {
            target[key] =
              key === 'documentElement' || key === 'body' || key === 'head' ? node() : jest.fn()
          }
          return target[key]
        },
      })
    const page = node()
    page.addEventListener = (type: string, listener: (event: object) => void) => {
      if (type === 'keydown') listeners.push(listener)
    }
    Object.defineProperty(globalThis, 'document', { value: page, configurable: true })
    try {
      const { onCancel, rerender } = await render({ opener })
      const layer = all().find((node) => typeof node.props.onRequestClose === 'function')
      if (!layer) throw new Error('no Modal layer')
      const { onRequestClose, onDismiss } = layer.props as Record<string, () => void>

      // Échap enfoncée dans la fenêtre, puis relâchée (le Modal reçoit la touche relâchée).
      const escapeKey = { key: 'Escape', preventDefault: jest.fn() }
      await act(() => {
        for (const listener of listeners) listener(escapeKey)
      })
      await act(() => onRequestClose?.())
      expect(onCancel).toHaveBeenCalledTimes(1)
      expect(focus).not.toHaveBeenCalled() // pas avant que la fenêtre soit partie

      await rerender(
        <DeleteProjectDialog
          project={project}
          visible={false}
          onCancel={onCancel}
          onDeleted={jest.fn()}
          opener={opener}
        />,
      )
      // La fenêtre a fini son fondu : le Modal appelle onDismiss (le faux Modal de Jest ne le fait
      // pas lui-même).
      await act(() => onDismiss?.())
      expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    } finally {
      Reflect.deleteProperty(globalThis, 'document')
    }
  })
})
