// Tests de l'aperçu de la carte (tranche R6a, scénario « L'aperçu de la carte », planche
// `R6-Publier-Desktop` ; relecture du plan ui-B5) : sur ordinateur, à droite du formulaire, la carte
// du fil telle qu'elle sera, posée sur une scène sombre éclairée par la première photo.
//
// L'aperçu n'est qu'une image de ce que le formulaire contient déjà : rien n'y est atteignable.
// - Au clavier (web) : la couche est `inert` (l'attribut, que react-native-web ne transmet pas, posé
//   sur la balise, comme les copies mesurées de `ReadMore`) : aucun arrêt de Tab dans la carte.
// - Au doigt et à la souris : `pointerEvents="none"` ; « Tester » de la carte n'ouvre rien.
// - Aux lecteurs d'écran : **caché**. Décision de ce fichier, d'après ui-B5 (« `inert`, rien
//   d'atteignable ») : sur le web, `inert` retire déjà la couche de l'arbre d'accessibilité ; le
//   téléphone fait de même (`aria-hidden`, `importantForAccessibility="no-hide-descendants"`), pour
//   qu'un lecteur ne lise pas deux fois le titre et l'accroche. Ce qui présente l'aperçu (« Aperçu
//   dans le fil », « Il suit ce que tu écris. », la phrase sur la lumière) reste dans l'écran, hors
//   du composant, et se lit normalement.
//
// L'API (découpage amendé de R6a, U7) : CardPreview({ image: CoverImage | null; children }).
import { fireEvent, screen } from '@testing-library/react-native'
import { createRef } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { CardPreview } from './CardPreview'
import type { CoverImage } from './ProjectCover'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const TITLE = 'Le ciel de ce soir'
const PHOTO_URI = 'https://media.example/visuals/ciel-1.webp'
const photo: CoverImage = { source: { uri: PHOTO_URI }, label: 'Photo 1 sur 3' }

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = {
  props: Record<string, unknown>
  children: ReadonlyArray<Host | string>
  parent?: Host | null
}

/** Tous les éléments de l'arbre rendu, en profondeur. */
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

/** Un élément de l'arbre affiche-t-il l'image de cette adresse ? */
const drawsUri = (uri: string) =>
  hostsOf(screen.root as unknown as Host).some((node) =>
    JSON.stringify(node.props.source ?? null).includes(uri),
  )

/** Des enfants React contiennent-ils ce texte, à n'importe quelle profondeur ? */
const holds = (children: unknown, text: string): boolean => {
  if (typeof children === 'string') return children === text
  if (Array.isArray(children)) return children.some((child) => holds(child, text))
  const props = (children as { props?: Record<string, unknown> } | null)?.props
  return props ? holds(props.children, text) : false
}

/** Une carte de test : un titre et un bouton « Tester », comme la carte du fil. */
const card = (onTest: () => void) => (
  <View>
    <Text>{TITLE}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Tester" onPress={onTest}>
      <Text>Tester</Text>
    </Pressable>
  </View>
)

describe('CardPreview', () => {
  it('draws the card it is given, with or without a photo', async () => {
    const { rerender } = await renderWithProviders(
      <CardPreview image={photo}>{card(() => {})}</CardPreview>,
    )
    expect(screen.getByText(TITLE, { includeHiddenElements: true })).toBeTruthy()

    await rerender(<CardPreview image={null}>{card(() => {})}</CardPreview>)
    expect(screen.getByText(TITLE, { includeHiddenElements: true })).toBeTruthy()
  })

  it('lights the scene with the first photo, and with nothing else without one', async () => {
    const { rerender } = await renderWithProviders(
      <CardPreview image={photo}>{card(() => {})}</CardPreview>,
    )
    expect(drawsUri(PHOTO_URI)).toBe(true)

    await rerender(<CardPreview image={null}>{card(() => {})}</CardPreview>)
    expect(drawsUri(PHOTO_URI)).toBe(false)
  })

  it('hides the card from screen readers: the form already says it all', async () => {
    await renderWithProviders(<CardPreview image={photo}>{card(() => {})}</CardPreview>)

    // Témoin : la carte est bien là, cachée.
    expect(screen.getByRole('button', { name: 'Tester', includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Tester' })).toBeNull()
    expect(screen.queryByText(TITLE)).toBeNull()
    // La photo de la lumière n'est pas annoncée non plus.
    expect(screen.queryByLabelText(photo.label)).toBeNull()
  })

  it('lets no tap reach the card: « Tester » opens nothing', async () => {
    const onTest = jest.fn()
    await renderWithProviders(<CardPreview image={photo}>{card(onTest)}</CardPreview>)

    await fireEvent.press(
      screen.getByRole('button', { name: 'Tester', includeHiddenElements: true }),
    )

    expect(onTest).not.toHaveBeenCalled()
  })

  describe('on the web', () => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'web')
    })
    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('marks the card inert, so that Tab never stops in it', async () => {
      // Une vue témoin : toutes les vues natives du rendu partagent son prototype, à qui l'on prête
      // `setAttribute`, celui de la balise du navigateur.
      const probe = createRef<View>()
      await renderWithProviders(<View ref={probe} />)
      const proto = Object.getPrototypeOf(probe.current) as { setAttribute?: unknown }
      const had = Object.hasOwn(proto, 'setAttribute')
      const original = proto.setAttribute
      proto.setAttribute = () => {}
      const setAttribute = jest.spyOn(proto as { setAttribute: () => void }, 'setAttribute')
      try {
        await renderWithProviders(<CardPreview image={photo}>{card(() => {})}</CardPreview>)

        const inert = setAttribute.mock.calls.flatMap((call, index) =>
          (call as unknown[])[0] === 'inert' ? [setAttribute.mock.contexts[index]] : [],
        ) as unknown as Host[]
        expect(inert.length).toBeGreaterThanOrEqual(1)
        // La couche inerte contient la carte entière, son bouton compris : on descend dans ses
        // enfants (RNTL 14 garde les `props` de la `ref` d'un natif).
        expect(inert.some((layer) => holds(layer.props.children, 'Tester'))).toBe(true)
        expect(inert.some((layer) => holds(layer.props.children, TITLE))).toBe(true)
      } finally {
        setAttribute.mockRestore()
        if (had) proto.setAttribute = original
        else delete proto.setAttribute
      }
    })
  })
})
