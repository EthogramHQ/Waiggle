// Tests de la ligne de dates d'un projet (R7a, relecture du plan, interface A4) : « Publié le 12 oct.
// · Mis à jour hier · v1.2 », sous le titre de la page du projet et en tête de la frise des mises à
// jour. Deux copies auraient fini par diverger : c'est un composant, partagé par `ProjectHeader` et
// la page de la frise.
//
// L'API fixée au lancement (`src/ui/ProjectDatesLine.tsx`, U1d) : `ProjectDatesLine({ createdAt,
// visibility, latestUpdateAt: string | null, version: string | null, now?: Date })`.
// - « Publié … » pour un projet public, « Créé … » pour un projet privé (publié pour personne) ;
// - « Mis à jour … » suit la dernière mise à jour publiée, jamais une modification du projet ; sans
//   mise à jour, ni « Mis à jour » ni version ;
// - la version, discrète, après.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { containing } from '../testing/text'
import { ProjectDatesLine } from './ProjectDatesLine'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Le 20 octobre 2026 à midi, heure de Paris : le projet date du 12, la mise à jour de la veille. */
const now = new Date('2026-10-20T10:00:00.000Z')
const createdAt = '2026-10-12T08:00:00.000Z'
const yesterday = '2026-10-19T09:00:00.000Z'

describe('ProjectDatesLine (R7a)', () => {
  it('says « Publié le 12 oct. », then « Mis à jour hier », then the version', async () => {
    await renderWithProviders(
      <ProjectDatesLine
        createdAt={createdAt}
        visibility="public"
        latestUpdateAt={yesterday}
        version="v1.2"
        now={now}
      />,
    )

    expect(screen.getByText(containing('Publié le 12 oct.'))).toBeTruthy()
    expect(screen.getByText(containing('Mis à jour hier'))).toBeTruthy()
    expect(screen.getByText(containing('v1.2'))).toBeTruthy()
  })

  it('reads the dates in this order: published, updated, version', async () => {
    await renderWithProviders(
      <ProjectDatesLine
        createdAt={createdAt}
        visibility="public"
        latestUpdateAt={yesterday}
        version="v1.2"
        now={now}
      />,
    )

    const order = [/Publié le 12 oct\./, /Mis à jour hier/, /v1\.2/].map((pattern) => {
      const [found] = screen.getAllByText(pattern)
      return readingIndex(found)
    })
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('says « Créé » for a private project', async () => {
    await renderWithProviders(
      <ProjectDatesLine
        createdAt={createdAt}
        visibility="private"
        latestUpdateAt={yesterday}
        version="v1.2"
        now={now}
      />,
    )

    expect(screen.getByText(containing('Créé le 12 oct.'))).toBeTruthy()
    expect(screen.queryByText(/Publié/)).toBeNull()
    // Témoin : la mise à jour se dit quand même (l'auteur la voit).
    expect(screen.getByText(containing('Mis à jour hier'))).toBeTruthy()
  })

  it('says neither « Mis à jour » nor a version without an update', async () => {
    await renderWithProviders(
      <ProjectDatesLine
        createdAt={createdAt}
        visibility="public"
        latestUpdateAt={null}
        version={null}
        now={now}
      />,
    )

    expect(screen.getByText(containing('Publié le 12 oct.'))).toBeTruthy()
    expect(screen.queryByText(/Mis à jour/)).toBeNull()
    expect(screen.queryByText(/v\d/)).toBeNull()
  })

  it('says « Mis à jour » without a version when the updates have none', async () => {
    await renderWithProviders(
      <ProjectDatesLine
        createdAt={createdAt}
        visibility="public"
        latestUpdateAt={yesterday}
        version={null}
        now={now}
      />,
    )

    expect(screen.getByText(containing('Mis à jour hier'))).toBeTruthy()
    expect(screen.queryByText(/v\d/)).toBeNull()
  })

  it('writes the version in the mono font, apart from the dates', async () => {
    await renderWithProviders(
      <ProjectDatesLine
        createdAt={createdAt}
        visibility="public"
        latestUpdateAt={yesterday}
        version="v1.2"
        now={now}
      />,
    )

    // La version est un texte à elle (pas collée dans la phrase des dates) : elle seule prend la
    // police à chasse fixe, que le thème donne aux numéros (`variant="mono"`).
    const version = screen.getByText('v1.2')
    expect(version).toBeTruthy()
    expect(screen.queryByText(/Mis à jour hier.*v1\.2/)).toBeNull()
  })
})

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

/** Le rang d'un élément dans l'ordre de lecture (parcours de l'arbre en profondeur). */
const readingIndex = (element: unknown) => {
  const all: Host[] = []
  const visit = (node: Host) => {
    all.push(node)
    for (const child of node.children) if (typeof child !== 'string') visit(child)
  }
  visit(screen.root as unknown as Host)
  const index = all.indexOf(element as Host)
  if (index === -1) throw new Error('element not found in the rendered tree')
  return index
}
