// Tests du cadre de la barre d'onglets (TabBarHost, ui/TabBar.tsx) : la hauteur qu'il donne aux
// écrans est celle de la barre **rendue**, pas de l'élément qu'il reçoit. Dans l'appli, il reçoit
// toujours `<AppTabBar />`, qui rend souvent `null` (une page poussée, un visiteur, un ordinateur) ;
// le cadre mesurait alors sa seule marge (8 points sur le web) et les pages sans barre réservaient
// cette marge, plus de l'air, en bas, au lieu de leur marge habituelle (correcteur N1c de R3).
//
// Jest ne calcule aucune position : on joue l'appareil en appelant chaque `onLayout` posé dans
// l'arbre, avec la hauteur que le téléphone mesurerait.
import { fireEvent, screen } from '@testing-library/react-native'
import { createI18n } from '../i18n'
import { renderWithProviders } from '../testing/render'
import { TabBar, TabBarHost } from './TabBar'
import { Text } from './Text'
import { useTabBarSpace } from './tabBarSpace'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const { t } = createI18n('fr')

const tabs = [
  { key: 'feed', label: t(($) => $.nav.feed), href: '/' },
  { key: 'explore', label: t(($) => $.nav.explore), href: '/explore' },
  { key: 'hives', label: t(($) => $.nav.hives), href: '/hives' },
  { key: 'me', label: t(($) => $.nav.me), href: '/me' },
] as const

/**
 * Comme AppTabBar : un composant qui rend la barre ou rien. `shown` à faux, c'est une page sans
 * barre (un projet, les notifications).
 */
const MaybeBar = ({ shown }: { shown: boolean }) =>
  shown ? (
    <TabBar
      tabs={tabs}
      active="feed"
      avatar={{ source: null, name: 'Léa Martin' }}
      publish={{ href: '/projects/new', label: t(($) => $.nav.publish) }}
      onPress={() => {}}
      onReselect={() => {}}
    />
  ) : null

// Un composant témoin : il affiche la hauteur réservée en bas, lue par le contexte.
const Probe = () => {
  const { height } = useTabBarSpace()
  return <Text>{`height ${height}`}</Text>
}

const app = (shown: boolean) => (
  <TabBarHost bar={<MaybeBar shown={shown} />}>
    <Probe />
  </TabBarHost>
)

// Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'a plus `findAll`).
type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[] }

/** Tous les éléments natifs qui écoutent leur mesure (`onLayout`). */
const measured = (): Node[] => {
  const found: Node[] = []
  const visit = (node: Node | string) => {
    if (typeof node === 'string') return
    if (typeof node.type === 'string' && typeof node.props.onLayout === 'function') found.push(node)
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Node)
  return found
}

/** L'appareil mesure tout ce qui écoute sa mesure, à cette hauteur. */
const layoutAll = async (height: number) => {
  for (const node of measured()) {
    await fireEvent(node as never, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
    })
  }
}

const reserved = () =>
  Number(String(screen.getByText(/^height \d+$/).props.children).replace('height ', ''))

describe('TabBarHost and the rendered bar', () => {
  it('reserves no space when the bar it holds renders nothing', async () => {
    await renderWithProviders(app(false))

    // Le cadre est là, avec sa marge du bas : l'appareil mesure tout ce qui écoute sa mesure (le
    // cadre vide faisait 8 points sur le web, et cette marge était réservée). Le témoin est le test
    // suivant : la même mesure, avec une barre rendue.
    await layoutAll(8)

    expect(screen.queryByLabelText(t(($) => $.nav.label))).toBeNull()
    expect(reserved()).toBe(0)
  })

  it('reserves the height of a bar rendered by a component', async () => {
    await renderWithProviders(app(true))

    // Témoin du test précédent : la même mesure, une barre rendue, et la place est réservée.
    await layoutAll(64)

    expect(screen.getByLabelText(t(($) => $.nav.label))).toBeTruthy()
    expect(reserved()).toBeGreaterThanOrEqual(64)
  })

  it('gives the space back when the bar stops rendering', async () => {
    const view = await renderWithProviders(app(true))
    await layoutAll(64)
    expect(reserved()).toBeGreaterThanOrEqual(64)

    // Une page poussée par-dessus les onglets : la barre ne se rend plus.
    await view.rerender(app(false))
    await layoutAll(8)

    expect(screen.queryByLabelText(t(($) => $.nav.label))).toBeNull()
    expect(reserved()).toBe(0)
  })
})
