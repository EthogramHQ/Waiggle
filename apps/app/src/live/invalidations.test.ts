// Tests de la table « signal → lectures à refaire » du temps réel (R21, choix 10 du plan) : un
// signal ne porte que son sujet et sa sorte (« les commentaires du projet X ont changé ») ; l'appli
// marque périmées les lectures concernées du cache de React Query, qui les relit avec les droits du
// membre si un écran les montre.
//
// Deux sortes de lectures :
// - celles qui se relisent dès le signal (les commentaires, la page d'un projet, la cloche…) ;
// - les files qui ne se relisent jamais seules, exprès, pour que rien ne bouge sous le doigt : la
//   file de modération, la page de tri des Éclaireuses, la liste de l'Activité ouverte. Elles sont
//   seulement marquées périmées (`refetchType: 'none'`) : l'écran l'annonce, et elles se relisent à
//   la prochaine ouverture.
// Le Fil est à part : seule sa tête se relit (le bouton des nouveautés paraît), jamais la liste.
//
// L'interface attendue (src/live/invalidations.ts) :
//   invalidationsFor(event: LiveEvent): InvalidateQueryFilters[]
// chaque élément étant donné tel quel à `queryClient.invalidateQueries`.
//
// On regarde le vrai cache : des lectures « suivies » (un observateur abonné, comme un écran
// ouvert), et ce que le signal en fait. Les clés sont celles des modules de l'appli ; celles qui y
// sont encore privées (Activité, coin des testeurs, modération) sont écrites ici telles quelles.
import type { LiveEvent } from '@ruche/contracts'
import { QueryClient, type QueryKey, QueryObserver } from '@tanstack/react-query'
import { commentsQueryKey } from '../comments/api'
import { hiveQueryKey, myHivesQueryKey } from '../hives/api'
import { projectQueryKey } from '../projects/hooks'
import { scoutKeys } from '../scout/api'
import { myTesterMessagesKey } from '../testers/corner-api'
import { projectUpdatesQueryKey } from '../updates/api'
import { invalidationsFor } from './invalidations'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const P = '9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'
const Q = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const H = '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b'
const H2 = '6f7a8b9c-0d1e-4f2a-9b3c-4d5e6f7a8b9c'

// Les clés encore privées dans leurs modules (le plan les rend publiques ; leur valeur ne change pas).
const unreadKey = ['notifications', 'unread']
const activityListKey = ['notifications', 'list']
const cornerKey = (id: string) => ['tester-corner', id]
const moderationQueueKey = ['moderation', 'queue']
const scoutTriageReportsKey = ['moderation', 'scouts', 'reports', { status: 'new' }]
const harvestKey = ['harvest']
const memberKey = (id: string) => ['member', id]
const discoverList = ['feed', 'discover', false]
const discoverHead = ['feed', 'discover', false, 'head']
const followingHead = ['feed', 'following', false, 'head']
const categoryHead = ['feed', 'discover', false, { category: 'games' }, 'head']

let client: QueryClient
const stops: (() => void)[] = []

beforeEach(() => {
  // staleTime infini : une lecture ne se refait que si le signal la marque périmée.
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  })
})

afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  client.clear()
})

/** Laisse les lectures en route se terminer (promesses et notifications de React Query). */
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve))
}

/** Une lecture suivie par un écran ouvert ; rend le nombre de fois où elle a été refaite. */
const watch = async (queryKey: QueryKey) => {
  const read = jest.fn(async () => ({ at: Date.now() }))
  const observer = new QueryObserver(client, { queryKey, queryFn: read })
  stops.push(observer.subscribe(() => {}))
  await settle()
  return { rereads: () => read.mock.calls.length - 1, key: queryKey }
}

type Watched = Awaited<ReturnType<typeof watch>>

/** Ce que le signal a fait de la lecture : relue, gardée périmée sans la relire, ou laissée. */
const fate = (watched: Watched): 'reread' | 'kept' | 'untouched' => {
  if (watched.rereads() > 0) return 'reread'
  return client.getQueryState(watched.key)?.isInvalidated ? 'kept' : 'untouched'
}

