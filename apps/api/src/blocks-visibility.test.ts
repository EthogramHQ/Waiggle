// Ce qu'un blocage cache, lecture par lecture (tranche 7b) : le fil, les étiquettes, la page d'un
// projet, les réactions, les suggestions après « @ », les notifications et l'export. Scénario :
// docs/scenarios/phase-1.md, « Tranche 7b — Bloquer » ; règles 3, 4, 9 et 12 de la relecture du
// plan (24/10/2026). Les routes du blocage sont testées dans blocks.test.ts, les commentaires dans
// comments.test.ts, les e-mails dans jobs/. Après la relecture de la branche (25/10/2026), ce
// fichier ajoute : la règle 7 dans les deux sens (A2), le geste d'un tiers sur le projet de
// l'autre (B2), et les preuves de trois routes de l'inventaire (A5 : modifier, masquer, le fil
// « Abonnements »).
//
// Trois membres : Inès (autrice du projet « Météo »), Malik (bloqué avec elle, dans un sens ou dans
// l'autre) et Zoé (une troisième, qui montre que les autres ne voient aucune différence). Louis,
// administrateur, sert aux notifications de modération. Chaque règle se vérifie dans les deux sens
// du blocage : « Inès a bloqué Malik » et « Malik a bloqué Inès ».
import {
  AccountExport,
  type AccountExport as AccountExportType,
  MENTION_EMAIL_DELAY_MINUTES,
  MentionableList,
  type Notification,
  NotificationPage,
  Project,
  toolSlug,
  UnreadCount,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { fill, resources } from '@ruche/i18n'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mentionEmails } from './jobs/mention-emails'
import { activity } from './testing/activity'
import {
  createTestContext,
  TEST_API_URL,
  TEST_APP_URL,
  TEST_AUTH_SECRET,
  type TestContext,
} from './testing/context'

let ctx: TestContext
let act: ReturnType<typeof activity>
let ines: string // cookies de session
let malik: string
let zoe: string
let louis: string
let inesId: string
let malikId: string
let zoeId: string
let meteo: Project // le projet public d'Inès

const SECOND = 1000
const MINUTE = 60 * SECOND
const START = new Date('2026-06-15T08:00:00.000Z')
const UNKNOWN = '00000000-0000-4000-8000-000000000000'
const inesAccount = { name: 'Inès', email: 'ines@example.com', password: 'ines-long-password' }

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  ines = await ctx.verifiedMember(inesAccount)
  malik = await ctx.verifiedMember({
    name: 'Malik',
    email: 'malik@example.com',
    password: 'malik-long-password',
  })
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  inesId = (await act.me(ines)).id
  malikId = (await act.me(malik)).id
  zoeId = (await act.me(zoe)).id
  await act.makeAdmin((await act.me(louis)).id)
  meteo = await act.publish(ines, 'Météo', { tools: ['Mistral'] })
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une seconde : deux gestes n'ont jamais la même date). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

/** Les deux sens du blocage, avec qui bloque qui. */
const DIRECTIONS = [
  ['Inès blocked Malik', () => act.block(malikId, ines)],
  ['Malik blocked Inès', () => act.block(inesId, malik)],
] as const

const get = async (path: string, cookie: string) => {
  const res = await act.send('GET', path, cookie)
  expect(res.status, path).toBe(200)
  return res
}

// ─── Les lectures de contenus ────────────────────────────────────────────────────────────────────

