// Tests de l'alignement des états d'une page (refonte, tranche R3, « Venus des listes », choix de
// Louis du 30/10/2026) : l'illustration, le titre, le message et les issues d'un `StateMessage`
// (lien refusé, « Connecte-toi d'abord », rien trouvé) se rangent à gauche, comme le reste des
// pages, au lieu d'être centrés. Le rôle et le titre ne changent pas.
//
// Jest ne calcule aucune position : on lit donc la règle elle-même, dans les styles. Pour chaque
// élément, on descend de la racine du composant jusqu'à lui, et on note comment chaque étage le
// place dans la largeur de son parent (alignSelf, sinon alignItems du parent ; en rangée,
// justifyContent). « stretch » prend toute la largeur et ne dit rien ; le premier étage qui
// choisit autre chose décide : il doit être « flex-start ». Un texte, en plus, ne se centre pas.
//
// Les tests d'avant R3 (issue, titre h1 ou h2, mascotte cachée aux lecteurs d'écran) restent dans
// components.test.tsx.
import { fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet, View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { StateMessage } from './StateMessage'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; parent: Node | null; children: (Node | string)[] }

type Layout = {
  alignItems?: string
  alignSelf?: string
  flexDirection?: string
  justifyContent?: string
  textAlign?: string
}

const styleOf = (node: Node): Layout =>
  (StyleSheet.flatten(node.props.style as never) as Layout | undefined) ?? {}

/** Le cadre posé autour du composant : son premier enfant est la racine de StateMessage. */
const HOST = 'state-host'

/** La racine du composant (sous le cadre du test). */
const rootOf = (): Node => {
  const host = screen.getByTestId(HOST) as unknown as Node
  const first = host.children.find((child): child is Node => typeof child !== 'string')
  if (!first) throw new Error('StateMessage ne rend rien')
  return first
}

/**
 * Comment l'élément se place dans la largeur du composant : la première décision prise en
 * descendant de la racine jusqu'à lui (« flex-start », « center »…), ou « stretch » si chaque étage
 * prend toute la largeur.
 */
const horizontalPlacement = (element: unknown): string => {
  const root = rootOf()
  // Les étages, de l'élément jusqu'à la racine (exclue : sa place dans la page ne compte pas).
  const chain: Node[] = []
  let node = element as Node | null
  while (node && node !== root) {
    chain.push(node)
    node = node.parent
  }
  if (node !== root) throw new Error("l'élément n'est pas dans StateMessage")
  for (const current of chain.reverse()) {
    const parent = current.parent as Node
    const parentStyle = styleOf(parent)
    const own = styleOf(current)
    const placement =
      parentStyle.flexDirection === 'row' || parentStyle.flexDirection === 'row-reverse'
        ? (parentStyle.justifyContent ?? 'flex-start')
        : own.alignSelf && own.alignSelf !== 'auto'
          ? own.alignSelf
          : (parentStyle.alignItems ?? 'stretch')
    if (placement !== 'stretch') return placement
  }
  return 'stretch'
}

/** Vrai si l'élément se range à gauche : rien ne le centre ni ne le pousse à droite. */
const onTheLeft = (element: unknown) =>
  ['flex-start', 'stretch'].includes(horizontalPlacement(element))

/** L'alignement du texte d'un élément Text (absent : à gauche, comme tout texte). */
const textAlignOf = (element: unknown) => styleOf(element as Node).textAlign ?? 'auto'

const title = 'Ce lien ne mène plus nulle part'
const message = 'Le projet a peut-être été retiré, ou son lien a changé.'

const sample = (onPress: () => void = () => {}) => (
  <View testID={HOST}>
    <StateMessage
      kind="notFound"
      title={title}
      message={message}
      actions={[
        { label: 'Revenir au fil', onPress },
        { label: 'Explorer', onPress: () => {} },
      ]}
    />
  </View>
)

