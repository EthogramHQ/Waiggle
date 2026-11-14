// Le bouton « Retour » dans la tête d'une feuille (R9, planche `R9-Signaler`) : la feuille
// « Signaler » a deux étapes ; à la seconde (le motif), « Retour » en haut à gauche revient à la
// première (« Quelle partie ? »), et « Annuler » reste à droite. Revenir d'une étape ne ferme pas la
// feuille : ni `onClose`, ni `closeGuard`.
//
// L'API attendue (relecture du plan de R9, ui-P4) : `Sheet` gagne
//   back?: { label: string; onPress: () => void }
// dans son en-tête ; sans elle, rien ne change.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { Sheet } from './Sheet'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const TITLE = 'Signaler ce projet'
const BACK = 'Retour'

type Host = { type: unknown; parent: Host | null; children: ReadonlyArray<Host | string> }

/** Tous les éléments de l'arbre rendu, en profondeur : c'est l'ordre de lecture. */
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const rank = (element: unknown): number =>
  hostsOf(screen.root as unknown as Host).indexOf(element as Host)

const onBack = jest.fn()
const onClose = jest.fn()
const closeGuard = jest.fn()

beforeEach(() => {
  for (const fn of [onBack, onClose, closeGuard]) fn.mockClear()
})

const open = (
  options: { back?: boolean; cancelLabel?: string; guarded?: boolean; action?: boolean } = {},
) =>
  renderWithProviders(
    <Sheet
      open
      title={TITLE}
      onClose={onClose}
      {...(options.back === false ? null : { back: { label: BACK, onPress: onBack } })}
      {...(options.cancelLabel ? { cancelLabel: options.cancelLabel } : null)}
      {...(options.guarded ? { closeGuard } : null)}
      {...(options.action
        ? { action: { label: 'Envoyer le signalement', onPress: () => {} } }
        : null)}
    >
      <Text>Qu’est-ce qui ne va pas ?</Text>
    </Sheet>,
  )

describe('the back button in the head of a sheet', () => {
  it('shows « Retour » in the head, before the title, and calls it', async () => {
    await open()

    const back = screen.getByRole('button', { name: BACK })
    const title = screen.getByRole('header', { name: TITLE })
    expect(rank(back)).toBeLessThan(rank(title))
    await fireEvent.press(back)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('goes back without closing the sheet, nor asking to abandon', async () => {
    await open({ guarded: true })

    await fireEvent.press(screen.getByRole('button', { name: BACK }))

    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    expect(closeGuard).not.toHaveBeenCalled()
    expect(screen.getByRole('header', { name: TITLE })).toBeTruthy()
  })

  it('keeps « Annuler » next to « Retour », as on the board', async () => {
    await open({ cancelLabel: 'Annuler' })

    const back = screen.getByRole('button', { name: BACK })
    const cancel = screen.getByRole('button', { name: 'Annuler' })
    expect(rank(back)).toBeLessThan(rank(cancel))
    await fireEvent.press(cancel)
    expect(onBack).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the action of the sheet with « Retour »', async () => {
    await open({ cancelLabel: 'Annuler', action: true })

    expect(screen.getByRole('button', { name: BACK })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Envoyer le signalement' })).toBeTruthy()
  })

  it('has no « Retour » without the prop', async () => {
    await open({ back: false })

    // Témoin : la tête est là, avec son titre.
    expect(screen.getByRole('header', { name: TITLE })).toBeTruthy()
    expect(screen.queryByRole('button', { name: BACK })).toBeNull()
  })

  it('shows « Retour » on a computer too', async () => {
    const restore = setDesktopWindow()
    try {
      await open()

      await fireEvent.press(screen.getByRole('button', { name: BACK }))
      expect(onBack).toHaveBeenCalledTimes(1)
      expect(onClose).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })
})