/** Applique un signal comme le fait la connexion : chaque filtre de la table, sur le cache. */
const apply = async (event: LiveEvent) => {
  for (const filters of invalidationsFor(event)) void client.invalidateQueries(filters)
  await settle()
}

describe('what a signal on a project page rereads', () => {
  it('rereads the comments of that project only', async () => {
    const mine = await watch(commentsQueryKey(P))
    const other = await watch(commentsQueryKey(Q))
    const bell = await watch(unreadKey)

    await apply({ topic: `project:${P}`, kind: 'comments' })

    expect(fate(mine)).toBe('reread')
    expect(fate(other)).toBe('untouched')
    expect(fate(bell)).toBe('untouched')
  })

  it.each(['reactions', 'followers', 'testers', 'project'] as const)(
    'rereads the project page when its %s change',
    async (kind) => {
      const page = await watch(projectQueryKey(P))
      const other = await watch(projectQueryKey(Q))

      await apply({ topic: `project:${P}`, kind })

      expect(fate(page)).toBe('reread')
      expect(fate(other)).toBe('untouched')
    },
  )

  it('rereads the journal of the project when an update is published', async () => {
    const journal = await watch(projectUpdatesQueryKey(P))
    const other = await watch(projectUpdatesQueryKey(Q))

    await apply({ topic: `project:${P}`, kind: 'updates' })

    expect(fate(journal)).toBe('reread')
    expect(fate(other)).toBe('untouched')
  })

  it('rereads the page and its comments when the project is no longer allowed (gone)', async () => {
    // L'appli relit, reçoit le 404, et l'écran retire le projet (choix 3 du plan).
    const page = await watch(projectQueryKey(P))
    const thread = await watch(commentsQueryKey(P))

    await apply({ topic: `project:${P}`, kind: 'gone' })

    expect(fate(page)).toBe('reread')
    expect(fate(thread)).toBe('reread')
  })
})

describe('what a signal on a member, a hive or a tester corner rereads', () => {
  it('rereads the page of that member when their followers change', async () => {
    const nora = await watch(memberKey('nora'))
    const sam = await watch(memberKey('sam'))

    await apply({ topic: 'member:nora', kind: 'followers' })

    expect(fate(nora)).toBe('reread')
    expect(fate(sam)).toBe('untouched')
  })

  it('rereads the page of a member who is no longer allowed (gone)', async () => {
    const nora = await watch(memberKey('nora'))

    await apply({ topic: 'member:nora', kind: 'gone' })

    expect(fate(nora)).toBe('reread')
  })

  it('rereads everything about that hive (its page, its members), not the other hives', async () => {
    const page = await watch(hiveQueryKey(H))
    const members = await watch([...hiveQueryKey(H), 'members'])
    const other = await watch(hiveQueryKey(H2))

    await apply({ topic: `hive:${H}`, kind: 'hive' })

    expect(fate(page)).toBe('reread')
    expect(fate(members)).toBe('reread')
    expect(fate(other)).toBe('untouched')
  })

  it('rereads the hive when the member may no longer see it (gone)', async () => {
    const page = await watch(hiveQueryKey(H))

    await apply({ topic: `hive:${H}`, kind: 'gone' })

    expect(fate(page)).toBe('reread')
  })

  it('rereads the tester corner of that project only', async () => {
    const corner = await watch(cornerKey(P))
    const other = await watch(cornerKey(Q))

    await apply({ topic: `corner:${P}`, kind: 'corner' })

    expect(fate(corner)).toBe('reread')
    expect(fate(other)).toBe('untouched')
  })
})

