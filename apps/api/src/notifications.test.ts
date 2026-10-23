// Tests d'intégration de la tranche 6b : les notifications dans l'appli. Scénario :
// docs/scenarios/phase-1.md, « Précisions (tranche 6b) ». Quatre membres : Inès (l'autrice du
// projet « Météo »), Malik (qui réagit, commente et mentionne), Zoé et Sam (qui répondent, suivent,
// et montrent ce que voient les autres). Les mentions elles-mêmes (écriture, pseudo changé, liste
// des suggestions) sont testées dans mentions.test.ts ; ici, ce qu'elles font naître.
//
// Les notifications ne sont pas recopiées : l'API les calcule à partir des réactions, abonnements,
// commentaires et mentions. Chaque test fait donc un geste, puis lit la liste.
//
// Le temps est maîtrisé par le test : vi.useFakeTimers remplace l'horloge de JavaScript (Date) par
// une fausse, qu'on avance à la main (voir comments.test.ts). L'horloge part d'une date fixe, loin
// d'aujourd'hui : une date écrite par la base elle-même (now() en SQL) au lieu de l'horloge de
// l'API se verrait tout de suite (les jours et les 90 jours seraient faux). En juin, Paris est à
// UTC+2 : 21 h 30 UTC, c'est 23 h 30 à Paris.
import {
  Comment,
  ErrorResponse,
  Me,
  NOTIFICATION_PAGE_SIZE,
  type Notification,
  NotificationPage,
  Project,
  type ReportTarget,
  UnreadCount,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadNotificationsSince } from './notifications/load'
import { memberCounterKeys } from './rate-limit'
import { activity } from './testing/activity'
import { createTestContext, TEST_API_URL, type TestContext } from './testing/context'

let ctx: TestContext
let ines: string // cookies de session
let malik: string
let zoe: string
let sam: string
let inesId: string
let malikId: string

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const START = new Date('2026-06-15T08:00:00.000Z')

const inesAccount = {
  name: 'Inès Morel',
  email: 'ines@example.com',
  password: 'ines-long-password',
}
const malikAccount = { name: 'Malik', email: 'malik@example.com', password: 'malik-long-password' }

beforeEach(async () => {
  // La fausse horloge est posée avant de créer l'API : la limite de débit garde la fonction
  // Date.now qu'elle trouve à ce moment-là (voir feed.test.ts).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)

  ctx = await createTestContext()
  ines = await ctx.verifiedMember(inesAccount)
  malik = await ctx.verifiedMember(malikAccount)
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-password',
  })
  sam = await ctx.verifiedMember({
    name: 'Sam',
    email: 'sam@example.com',
    password: 'sam-long-password',
  })
  inesId = (await me(ines)).id
  malikId = (await me(malik)).id
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une seconde : assez pour que les dates diffèrent). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

