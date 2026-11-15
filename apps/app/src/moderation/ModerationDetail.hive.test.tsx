// Tests du détail d'un signalement de ruche (R10, scénario « La modération ») : la modération voit le
// nom (la copie), l'icône, l'animateur et le nombre de membres, jamais l'actualité ni les projets ;
// elle peut retirer le nom, ou le rétablir. Une ruche n'a pas de page à voir pour elle : pas de lien.
import type { ModerationQueueItem, RemovedItem } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ModerationDetail } from './ModerationDetail'

// Aucune image à charger ici : le faux ne lit pas la session (le client d'authentification des
// tests est inerte).
jest.mock('../api/media', () => ({ useMediaSources: () => () => null }))

const hiveId = '5e6f7a8b-9cad-4eaf-8b1c-2d3e4f5a6b7c'

/** « Famille », signalée deux fois : 4 membres, animée par Papi Jean, qui en a écrit le nom. */
const famille: ModerationQueueItem = {
  target: { kind: 'hive', id: hiveId },
  part: { field: 'name', mediaId: null, position: null },
  context: null,
  hive: { icon: 'house-line', animatorName: 'Papi Jean', memberCount: 4 },
  contentCreatedAt: '2026-10-01T08:00:00.000Z',
  projectId: null,
  snapshot: [{ field: 'name', value: 'Famille' }],
  images: [],
  snapshotsDiffer: false,
  state: 'present',
  concernsMe: false,
  reasons: [{ reason: 'harassment', count: 2 }],
  details: [],
  count: 2,
  firstReportedAt: '2026-10-20T08:00:00.000Z',
  lastReportedAt: '2026-10-20T09:00:00.000Z',
  authorRecord: {
    memberId: 'jean-id',
    name: 'Papi Jean',
    handle: 'papi_jean',
    joinedAt: '2026-08-14T09:00:00.000Z',
    projectCount: 1,
    commentCount: 2,
    removals: 0,
    suspensions: 0,
    suspendedNow: false,
    canSuspend: true,
  },
}

const noop = () => undefined

const mount = (item: ModerationQueueItem, onView: (() => void) | null = noop) =>
  renderWithProviders(
    <ModerationDetail
      tab="pending"
      item={item}
      actions={[
        { label: fr.t(($) => $.moderation.remove), tone: 'danger', onPress: noop },
        { label: fr.t(($) => $.moderation.dismiss), onPress: noop },
      ]}
      onView={onView}
      onSuspend={null}
      onSeeDecisions={null}
    />,
  )

describe('ModerationDetail of a reported hive', () => {
  it('titles the detail with the name of a hive, not with the animator', async () => {
    await mount(famille)

    expect(
      screen.getByRole('header', { name: fr.t(($) => $.moderation.detail.hiveName) }),
    ).toBeTruthy()
    expect(screen.queryByRole('header', { name: /Papi Jean/ })).toBeNull()
  })

  it('shows the icon cell named by the hive, and the members and animator', async () => {
    await mount(famille)

    expect(screen.getByRole('img', { name: 'Ruche Famille' })).toBeTruthy()
    expect(screen.getByText('4 membres, animée par Papi Jean')).toBeTruthy()
  })

  it('shows the copy of the name under its label', async () => {
    await mount(famille)

    expect(screen.getByText('Famille')).toBeTruthy()
  })

  it('says only the member count when the animator account is gone', async () => {
    await mount({ ...famille, hive: { icon: 'heart', animatorName: null, memberCount: 1 } })

    expect(screen.getByText('1 membre')).toBeTruthy()
    expect(screen.queryByText(/animée par/)).toBeNull()
  })

  it('shows no hive block for a hive deleted since', async () => {
    await mount({ ...famille, hive: null, state: 'gone' })

    expect(screen.queryByRole('img', { name: /Ruche/ })).toBeNull()
    expect(screen.queryByText(/^\d+ membres?/)).toBeNull()
    // Témoin : le reste du détail est là.
    expect(screen.getByText(fr.t(($) => $.moderation.state.gone))).toBeTruthy()
  })

  it('offers no link to the hive, the moderation is no member of it', async () => {
    await mount(famille)

    expect(screen.queryByText(fr.t(($) => $.moderation.detail.seeInContext))).toBeNull()
    // Témoin : les décisions, elles, sont là.
    expect(screen.getByRole('button', { name: /^Retirer/ })).toBeTruthy()
  })

  it('keeps the link for a project, which has a page', async () => {
    const project: ModerationQueueItem = {
      ...famille,
      target: { kind: 'project', id: '6e7f8091-a2b3-4dc4-9ed5-e6f708192a3b' },
      part: null,
      hive: undefined,
      snapshot: [{ field: 'title', value: 'Météo' }],
    }
    await mount(project)

    expect(screen.getByText(fr.t(($) => $.moderation.detail.seeInContext))).toBeTruthy()
  })

  it('lets the hive name be restored from « Retirés »', async () => {
    const removed: RemovedItem = {
      target: { kind: 'hive', id: hiveId },
      part: { field: 'name', mediaId: null, position: null },
      projectId: null,
      text: 'Famille',
      ground: 'rules',
      explanation: 'Ce nom vise un membre.',
      removedAt: '2026-10-21T09:00:00.000Z',
      concernsMe: false,
    }
    const restore = jest.fn()
    await renderWithProviders(
      <ModerationDetail
        tab="removed"
        item={removed}
        actions={[{ label: fr.t(($) => $.moderation.restore), onPress: restore }]}
        onView={null}
      />,
    )

    expect(
      screen.getByRole('header', { name: fr.t(($) => $.moderation.detail.hiveName) }),
    ).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: /^Rétablir/ }))
    expect(restore).toHaveBeenCalledTimes(1)
  })
})
