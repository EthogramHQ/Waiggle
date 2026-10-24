// Ce qu'un blocage cache, lecture par lecture (tranche 7b) : le fil, les étiquettes, la page d'un
// projet, les réactions, les suggestions après « @ », les notifications et l'export. Scénario :
// docs/scenarios/phase-1.md, « Tranche 7b — Bloquer » ; règles 3, 4, 9 et 12 de la relecture du
// plan (24/10/2026). Les routes du blocage sont testées dans blocks.test.ts, les commentaires dans
// comments.test.ts, les e-mails dans jobs/.
//
// Trois membres : Inès (autrice du projet « Météo »), Malik (bloqué avec elle, dans un sens ou dans
// l'autre) et Zoé (une troisième, qui montre que les autres ne voient aucune différence). Louis,
// administrateur, sert aux notifications de modération. Chaque règle se vérifie dans les deux sens
// du blocage : « Inès a bloqué Malik » et « Malik a bloqué Inès ».
import {
  AccountExport,
  type AccountExport as AccountExportType,
  MentionableList,
  type Notification,
  NotificationPage,
  Project,
  toolSlug,
  UnreadCount,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'

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