describe.each(DIRECTIONS)('the contents, when %s', (_, blockNow) => {
  it('hides the projects of the other one from the discovery feed and the tag pages', async () => {
    const velo = await act.publish(malik, 'Vélo', { tools: ['Mistral'] })
    later()
    await act.send('POST', `/v1/projects/${meteo.id}/notes`, ines, { body: 'Une note de Météo' })
    await blockNow()

    for (const [cookie, hidden] of [
      [malik, meteo.id],
      [ines, velo.id],
    ] as const) {
      const discover = await (await get('/v1/feed/discover', cookie)).text()
      expect(discover).not.toContain(hidden)
      const tag = await (await get(`/v1/tags/${toolSlug('Mistral')}`, cookie)).text()
      expect(tag).not.toContain(hidden)
    }
    // Zoé voit les deux projets. (Découvrir ne montre jamais de note : la note d'Inès se lit sur la
    // page du projet, qui répond 404 à Malik, test suivant.)
    const zoeFeed = await (await get('/v1/feed/discover', zoe)).text()
    for (const witness of [meteo.id, velo.id]) {
      expect(zoeFeed).toContain(witness)
    }
  })

  it('answers the page of a project of the other one as an unknown project', async () => {
    await blockNow()

    const res = await act.send('GET', `/v1/projects/${meteo.id}`, malik)
    const unknown = await act.send('GET', `/v1/projects/${UNKNOWN}`, malik)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual(await unknown.json())
    // Inès garde sa page, Zoé la lit.
    await get(`/v1/projects/${meteo.id}`, ines)
    await get(`/v1/projects/${meteo.id}`, zoe)
  })

  // Précision 4 : les réactions déjà données restent dans les compteurs, les mêmes pour tous.
  it('keeps the reactions already given in the counts', async () => {
    await act.react(meteo.id, 'bravo', malik)
    await act.react(meteo.id, 'bravo', zoe)
    await blockNow()

    for (const cookie of [ines, zoe]) {
      const project = Project.parse(await (await get(`/v1/projects/${meteo.id}`, cookie)).json())
      expect(project.reactions.counts.bravo).toBe(2)
    }
  })

  it('takes the other one out of the suggestions after "@"', async () => {
    const recettes = await act.publish(zoe, 'Recettes')
    const { handle: inesHandle } = await act.me(ines)
    const { handle: malikHandle } = await act.me(malik)
    await blockNow()

    const proposed = async (cookie: string, handle: string) => {
      const query = new URLSearchParams({ q: handle.slice(0, 3), projectId: recettes.id })
      const res = await get(`/v1/members/mentionable?${query}`, cookie)
      return MentionableList.parse(await res.json()).members.map((m) => m.handle)
    }
    expect(await proposed(malik, inesHandle)).not.toContain(inesHandle)
    expect(await proposed(ines, malikHandle)).not.toContain(malikHandle)
    // Témoin : Zoé trouve les deux.
    expect(await proposed(zoe, inesHandle)).toContain(inesHandle)
    expect(await proposed(zoe, malikHandle)).toContain(malikHandle)
  })

  // Les preuves de l'inventaire des routes (route-inventory.test.ts, relecture de la branche A5) :
  // chaque route classée « cache le membre bloqué » a un test qui le montre. Les trois suivants
  // couvrent les routes qui n'en avaient pas.

  it('refuses to edit my comment on a project of the other one, as an unknown comment', async () => {
    const mine = await act.comment(meteo.id, malik, 'Mon commentaire chez Inès')
    const zoes = await act.comment(meteo.id, zoe, 'Le commentaire de Zoé')
    await blockNow()

    const edit = (id: string, cookie: string) =>
      act.send('PATCH', `/v1/projects/${meteo.id}/comments/${id}`, cookie, { body: 'Corrigé' })
    const res = await edit(mine.id, malik)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual(await (await edit(UNKNOWN, malik)).json())
    // Témoin : Zoé modifie encore le sien.
    expect((await edit(zoes.id, zoe)).status).toBe(200)
  })

  it('answers « unknown » to who hides, or shows again, a comment of the other one', async () => {
    const recettes = await act.publish(zoe, 'Recettes')
    const malikComment = await act.comment(recettes.id, malik, 'Le commentaire de Malik')
    const louisComment = await act.comment(recettes.id, louis, 'Le commentaire de Louis')
    await blockNow()

    // Inès n'est pas l'autrice de « Recettes » : elle n'a pas le droit de masquer (403). Mais le
    // commentaire de Malik, qu'elle ne lit plus, est pour elle introuvable (404), comme un inconnu.
    for (const method of ['PUT', 'DELETE']) {
      const hide = (id: string) =>
        act.send(method, `/v1/projects/${recettes.id}/comments/${id}/hide`, ines)
      const res = await hide(malikComment.id)
      expect(res.status, method).toBe(404)
      expect(await res.json()).toEqual(await (await hide(UNKNOWN)).json())
      expect((await hide(louisComment.id)).status, method).toBe(403) // témoin
    }
  })

  // Règle S7 : un abonnement écrit pendant un blocage (une course entre deux requêtes) est rattrapé
  // à la lecture. Le test l'écrit directement en base, puisque l'API ne le permet pas.
  it('leaves out of the following feed a follow that slipped in during the block', async () => {
    await blockNow()
    await ctx.db.insert(schema.memberFollow).values({ followerId: malikId, memberId: inesId })
    await ctx.db.insert(schema.projectFollow).values({ followerId: malikId, projectId: meteo.id })
    await act.followMember(inesId, zoe)

    expect(await (await get('/v1/feed/following', malik)).text()).not.toContain(meteo.id)
    // Témoin : Zoé, qui suit Inès, voit « Météo ».
    expect(await (await get('/v1/feed/following', zoe)).text()).toContain(meteo.id)
  })

  // Règle 7 (J8), dans les deux sens (relecture de la branche, A2) : qui a bloqué comme qui est
  // bloqué défait encore ses propres gestes chez l'autre. (blocks.test.ts le vérifie pour qui est
  // bloqué ; ici, les deux.)
  it('lets me delete my comment, remove my reaction and unfollow on a project of the other one', async () => {
    const mine = await act.comment(meteo.id, malik, 'Mon commentaire chez Inès')
    await act.react(meteo.id, 'bravo', malik)
    await act.send('POST', `/v1/projects/${meteo.id}/follow`, malik)
    await blockNow()

    for (const [method, path] of [
      ['DELETE', `/v1/projects/${meteo.id}/comments/${mine.id}`],
      ['DELETE', `/v1/projects/${meteo.id}/reactions/bravo`],
      ['DELETE', `/v1/projects/${meteo.id}/follow`],
      ['DELETE', `/v1/members/${inesId}/follow`],
    ] as const) {
      const res = await act.send(method, path, malik)
      expect(res.status, path).toBe(204)
    }
    const [comment] = await ctx.db
      .select({ deletedAt: schema.projectComment.deletedAt })
      .from(schema.projectComment)
      .where(eq(schema.projectComment.id, mine.id))
    expect(comment?.deletedAt).not.toBeNull()
    expect(
      await ctx.db
        .select()
        .from(schema.projectReaction)
        .where(eq(schema.projectReaction.memberId, malikId)),
    ).toEqual([])
  })
})

