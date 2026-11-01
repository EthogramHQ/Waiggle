// Tests de l'encadré « à savoir avant le geste » (Callout, R2, relecture de l'interface C6) : il
// montre son titre et son explication, son icône reste décorative, et il n'est pas annoncé comme
// un message (ni alerte ni statut : rien ne vient de se passer).
//
// R5a (relecture de l'interface du plan, ui-1) : un ton `caution`, l'encadré de prudence ambre,
// le même partout où il faut douter un instant (la phrase sous un prompt, le bandeau « Seuls les
// membres… » du partage, la page de sortie, le bandeau d'un projet privé). Son fond est
// `cautionSoft`, son titre et son icône sont en `amberText` ; la phrase reste à l'encre (couples
// vérifiés dans `contrastPairs` de packages/brand/src/colors.ts). Sans ton, rien ne change.
import { palettes } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Callout } from './Callout'
import { Icon } from './Icon'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const sample = (
  <Callout
    icon="device-mobile"
    title="Tes autres appareils seront déconnectés"
    body="Cet appareil reste connecté. Sur les autres, il faudra le nouveau mot de passe."
  />
)

// Le ton de prudence, avec les textes de la page projet (project.prompts.warning et caution).
const CAUTION_TITLE = "À lire avant de l'utiliser"
const CAUTION_BODY =
  "Relis-le avant de t'en servir. Ne donne jamais à une IA ton mot de passe, une clé ou un code reçu."
const caution = (
  <Callout tone="caution" icon="warning-circle" title={CAUTION_TITLE} body={CAUTION_BODY} />
)

// Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'expose pas le type complet).
type Node = {
  type: unknown
  props: Record<string, unknown>
  children: (Node | string)[]
}

const styleOf = (node: Node): Record<string, unknown> =>
  (StyleSheet.flatten(node.props.style as never) as Record<string, unknown> | undefined) ?? {}

/** Tous les nœuds de l'arbre rendu, en profondeur. */
const allNodes = (): Node[] => {
  const found: Node[] = []
  const visit = (node: Node | string) => {
    if (typeof node === 'string') return
    found.push(node)
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Node)
  return found
}

/** Les couleurs de fond posées dans l'encadré (Surface peut poser la sienne sur une couche sœur). */
const backgrounds = (): unknown[] =>
  allNodes()
    .map((node) => styleOf(node).backgroundColor)
    .filter((color) => color !== undefined)

/**
 * Les couleurs des icônes, dans l'ordre de l'arbre : le dessin SVG de Phosphor (ui/Icon.tsx) reçoit
 * sa couleur par `fill`, que react-native-svg peut transformer (nombre, objet) avant l'élément
 * natif. On compare donc à une icône témoin rendue à côté, dans une teinte connue, lue de la même
 * façon (l'élément natif de la racine de chaque SVG).
 */
const iconFills = (): string[] =>
  allNodes()
    .filter((node) => typeof node.type === 'string' && /^RNSVGSvg/.test(node.type))
    .map((svg) => JSON.stringify(svg.props.fill ?? styleOf(svg).color ?? svg.props.color))

// L'icône témoin : la teinte `accent` d'Icon, c'est amberText (ui/Icon.tsx).
const amberTextIcon = <Icon name="sparkle" tone="accent" />

describe('Callout', () => {
  it('shows its title and its explanation', async () => {
    await renderWithProviders(sample)

    expect(screen.getByText('Tes autres appareils seront déconnectés')).toBeTruthy()
    expect(
      screen.getByText(
        'Cet appareil reste connecté. Sur les autres, il faudra le nouveau mot de passe.',
      ),
    ).toBeTruthy()
  })

  it('is not announced as a message when the page appears', async () => {
    await renderWithProviders(sample)

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('keeps its icon away from screen readers', async () => {
    await renderWithProviders(sample)

    // Le seul contenu lu : les deux textes ; l'icône n'a ni nom ni image annoncée.
    expect(screen.queryByRole('image')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })
})

describe('Callout with the caution tone', () => {
  it('lays the soft amber background under its texts, by day', async () => {
    await renderWithProviders(caution, 'fr', 'day')

    expect(screen.getByText(CAUTION_TITLE)).toBeTruthy() // témoin
    expect(backgrounds()).toContain(palettes.day.cautionSoft)
  })

  it('lays the night soft amber background at night', async () => {
    await renderWithProviders(caution, 'fr', 'night')

    expect(screen.getByText(CAUTION_TITLE)).toBeTruthy() // témoin
    expect(backgrounds()).toContain(palettes.night.cautionSoft)
    expect(backgrounds()).not.toContain(palettes.day.cautionSoft)
  })

  it('writes its title in amber text', async () => {
    await renderWithProviders(caution, 'fr', 'day')

    expect(styleOf(screen.getByText(CAUTION_TITLE) as unknown as Node).color).toBe(
      palettes.day.amberText,
    )
  })

  it('keeps the explanation in ink, readable on the amber background', async () => {
    await renderWithProviders(caution, 'fr', 'day')

    // L'encre ou l'encre secondaire : les deux couples sont vérifiés sur cautionSoft.
    const color = styleOf(screen.getByText(CAUTION_BODY) as unknown as Node).color
    expect([palettes.day.text, palettes.day.textSecondary]).toContain(color)
  })

  it('draws its icon in amber text too', async () => {
    // Une icône de l'ambre du logo (`amber`) ne passerait pas le contraste sur le fond doux : c'est
    // amberText, comme le titre.
    await renderWithProviders(
      <>
        {caution}
        {amberTextIcon}
      </>,
      'fr',
      'day',
    )

    const [calloutIcon, reference] = iconFills()
    expect(reference).toBeDefined() // témoin : les deux icônes sont lues
    expect(calloutIcon).toBe(reference)
  })

  it('stays silent and keeps its icon hidden, like the default tone', async () => {
    await renderWithProviders(caution)

    expect(screen.getByText(CAUTION_TITLE)).toBeTruthy() // témoin
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('image')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })
})

describe('Callout without a tone', () => {
  it('keeps its usual background, not the amber one', async () => {
    await renderWithProviders(sample, 'fr', 'day')

    expect(screen.getByText('Tes autres appareils seront déconnectés')).toBeTruthy() // témoin
    expect(backgrounds()).not.toContain(palettes.day.cautionSoft)
  })

  it('keeps its icon out of the amber text', async () => {
    await renderWithProviders(
      <>
        {sample}
        {amberTextIcon}
      </>,
      'fr',
      'day',
    )

    const [calloutIcon, reference] = iconFills()
    expect(reference).toBeDefined() // témoin : les deux icônes sont lues
    expect(calloutIcon).not.toBe(reference)
  })

  it('keeps its title in ink', async () => {
    await renderWithProviders(sample, 'fr', 'day')

    expect(
      styleOf(screen.getByText('Tes autres appareils seront déconnectés') as unknown as Node).color,
    ).toBe(palettes.day.text)
  })
})
