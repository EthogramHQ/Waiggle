// Tests du toast et de la place flottante de Screen (R5a, relecture de l'interface du plan ui-1) :
// sur la page projet, la capsule des réactions flotte en bas de l'écran (`floating` de Screen), là
// même où se pose un toast (« Prompt copié », « Lien copié »). Le toast monte donc au-dessus de la
// place flottante quand elle existe, comme il monte au-dessus de la barre d'onglets
// (toast.tabbar.test.tsx) ; sans elle, il garde sa place habituelle.
//
// Sur le web, la page quittée reste montée, cachée, sous la nouvelle : sa capsule ne doit plus
// soulever le toast de la page affichée (useScreenFocused, ui/screenFocus.ts).
//
// Jest ne calcule aucune position : on donne une hauteur à la place flottante comme le ferait
// l'appareil (son `onLayout`), puis on lit le décalage du bas posé sur la couche du toast.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { StyleSheet } from 'react-native'
import { renderWithProviders, setDesktopWindow } from '../../testing/render'
import { Button } from '../Button'
import { Screen } from '../Screen'
import { useScreenFocused } from '../screenFocus'
import { Text } from '../Text'
import { ToastProvider, useToast } from './toast'

jest.mock('../../accounts/api', () => ({ useSession: jest.fn() }))
// Si la page de l'écran est celle qui est affichée (useIsFocused d'Expo Router, derrière une aide
// qui répond « oui » hors d'un navigateur) : remplacée ici.
jest.mock('../screenFocus', () => ({ useScreenFocused: jest.fn() }))

beforeEach(() => {
  jest.mocked(useScreenFocused).mockReset().mockReturnValue(true)
})

// Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'expose pas le type complet).
type Node = {
  type: unknown
  props: Record<string, unknown>
  parent: Node | null
  children: (Node | string)[]
}

/** Le premier élément natif de ce type (« RCTScrollView », la zone qui défile de l'écran). */
const hostOfType = (type: string): Node => {
  let found: Node | undefined
  const visit = (node: Node | string) => {
    if (typeof node === 'string' || found) return
    if (node.type === type) found = node
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Node)
  if (!found) throw new Error(`No host element of type ${type}`)
  return found
}

const isInside = (node: Node, ancestor: Node): boolean => {
  for (let current: Node | null = node; current; current = current.parent) {
    if (current === ancestor) return true
  }
  return false
}

/** Le décalage du bas posé sur la couche du toast : on remonte du texte jusqu'au premier `bottom`. */
const bottomOf = (text: string): number | undefined => {
  let node = screen.getByText(text) as unknown as Node | null
  while (node) {
    const { bottom } = StyleSheet.flatten(node.props.style as never) ?? {}
    if (typeof bottom === 'number') return bottom
    node = node.parent
  }
  return undefined
}

/**
 * La place flottante prend une hauteur, comme l'appareil la mesurerait : le premier élément qui
 * mesure en remontant depuis son contenu, un ancêtre qui a `onLayout` ou une vue vide sœur posée
 * pour mesurer (même aide que dans Screen.floating.test.tsx). On s'arrête au premier ancêtre qui
 * porte aussi la zone qui défile : au-delà, ce qui mesure mesurerait tout l'écran.
 */
const measureFloating = async (content: Node, height: number) => {
  const layout = {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
    persist: () => {},
  }
  const scroller = hostOfType('RCTScrollView')
  let path: Node | null = content
  for (let node: Node | null = content.parent; node; path = node, node = node.parent) {
    if (isInside(scroller, node)) break
    const own = node.props.onLayout
    if (typeof own === 'function') {
      await act(async () => own(layout))
      return
    }
    const probe = node.children.find(
      (child): child is Node =>
        typeof child !== 'string' &&
        child !== path &&
        child.children.length === 0 &&
        typeof child.props.onLayout === 'function',
    )
    if (probe) {
      const onLayout = probe.props.onLayout as (event: typeof layout) => void
      await act(async () => onLayout(layout))
      return
    }
  }
  throw new Error('Nothing measures the floating place')
}

const CAPSULE = 'Waggle !, 21, ta réaction'
const COPIED = 'Prompt copié'

const Show = () => {
  const toast = useToast()
  return <Button label="Copier" onPress={() => toast.show(COPIED)} />
}

/** La page projet, réduite : un bouton qui montre un toast, et la capsule en place flottante. */
const ProjectPage = ({ floating = true }: { floating?: boolean }) => (
  <Screen
    width="page"
    floating={floating ? <Button label={CAPSULE} variant="glass" onPress={() => {}} /> : undefined}
  >
    <Text>La description du projet</Text>
    <Show />
  </Screen>
)

const capsule = () => screen.getByRole('button', { name: CAPSULE }) as unknown as Node

describe('the toast over the floating place', () => {
  it('rises above the floating place on a phone', async () => {
    await renderWithProviders(
      <ToastProvider>
        <ProjectPage />
      </ToastProvider>,
    )
    // Plus haute que la place habituelle du toast sur téléphone (104 points).
    await measureFloating(capsule(), 140)

    await fireEvent.press(screen.getByRole('button', { name: 'Copier' }))

    expect(bottomOf(COPIED)).toBeGreaterThan(140)
  })

  it('rises above the floating place on a computer', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(
        <ToastProvider>
          <ProjectPage />
        </ToastProvider>,
      )
      // Sur ordinateur, le toast se pose à 32 points du bas : la capsule de 88 le couvrirait.
      await measureFloating(capsule(), 88)

      await fireEvent.press(screen.getByRole('button', { name: 'Copier' }))

      expect(bottomOf(COPIED)).toBeGreaterThan(88)
    } finally {
      // Le retour au téléphone redessine l'écran encore monté : dans act().
      await act(async () => restore())
    }
  })

  it('keeps its usual place on a page without a floating place', async () => {
    await renderWithProviders(
      <ToastProvider>
        <ProjectPage floating={false} />
      </ToastProvider>,
    )

    await fireEvent.press(screen.getByRole('button', { name: 'Copier' }))

    expect(bottomOf(COPIED)).toBe(104)
  })

  it('comes back to its usual place once the floating page is gone', async () => {
    // Le membre quitte la page projet (sa capsule disparaît) pour une page sans place flottante.
    const Leave = () => {
      const [onProject, setOnProject] = useState(true)
      return (
        <>
          {onProject ? <ProjectPage /> : <ProjectPage floating={false} />}
          <Button label="Quitter" onPress={() => setOnProject(false)} />
        </>
      )
    }
    await renderWithProviders(
      <ToastProvider>
        <Leave />
      </ToastProvider>,
    )
    await measureFloating(capsule(), 140)

    await fireEvent.press(screen.getByRole('button', { name: 'Quitter' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Copier' }))

    expect(screen.queryByRole('button', { name: CAPSULE })).toBeNull() // témoin
    expect(bottomOf(COPIED)).toBe(104)
  })

  it('is not lifted by the floating place of a hidden page', async () => {
    // Sur le web, la page projet quittée reste montée sous la page affichée.
    jest.mocked(useScreenFocused).mockReturnValue(false)
    await renderWithProviders(
      <ToastProvider>
        <ProjectPage />
      </ToastProvider>,
    )
    await measureFloating(capsule(), 140)

    await fireEvent.press(screen.getByRole('button', { name: 'Copier' }))

    expect(bottomOf(COPIED)).toBe(104)
  })
})