// ─── Les notifications ───────────────────────────────────────────────────────────────────────────

const readNotifications = async (cookie: string) =>
  NotificationPage.parse(await (await get('/v1/notifications', cookie)).json()).items
const unread = async (cookie: string) =>
  UnreadCount.parse(await (await get('/v1/notifications/unread', cookie)).json()).count

/** Une notification en une ligne lisible : sa sorte, sa raison ou son nombre, son auteur. */
const describeNotification = (n: Notification) => {
  switch (n.kind) {
    case 'comment':
      return `comment:${n.reason}:${n.author.name}`
    case 'reactions':
      return `reactions:${n.total}`
    case 'project_follows':
    case 'member_follows':
      return `${n.kind}:${n.count}`
    default:
      return n.kind
  }
}

// Règle S10 : un test par source et par sens de blocage. Malik fait chaque geste qui prévient Inès,
// Zoé aussi (le témoin) ; après le blocage, il ne reste que ceux de Zoé, dans la liste comme dans
// la cloche.
describe.each(DIRECTIONS)('the notifications, when %s', (_, blockNow) => {
  const everyGesture = async () => {
    const { handle } = await act.me(ines)
    const recettes = await act.publish(zoe, 'Recettes')
    later()
    const inesComment = await act.comment(recettes.id, ines, 'Le commentaire d’Inès')
    for (const [cookie, name] of [
      [malik, 'Malik'],
      [zoe, 'Zoé'],
    ] as const) {
      later()
      await act.react(meteo.id, 'bravo', cookie)
      await act.send('POST', `/v1/projects/${meteo.id}/follow`, cookie)
      await act.followMember(inesId, cookie)
      later()
      await act.comment(meteo.id, cookie, `Un commentaire de ${name}`)
      later()
      await act.comment(recettes.id, cookie, `Une réponse de ${name}`, inesComment.id)
      later()
      await act.comment(recettes.id, cookie, `${name} parle de @${handle}`)
    }
  }

  it('drops every notification coming from the other one, and keeps those of others', async () => {
    await everyGesture()
    await blockNow()

    const items = await readNotifications(ines)
    expect(items.map(describeNotification).sort()).toEqual(
      [
        'comment:comment:Zoé',
        'comment:mention:Zoé',
        'comment:reply:Zoé',
        'handle', // son pseudo, donné à l'inscription : rien à voir avec Malik
        'member_follows:1',
        'project_follows:1',
        'reactions:1',
      ].sort(),
    )
    expect(JSON.stringify(items)).not.toContain(malikId)
    expect(await unread(ines)).toBe(items.filter((n) => n.isNew).length)
  })

  // Règle 3 : débloquer peut faire réapparaître les anciennes notifications (pas de date gardée) ;
  // les abonnements, eux, ne reviennent pas.
  it('may show the old notifications again after unblocking, except the follows', async () => {
    await everyGesture()
    await blockNow()
    later()
    await act.unblock(malikId, ines)
    await act.unblock(inesId, malik)

    const kinds = (await readNotifications(ines)).map(describeNotification)
    expect(kinds).toEqual(
      expect.arrayContaining(['comment:comment:Malik', 'comment:reply:Malik', 'reactions:2']),
    )
    expect(kinds).toEqual(expect.arrayContaining(['member_follows:1', 'project_follows:1']))
  })

  // Règle 9 (J4) : une notification de modération n'est jamais coupée par un blocage.
  it('never drops a removal nor a handled report', async () => {
    const velo = await act.publish(malik, 'Vélo')
    later()
    const mine = await act.comment(velo.id, ines, 'Un commentaire d’Inès chez Malik')
    later()
    await act.report(zoe, { kind: 'comment', id: mine.id })
    later()
    await act.decide(louis, {
      action: 'remove',
      target: { kind: 'comment', id: mine.id },
      ground: 'rules',
      explanation: 'Une motivation à garder.',
    })
    later()
    await act.report(ines, { kind: 'project', id: velo.id })
    later()
    await act.decide(louis, { action: 'dismiss', target: { kind: 'project', id: velo.id } })
    await blockNow()

    const items = await readNotifications(ines)
    const removed = items.find((n) => n.kind === 'removed')
    expect(removed).toMatchObject({ explanation: 'Une motivation à garder.' })
    // Le projet de l'autre ne se nomme plus : la motivation reste, sans son titre.
    expect(JSON.stringify(removed)).not.toContain('Vélo')
    expect(items.find((n) => n.kind === 'report_handled')).toMatchObject({
      targetKind: 'project',
      outcome: 'dismissed',
    })
  })

  // Règle 4 (relecture de la branche, B2) : le geste d'une troisième personne sur le projet d'un
  // membre bloqué avec Inès ne la prévient plus, ni dans la liste, ni dans la cloche, ni par e-mail
  // (`listedProjectFor` dans `readable()`, notifications/load.ts) : la notification nommerait un
  // projet qu'elle ne peut plus ouvrir, et en citerait un extrait. Zoé n'est bloquée avec personne ;
  // ses mêmes gestes sur son propre projet servent de témoin.
  it('drops what a third member does on a project of the other one, and keeps the rest', async () => {
    await act.setPreferences(ines, { mentionEmails: true })
    const { handle } = await act.me(ines)
    const velo = await act.publish(malik, 'Vélo')
    const recettes = await act.publish(zoe, 'Recettes')
    for (const [project, place] of [
      [velo.id, 'chez Malik'],
      [recettes.id, 'chez Zoé'],
    ] as const) {
      later()
      const root = await act.comment(project, ines, `Inès commente ${place}`)
      later()
      await act.comment(project, zoe, `Zoé répond ${place}`, root.id)
      later()
      await act.comment(project, zoe, `Zoé parle de @${handle} ${place}`)
    }
    const before = (await readNotifications(ines)).map(describeNotification)
    expect(before.filter((kind) => kind.startsWith('comment:'))).toHaveLength(4)
    const unreadBefore = await unread(ines)
    await blockNow()

    const items = await readNotifications(ines)
    expect(items.map(describeNotification).sort()).toEqual(
      ['comment:mention:Zoé', 'comment:reply:Zoé', 'handle'].sort(),
    )
    const text = JSON.stringify(items)
    expect(text).not.toContain(velo.id)
    expect(text).not.toContain('chez Malik')
    expect(await unread(ines)).toBe(unreadBefore - 2)

    // L'e-mail de mentions, une fois le délai passé : seuls les gestes chez Zoé y sont.
    later((MENTION_EMAIL_DELAY_MINUTES + 1) * MINUTE)
    await mentionEmails(
      {
        db: ctx.db,
        mailer: ctx.mailer,
        appUrl: TEST_APP_URL,
        apiUrl: TEST_API_URL,
        secret: TEST_AUTH_SECRET,
      },
      new Date(),
    )
    const mentionSubjects = [
      fill(resources.fr.translation.email.mentions.subject),
      fill(resources.en.translation.email.mentions.subject),
    ]
    const emails = ctx.mailer.sent.filter(
      (email) => email.to === inesAccount.email && mentionSubjects.includes(email.subject),
    )
    expect(emails).toHaveLength(1)
    expect(emails[0]?.text).toContain('chez Zoé')
    expect(`${emails[0]?.text}${emails[0]?.html}`).not.toContain('chez Malik')
    expect(`${emails[0]?.text}${emails[0]?.html}`).not.toContain('Vélo')
  })
})

