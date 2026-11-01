// Tests du toast (refonte, tranche R1) : une courte phrase en verre (« Projet publié ») qui
// s'affiche au moins 2,4 secondes puis s'efface. Les lecteurs d'écran l'annoncent sans qu'il prenne
// le focus ; un seul à la fois ; jamais de bouton dedans, car un geste qui disparaît tout seul
// serait perdu pour qui lit lentement (règle J8, WCAG 2.2.1) ; un texte long reste plus longtemps.
// Le toast ne reçoit que du texte (S7) : jamais un élément React, jamais du HTML interprété.
//
// Les « faux minuteurs » de Jest (jest.useFakeTimers) remplacent l'horloge : le test avance le
// temps à la main (advanceTimersByTime) au lieu d'attendre vraiment 2,4 secondes.
import { durations } from '@ruche/brand'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { AccessibilityInfo, Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Text } from './Text'
import { ToastProvider, useToast } from './theme/toast'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// « Réduire les animations » : le réglage de l'appareil, que chaque test choisit. Le préfixe `mock`
// permet à Jest de lire cette variable dans le remplacement du module, remonté en tête du fichier.
let mockCalm = false
jest.mock('./theme/motion', () => ({
  ...jest.requireActual('./theme/motion'),
  useCalmMotion: () => mockCalm,
}))

type Show = ReturnType<typeof useToast>['show']

// La fonction `show` du toast, attrapée par un petit composant posé dans le fournisseur, comme un
// écran l'obtiendrait par useToast().
let show: Show = () => {}
function Grab() {
  show = useToast().show
  return null
}

const renderToasts = () =>
  renderWithProviders(
    <ToastProvider>
      <Grab />
    </ToastProvider>,
  )

/** Affiche un toast, comme le ferait un écran après un geste réussi. */
const showToast = (text: string) =>
  act(() => {
    show(text)
  })

/** Avance l'horloge des faux minuteurs. */
const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms))

// Le départ en fondu, après le temps de lecture : il reste de quoi finir, mais pas un second toast.
const fadeOut = durations.long

/**
 * Le toast est-il annoncé ? On remonte les parents du texte jusqu'à un statut ou une région vivante,
 * quel que soit le composant (aide reprise de ChangeEmailScreen.test.tsx).
 */
const announced = (element: { parent: unknown; props: Record<string, unknown> }): boolean => {
  for (
    let node = element as { parent: unknown; props: Record<string, unknown> } | null;
    node;
    node = node.parent as typeof node
  ) {
    const { role, accessibilityRole, accessibilityLiveRegion } = node.props
    const values: unknown[] = [
      role,
      accessibilityRole,
      node.props['aria-live'],
      accessibilityLiveRegion,
    ]
    if (values.some((value) => ['status', 'polite'].includes(String(value)))) return true
  }
  return false
}

/** Une propriété posée sur le texte ou sur l'un de ses parents. */
const inherited = (
  element: { parent: unknown; props: Record<string, unknown> },
  prop: string,
): unknown[] => {
  const found: unknown[] = []
  for (
    let node = element as { parent: unknown; props: Record<string, unknown> } | null;
    node;
    node = node.parent as typeof node
  ) {
    if (node.props[prop] !== undefined) found.push(node.props[prop])
  }
  return found
}

