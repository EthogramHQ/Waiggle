// Tests du focus dans un texte replié, sur le web (relecture de R5b, ui-B2, ui-A1, sec-A4). Une
// pastille de mention sous le pli est un arrêt de Tab : le texte se déplie quand le focus l'atteint,
// au lieu de garder un focus invisible. Le navigateur, lui, ne fait plus défiler un cadre : les copies
// mesurées sont rognées par leur propre couche (l'essai dans le navigateur mesure `scrollTop`).
import { fireEvent, screen } from '@testing-library/react-native'
import { createRef } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { renderWithProviders as render } from '../testing/render'
import { ReadMore } from './ReadMore'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const LONG = 'Une ligne\n'.repeat(14).trim()

type Node = { props: Record<string, unknown>; children: (Node | string)[] }

/** Tous les éléments natifs du rendu. */
const hosts = (node: Node | string = screen.root as unknown as Node): Node[] =>
  typeof node === 'string' ? [] : [node, ...node.children.flatMap(hosts)]

const measuring = () => hosts().filter((node) => typeof node.props.onLayout === 'function')

const layout = async (view: Node | undefined, height: number) => {
  if (!view) throw new Error('vue mesurée attendue')
  await fireEvent(view as never, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 300, height } },
  })
}

/** Le texte a 14 lignes de 20 points, repliées à 10 : « Lire la suite » est là. */
const renderFolded = async () => {
  await render(<ReadMore>{(n) => <Text numberOfLines={n}>{LONG}</Text>}</ReadMore>)
  const [full, line] = measuring()
  await layout(full, 280)
  await layout(line, 20)
  return screen.getByRole('button', { name: 'Lire la suite' })
}

/**
 * Le focus entre dans le texte : le cadre descend jusqu'à 200 ; la pastille qui reçoit le focus
 * s'arrête à `bottom`.
 */
const focusPillEndingAt = async (bottom: number) => {
  await fireEvent(screen.getByText(LONG), 'focus', {
    target: { getBoundingClientRect: () => ({ bottom }) },
    currentTarget: { getBoundingClientRect: () => ({ bottom: 200 }) },
  })
}

describe('ReadMore, the focus inside a folded text (web)', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web')
  })
  afterEach(() => jest.restoreAllMocks())

  it('unfolds when the focus lands on a pill below the fold', async () => {
    await renderFolded()

    await focusPillEndingAt(320)

    // Le même bouton, qui dit maintenant « Réduire » : le texte entier est montré.
    expect(screen.getByRole('button', { name: 'Réduire' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Lire la suite' })).toBeNull()
  })

  it('stays folded when the focus lands on a pill of the shown lines', async () => {
    await renderFolded()

    // Le bas de la pastille dépasse d'un rien la dernière ligne (sa marge) : elle est bien montrée.
    await focusPillEndingAt(202)

    expect(screen.getByRole('button', { name: 'Lire la suite' })).toBeTruthy()
  })

  it('never lets the frame scroll: only the measured layer clips, at no height', async () => {
    await renderFolded()
    const flat = (node: Node) =>
      (StyleSheet.flatten(node.props.style as object) ?? {}) as Record<string, unknown>
    const [full] = measuring()
    const layer = hosts().find(
      (node) => node.props['aria-hidden'] === true && node.props.pointerEvents === 'none',
    )
    if (!layer || !full) throw new Error('couche mesurée attendue')

    expect(flat(layer)).toMatchObject({ position: 'absolute', height: 0, overflow: 'hidden' })
    // Rien d'autre n'a `overflow: hidden` autour du texte vu : le navigateur y ferait défiler le cadre.
    const clipped = hosts().filter(
      (node) =>
        node !== layer &&
        flat(node).overflow === 'hidden' &&
        hosts(node).some((inner) => inner.props.children === LONG),
    )
    expect(clipped).toEqual([])
  })
})

describe('ReadMore, the measured copies (web, sec-A4)', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web')
  })
  afterEach(() => jest.restoreAllMocks())

  it('marks them inert, hidden from readers and out of the pointer’s reach', async () => {
    // Une vue témoin : toutes les vues natives du rendu partagent son prototype, à qui l'on prête
    // `setAttribute`, celui de la balise du navigateur.
    const probe = createRef<View>()
    await render(<View ref={probe} />)
    const proto = Object.getPrototypeOf(probe.current) as { setAttribute?: unknown }
    const had = Object.hasOwn(proto, 'setAttribute')
    const original = proto.setAttribute
    proto.setAttribute = () => {}
    const setAttribute = jest.spyOn(proto as { setAttribute: () => void }, 'setAttribute')
    try {
      await render(<ReadMore>{(n) => <Text numberOfLines={n}>{LONG}</Text>}</ReadMore>)

      const inert = setAttribute.mock.calls.flatMap((call, index) =>
        (call as unknown[])[0] === 'inert' ? [setAttribute.mock.contexts[index]] : [],
      ) as unknown as Node[]
      expect(inert).toHaveLength(1)
      const layer = inert[0] as Node
      expect(layer.props['aria-hidden']).toBe(true)
      expect(layer.props.pointerEvents).toBe('none')
    } finally {
      setAttribute.mockRestore()
      if (had) proto.setAttribute = original
      else delete proto.setAttribute
    }
  })
})