// ─── L'export, la suppression du compte ──────────────────────────────────────────────────────────

describe('the export of my data', () => {
  const exportOf = async (cookie: string) => {
    const raw = await (await get('/v1/me/export', cookie)).text()
    return { raw, data: AccountExport.parse(JSON.parse(raw)) as AccountExportType }
  }

  it('lists the members I blocked, oldest first, and never who blocked me', async () => {
    await act.block(inesId, malik)
    const inesAt = new Date(Date.now()).toISOString()
    later()
    await act.block(zoeId, malik)
    const zoeAt = new Date(Date.now()).toISOString()
    const { handle: inesHandle } = await act.me(ines)
    const { handle: zoeHandle } = await act.me(zoe)

    expect((await exportOf(malik)).data.blocks).toEqual([
      { memberId: inesId, handle: inesHandle, blockedAt: inesAt },
      { memberId: zoeId, handle: zoeHandle, blockedAt: zoeAt },
    ])
    const inesExport = await exportOf(ines)
    expect(inesExport.data.blocks).toEqual([])
    expect(inesExport.raw).not.toContain(malikId)
  })

  it('forgets an unblocked member', async () => {
    await act.block(inesId, malik)
    await act.unblock(inesId, malik)

    expect((await exportOf(malik)).data.blocks).toEqual([])
  })
})

describe('deleting an account', () => {
  it('removes the blocks it set and those aimed at it', async () => {
    await act.block(malikId, ines)
    await act.block(inesId, zoe)
    await act.block(zoeId, malik) // témoin : un blocage sans Inès

    await act.deleteAccount(ines, inesAccount.password)

    const rows = await ctx.db.select().from(schema.memberBlock)
    expect(rows.map((r) => `${r.blockerId}>${r.blockedId}`)).toEqual([`${malikId}>${zoeId}`])
  })
})