describe('what a personal signal (me) rereads', () => {
  it('rereads the count of the bell, and keeps the open Activity list in place', async () => {
    const bell = await watch(unreadKey)
    const list = await watch(activityListKey)

    await apply({ topic: 'me', kind: 'notifications' })

    expect(fate(bell)).toBe('reread')
    // La liste ouverte ne bouge pas sous le doigt : périmée, relue à la prochaine ouverture.
    expect(fate(list)).toBe('kept')
  })

  it('rereads the harvest when pollen arrives', async () => {
    const harvest = await watch(harvestKey)

    await apply({ topic: 'me', kind: 'pollen' })

    expect(fate(harvest)).toBe('reread')
  })

  it('rereads the missions of the Drop when a scout report is heard', async () => {
    const missions = await watch(scoutKeys.missions)
    const reports = await watch(scoutKeys.reports)

    await apply({ topic: 'me', kind: 'scouts' })

    expect(fate(missions)).toBe('reread')
    expect(fate(reports)).toBe('reread')
  })

  it('rereads one’s own tester threads when a message arrives in them', async () => {
    // Un message de fil de testeur ne part qu'au `me` des deux personnes du fil (relecture, B1).
    const threads = await watch(myTesterMessagesKey)

    await apply({ topic: 'me', kind: 'corner' })

    expect(fate(threads)).toBe('reread')
  })

  // R21 : le signal ne dit pas de quel projet vient le message ; le fil ouvert se relit, côté
  // testeur comme côté auteur, et chez l'auteur sa liste de fils et son coin.
  it('rereads the open tester thread and the author’s threads when a message arrives', async () => {
    const thread = await watch(['tester-messages', P, 'nora'])
    const threads = await watch(['tester-threads', P, 'open'])
    const corner = await watch(cornerKey(P))
    const bell = await watch(unreadKey)

    await apply({ topic: 'me', kind: 'corner' })

    expect(fate(thread)).toBe('reread')
    expect(fate(threads)).toBe('reread')
    expect(fate(corner)).toBe('reread')
    // Témoin : le signal du fil ne recompte pas la cloche (son avis a son propre signal).
    expect(fate(bell)).toBe('untouched')
  })

  it('rereads one’s hives and invitations when an invitation arrives (me:hive)', async () => {
    const hives = await watch(myHivesQueryKey)
    const page = await watch(hiveQueryKey(H))

    await apply({ topic: 'me', kind: 'hive' })

    expect(fate(hives)).toBe('reread')
    expect(fate(page)).toBe('untouched')
  })
})

describe('the calls of a tester corner (R21)', () => {
  it('rereads the calls of that project when its author posts one', async () => {
    const calls = await watch(['tester-calls', P])
    const other = await watch(['tester-calls', Q])

    await apply({ topic: `corner:${P}`, kind: 'corner' })

    expect(fate(calls)).toBe('reread')
    expect(fate(other)).toBe('untouched')
  })
})

describe('the feeds: only the head is reread, never the list', () => {
  it('rereads the heads of the feeds when a public project is published', async () => {
    const discover = await watch(discoverHead)
    const following = await watch(followingHead)
    const category = await watch(categoryHead)
    const list = await watch(discoverList)

    await apply({ topic: 'feed', kind: 'feed' })

    expect(fate(discover)).toBe('reread')
    expect(fate(following)).toBe('reread')
    expect(fate(category)).toBe('reread')
    // Le fil affiché ne se relit pas : le bouton des nouveautés paraît, la liste ne bouge pas.
    expect(fate(list)).not.toBe('reread')
  })

  it('rereads the heads and one’s hives when a hive project is published (me:feed)', async () => {
    const following = await watch(followingHead)
    const hives = await watch(myHivesQueryKey)
    const list = await watch(discoverList)

    await apply({ topic: 'me', kind: 'feed' })

    expect(fate(following)).toBe('reread')
    expect(fate(hives)).toBe('reread')
    expect(fate(list)).not.toBe('reread')
  })
})

describe('the queues that never reread by themselves', () => {
  it('keeps the moderation queue in place when a new report arrives', async () => {
    const queue = await watch(moderationQueueKey)

    await apply({ topic: 'moderation', kind: 'moderation' })

    expect(fate(queue)).toBe('kept')
  })

  it('keeps the scouts triage page in place when a new report arrives', async () => {
    const triage = await watch(scoutTriageReportsKey)

    await apply({ topic: 'scouts', kind: 'scouts' })

    expect(fate(triage)).toBe('kept')
  })
})