describe('StateMessage, aligned on the left (R3)', () => {
  it('lines up its picture, title, message and actions on the left', async () => {
    await renderWithProviders(sample())

    const mascot = screen.getByRole('img', {
      name: fr.t(($) => $.mascot.search),
      includeHiddenElements: true,
    })
    expect(horizontalPlacement(mascot)).toBe('flex-start')

    for (const element of [
      screen.getByRole('header', { name: title }),
      screen.getByText(message),
      screen.getByRole('button', { name: 'Revenir au fil' }),
      screen.getByRole('button', { name: 'Explorer' }),
    ]) {
      expect(onTheLeft(element)).toBe(true)
    }
    // Et la racine range ses enfants à gauche : c'est la règle elle-même, écrite une fois.
    expect(styleOf(rootOf()).alignItems).toBe('flex-start')
  })

  it('never centres the text of its title or its message', async () => {
    await renderWithProviders(sample())

    for (const text of [screen.getByRole('header', { name: title }), screen.getByText(message)]) {
      expect(['auto', 'left']).toContain(textAlignOf(text))
    }
  })

  it('lines up the text of an error on the left too, still read out as an alert', async () => {
    await renderWithProviders(
      <View testID={HOST}>
        <StateMessage
          kind="error"
          title="Cette page n’a pas pu se charger"
          message="Une erreur inattendue est survenue."
          actions={[{ label: 'Réessayer', onPress: () => {} }]}
        />
      </View>,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Une erreur inattendue est survenue.')
    expect(['auto', 'left']).toContain(textAlignOf(alert))
    const header = screen.getByRole('header', { name: 'Cette page n’a pas pu se charger' })
    expect(['auto', 'left']).toContain(textAlignOf(header))
    expect(onTheLeft(header)).toBe(true)
    expect(onTheLeft(screen.getByRole('button', { name: 'Réessayer' }))).toBe(true)
  })

  // Relecture R3 : l'onglet Ruches assemblait à la main un état « bientôt », centré. Il passe par
  // StateMessage : l'abeille qui fait coucou, le titre et plusieurs paragraphes, à gauche.
  it('says that something is coming, with the waving bee and several paragraphs, on the left', async () => {
    await renderWithProviders(
      <View testID={HOST}>
        <StateMessage
          kind="soon"
          title="Les ruches arrivent bientôt"
          message={['Une ruche, c’est un groupe de proches.', 'Tu pourras y partager tes projets.']}
        />
      </View>,
    )

    const bee = screen.getByRole('img', {
      name: fr.t(($) => $.mascot.wave),
      includeHiddenElements: true,
    })
    expect(horizontalPlacement(bee)).toBe('flex-start')
    const header = screen.getByRole('header', { name: 'Les ruches arrivent bientôt' })
    const first = screen.getByText('Une ruche, c’est un groupe de proches.')
    const second = screen.getByText('Tu pourras y partager tes projets.')
    for (const element of [header, first, second]) {
      expect(onTheLeft(element)).toBe(true)
      expect(['auto', 'left']).toContain(textAlignOf(element))
    }
    // Deux paragraphes, pas une alerte : rien ne va mal.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('puts the emblem of an error on the left too, before its title', async () => {
    await renderWithProviders(
      <View testID={HOST}>
        <StateMessage kind="error" title="Cette page n’a pas pu se charger" />
      </View>,
    )

    // L'emblème est caché aux lecteurs d'écran : on le trouve par son cadre, le premier enfant.
    const group = rootOf().children.find((child): child is Node => typeof child !== 'string')
    const frame = group?.children.find((child): child is Node => typeof child !== 'string')
    if (!frame) throw new Error('pas de cadre pour l’image')
    expect(horizontalPlacement(frame)).toBe('flex-start')
    expect(
      onTheLeft(screen.getByRole('header', { name: 'Cette page n’a pas pu se charger' })),
    ).toBe(true)
  })

  // Témoin : le rôle et le titre ne changent pas avec l'alignement.
  it('keeps its heading and its way out', async () => {
    const back = jest.fn()
    await renderWithProviders(sample(back))

    expect(screen.getByRole('header', { name: title })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Revenir au fil' }))
    expect(back).toHaveBeenCalledTimes(1)
  })
})
