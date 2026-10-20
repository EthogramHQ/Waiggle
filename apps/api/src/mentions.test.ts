// Tests d'intégration des mentions (tranche 6b) : écrire « @ines_morel » dans un commentaire, ce que
// l'API en garde (le membre, par son identifiant), ce qu'elle renvoie avec le commentaire, et la
// liste des membres proposés pendant qu'on tape « @in » (GET /v1/members/mentionable). Scénario :
// docs/scenarios/phase-1.md, « Précisions (tranche 6b) », « Mentionner ». Les notifications que
// font naître les mentions sont testées dans notifications.test.ts.
//
// Trois membres : Inès (autrice du projet « Météo », pseudo ines_morel), Malik (qui commente et
// mentionne, pseudo malik) et Zoé (pseudo zoe, qui lit). Le temps est maîtrisé par le test, comme
// dans comments.test.ts : les 30 jours de réservation d'un ancien pseudo et le quota horaire des
// suggestions se vérifient sans attendre.
import {
  Comment,
  CommentPage,
  ErrorResponse,
  Me,
  MentionableList,
  NotificationPage,
  Project,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let ines: string // cookies de session
let malik: string
let zoe: string
let inesId: string
let malikId: string
let zoeId: string

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const inesAccount = {
  name: 'Inès Morel',
  email: 'ines@example.com',
  password: 'ines-long-password',
}
const malikAccount = { name: 'Malik', email: 'malik@example.com', password: 'malik-long-password' }
const zoeAccount = { name: 'Zoé', email: 'zoe@example.com', password: 'zoe-long-password' }

beforeEach(async () => {
  // La fausse horloge est posée avant de créer l'API : la limite de débit garde la fonction
  // Date.now qu'elle trouve à ce moment-là (voir feed.test.ts).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-06-15T08:00:00.000Z'))

  ctx = await createTestContext()
  ines = await ctx.verifiedMember(inesAccount)
  malik = await ctx.verifiedMember(malikAccount)
  zoe = await ctx.verifiedMember(zoeAccount)
  inesId = (await me(ines)).id
  malikId = (await me(malik)).id
  zoeId = (await me(zoe)).id
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

/** Publie un commentaire (une réponse si `replyTo` est donné) et le renvoie tel que l'API l'a décrit. */
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

/** Les commentaires racines de la première page, tels que ce membre les lit. */
const readComments = async (projectId: string, cookie: string) => {
  const res = await send('GET', `/v1/projects/${projectId}/comments`, cookie)
  expect(res.status).toBe(200)
  return CommentPage.parse(await res.json()).items
}

const changeHandle = async (cookie: string, handle: string) => {
  later()
  const res = await send('PATCH', '/v1/me', cookie, { handle })
  expect(res.status, `change to ${handle}`).toBe(200)
}

const signInAgain = async (account: { email: string; password: string }) => {
  const res = await ctx.signIn(account)
  expect(res.status).toBe(200)
  return ctx.cookiesFrom(res)
}

const deleteAccount = async (cookie: string, password: string) => {
  const res = await send('POST', '/api/auth/delete-user', cookie, { password })
  expect(res.status).toBe(200)
}

/** Les mentions d'une notification de commentaire, telles que ce membre les reçoit. */
const mentionNotifications = async (cookie: string) => {
  const res = await send('GET', '/v1/notifications', cookie)
  expect(res.status).toBe(200)
  return NotificationPage.parse(await res.json()).items.filter(
    (n) => n.kind === 'comment' && n.reason === 'mention',
  )
}

/**
 * Des membres vérifiés, rangés directement dans la base avec leur pseudo : plus rapide que six
 * inscriptions, et l'inscription est limitée à 10 par heure et par adresse IP.
 */
const insertMembers = async (handles: string[]) => {
  await ctx.db.insert(schema.user).values(
    handles.map((handle) => ({
      id: `id-${handle}`,
      name: `Membre ${handle}`,
      email: `${handle}@example.com`,
      emailVerified: true,
    })),
  )
  await ctx.db
    .insert(schema.memberHandle)
    .values(handles.map((handle) => ({ handle, userId: `id-${handle}`, claimedAt: new Date() })))
}

describe('writing a mention', () => {
  it('gives the member it names with the comment, by id, and in the list of comments', async () => {
    const meteo = await publish(ines)

    const published = await comment(meteo.id, malik, 'Merci @ines_morel !')

    const expected = [{ handle: 'ines_morel', memberId: inesId }]
    expect(published).toMatchObject({ body: 'Merci @ines_morel !', mentions: expected })
    expect((await readComments(meteo.id, zoe))[0]?.mentions).toEqual(expected)
  })

  it('accepts capitals, and keeps the text as it was typed', async () => {
    const meteo = await publish(ines)

    const published = await comment(meteo.id, malik, 'Merci @Ines_Morel !')

    expect(published.body).toBe('Merci @Ines_Morel !')
    expect(published.mentions).toEqual([{ handle: 'ines_morel', memberId: inesId }])
  })

  it('leaves as plain text a handle that names nobody, and an email address', async () => {
    const meteo = await publish(ines)

    const published = await comment(
      meteo.id,
      malik,
      '@personne, écris à zoe@example.com, ou demande à @ines_morel',
    )

    // Seule la dernière est une mention d'un membre (témoin : l'extraction a bien lieu).
    expect(published.mentions).toEqual([{ handle: 'ines_morel', memberId: inesId }])
  })

  it('names each member once, in the order of the text', async () => {
    const meteo = await publish(ines)

    const published = await comment(meteo.id, malik, '@zoe, @ines_morel et encore @ZOE')

    expect(published.mentions).toEqual([
      { handle: 'zoe', memberId: zoeId },
      { handle: 'ines_morel', memberId: inesId },
    ])
  })

  it('keeps the first 5 members: beyond, plain text', async () => {
    const meteo = await publish(ines)
    await insertMembers(['m_one', 'm_two', 'm_three', 'm_four', 'm_five', 'm_six'])

    // « @personne » ne désigne personne : il ne prend pas de place parmi les 5.
    const published = await comment(
      meteo.id,
      malik,
      '@personne @m_one @m_two @m_three @m_four @m_five @m_six',
    )

    expect(published.mentions.map((m) => m.memberId)).toEqual([
      'id-m_one',
      'id-m_two',
      'id-m_three',
      'id-m_four',
      'id-m_five',
    ])
    expect(published.body).toContain('@m_six')
  })

  it('ignores a former handle, even in reserve for its owner', async () => {
    const meteo = await publish(ines)
    await changeHandle(ines, 'ines')

    const published = await comment(meteo.id, malik, 'Merci @ines_morel !')

    expect(published.mentions).toEqual([])
    expect(await mentionNotifications(ines)).toEqual([])
  })

  it('gives the mentions of replies too', async () => {
    const meteo = await publish(ines)
    const root = await comment(meteo.id, malik, 'Super idée.')

    await comment(meteo.id, zoe, 'Bien vu @malik', root.id)

    const [thread] = await readComments(meteo.id, ines)
    expect(thread?.mentions).toEqual([])
    expect(thread?.replies[0]?.mentions).toEqual([{ handle: 'malik', memberId: malikId }])
  })

  it('follows an edit: a mention added appears, a mention taken out disappears', async () => {
    const meteo = await publish(ines)
    const published = await comment(meteo.id, malik, 'Tu as vu, @zoe ?')

    await editComment(meteo.id, published.id, malik, 'Tu as vu, @ines_morel ?')

    expect((await readComments(meteo.id, zoe))[0]?.mentions).toEqual([
      { handle: 'ines_morel', memberId: inesId },
    ])
  })

  it('shows the mentions of a hidden comment only to those who still read it', async () => {
    const meteo = await publish(ines)
    const published = await comment(meteo.id, malik, 'Un avis vif, @zoe.')
    await comment(meteo.id, zoe, 'Réponse.', published.id) // sa place reste dans la liste
    later()
    const hidden = await send('PUT', `/v1/projects/${meteo.id}/comments/${published.id}/hide`, ines)
    expect(hidden.status).toBe(204)

    const expected = [{ handle: 'zoe', memberId: zoeId }]
    expect((await readComments(meteo.id, ines))[0]?.mentions).toEqual(expected)
    expect((await readComments(meteo.id, malik))[0]?.mentions).toEqual(expected)
    // Pour Zoé, le commentaire n'est qu'une place vide : ni texte, ni mention.
    expect((await readComments(meteo.id, zoe))[0]).toMatchObject({
      state: 'hidden',
      body: '',
      mentions: [],
    })
  })

  it('tells nobody about a « @ » in a note: mentions live in comments only', async () => {
    const meteo = await publish(ines)
    later()
    const res = await send('POST', `/v1/projects/${meteo.id}/notes`, ines, {
      body: 'Merci @zoe pour l’idée.',
    })
    expect(res.status).toBe(201)

    expect(await mentionNotifications(zoe)).toEqual([])
  })
})

describe('a handle that changes after the mention', () => {
  it('keeps the text, and the link to the same member', async () => {
    const meteo = await publish(ines)
    await comment(meteo.id, malik, 'Merci @ines_morel !')

    await changeHandle(ines, 'ines')

    expect((await readComments(meteo.id, zoe))[0]).toMatchObject({
      body: 'Merci @ines_morel !',
      mentions: [{ handle: 'ines_morel', memberId: inesId }],
    })
  })

  it('never leads to the member who takes the handle later', async () => {
    const meteo = await publish(ines)
    await comment(meteo.id, malik, 'Merci @ines_morel !')
    await changeHandle(ines, 'ines')
    // Après les 30 jours de réservation, Zoé prend « ines_morel » (sessions de 7 jours : on se
    // reconnecte).
    later(30 * DAY + MINUTE)
    const zoeAgain = await signInAgain(zoeAccount)
    const malikAgain = await signInAgain(malikAccount)
    await changeHandle(zoeAgain, 'ines_morel')

    expect((await readComments(meteo.id, zoeAgain))[0]?.mentions).toEqual([
      { handle: 'ines_morel', memberId: inesId },
    ])
    // Un nouveau commentaire, lui, désigne Zoé : le pseudo est à elle maintenant.
    const fresh = await comment(meteo.id, malikAgain, 'Salut @ines_morel')
    expect(fresh.mentions).toEqual([{ handle: 'ines_morel', memberId: zoeId }])
  })
})

describe('a deleted account', () => {
  it('turns the mention of a deleted member into plain text', async () => {
    const meteo = await publish(ines)
    const published = await comment(meteo.id, malik, 'Tu as vu, @zoe ?')
    // Témoin : avant la suppression, la mention désigne Zoé.
    expect(published.mentions).toEqual([{ handle: 'zoe', memberId: zoeId }])

    await deleteAccount(zoe, zoeAccount.password)

    expect((await readComments(meteo.id, ines))[0]).toMatchObject({
      id: published.id,
      body: 'Tu as vu, @zoe ?',
      mentions: [],
    })
  })

  it('gives no mention with the place of a comment whose author left', async () => {
    const meteo = await publish(ines)
    const published = await comment(meteo.id, malik, 'Tu as vu, @zoe ?')
    await comment(meteo.id, zoe, 'Oui !', published.id) // sa place reste dans la liste
    // Témoin : avant la suppression, la mention est donnée avec le commentaire.
    expect((await readComments(meteo.id, ines))[0]?.mentions).toEqual([
      { handle: 'zoe', memberId: zoeId },
    ])

    await deleteAccount(malik, malikAccount.password)

    expect((await readComments(meteo.id, ines))[0]).toMatchObject({
      id: published.id,
      author: null,
      state: 'deleted',
      mentions: [],
    })
  })
})

describe('the members proposed after « @ »', () => {
  const mentionable = (cookie: string | null, params: Record<string, string>) =>
    send('GET', `/v1/members/mentionable?${new URLSearchParams(params)}`, cookie)

  /** Les pseudos proposés à ce membre (la demande doit réussir). */
  const proposed = async (cookie: string, params: Record<string, string>) => {
    const res = await mentionable(cookie, params)
    expect(res.status).toBe(200)
    return MentionableList.parse(await res.json()).members.map((m) => m.handle)
  }

  /** Inscrit et vérifie un membre de plus ; renvoie son cookie de session. */
  const member = (name: string) =>
    ctx.verifiedMember({
      name,
      email: `${name.toLowerCase()}@example.com`,
      password: 'a-long-enough-password',
    })

  it('proposes the close members first, then the others, 5 at most', async () => {
    const meteo = await publish(ines)
    // Des pseudos qui commencent tous par « in » : ina, inaya, inda, inge, inu (et ines_morel).
    await member('Ina')
    await member('Inaya')
    await member('Inda')
    const inge = await member('Inge')
    const inu = await member('Inu')
    // Les proches de Malik sur « Météo » : l'autrice (Inès), qui l'a commenté (Inge), et qui il
    // suit (Inu). Par ordre alphabétique seul, ils ne seraient pas en tête.
    await comment(meteo.id, inge, 'Joli.')
    later()
    const inuId = (await me(inu)).id
    expect((await send('POST', `/v1/members/${inuId}/follow`, malik)).status).toBe(204)

    const handles = await proposed(malik, { q: 'in', projectId: meteo.id })

    expect(handles).toHaveLength(5)
    expect(handles.slice(0, 3).sort()).toEqual(['ines_morel', 'inge', 'inu'])
    expect(handles.slice(3)).toEqual(['ina', 'inaya'])
  })

  it('searches the start of the handle only, with capitals and an « @ » accepted', async () => {
    const meteo = await publish(ines)

    expect(await proposed(malik, { q: '@INES', projectId: meteo.id })).toEqual(['ines_morel'])
    // Ni le milieu du pseudo, ni le nom.
    expect(await proposed(malik, { q: 'morel', projectId: meteo.id })).toEqual([])
    await changeHandle(ines, 'zebra')
    expect(await proposed(malik, { q: 'ine', projectId: meteo.id })).toEqual([])
    expect(await proposed(malik, { q: 'zeb', projectId: meteo.id })).toEqual(['zebra'])
  })

  it('gives the name, the handle and the picture, never the email address', async () => {
    const meteo = await publish(ines)

    const res = await mentionable(malik, { q: 'ines', projectId: meteo.id })

    expect(res.status).toBe(200)
    const raw = await res.text()
    expect(MentionableList.parse(JSON.parse(raw))).toEqual({
      members: [{ id: inesId, name: 'Inès Morel', handle: 'ines_morel', avatarUrl: null }],
    })
    expect(raw).not.toContain('@example.com')
  })

  it('proposes verified accounts only', async () => {
    const meteo = await publish(ines)
    await ctx.signUp({ name: 'Inès Bis', email: 'bis@example.com', password: 'a-long-password' })
    // Un compte rangé avec un pseudo mais jamais vérifié (comme un compte importé à la main).
    await ctx.db.insert(schema.user).values({
      id: 'unverified',
      name: 'Inès Ter',
      email: 'ter@example.com',
      emailVerified: false,
    })
    await ctx.db
      .insert(schema.memberHandle)
      .values({ handle: 'ines_ter', userId: 'unverified', claimedAt: new Date() })

    expect(await proposed(malik, { q: 'ines', projectId: meteo.id })).toEqual(['ines_morel'])
  })

  it('answers « not found » for a project the member cannot see, as for an unknown one', async () => {
    const draft = await publish(ines, { visibility: 'private' })

    const hidden = await mentionable(malik, { q: 'ma', projectId: draft.id })
    const unknown = await mentionable(malik, {
      q: 'ma',
      projectId: '00000000-0000-4000-8000-000000000000',
    })

    expect(hidden.status).toBe(404)
    expect(unknown.status).toBe(404)
    expect(await hidden.json()).toEqual(await unknown.json())
    // Témoin : son autrice, elle, y cherche qui elle veut.
    expect(await proposed(ines, { q: 'ma', projectId: draft.id })).toEqual(['malik'])
  })

  it('waits for 2 characters, and refuses a malformed request', async () => {
    const meteo = await publish(ines)

    for (const params of [
      { q: 'i', projectId: meteo.id },
      { q: 'in%', projectId: meteo.id },
      { q: 'in', projectId: 'meteo' },
      { q: 'in' },
    ]) {
      await expectError(await mentionable(malik, params), 400, 'validation')
    }
  })

  it('is only for signed-in members', async () => {
    const meteo = await publish(ines)

    await expectError(
      await mentionable(null, { q: 'in', projectId: meteo.id }),
      401,
      'unauthorized',
    )
    // Témoin : la même demande, avec une session, réussit (la route existe bien).
    expect(await proposed(malik, { q: 'in', projectId: meteo.id })).toEqual(['ines_morel'])
  })

  it('answers 600 searches an hour per member, then asks to wait', async () => {
    const meteo = await publish(ines)
    const params = { q: 'in', projectId: meteo.id }
    for (let i = 0; i < 600; i++) {
      const res = await mentionable(malik, params)
      if (res.status !== 200) throw new Error(`search ${i + 1}: status ${res.status}`)
    }

    await expectError(await mentionable(malik, params), 429, 'rate_limited')
    // Chaque membre a son compteur : Zoé cherche encore.
    expect(await proposed(zoe, params)).toEqual(['ines_morel'])
    // Une heure plus tard, Malik aussi.
    later(HOUR)
    expect(await proposed(malik, params)).toEqual(['ines_morel'])
  }, 60_000)
})