beforeEach(() => {
  mockCalm = false
  jest.useFakeTimers()
})
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('Toast', () => {
  it('shows the sentence it is given', async () => {
    await renderToasts()

    await showToast('Projet publié')

    expect(screen.getByText('Projet publié')).toBeTruthy()
  })

  it('stays at least 2.4 seconds, then leaves', async () => {
    await renderToasts()
    await showToast('Projet publié')

    await wait(durations.toast - 100)
    expect(screen.getByText('Projet publié')).toBeTruthy()

    await wait(100 + fadeOut)
    expect(screen.queryByText('Projet publié')).toBeNull()
  })

  it('stays longer when the sentence is long: 60 ms more per character beyond 20', async () => {
    // Le temps de lecture grandit avec le texte (J8) ; un texte court garde les 2,4 secondes.
    const long = 'Ton projet est publié et toute ta ruche pourra le découvrir dès ce soir'
    const expected = durations.toast + (long.length - 20) * 60
    await renderToasts()
    await showToast(long)

    // Bien après le départ d'un toast court, le long est toujours là.
    await wait(expected - 100)
    expect(screen.getByText(long)).toBeTruthy()

    await wait(100 + fadeOut)
    expect(screen.queryByText(long)).toBeNull()
  })

  it('shows one toast at a time: a new one replaces the previous', async () => {
    await renderToasts()
    await showToast('Projet publié')
    await wait(durations.toast - 400)

    await showToast('Lien copié')

    expect(screen.queryByText('Projet publié')).toBeNull()
    expect(screen.getByText('Lien copié')).toBeTruthy()
    // Le nouveau a droit à tout son temps de lecture, pas au reste de celui d'avant.
    await wait(durations.toast - 100)
    expect(screen.getByText('Lien copié')).toBeTruthy()
  })

  it('shows markup as plain text, never as formatting', async () => {
    // Le toast affiche du texte (S7) : des balises restent des caractères, jamais du HTML.
    await renderToasts()

    await showToast('<b>x</b>')

    expect(screen.getByText('<b>x</b>')).toBeTruthy()
  })

  it('has no button: nothing to do that would vanish with it', async () => {
    await renderToasts()

    await showToast('Projet publié')

    expect(screen.getByText('Projet publié')).toBeTruthy() // témoin
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('only takes a plain text, never an element nor an action (checked by tsc)', () => {
    // Vérifié par le typage (tsc) : si l'une de ces règles saute, la directive @ts-expect-error
    // devient elle-même une erreur. Le corps n'est jamais appelé.
    const misuses = (toast: Show) => {
      // @ts-expect-error : un élément React est refusé, seul un texte passé par t() s'affiche (S7).
      toast(<Text>Projet publié</Text>)
      // @ts-expect-error : un toast n'a pas d'action (J8) : un geste qui disparaît serait perdu.
      toast('Projet supprimé', { action: { label: 'Annuler', onPress: () => {} } })
    }
    expect(typeof misuses).toBe('function')
  })

  describe('announced to screen readers, without taking the focus', () => {
    it('is a polite status on the web', async () => {
      jest.replaceProperty(Platform, 'OS', 'web')
      await renderToasts()

      await showToast('Projet publié')

      const text = screen.getByText('Projet publié')
      expect(announced(text)).toBe(true)
      // Jamais de focus : rien de focalisable autour du texte.
      expect(inherited(text, 'tabIndex')).toEqual([])
    })

    it('is a polite live region on Android', async () => {
      jest.replaceProperty(Platform, 'OS', 'android')
      await renderToasts()

      await showToast('Projet publié')

      expect(inherited(screen.getByText('Projet publié'), 'accessibilityLiveRegion')).toContain(
        'polite',
      )
    })

    it('is read aloud on iOS, without moving the focus', async () => {
      jest.replaceProperty(Platform, 'OS', 'ios')
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility')
      const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      await renderToasts()

      await showToast('Projet publié')

      expect(announce).toHaveBeenCalledWith('Projet publié')
      expect(focus).not.toHaveBeenCalled()
    })
  })

  describe('on the web, under the mouse', () => {
    // Les événements de survol de chaque façon de l'écrire (Pressable, vue de react-native-web,
    // pointeur) : le test ne dépend pas de celle que le composant choisit.
    const hover = async (text: string) => {
      for (const name of ['hoverIn', 'mouseEnter', 'pointerEnter']) {
        await fireEvent(screen.getByText(text), name, {})
      }
    }
    const leave = async (text: string) => {
      for (const name of ['hoverOut', 'mouseLeave', 'pointerLeave']) {
        await fireEvent(screen.getByText(text), name, {})
      }
    }

    it('stays while the mouse is over it, then leaves after its reading time', async () => {
      jest.replaceProperty(Platform, 'OS', 'web')
      await renderToasts()
      await showToast('Projet publié')

      await wait(durations.toast - 400)
      await hover('Projet publié')
      await wait(durations.toast * 2)
      expect(screen.getByText('Projet publié')).toBeTruthy()

      await leave('Projet publié')
      await wait(durations.toast + fadeOut)
      expect(screen.queryByText('Projet publié')).toBeNull()
    })
  })

  describe('with reduced motion', () => {
    it('still shows, announces and removes the toast on time', async () => {
      // Le toast apparaît alors en fondu, sans ressort ; ce qu'il dit et sa durée ne changent pas.
      mockCalm = true
      jest.replaceProperty(Platform, 'OS', 'web')
      await renderToasts()

      await showToast('Projet publié')
      expect(announced(screen.getByText('Projet publié'))).toBe(true)

      await wait(durations.toast - 100)
      expect(screen.getByText('Projet publié')).toBeTruthy()
      await wait(100 + fadeOut)
      expect(screen.queryByText('Projet publié')).toBeNull()
    })
  })
})
