// Tests d'intégration de la tranche 6a : le pseudo unique d'un membre. Il le reçoit en vérifiant son
// adresse, le lit dans « Mon profil » et sur sa page, le change (l'ancien lui reste réservé 30 jours),
// le retrouve dans l'export, et le libère en supprimant son compte. Scénario :
// docs/scenarios/phase-1.md, « Tranche 6a — Le pseudo ». Deux membres : Inès et Max.
//
// Le temps est maîtrisé par le test, comme dans comments.test.ts : vi.useFakeTimers remplace
// l'horloge de JavaScript (Date) par une fausse, qu'on avance à la main. Les 30 jours de réservation
// et le quota de 5 changements par jour se vérifient ainsi sans attendre.
import { appName } from '@ruche/brand'
import { AccountExport, ErrorResponse, Handle, Me, Member } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { type SQL, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backfillHandles } from './handles/claim'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let ines: string // cookies de session
let max: string
let inesId: string
let maxId: string

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE

const inesAccount = {
  name: 'Inès Morel',
  email: 'ines@example.com',
  password: 'correct-horse-battery',
}
const maxAccount = { name: 'Max', email: 'max@example.com', password: 'another-long-password' }

beforeEach(async () => {
  // La fausse horloge est posée avant de créer l'API : la limite de débit garde la fonction
  // Date.now qu'elle trouve à ce moment-là (voir feed.test.ts).
  const start = Date.now()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(start)

  ctx = await createTestContext()
  ines = await ctx.verifiedMember(inesAccount)
  max = await ctx.verifiedMember(maxAccount)
  inesId = (await me(ines)).id
  maxId = (await me(max)).id
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge. */
const later = (ms: number) => vi.setSystemTime(Date.now() + ms)

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

const patchMe = (cookie: string | null, body: object) => send('PATCH', '/v1/me', cookie, body)

/** Change de pseudo et vérifie que l'API accepte. */
const changeHandle = async (cookie: string, handle: string) => {
  const res = await patchMe(cookie, { handle })
  expect(res.status, `change to ${handle}`).toBe(200)
  return Me.parse(await res.json())
}

const memberPage = async (id: string, cookie: string) => {
  const res = await send('GET', `/v1/members/${encodeURIComponent(id)}`, cookie)
  expect(res.status).toBe(200)
  return Member.parse(await res.json())
}

const exportOf = async (cookie: string) => {
  const res = await send('GET', '/v1/me/export', cookie)
  expect(res.status).toBe(200)
  return AccountExport.parse(await res.json())
}

/** La réponse « déjà pris », avec son message traduit. */
const expectTaken = async (res: Response) => {
  expect(res.status).toBe(409)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe('handle_taken')
}

/** Ouvre le dernier lien de vérification reçu à cette adresse ; renvoie le cookie de session. */
const openVerificationLink = async (email: string) => {
  const link = ctx.mailer.sent.findLast((sent) => sent.to === email)?.text.match(/https?:\/\/\S+/)
  if (!link) throw new Error(`no verification link for ${email}`)
  const url = new URL(link[0])
  return ctx.cookiesFrom(await ctx.request(url.pathname + url.search))
}

/** Se reconnecte : une session dure 7 jours, et certains tests avancent l'horloge d'un mois. */
const signInAgain = async (account: { email: string; password: string }) => {
  const res = await ctx.signIn(account)
  expect(res.status).toBe(200)
  return ctx.cookiesFrom(res)
}

const deleteAccount = async (cookie: string, password: string) => {
  const res = await send('POST', '/api/auth/delete-user', cookie, { password })
  expect(res.status).toBe(200)
}

/**
 * Une requête SQL brute, pour lire la table des pseudos telle que le plan la décrit
 * (`member_handle` : handle, user_id, claimed_at, released_at). Le résultat n'est pas typé : on
 * précise sa forme nous-mêmes (voir packages/db/src/db.test.ts).
 */
const rows = async <T>(query: SQL) =>
  ((await ctx.db.execute(query)) as unknown as { rows: T[] }).rows

/** Le pseudo actuel d'un membre, lu directement dans la base (sans le filet de GET /v1/me). */
const currentHandleInDb = async (userId: string) => {
  const found = await rows<{ handle: string }>(
    sql`select handle from member_handle where user_id = ${userId} and released_at is null`,
  )
  return found.map((row) => row.handle)
}

describe('receiving a handle', () => {
  it('gives a member who verifies her address a handle made from her name', async () => {
    expect((await me(ines)).handle).toBe('ines_morel')
    expect((await me(max)).handle).toBe('max')
  })

  it('numbers the handle when it is already taken: 2, then 3', async () => {
    const second = await ctx.verifiedMember({ ...inesAccount, email: 'ines2@example.com' })
    const third = await ctx.verifiedMember({ ...inesAccount, email: 'ines3@example.com' })

    expect((await me(second)).handle).toBe('ines_morel2')
    expect((await me(third)).handle).toBe('ines_morel3')
  })

  it('gives no handle before the address is verified, so an unverified account blocks none', async () => {
    // Une première « Inès Morel » s'inscrit sans ouvrir son lien ; une seconde vérifie la sienne.
    await ctx.signUp({ ...inesAccount, email: 'first@example.com' })
    const second = await ctx.verifiedMember({ ...inesAccount, email: 'second@example.com' })
    expect((await me(second)).handle).toBe('ines_morel2')

    // La première vérifie enfin son adresse : elle reçoit le numéro suivant, pas celui d'avant.
    const first = await openVerificationLink('first@example.com')

    expect((await me(first)).handle).toBe('ines_morel3')
  })

  it('skips a handle that its former owner still has in reserve', async () => {
    await changeHandle(ines, 'ines')

    const newcomer = await ctx.verifiedMember({ ...inesAccount, email: 'other@example.com' })

    expect((await me(newcomer)).handle).toBe('ines_morel2')
  })

  it('never gives a reserved word, even to a member named like one', async () => {
    const admin = await ctx.verifiedMember({ ...maxAccount, name: 'Admin', email: 'a@example.com' })
    const brand = await ctx.verifiedMember({ ...maxAccount, name: appName, email: 'b@example.com' })

    for (const cookie of [admin, brand]) {
      const { handle } = await me(cookie)
      expect(Handle.safeParse(handle).success, handle).toBe(true)
      expect(handle).not.toBe('admin')
      expect(handle).not.toBe(appName.toLowerCase())
    }
  })

  it('starts with « member_ » for a name in another alphabet, in the language of the account', async () => {
    const english = await ctx.verifiedMember({
      name: '李小龙',
      email: 'li@example.com',
      password: 'li-long-password',
      language: 'en',
    })
    const french = await ctx.verifiedMember({
      name: '李小龙',
      email: 'li2@example.com',
      password: 'li-long-password',
    })

    expect((await me(english)).handle).toMatch(/^member_/)
    expect((await me(french)).handle).toMatch(/^membre_/)
  })

  it('keeps the handle when the name changes', async () => {
    const res = await patchMe(ines, { name: 'Inès M.' })

    expect(res.status).toBe(200)
    expect(Me.parse(await res.json())).toMatchObject({ name: 'Inès M.', handle: 'ines_morel' })
  })

  it('gives one on the way to a member who has none yet, on her profile and on her page', async () => {
    // Un compte d'avant la tranche 6a, que le rattrapage du démarrage n'aurait pas encore vu.
    await ctx.db.execute(sql`delete from member_handle`)

    expect((await me(ines)).handle).toBe('ines_morel')
    expect((await memberPage(maxId, ines)).handle).toBe('max')
  })
})

describe('giving a handle to the members already signed up', () => {
  /** Des comptes d'avant la tranche 6a, rangés directement dans la base, sans pseudo. */
  const insertOldAccounts = async () => {
    await ctx.db.insert(schema.user).values([
      { id: 'old-1', name: 'Zoé Martin', email: 'zoe@example.com', emailVerified: true },
      { id: 'old-2', name: 'Zoé Martin', email: 'zoe2@example.com', emailVerified: true },
      {
        id: 'old-3',
        name: '李小龙',
        email: 'li@example.com',
        emailVerified: true,
        language: 'en',
      },
      { id: 'old-4', name: 'Inès Morel', email: 'ines-old@example.com', emailVerified: true },
      { id: 'never', name: 'Jamais Vérifié', email: 'never@example.com', emailVerified: false },
    ])
  }

  it('gives one to every verified member who has none, the same way as at sign-up', async () => {
    await insertOldAccounts()

    await backfillHandles(ctx.db)

    const zoes = [...(await currentHandleInDb('old-1')), ...(await currentHandleInDb('old-2'))]
    expect(zoes.sort()).toEqual(['zoe_martin', 'zoe_martin2'])
    expect((await currentHandleInDb('old-3'))[0]).toMatch(/^member_/)
    // « ines_morel » est déjà à Inès, inscrite après la tranche 6a.
    expect(await currentHandleInDb('old-4')).toEqual(['ines_morel2'])
    // Un compte jamais vérifié n'en reçoit pas.
    expect(await currentHandleInDb('never')).toEqual([])
    // Ceux qui en avaient un le gardent.
    expect(await currentHandleInDb(inesId)).toEqual(['ines_morel'])
  })

  it('changes nothing when it runs a second time', async () => {
    await insertOldAccounts()
    await backfillHandles(ctx.db)
    const all = sql`select handle, user_id, claimed_at, released_at from member_handle order by handle`
    const first = await rows(all)

    await backfillHandles(ctx.db)

    expect(await rows(all)).toEqual(first)
  })
})

describe('seeing a handle', () => {
  it('shows the handle of a member on her page to another member', async () => {
    expect((await memberPage(inesId, max)).handle).toBe('ines_morel')
    expect((await memberPage(inesId, ines)).handle).toBe('ines_morel')
  })

  it('never shows the former handle, neither on her page nor anywhere else for others', async () => {
    await changeHandle(ines, 'ines')

    const page = await send('GET', `/v1/members/${inesId}`, max)
    const ownProfile = await send('GET', '/v1/me', ines)

    const pageText = await page.text()
    // Témoin : la page montre bien le pseudo actuel.
    expect(Member.parse(JSON.parse(pageText)).handle).toBe('ines')
    expect(pageText).not.toContain('ines_morel')
    // Même pour elle, « Mon profil » ne montre que le pseudo actuel (l'ancien est dans l'export).
    expect(await ownProfile.text()).not.toContain('ines_morel')
  })

  it('is only shown to signed-in members', async () => {
    const res = await send('GET', `/v1/members/${inesId}`, null)

    expect(res.status).toBe(401)
    expect(await res.text()).not.toContain('ines_morel')
    // Témoin : connecté, la même page donne le pseudo.
    expect((await memberPage(inesId, max)).handle).toBe('ines_morel')
  })
})

describe('changing my handle', () => {
  it('replaces the handle, on my profile and on my page', async () => {
    const updated = await changeHandle(ines, 'ines')

    expect(updated.handle).toBe('ines')
    expect((await me(ines)).handle).toBe('ines')
    expect((await memberPage(inesId, max)).handle).toBe('ines')
  })

  it('lowers the case and removes an « @ » typed at the start', async () => {
    expect((await changeHandle(ines, ' @Ines ')).handle).toBe('ines')
    // La comparaison avec les pseudos des autres se fait elle aussi sur la forme nettoyée.
    await expectTaken(await patchMe(max, { handle: '@INES' }))
  })

  it('refuses a handle of the wrong form, and keeps the current one', async () => {
    for (const handle of ['in', 'i'.repeat(21), '1nes', 'inès', 'ines-morel', 'admin', appName]) {
      const res = await patchMe(ines, { handle })
      expect(res.status, handle).toBe(400)
      expect(ErrorResponse.parse(await res.json()).error.code).toBe('validation')
    }

    expect((await me(ines)).handle).toBe('ines_morel')
  })

  it('says « already taken », in the language of the member, for the handle of another', async () => {
    const taken = await ctx.request('/v1/me', {
      method: 'PATCH',
      headers: { cookie: max, 'content-type': 'application/json', 'Accept-Language': 'en' },
      body: JSON.stringify({ handle: 'ines_morel' }),
    })

    expect(taken.status).toBe(409)
    expect(ErrorResponse.parse(await taken.json()).error).toEqual({
      code: 'handle_taken',
      message: 'This handle is already taken. Choose another one.',
    })
    expect((await me(max)).handle).toBe('max')
  })

  it('answers exactly the same for a handle in use and a handle in reserve', async () => {
    // « ines » est en usage chez Inès ; « ines_morel », son ancien, lui reste réservé.
    await changeHandle(ines, 'ines')

    const inUse = await patchMe(max, { handle: 'ines' })
    const reserved = await patchMe(max, { handle: 'ines_morel' })

    expect(inUse.status).toBe(409)
    expect(reserved.status).toBe(inUse.status)
    // Rien ne dit lequel des deux : ni le corps, ni les en-têtes qui pourraient varier.
    expect(await reserved.text()).toBe(await inUse.text())
    expect(reserved.headers.get('content-type')).toBe(inUse.headers.get('content-type'))
  })

  it('lets the former owner take her former handle back within the 30 days', async () => {
    await changeHandle(ines, 'ines')
    later(29 * DAY)
    const session = await signInAgain(inesAccount)

    expect((await changeHandle(session, 'ines_morel')).handle).toBe('ines_morel')
    // Elle a repris l'ancien : c'est maintenant « ines » qui lui reste réservé.
    expect((await exportOf(session)).formerHandle?.handle).toBe('ines')
  })

  it('keeps the former handle for its owner during 30 days, then frees it', async () => {
    await changeHandle(ines, 'ines')

    later(30 * DAY - MINUTE)
    const maxThen = await signInAgain(maxAccount)
    await expectTaken(await patchMe(maxThen, { handle: 'ines_morel' }))

    later(2 * MINUTE)
    expect((await changeHandle(maxThen, 'ines_morel')).handle).toBe('ines_morel')
  })

  it('keeps only the last former handle in reserve: changing twice frees the first one', async () => {
    await changeHandle(ines, 'ines')
    await changeHandle(ines, 'ines_m')

    expect((await changeHandle(max, 'ines_morel')).handle).toBe('ines_morel')
    await expectTaken(await patchMe(max, { handle: 'ines' }))
    expect((await exportOf(ines)).formerHandle?.handle).toBe('ines')
  })

  it('does not count keeping the current handle as a change', async () => {
    await changeHandle(ines, 'ines')
    const before = (await exportOf(ines)).formerHandle

    // Le même pseudo, tapé autrement : rien ne change, ni le pseudo, ni l'ancien réservé.
    later(MINUTE)
    const res = await patchMe(ines, { handle: '@INES', bio: 'Je bricole des agents.' })

    expect(res.status).toBe(200)
    expect(Me.parse(await res.json())).toMatchObject({
      handle: 'ines',
      bio: 'Je bricole des agents.',
    })
    expect((await exportOf(ines)).formerHandle).toEqual(before)
    expect(before?.handle).toBe('ines_morel')
  })

  it('saves nothing of the profile when the handle is taken', async () => {
    const res = await patchMe(max, { handle: 'ines_morel', name: 'Max L.', bio: 'Nouvelle bio' })

    await expectTaken(res)
    expect(await me(max)).toMatchObject({ name: 'Max', bio: '', handle: 'max' })
  })

  it('gives a handle to only one of two members who ask for it at the same time', async () => {
    const [first, second] = await Promise.all([
      patchMe(ines, { handle: 'zoe_x' }),
      patchMe(max, { handle: 'zoe_x' }),
    ])

    expect([first.status, second.status].sort()).toEqual([200, 409])
    const owners = [(await me(ines)).handle, (await me(max)).handle].filter((h) => h === 'zoe_x')
    expect(owners).toHaveLength(1)
  })
})

describe('the daily limit of handle changes', () => {
  /** Cinq changements de pseudo : le maximum d'une journée. */
  const fiveChanges = async () => {
    for (const handle of ['ines_a', 'ines_b', 'ines_c', 'ines_d', 'ines_e']) {
      await changeHandle(ines, handle)
    }
  }

  it('blocks a 6th change within a day, and saves nothing of that request', async () => {
    await fiveChanges()

    const res = await patchMe(ines, { handle: 'ines_f', bio: 'Une de trop' })

    expect(res.status).toBe(429)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('handle_change_limit')
    expect(res.headers.get('retry-after')).toBeTruthy()
    expect(await me(ines)).toMatchObject({ handle: 'ines_e', bio: '' })
  })

  it('lets the member change again the next day', async () => {
    await fiveChanges()
    expect((await patchMe(ines, { handle: 'ines_f' })).status).toBe(429)

    later(DAY + MINUTE)

    expect((await changeHandle(ines, 'ines_f')).handle).toBe('ines_f')
  })

  it('still lets the member save the rest of the profile, with the current handle', async () => {
    await fiveChanges()

    // L'appli peut renvoyer le pseudo actuel avec le reste : ce n'est pas un changement.
    const res = await patchMe(ines, { handle: 'ines_e', bio: 'Toujours là' })

    expect(res.status).toBe(200)
    expect(await me(ines)).toMatchObject({ handle: 'ines_e', bio: 'Toujours là' })
  })

  it('counts each member apart', async () => {
    await fiveChanges()

    expect((await changeHandle(max, 'max_l')).handle).toBe('max_l')
  })

  it('counts an attempt at a taken handle, so that nobody can probe handles without end', async () => {
    for (const handle of ['ines_a', 'ines_b', 'ines_c', 'ines_d']) await changeHandle(ines, handle)
    await expectTaken(await patchMe(ines, { handle: 'max' }))

    expect((await patchMe(ines, { handle: 'ines_z' })).status).toBe(429)
  })
})

describe('the order of the checks', () => {
  it('asks to sign in before looking at the handle', async () => {
    const res = await patchMe(null, { handle: '1nes' })
    // Témoin : avec une session, la même demande est refusée pour sa forme.
    const signedIn = await patchMe(ines, { handle: '1nes' })

    expect(res.status).toBe(401)
    expect(signedIn.status).toBe(400)
  })

  it('checks the form of the handle before the daily limit', async () => {
    for (const handle of ['ines_a', 'ines_b', 'ines_c', 'ines_d', 'ines_e']) {
      await changeHandle(ines, handle)
    }

    expect((await patchMe(ines, { handle: '1nes' })).status).toBe(400)
    // Témoin : un pseudo bien formé, lui, bute sur la limite.
    expect((await patchMe(ines, { handle: 'ines_f' })).status).toBe(429)
  })
})

describe('deleting my account', () => {
  it('frees the handle and the former handle at once', async () => {
    await changeHandle(ines, 'ines')

    await deleteAccount(ines, inesAccount.password)

    expect((await changeHandle(max, 'ines')).handle).toBe('ines')
    expect((await changeHandle(max, 'ines_morel')).handle).toBe('ines_morel')
  })

  it('lets a newcomer of the same name receive the handle', async () => {
    await deleteAccount(ines, inesAccount.password)

    const newcomer = await ctx.verifiedMember({ ...inesAccount, email: 'new@example.com' })

    expect((await me(newcomer)).handle).toBe('ines_morel')
  })

  it('leaves no trace of the member: no handle row, no counter', async () => {
    await changeHandle(ines, 'ines')

    await deleteAccount(ines, inesAccount.password)

    expect(
      await rows(sql`select handle from member_handle where user_id = ${inesId}`),
    ).toHaveLength(0)
    const counters = await ctx.db.select({ key: schema.apiRateLimit.key }).from(schema.apiRateLimit)
    expect(counters.filter(({ key }) => key.includes(inesId))).toEqual([])
  })
})

describe('exporting my data', () => {
  it('gives my handle, and no former handle before any change', async () => {
    const data = await exportOf(ines)

    expect(data.user.handle).toBe('ines_morel')
    expect(data.formerHandle).toBeNull()
  })

  it('gives the former handle in reserve, with the date when it becomes free', async () => {
    const changedAt = Date.now()
    await changeHandle(ines, 'ines')

    const data = await exportOf(ines)

    expect(data.user.handle).toBe('ines')
    expect(data.formerHandle).toEqual({
      handle: 'ines_morel',
      reservedUntil: new Date(changedAt + 30 * DAY).toISOString(),
    })
  })

  it('no longer gives the former handle once it is free', async () => {
    await changeHandle(ines, 'ines')
    later(30 * DAY + MINUTE)
    const session = await signInAgain(inesAccount)

    expect((await exportOf(session)).formerHandle).toBeNull()
  })

  it('never gives the handles of another member', async () => {
    await changeHandle(ines, 'ines_secret')

    const text = await (await send('GET', '/v1/me/export', max)).text()

    expect(text).not.toContain('ines_secret')
    expect(text).not.toContain('ines_morel')
    // Témoin : l'export d'Inès, lui, les donne tous les deux.
    const own = await exportOf(ines)
    expect([own.user.handle, own.formerHandle?.handle]).toEqual(['ines_secret', 'ines_morel'])
  })
})

describe('the notification of the handle', () => {
  // La première notification d'un membre dit le pseudo qu'il a reçu (tranche 6b). Elle est datée
  // par sa ligne notification_state, qui naît avec le pseudo (packages/db/src/schema/notifications.ts).
  // Ses notifications elles-mêmes sont testées dans notifications.test.ts.
  const t = schema.notificationState
  /** La ligne d'un membre (aucune ou une) : sa date de naissance et jusqu'où il a vu. */
  const stateOf = async (userId: string) =>
    (
      await ctx.db
        .select({ createdAt: t.createdAt, seenAt: t.seenAt })
        .from(t)
        .where(sql`${t.userId} = ${userId}`)
    ).map((row) => ({ createdAt: row.createdAt.toISOString(), seenAt: row.seenAt }))
  const now = () => new Date(Date.now()).toISOString()

  it('is born with the handle, when the member verifies her address', async () => {
    // Inès a vérifié son adresse au début du test, et l'horloge n'a pas bougé depuis.
    expect(await stateOf(inesId)).toEqual([{ createdAt: now(), seenAt: null }])
  })

  it('is not born before the address is verified', async () => {
    await ctx.signUp({ ...inesAccount, email: 'first@example.com' })
    const [pending] = await rows<{ id: string }>(
      sql`select id from "user" where email = 'first@example.com'`,
    )
    expect(await stateOf(pending?.id ?? '')).toEqual([])

    later(MINUTE)
    const first = await openVerificationLink('first@example.com')

    expect(await stateOf((await me(first)).id)).toEqual([{ createdAt: now(), seenAt: null }])
  })

  it('is born with a handle given on the way, on « My profile »', async () => {
    await ctx.db.execute(sql`delete from member_handle where user_id = ${inesId}`)
    await ctx.db.execute(sql`delete from notification_state where user_id = ${inesId}`)
    later(MINUTE)

    expect((await me(ines)).handle).toBe('ines_morel')

    expect(await stateOf(inesId)).toEqual([{ createdAt: now(), seenAt: null }])
  })

  it('is given at startup to the members who already had a handle, and to the others with theirs', async () => {
    // Les membres d'avant la tranche 6b ont un pseudo, mais pas encore de ligne : comme Max ici.
    await ctx.db.execute(sql`delete from notification_state where user_id = ${maxId}`)
    // Un compte d'avant la tranche 6a, sans pseudo ni ligne, et un compte jamais vérifié.
    await ctx.db.insert(schema.user).values([
      { id: 'old-1', name: 'Zoé Martin', email: 'zoe@example.com', emailVerified: true },
      { id: 'never', name: 'Jamais Vérifié', email: 'never@example.com', emailVerified: false },
    ])
    const inesBefore = await stateOf(inesId)
    expect(inesBefore).toHaveLength(1)
    later(DAY)

    await backfillHandles(ctx.db)

    expect(await stateOf(maxId)).toEqual([{ createdAt: now(), seenAt: null }])
    expect(await stateOf('old-1')).toEqual([{ createdAt: now(), seenAt: null }])
    expect(await stateOf('never')).toEqual([])
    // Inès avait déjà la sienne : elle ne change pas.
    expect(await stateOf(inesId)).toEqual(inesBefore)
  })

  it('changes nothing at the next startup', async () => {
    await ctx.db.execute(sql`delete from notification_state where user_id = ${maxId}`)
    await backfillHandles(ctx.db)
    const first = await stateOf(maxId)
    expect(first).toHaveLength(1)
    later(DAY)

    await backfillHandles(ctx.db)

    expect(await stateOf(maxId)).toEqual(first)
  })
})