const send = (method: string, path: string, cookie: string | null, body?: unknown) =>
  ctx.request(path, {
    method,
    headers: {
      ...(cookie && { cookie }),
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })

const me = async (cookie: string) => {
  const res = await send('GET', '/v1/me', cookie)
  expect(res.status).toBe(200)
  return Me.parse(await res.json())
}

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Une réponse 204 : réussie, et sans corps. */
const expectDone = async (res: Response) => {
  expect(res.status).toBe(204)
  expect(await res.text()).toBe('')
}

/** Publie un projet (public par défaut) et le renvoie. */
const publish = async (cookie: string, body: object = {}) => {
  later()
  const res = await send('POST', '/v1/projects', cookie, {
    title: 'Météo',
    pitch: 'La pluie de demain, quartier par quartier.',
    ...body,
  })
  expect(res.status).toBe(201)
  return Project.parse(await res.json())
}

const setVisibility = async (projectId: string, cookie: string, visibility: string) => {
  later()
  const res = await send('PATCH', `/v1/projects/${projectId}`, cookie, { visibility })
  expect(res.status).toBe(200)
}

const react = async (projectId: string, kind: string, cookie: string) => {
  later()
  await expectDone(await send('PUT', `/v1/projects/${projectId}/reactions/${kind}`, cookie))
}
const unreact = async (projectId: string, kind: string, cookie: string) => {
  later()
  await expectDone(await send('DELETE', `/v1/projects/${projectId}/reactions/${kind}`, cookie))
}

type Followed = 'members' | 'projects'
const follow = async (kind: Followed, id: string, cookie: string) => {
  later()
  await expectDone(await send('POST', `/v1/${kind}/${id}/follow`, cookie))
}
const unfollow = async (kind: Followed, id: string, cookie: string) => {
  later()
  await expectDone(await send('DELETE', `/v1/${kind}/${id}/follow`, cookie))
}

/** Publie un commentaire (une réponse si `replyTo` est donné), une seconde après ce qui précède. */
const comment = async (projectId: string, cookie: string, body: string, replyTo?: string) => {
  later()
  const res = await send(
    'POST',
    `/v1/projects/${projectId}/comments`,
    cookie,
    replyTo === undefined ? { body } : { body, replyTo },
  )
  expect(res.status).toBe(201)
  return Comment.parse(await res.json())
}
const editComment = async (projectId: string, commentId: string, cookie: string, body: string) => {
  later()
  const res = await send('PATCH', `/v1/projects/${projectId}/comments/${commentId}`, cookie, {
    body,
  })
  expect(res.status).toBe(200)
}
const deleteComment = async (projectId: string, commentId: string, cookie: string) => {
  later()
  await expectDone(await send('DELETE', `/v1/projects/${projectId}/comments/${commentId}`, cookie))
}
const hide = async (projectId: string, commentId: string, cookie: string) => {
  later()
  await expectDone(
    await send('PUT', `/v1/projects/${projectId}/comments/${commentId}/hide`, cookie),
  )
}
const unhide = async (projectId: string, commentId: string, cookie: string) => {
  later()
  await expectDone(
    await send('DELETE', `/v1/projects/${projectId}/comments/${commentId}/hide`, cookie),
  )
}

/** Une page de notifications de ce membre (la première sans curseur). */
const readPage = async (cookie: string, cursor?: string) => {
  const query = cursor === undefined ? '' : `?${new URLSearchParams({ cursor })}`
  const res = await send('GET', `/v1/notifications${query}`, cookie)
  expect(res.status).toBe(200)
  return NotificationPage.parse(await res.json())
}

/**
 * Les notifications de la première page, sans celle du pseudo (que chaque membre reçoit en
 * vérifiant son adresse, et qui gênerait la lecture de la plupart des tests).
 */
const notifications = async (cookie: string) =>
  (await readPage(cookie)).items.filter((n) => n.kind !== 'handle')

/** Le nombre de la cloche. */
const unread = async (cookie: string) => {
  const res = await send('GET', '/v1/notifications/unread', cookie)
  expect(res.status).toBe(200)
  return UnreadCount.parse(await res.json()).count
}

const markSeen = (cookie: string | null, upTo: unknown) =>
  send('PUT', '/v1/notifications/seen', cookie, { upTo })

/** Ouvre l'écran, comme l'appli : lit la première page, puis marque vu jusqu'à son heure. */
const openScreen = async (cookie: string) => {
  const page = await readPage(cookie)
  await expectDone(await markSeen(cookie, page.asOf))
  later()
  return page
}

/** Le pourquoi des notifications de commentaires, dans l'ordre de la liste. */
const commentReasons = (items: Notification[]) =>
  items.flatMap((n) => (n.kind === 'comment' ? [`${n.reason}:${n.comment.id}`] : []))

const deleteAccount = async (cookie: string, password: string) => {
  const res = await send('POST', '/api/auth/delete-user', cookie, { password })
  expect(res.status).toBe(200)
}

/** Se reconnecte : une session dure 7 jours, et certains tests avancent l'horloge de 90. */
const signInAgain = async (account: { email: string; password: string }) => {
  const res = await ctx.signIn(account)
  expect(res.status).toBe(200)
  return ctx.cookiesFrom(res)
}

describe('the scenario of Inès', () => {
  it('lists every kind, from the most recent to the oldest', async () => {
    const meteo = await publish(ines)
    const own = await comment(meteo.id, ines, 'Vos retours sont les bienvenus.')
    await react(meteo.id, 'bravo', malik)
    await react(meteo.id, 'bravo', zoe)
    const commented = await comment(meteo.id, malik, 'Super idée, je teste ce soir.')
    const mentioning = await comment(meteo.id, malik, 'Et @ines_morel, tu prévois la neige ?')
    const reply = await comment(meteo.id, malik, 'Moi aussi !', own.id)
    await follow('members', inesId, malik)
    await follow('members', inesId, zoe)
    await follow('members', inesId, sam)
    await follow('projects', meteo.id, malik)
    await follow('projects', meteo.id, zoe)

    const page = await readPage(ines)

    expect(page.items.map((n) => n.kind)).toEqual([
      'project_follows',
      'member_follows',
      'comment',
      'comment',
      'comment',
      'reactions',
      'handle',
    ])
    expect(page.items).toMatchObject([
      { kind: 'project_follows', project: { id: meteo.id, title: 'Météo' }, count: 2 },
      { kind: 'member_follows', count: 3 },
      { kind: 'comment', reason: 'reply', comment: { id: reply.id } },
      { kind: 'comment', reason: 'mention', comment: { id: mentioning.id } },
      { kind: 'comment', reason: 'comment', comment: { id: commented.id } },
      {
        kind: 'reactions',
        project: { id: meteo.id, title: 'Météo' },
        counts: { amazing: 0, inspiring: 0, useful: 0, funny: 0, bravo: 2 },
        total: 2,
      },
      { kind: 'handle', handle: 'ines_morel' },
    ])
    // Tout est nouveau : Inès n'a jamais ouvert l'écran.
    expect(page.items.every((n) => n.isNew)).toBe(true)
    // Les dates vont de la plus récente à la plus ancienne.
    const dates = page.items.map((n) => Date.parse(n.at))
    expect(dates).toEqual([...dates].sort((a, b) => b - a))
    expect(page.nextCursor).toBeNull()
  })

  it('shows « 1 » for two « Bravo » on the same project: the bell counts groups', async () => {
    const meteo = await publish(ines)
    await openScreen(ines) // celle du pseudo est vue

    await react(meteo.id, 'bravo', malik)
    await react(meteo.id, 'bravo', zoe)

    expect(await unread(ines)).toBe(1)
  })

  it('brings the bell back to zero once the screen is opened', async () => {
    const meteo = await publish(ines)
    await react(meteo.id, 'bravo', malik)
    expect(await unread(ines)).toBe(2) // la réaction et le pseudo

    await openScreen(ines)

    expect(await unread(ines)).toBe(0)
    expect((await readPage(ines)).items.every((n) => !n.isNew)).toBe(true)
  })
})

describe('reactions', () => {
  it('groups them by project and by day, with the number of each kind and no name', async () => {
    const meteo = await publish(ines)
    const recettes = await publish(ines, { title: 'Recettes' })
    await react(meteo.id, 'bravo', malik)
    await react(meteo.id, 'useful', malik)
    await react(meteo.id, 'bravo', zoe)
    await react(recettes.id, 'funny', zoe)

    const items = await notifications(ines)

    expect(items).toMatchObject([
      {
        kind: 'reactions',
        project: { id: recettes.id, title: 'Recettes' },
        day: '2026-06-15',
        counts: { amazing: 0, inspiring: 0, useful: 0, funny: 1, bravo: 0 },
        total: 1,
      },
      {
        kind: 'reactions',
        project: { id: meteo.id, title: 'Météo' },
        day: '2026-06-15',
        counts: { amazing: 0, inspiring: 0, useful: 1, funny: 0, bravo: 2 },
        total: 3,
      },
    ])
    // Le groupe est daté de sa dernière réaction (celle de Zoé, juste avant la sienne sur Recettes).
    expect(Date.parse(items[1]?.at ?? '')).toBe(Date.now() - SECOND)
    // Personne n'est nommé : ni Malik ni Zoé n'apparaissent dans ce qu'Inès reçoit.
    const text = await (await send('GET', '/v1/notifications', ines)).text()
    expect(text).not.toContain(malikId)
    expect(text).not.toMatch(/Malik|Zoé|malik|zoe/)
  })

  it('cuts the days at midnight in Paris, not in UTC', async () => {
    const meteo = await publish(ines)
    // 23 h 30 à Paris le 15 juin, puis 0 h 30 le 16 : le même jour en UTC, pas à Paris.
    vi.setSystemTime(new Date('2026-06-15T21:30:00.000Z'))
    await react(meteo.id, 'bravo', malik)
    vi.setSystemTime(new Date('2026-06-15T22:30:00.000Z'))
    await react(meteo.id, 'bravo', zoe)

    const items = await notifications(ines)

    expect(items).toMatchObject([
      { kind: 'reactions', day: '2026-06-16', total: 1 },
      { kind: 'reactions', day: '2026-06-15', total: 1 },
    ])
    // Deux groupes, deux clés.
    expect(items[0]?.id).not.toBe(items[1]?.id)
  })

  it('takes a removed reaction out of the number, and removes the group at zero', async () => {
    const meteo = await publish(ines)
    await react(meteo.id, 'bravo', malik)
    await react(meteo.id, 'bravo', zoe)

    await unreact(meteo.id, 'bravo', zoe)
    expect(await notifications(ines)).toMatchObject([{ kind: 'reactions', total: 1 }])

    await unreact(meteo.id, 'bravo', malik)
    expect(await notifications(ines)).toEqual([])
  })

  it('keeps the same key for a group that grows', async () => {
    const meteo = await publish(ines)
    await react(meteo.id, 'bravo', malik)
    const before = (await notifications(ines))[0]?.id

    await react(meteo.id, 'funny', zoe)

    const after = await notifications(ines)
    expect(after).toHaveLength(1)
    expect(after[0]?.id).toBe(before)
  })

  it('makes a group new again, and first, when it grows after being seen', async () => {
    const meteo = await publish(ines)
    await react(meteo.id, 'bravo', malik)
    await comment(meteo.id, malik, 'Super idée.')
    await openScreen(ines)
    expect((await notifications(ines)).map((n) => [n.kind, n.isNew])).toEqual([
      ['comment', false],
      ['reactions', false],
    ])

    await react(meteo.id, 'bravo', zoe)

    expect((await notifications(ines)).map((n) => [n.kind, n.isNew])).toEqual([
      ['reactions', true],
      ['comment', false],
    ])
    expect(await unread(ines)).toBe(1)
  })

  it('tells nobody but the author of the project', async () => {
    const meteo = await publish(ines)
    await react(meteo.id, 'bravo', malik)

    expect(await notifications(malik)).toEqual([])
    expect(await notifications(zoe)).toEqual([])
  })
})

describe('followers', () => {
  it('groups the followers of a project by project and by day, without names', async () => {
    const meteo = await publish(ines)
    await follow('projects', meteo.id, malik)
    await follow('projects', meteo.id, zoe)

    const items = await notifications(ines)

    expect(items).toEqual([
      expect.objectContaining({
        kind: 'project_follows',
        project: { id: meteo.id, title: 'Météo' },
        day: '2026-06-15',
        count: 2,
        at: new Date(Date.now()).toISOString(),
      }),
    ])
    expect(JSON.stringify(items)).not.toMatch(/Malik|Zoé|malik|zoe/)
  })

  it('groups the followers of the member by day, without names nor project', async () => {
    await follow('members', inesId, malik)
    await follow('members', inesId, zoe)
    later(DAY)
    await follow('members', inesId, sam)

    const items = await notifications(ines)

    expect(items).toMatchObject([
      { kind: 'member_follows', day: '2026-06-16', count: 1 },
      { kind: 'member_follows', day: '2026-06-15', count: 2 },
    ])
    expect(items[0]).not.toHaveProperty('project')
    expect(JSON.stringify(items)).not.toMatch(/Malik|Zoé|Sam|malik|zoe|sam/)
  })

  it('takes a follower who leaves out of the number, and removes the group at zero', async () => {
    const meteo = await publish(ines)
    await follow('members', inesId, malik)
    await follow('members', inesId, zoe)
    await follow('projects', meteo.id, malik)

    await unfollow('members', inesId, zoe)
    await unfollow('projects', meteo.id, malik)

    expect(await notifications(ines)).toMatchObject([{ kind: 'member_follows', count: 1 }])
  })
})

describe('comments', () => {
  it('tells the author of the project, with the name of the commenter and an excerpt', async () => {
    const meteo = await publish(ines)

    const published = await comment(meteo.id, malik, 'Super idée, je teste ce soir.')

    expect(await notifications(ines)).toEqual([
      {
        id: expect.any(String),
        kind: 'comment',
        reason: 'comment',
        at: published.createdAt,
        isNew: true,
        project: { id: meteo.id, title: 'Météo' },
        comment: { id: published.id, excerpt: 'Super idée, je teste ce soir.' },
        author: { id: malikId, name: 'Malik', avatarUrl: null, handle: 'malik' },
      },
    ])
  })

  it('cuts a long comment to an excerpt of 80 characters', async () => {
    const meteo = await publish(ines)
    const body = `${'Une très longue remarque sur la météo de demain. '.repeat(4)}Fin.`

    await comment(meteo.id, malik, body)

    const [notification] = await notifications(ines)
    if (notification?.kind !== 'comment') throw new Error('expected a comment notification')
    const { excerpt } = notification.comment
    expect(excerpt.length).toBeLessThanOrEqual(81)
    expect(excerpt.length).toBeGreaterThan(40)
    expect(excerpt.endsWith('…')).toBe(true)
    expect(body.startsWith(excerpt.slice(0, -1).trimEnd())).toBe(true)
  })

  it('follows the current text of an edited comment', async () => {
    const meteo = await publish(ines)
    const published = await comment(meteo.id, malik, 'Premier jet.')

    await editComment(meteo.id, published.id, malik, 'Texte corrigé.')

    expect(await notifications(ines)).toMatchObject([
      { kind: 'comment', comment: { id: published.id, excerpt: 'Texte corrigé.' } },
    ])
  })

  it('disappears with a deleted comment', async () => {
    const meteo = await publish(ines)
    const published = await comment(meteo.id, malik, 'Je retire ce que j’ai dit.')

    await deleteComment(meteo.id, published.id, malik)

    expect(await notifications(ines)).toEqual([])
  })

  it('tells the author of a thread about a reply from another, and the author of the project too', async () => {
    const meteo = await publish(ines)
    const root = await comment(meteo.id, malik, 'Super idée.')

    const reply = await comment(meteo.id, zoe, 'Tout à fait d’accord.', root.id)

    expect(commentReasons(await notifications(malik))).toEqual([`reply:${reply.id}`])
    expect(commentReasons(await notifications(ines))).toEqual([
      `comment:${reply.id}`,
      `comment:${root.id}`,
    ])
  })

  it('tells nobody else in the thread, unless mentioned', async () => {
    const meteo = await publish(ines)
    const root = await comment(meteo.id, malik, 'Super idée.')
    await comment(meteo.id, zoe, 'D’accord.', root.id)

    const third = await comment(meteo.id, sam, 'Moi aussi.', root.id)

    // Zoé a répondu dans le fil, mais n'en est pas l'autrice : rien pour elle.
    expect(await notifications(zoe)).toEqual([])
    expect(commentReasons(await notifications(malik))[0]).toBe(`reply:${third.id}`)
  })

  it('gives a single notification per comment: mention, else reply, else comment', async () => {
    const meteo = await publish(ines)
    const inesRoot = await comment(meteo.id, ines, 'Vos idées ?')
    const malikRoot = await comment(meteo.id, malik, 'La neige, peut-être.')

    // Une réponse dans le fil d'Inès, sur son projet : « réponse », pas aussi « commentaire ».
    const reply = await comment(meteo.id, malik, 'Et la grêle.', inesRoot.id)
    // Un commentaire sur son projet qui la mentionne : « mention », pas aussi « commentaire ».
    const mention = await comment(meteo.id, zoe, 'Qu’en dit @ines_morel ?')
    // Une réponse dans le fil de Malik qui le mentionne : « mention », pas aussi « réponse ».
    const replyMention = await comment(meteo.id, zoe, 'Bien vu @malik', malikRoot.id)

    expect(commentReasons(await notifications(ines))).toEqual([
      `comment:${replyMention.id}`,
      `mention:${mention.id}`,
      `reply:${reply.id}`,
      `comment:${malikRoot.id}`,
    ])
    expect(commentReasons(await notifications(malik))).toEqual([`mention:${replyMention.id}`])
  })

  it('counts in the bell only what the list shows: not a comment whose author has no handle', async () => {
    const meteo = await publish(ines)
    await openScreen(ines) // celle du pseudo est vue
    await comment(meteo.id, malik, 'Super idée.')
    expect(await unread(ines)).toBe(1) // témoin
    // Malik n'a plus de pseudo actuel (comme un compte d'avant la tranche 6a, pas encore servi par
    // le rattrapage) : la liste ne peut pas montrer son commentaire.
    await ctx.db.delete(schema.memberHandle).where(eq(schema.memberHandle.userId, malikId))

    expect(await notifications(ines)).toEqual([])
    expect(await unread(ines)).toBe(0)
  })

  it('never comes from my own gestures', async () => {
    const meteo = await publish(ines)
    const root = await comment(meteo.id, ines, 'Vos idées ?')
    await comment(meteo.id, ines, 'Je précise : pour l’été.', root.id)
    await comment(meteo.id, ines, 'Note pour moi : @ines_morel')
    const malikRoot = await comment(meteo.id, malik, 'La neige.')
    await comment(meteo.id, malik, 'Et la grêle.', malikRoot.id)

    expect(await notifications(ines)).toMatchObject([
      { kind: 'comment', reason: 'comment' },
      { kind: 'comment', reason: 'comment', comment: { id: malikRoot.id } },
    ])
    // Malik a répondu dans son propre fil : rien pour lui.
    expect(await notifications(malik)).toEqual([])
  })
})

describe('mentions', () => {
  it('tells a mentioned member who can read the comment', async () => {
    const meteo = await publish(ines)

    const published = await comment(meteo.id, malik, 'Tu as vu, @zoe ?')

    expect(await notifications(zoe)).toEqual([
      expect.objectContaining({
        kind: 'comment',
        reason: 'mention',
        project: { id: meteo.id, title: 'Météo' },
        comment: { id: published.id, excerpt: 'Tu as vu, @zoe ?' },
        author: { id: malikId, name: 'Malik', avatarUrl: null, handle: 'malik' },
      }),
    ])
  })

  it('tells nobody about a comment on a private project: nobody else can read it', async () => {
    const draft = await publish(ines, { visibility: 'private' })

    await comment(draft.id, ines, 'À montrer à @malik et @zoe plus tard.')

    expect(await notifications(malik)).toEqual([])
    expect(await notifications(zoe)).toEqual([])
  })

  it('tells a member added by an edit, and forgets a member taken out', async () => {
    const meteo = await publish(ines)
    const published = await comment(meteo.id, malik, 'Tu as vu, @zoe ?')

    await editComment(meteo.id, published.id, malik, 'Tu as vu, @sam ?')

    expect(await notifications(zoe)).toEqual([])
    expect(await notifications(sam)).toMatchObject([
      // La mention ajoutée est datée de la modification.
      { kind: 'comment', reason: 'mention', at: new Date(Date.now()).toISOString() },
    ])
  })

  it('keeps the date of a mention that an edit leaves in place', async () => {
    const meteo = await publish(ines)
    const published = await comment(meteo.id, malik, 'Tu as vu, @zoe ?')

    await editComment(meteo.id, published.id, malik, 'Tu as vu, @zoe ? Et toi, @sam ?')

    expect(await notifications(zoe)).toMatchObject([{ at: published.createdAt }])
  })
})

describe('a hidden comment', () => {
  it('tells its author, and only her', async () => {
    const meteo = await publish(ines)
    const published = await comment(meteo.id, malik, 'Un avis un peu vif.')

    await hide(meteo.id, published.id, ines)

    expect(await notifications(malik)).toEqual([
      {
        id: expect.any(String),
        kind: 'hidden',
        at: new Date(Date.now()).toISOString(),
        isNew: true,
        project: { id: meteo.id, title: 'Météo' },
        comment: { id: published.id, excerpt: 'Un avis un peu vif.' },
      },
    ])
    expect((await notifications(zoe)).filter((n) => n.kind === 'hidden')).toEqual([])
    expect((await notifications(ines)).filter((n) => n.kind === 'hidden')).toEqual([])
  })

  it('removes that notification when the comment is shown again, or deleted', async () => {
    const meteo = await publish(ines)
    const first = await comment(meteo.id, malik, 'Un avis un peu vif.')
    const second = await comment(meteo.id, malik, 'Un autre.')
    await hide(meteo.id, first.id, ines)
    await hide(meteo.id, second.id, ines)

    await unhide(meteo.id, first.id, ines)
    await deleteComment(meteo.id, second.id, malik)

    expect(await notifications(malik)).toEqual([])
  })

  it('hides the mention from the members it names, except the author of the project', async () => {
    const meteo = await publish(ines)
    const published = await comment(meteo.id, malik, '@zoe et @ines_morel, regardez.')

    await hide(meteo.id, published.id, ines)

    expect(await notifications(zoe)).toEqual([])
    expect(commentReasons(await notifications(ines))).toEqual([`mention:${published.id}`])

    await unhide(meteo.id, published.id, ines)

    expect(commentReasons(await notifications(zoe))).toEqual([`mention:${published.id}`])
  })
})

describe('a project that becomes private', () => {
  it('takes every notification about it away, and brings them back when public again', async () => {
    const meteo = await publish(ines)
    await react(meteo.id, 'bravo', malik)
    await follow('projects', meteo.id, malik)
    await comment(meteo.id, malik, 'Bravo @zoe et @ines_morel, regardez.')
    const before = await notifications(ines)
    expect(before).toHaveLength(3)

    await setVisibility(meteo.id, ines, 'private')

    expect(await notifications(ines)).toEqual([])
    expect(await notifications(zoe)).toEqual([])

    await setVisibility(meteo.id, ines, 'public')

    expect((await notifications(ines)).map((n) => n.id)).toEqual(before.map((n) => n.id))
    expect(await notifications(zoe)).toHaveLength(1)
  })
})

describe('a deleted account', () => {
  it('takes its reactions, follows and comments out of the notifications of others', async () => {
    const meteo = await publish(ines)
    await react(meteo.id, 'bravo', malik)
    await react(meteo.id, 'bravo', zoe)
    await follow('members', inesId, malik)
    await follow('projects', meteo.id, malik)
    await comment(meteo.id, malik, 'Super idée.')

    await deleteAccount(malik, malikAccount.password)

    expect(await notifications(ines)).toMatchObject([{ kind: 'reactions', total: 1 }])
  })
})

describe('keeping notifications 90 days', () => {
  it('shows a notification for 90 days, then never again', async () => {
    const meteo = await publish(ines)
    await react(meteo.id, 'bravo', malik)

    later(90 * DAY - 2 * MINUTE)
    let session = await signInAgain(inesAccount)
    expect((await readPage(session)).items.map((n) => n.kind)).toEqual(['reactions', 'handle'])

    later(3 * MINUTE)
    session = await signInAgain(inesAccount)

    // Celle du pseudo, née à l'inscription, est partie aussi.
    expect((await readPage(session)).items).toEqual([])
    expect(await unread(session)).toBe(0)
  })
})

describe('the handle', () => {
  it('is the first notification of a new member, dated from the verification of her address', async () => {
    expect((await readPage(ines)).items).toEqual([
      {
        id: expect.any(String),
        kind: 'handle',
        handle: 'ines_morel',
        at: START.toISOString(),
        isNew: true,
      },
    ])
    expect(await unread(ines)).toBe(1)
  })

  // Ce test disait « donne le pseudo actuel après un changement » : la notification aurait alors dit
  // « Ton pseudo est @ines », comme si on le lui avait donné. Relecture juridique de la tranche 6b :
  // elle parle du pseudo reçu, et disparaît dès que le membre en choisit un lui-même.
  it('disappears once the member chooses a handle herself: it would no longer be true', async () => {
    expect(await unread(ines)).toBe(1) // témoin : celle du pseudo reçu
    later()
    const res = await send('PATCH', '/v1/me', ines, { handle: 'ines' })
    expect(res.status).toBe(200)

    expect((await readPage(ines)).items).toEqual([])
    expect(await unread(ines)).toBe(0)
  })
})

describe('pages', () => {
  /** Inès publie `count` projets ; Malik réagit à chacun. */
  const projectsWithReactions = async (count: number) => {
    const projects = []
    for (let i = 0; i < count; i++) {
      const project = await publish(ines, { title: `Projet ${i + 1}` })
      await react(project.id, 'bravo', malik)
      projects.push(project)
    }
    return projects
  }

  it('loads 20 by 20, with nothing repeated nor skipped, and ends with a null cursor', async () => {
    const projects = await projectsWithReactions(12)
    for (const project of projects.slice(0, 10)) await comment(project.id, malik, 'Bravo.')
    // 12 groupes de réactions, 10 commentaires et le pseudo : 23 notifications.

    const first = await readPage(ines)
    // Une notification qui arrive entre deux pages ne décale pas la suite.
    await comment(projects[11]?.id ?? '', zoe, 'Arrivé entre deux pages.')
    const second = await readPage(ines, first.nextCursor ?? undefined)

    expect(first.items).toHaveLength(NOTIFICATION_PAGE_SIZE)
    expect(first.nextCursor).not.toBeNull()
    expect(second.items).toHaveLength(3)
    expect(second.nextCursor).toBeNull()
    const all = [...first.items, ...second.items]
    expect(new Set(all.map((n) => n.id)).size).toBe(23)
    const dates = all.map((n) => Date.parse(n.at))
    expect(dates).toEqual([...dates].sort((a, b) => b - a))
    expect(second.items.at(-1)?.kind).toBe('handle')
  })

  it('refuses a cursor that is not one of ours', async () => {
    for (const cursor of ['{"at":"2026"}', 'pas un curseur']) {
      const res = await send('GET', `/v1/notifications?${new URLSearchParams({ cursor })}`, ines)
      expect(res.status, cursor).toBe(400)
    }
  })

  it('caps the number of the bell at 10: the app shows « 9+ »', async () => {
    await projectsWithReactions(11)

    expect(await unread(ines)).toBe(10)
  })
})

describe('marking as seen', () => {
  it('gives the time of the server with each page, and marks seen what existed then', async () => {
    const meteo = await publish(ines)
    await react(meteo.id, 'bravo', malik)
    const page = await readPage(ines)
    expect(page.asOf).toBe(new Date(Date.now()).toISOString())

    // Un commentaire arrive pendant qu'Inès regarde l'écran : elle n'est pas « vue ».
    await comment(meteo.id, zoe, 'Arrivé pendant la lecture.')
    await expectDone(await markSeen(ines, page.asOf))

    expect(await unread(ines)).toBe(1)
    expect((await readPage(ines)).items.map((n) => [n.kind, n.isNew])).toEqual([
      ['comment', true],
      ['reactions', false],
      ['handle', false],
    ])
  })

  it('never goes back: an older date changes nothing', async () => {
    const meteo = await publish(ines)
    await react(meteo.id, 'bravo', malik)
    await openScreen(ines)

    await expectDone(await markSeen(ines, new Date(Date.now() - HOUR).toISOString()))

    expect(await unread(ines)).toBe(0)
  })

  it('never goes beyond the time of the server', async () => {
    const meteo = await publish(ines)

    await expectDone(await markSeen(ines, new Date(Date.now() + DAY).toISOString()))
    await react(meteo.id, 'bravo', malik)

    expect(await unread(ines)).toBe(1)
  })

  it('counts for one member only', async () => {
    const meteo = await publish(ines)
    await react(meteo.id, 'bravo', malik)

    await openScreen(malik)

    expect(await unread(ines)).toBe(2)
  })

  it('refuses something that is not a date', async () => {
    for (const upTo of ['maintenant', null, 12]) {
      await expectError(await markSeen(ines, upTo), 400, 'validation')
    }
  })
})

describe('the rights', () => {
  it('asks to sign in on every route', async () => {
    await expectError(await send('GET', '/v1/notifications', null), 401, 'unauthorized')
    await expectError(await send('GET', '/v1/notifications/unread', null), 401, 'unauthorized')
    await expectError(await markSeen(null, new Date().toISOString()), 401, 'unauthorized')
    // Témoin : les mêmes demandes, avec la session d'Inès, réussissent (les routes existent).
    expect((await send('GET', '/v1/notifications', ines)).status).toBe(200)
    expect((await send('GET', '/v1/notifications/unread', ines)).status).toBe(200)
    expect((await markSeen(ines, new Date().toISOString())).status).toBe(204)
  })

  /**
   * Range directement le compteur de ce membre à `count` demandes déjà faites dans la minute :
   * 300 lectures réelles recalculeraient 300 fois la liste, pour rien de plus.
   */
  const alreadyUsed = (key: string, count: number) =>
    ctx.db.insert(schema.apiRateLimit).values({ key, count, windowStart: Date.now() })

  it('answers 300 reads a minute, list and bell together, counting malformed ones, then asks to wait', async () => {
    await alreadyUsed(memberCounterKeys(inesId).notificationsRead, 298)
    // La 299e, mal formée, compte aussi ; la 300e, celle de la cloche, passe encore.
    const bad = await send('GET', `/v1/notifications?${new URLSearchParams({ cursor: 'x' })}`, ines)
    expect(bad.status).toBe(400)
    expect((await send('GET', '/v1/notifications/unread', ines)).status).toBe(200)

    await expectError(await send('GET', '/v1/notifications', ines), 429, 'rate_limited')
    await expectError(await send('GET', '/v1/notifications/unread', ines), 429, 'rate_limited')
    // Chaque membre a son compteur ; une minute plus tard, Inès lit de nouveau.
    expect((await send('GET', '/v1/notifications', malik)).status).toBe(200)
    later(MINUTE)
    expect((await send('GET', '/v1/notifications', ines)).status).toBe(200)
  })

  it('answers 60 « seen » a minute, counting malformed ones, then asks to wait', async () => {
    await alreadyUsed(memberCounterKeys(inesId).notificationsSeen, 59)
    await expectError(await markSeen(ines, 'maintenant'), 400, 'validation')

    await expectError(await markSeen(ines, new Date().toISOString()), 429, 'rate_limited')
    // Le compteur des lectures est un autre : la liste se lit toujours.
    expect((await send('GET', '/v1/notifications', ines)).status).toBe(200)
    later(MINUTE)
    await expectDone(await markSeen(ines, new Date().toISOString()))
  })

  it('shows each member her own notifications only', async () => {
    const meteo = await publish(ines)
    await react(meteo.id, 'bravo', malik)
    await comment(meteo.id, malik, 'Secret de Malik et Inès.')

    const res = await send('GET', '/v1/notifications', zoe)
    const text = await res.text()

    // Témoin : la liste de Zoé se lit (la sienne, avec son pseudo), sans rien de celle d'Inès.
    expect(res.status).toBe(200)
    expect(text).toContain('"zoe"')
    expect(text).not.toContain(meteo.id)
    expect(text).not.toContain('Secret')
    expect(text).not.toContain('ines_morel')
  })
})

// ─── Tranche 7a : les deux notifications de la modération ─────────────────────────────────────────
// « removed » prévient l'auteur d'un contenu retiré (clé removed:<id de la décision>) ;
// « report_handled » prévient la personne qui a signalé (clé report:<id du signalement>). Règles 2
// et 3 de la relecture du plan (22/10/2026). Sam est l'administrateur : son rôle est posé en base,
// comme le fait infra/grant-admin.sh.
describe('the notifications of the moderation', () => {
  let act: ReturnType<typeof activity>
  let samId: string

  beforeEach(async () => {
    act = activity(ctx)
    samId = (await me(sam)).id
    await act.makeAdmin(samId)
  })

  const report = async (cookie: string, target: ReportTarget) => {
    later()
    return act.report(cookie, target)
  }
  const remove = async (target: ReportTarget, explanation = 'Publicité déguisée.') => {
    later()
    return act.decide(sam, { action: 'remove', target, ground: 'rules', explanation })
  }
  const dismiss = async (target: ReportTarget) => {
    later()
    return act.decide(sam, { action: 'dismiss', target })
  }
  const ofKind = async (cookie: string, kind: Notification['kind']) =>
    (await notifications(cookie)).filter((n) => n.kind === kind)

  describe('« removed », to the author', () => {
    it('tells the author of a removed project, with the ground and the explanation', async () => {
      const meteo = await publish(ines)
      await report(malik, { kind: 'project', id: meteo.id })
      const before = await unread(ines)

      const decision = await remove({ kind: 'project', id: meteo.id })

      expect(await ofKind(ines, 'removed')).toEqual([
        {
          id: `removed:${decision.id}`,
          kind: 'removed',
          at: new Date(Date.now()).toISOString(),
          isNew: true,
          targetKind: 'project',
          project: { id: meteo.id, title: 'Météo' },
          excerpt: null,
          ground: 'rules',
          explanation: 'Publicité déguisée.',
          afterReport: true,
        },
      ])
      expect(await unread(ines)).toBe(before + 1)
      // Personne d'autre ne la reçoit.
      expect(await ofKind(malik, 'removed')).toEqual([])
      expect(await ofKind(zoe, 'removed')).toEqual([])
    })

    it('gives an excerpt of a removed note or comment', async () => {
      const meteo = await publish(ines)
      later()
      const noteRes = await send('POST', `/v1/projects/${meteo.id}/notes`, ines, {
        body: 'Une note publicitaire',
      })
      expect(noteRes.status).toBe(201)
      const note = (await noteRes.json()) as { id: string }
      const published = await comment(meteo.id, malik, 'Un commentaire insultant')
      await report(zoe, { kind: 'note', id: note.id })
      await report(zoe, { kind: 'comment', id: published.id })

      await remove({ kind: 'note', id: note.id })
      await remove({ kind: 'comment', id: published.id }, 'Insulte.')

      expect(await ofKind(ines, 'removed')).toMatchObject([
        { targetKind: 'note', project: { id: meteo.id }, excerpt: 'Une note publicitaire' },
      ])
      expect(await ofKind(malik, 'removed')).toMatchObject([
        {
          targetKind: 'comment',
          project: { id: meteo.id, title: 'Météo' },
          excerpt: 'Un commentaire insultant',
          explanation: 'Insulte.',
        },
      ])
    })

    it('disappears when the content is restored', async () => {
      const meteo = await publish(ines)
      await report(malik, { kind: 'project', id: meteo.id })
      await remove({ kind: 'project', id: meteo.id })
      expect(await ofKind(ines, 'removed')).toHaveLength(1)

      later()
      await act.decide(sam, { action: 'restore', target: { kind: 'project', id: meteo.id } })

      expect(await ofKind(ines, 'removed')).toEqual([])
    })

    // Règle 3 : la notification d'un commentaire retiré passe par la visibilité du projet.
    it('never shows the title of a project that became private, for a removed comment', async () => {
      const meteo = await publish(ines)
      const published = await comment(meteo.id, malik, 'Un commentaire insultant')
      await report(zoe, { kind: 'comment', id: published.id })
      await remove({ kind: 'comment', id: published.id })
      expect(await ofKind(malik, 'removed')).toHaveLength(1) // témoin

      await setVisibility(meteo.id, ines, 'private')

      const page = await send('GET', '/v1/notifications', malik)
      const text = await page.text()
      expect(page.status).toBe(200)
      expect(text).not.toContain('Météo')
      expect(text).not.toContain(meteo.id)
    })
  })

  // Relecture de sécurité de 4966555 (B1), règle 1 du plan : un commentaire retiré ne se lit plus,
  // pas même par l'auteur du projet. Les notifications de commentaires (raisons « comment »,
  // « mention », « reply ») ne passent pas par `sees` mais par sa copie en SQL brut, `readable`
  // (notifications/load.ts) : c'est cette copie que ce test couvre, dans la liste de l'écran et
  // dans loadNotificationsSince, d'où partent le récap et les e-mails de mentions.
  describe('a comment removed by the moderation', () => {
    it('tells nobody about it any more: not the author of the project, not the members it names', async () => {
      const zoeId = (await me(zoe)).id
      const since = new Date(Date.now())
      const meteo = await publish(ines)
      const fromZoe = await comment(meteo.id, zoe, 'Un commentaire de Zoé')
      const mention = await comment(meteo.id, malik, 'Regarde ça, @zoe !')
      const reply = await comment(meteo.id, malik, 'Une réponse insultante', fromZoe.id)
      const removed = [mention.id, reply.id]
      // Témoins, avant le retrait : Inès apprend les trois commentaires, Zoé la mention et la réponse.
      expect(commentReasons(await notifications(ines))).toEqual(
        expect.arrayContaining([`comment:${mention.id}`, `comment:${reply.id}`]),
      )
      expect(commentReasons(await notifications(zoe))).toEqual(
        expect.arrayContaining([`mention:${mention.id}`, `reply:${reply.id}`]),
      )
      const zoeBefore = await loadNotificationsSince(
        ctx.db,
        zoeId,
        since,
        new Date(Date.now()),
        TEST_API_URL,
      )
      expect(zoeBefore.map(({ row }) => row.comment_id)).toEqual(
        expect.arrayContaining([mention.id, reply.id]),
      )

      for (const id of removed) {
        await report(sam, { kind: 'comment', id })
        await remove({ kind: 'comment', id }, 'Insulte.')
      }
      later()
      const until = new Date(Date.now())

      for (const [name, cookie, memberId] of [
        ['Inès', ines, inesId],
        ['Zoé', zoe, zoeId],
      ] as const) {
        // La liste de l'écran : plus rien de ces deux commentaires, ni leur id, ni leur texte.
        const res = await send('GET', '/v1/notifications', cookie)
        expect(res.status, name).toBe(200)
        const text = await res.text()
        for (const leak of [...removed, 'Regarde ça', 'insultante']) {
          expect(text, `${name}: ${leak}`).not.toContain(leak)
        }
        // La source des e-mails (récap, mentions) : pas davantage.
        const items = await loadNotificationsSince(ctx.db, memberId, since, until, TEST_API_URL)
        for (const { row, notification } of items) {
          expect(removed, name).not.toContain(row.comment_id)
          expect(JSON.stringify(notification), name).not.toContain('insultante')
        }
        // Témoin : seul le commentaire de Zoé reste, pour Inès ; Zoé n'apprend pas le sien.
        expect(
          items.flatMap(({ row }) => (row.kind === 'comment' ? [row.comment_id] : [])),
          name,
        ).toEqual(name === 'Inès' ? [fromZoe.id] : [])
      }
      // Témoin : le commentaire de Zoé, lui, n'est pas retiré, et Inès l'apprend toujours.
      expect(commentReasons(await notifications(ines))).toEqual([`comment:${fromZoe.id}`])
    })
  })

  describe('« report_handled », to the reporter', () => {
    it('tells each reporter that the content was removed, without a link to it', async () => {
      const meteo = await publish(ines)
      const fromMalik = await report(malik, { kind: 'project', id: meteo.id })
      const fromZoe = await report(zoe, { kind: 'project', id: meteo.id })

      await remove({ kind: 'project', id: meteo.id })

      for (const [cookie, created] of [
        [malik, fromMalik],
        [zoe, fromZoe],
      ] as const) {
        expect(await ofKind(cookie, 'report_handled')).toEqual([
          {
            id: `report:${created.id}`,
            kind: 'report_handled',
            at: new Date(Date.now()).toISOString(),
            isNew: true,
            targetKind: 'project',
            outcome: 'removed',
            // Le projet retiré ne se voit plus : aucun lien.
            link: null,
          },
        ])
      }
      expect(await ofKind(ines, 'report_handled')).toEqual([])
    })

    it('tells the reporter that the content stays, with a link while it is visible', async () => {
      const meteo = await publish(ines)
      await report(malik, { kind: 'project', id: meteo.id })
      await report(zoe, { kind: 'member', id: inesId })

      await dismiss({ kind: 'project', id: meteo.id })
      await dismiss({ kind: 'member', id: inesId })

      expect(await ofKind(malik, 'report_handled')).toMatchObject([
        {
          targetKind: 'project',
          outcome: 'dismissed',
          link: { projectId: meteo.id, memberId: null },
        },
      ])
      expect(await ofKind(zoe, 'report_handled')).toMatchObject([
        { targetKind: 'member', outcome: 'dismissed', link: { projectId: null, memberId: inesId } },
      ])
    })

    // Règle 2 : ni titre, ni extrait, ni auteur, ni explication ; un lien seulement si la cible se
    // voit encore au moment de la lecture.
    it('says nothing of a project made private or removed after the report', async () => {
      const meteo = await publish(ines, { title: 'Météo secrète' })
      const velo = await publish(ines, { title: 'Vélo du dimanche' })
      const onVelo = await comment(velo.id, zoe, 'Un commentaire sur Vélo')
      await report(malik, { kind: 'project', id: meteo.id })
      await report(malik, { kind: 'comment', id: onVelo.id })
      await dismiss({ kind: 'project', id: meteo.id })
      await dismiss({ kind: 'comment', id: onVelo.id })

      await setVisibility(meteo.id, ines, 'private')
      await report(zoe, { kind: 'project', id: velo.id })
      await remove({ kind: 'project', id: velo.id }, 'Explication du retrait.')

      const res = await send('GET', '/v1/notifications', malik)
      const text = await res.text()
      const handled = NotificationPage.parse(JSON.parse(text)).items.filter(
        (n) => n.kind === 'report_handled',
      )
      expect(handled.map((n) => n.kind === 'report_handled' && n.link)).toEqual([null, null])
      for (const leak of [
        meteo.id,
        velo.id,
        'Météo secrète',
        'Vélo du dimanche',
        'Un commentaire sur Vélo',
        'Explication du retrait',
        inesId,
        'Inès',
        'ines_morel',
      ]) {
        expect(text, leak).not.toContain(leak)
      }
    })

    it('gives no link to a comment that was removed', async () => {
      const meteo = await publish(ines)
      const published = await comment(meteo.id, zoe, 'Un commentaire insultant')
      await report(malik, { kind: 'comment', id: published.id })

      await remove({ kind: 'comment', id: published.id })

      expect(await ofKind(malik, 'report_handled')).toMatchObject([
        { targetKind: 'comment', outcome: 'removed', link: null },
      ])
    })
  })
})
