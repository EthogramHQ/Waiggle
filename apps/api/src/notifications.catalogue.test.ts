// Tests d'intégration de R8 : les deux notifications du catalogue (le projet rangé par un
// administrateur, l'outil rattaché au catalogue), la miniature des projets nommés et le nombre des
// autres lignes d'une mise à jour. Scénario : docs/scenarios/refonte.md, « R8 — Les
// notifications », parties « Deux notifications nouvelles », « Où mène chaque ligne » et « Mes
// données » ; plan R8, « Choix de la session » 1, « Le modèle de données » et « API » (BE-A).
//
// Les notifications du catalogue sont les seules qui s'écrivent : une ligne `catalogue_notice` par
// membre et par outil (ou par projet rangé), posée dans la transaction de l'administrateur, puis lue
// comme les autres (GET /v1/notifications). Le reste se calcule toujours à la lecture : un projet
// devenu privé, retiré ou supprimé fait disparaître la notification.
//
// Cinq membres : Louis, l'administrateur ; Inès, l'autrice de « Quel papillon ? » ; Malik, qui a
// écrit « Glide » en « Autre » sur deux projets ; Zoé et Sam, qui réagissent, suivent et montrent ce
// que voient les autres. Le catalogue semé par la migration est effacé avant chaque test
// (testing/tool-catalogue.ts) : seul « Glide Apps » y est, pour les rattachements.
import {
  AdminCatalogueTool,
  type Notification,
  NotificationPage,
  PendingToolsPage,
  Project,
  ProjectUpdate,
  UnreadCount,
  type UpdateLine,
} from '@ruche/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nightlyPurge } from './jobs/nightly-purge'
import { weeklyRecap } from './jobs/weekly-recap'
import { activity } from './testing/activity'
import {
  createTestContext,
  TEST_API_URL,
  TEST_APP_URL,
  TEST_AUTH_SECRET,
  type TestContext,
} from './testing/context'
import { jpegImage, photoWithGps, visualForm } from './testing/images'
import { addCatalogueTool, clearCatalogue } from './testing/tool-catalogue'

let ctx: TestContext
let act: ReturnType<typeof activity>
let louis: string // cookies de session
let ines: string
let malik: string
let zoe: string
let sam: string
let louisId: string
let inesId: string
let malikId: string
let glideApps: { id: string; slug: string }

const SECOND = 1000
const HOUR = 60 * 60 * SECOND
const DAY = 24 * HOUR
// Un lundi de juin, loin d'aujourd'hui : une date écrite par la base (now() en SQL) au lieu de
// l'horloge de l'API se verrait tout de suite.
const START = new Date('2026-06-15T08:00:00.000Z')

const inesAccount = { name: 'Inès Morel', email: 'ines@example.com', password: 'ines-long-pw-1' }
const malikAccount = { name: 'Malik', email: 'malik@example.com', password: 'malik-long-pw-1' }
const louisAccount = { name: 'Louis', email: 'louis@example.com', password: 'louis-long-pw-1' }

/** Un corps valide pour faire entrer un « Autre » au catalogue (ToolAdmit). */
const admitBody = (name: string) => ({
  name,
  family: 'creation',
  descriptionFr: 'Fabrique une appli à partir d’un tableur.',
  descriptionEn: 'Builds an app from a spreadsheet.',
  siteUrl: null,
})

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  louis = await ctx.verifiedMember(louisAccount)
  ines = await ctx.verifiedMember(inesAccount)
  malik = await ctx.verifiedMember(malikAccount)
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-pw-1',
  })
  sam = await ctx.verifiedMember({
    name: 'Sam',
    email: 'sam@example.com',
    password: 'sam-long-pw-1',
  })
  louisId = (await act.me(louis)).id
  inesId = (await act.me(ines)).id
  malikId = (await act.me(malik)).id
  await act.makeAdmin(louisId)
  await clearCatalogue(ctx.db)
  glideApps = await addCatalogueTool(ctx.db, { name: 'Glide Apps', family: 'creation' })
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une seconde : deux gestes n'ont jamais la même date). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

/** Publie un projet (public, classé « Autre » par défaut), une seconde plus tard. */
const publish = async (cookie: string, title: string, body: object = {}) => {
  later()
  return act.publish(cookie, title, body)
}

/** Une demande de l'administrateur, une seconde après ce qui précède, qui doit réussir. */
const adminWrite = async (path: string, body: unknown, status: number) => {
  later()
  const res = await act.send('POST', path, louis, body)
  expect(res.status, path).toBe(status)
  return res
}

/** Le slug d'un « Autre » d'après son nom, lu dans « À vérifier ». */
const pendingSlug = async (name: string) => {
  const res = await act.send('GET', '/v1/moderation/tools/pending', louis)
  expect(res.status).toBe(200)
  const tool = PendingToolsPage.parse(await res.json()).items.find((item) => item.name === name)
  if (tool === undefined) throw new Error(`no pending tool named ${name}`)
  return tool.slug
}

/** Range un projet (« Catégories » de la Modération) : 204. */
const sort = (projectId: string, category: string) =>
  adminWrite(`/v1/moderation/projects/${projectId}/category`, { category }, 204)

/** Fait entrer un « Autre » au catalogue sous ce nom : rend l'outil admis. */
const admit = async (typed: string, name = typed) =>
  AdminCatalogueTool.parse(
    await (
      await adminWrite(
        `/v1/moderation/tools/${await pendingSlug(typed)}/admit`,
        admitBody(name),
        200,
      )
    ).json(),
  )

/** Rattache un « Autre » à un outil du catalogue : 204. */
const merge = async (typed: string, into: string) =>
  adminWrite(`/v1/moderation/tools/${await pendingSlug(typed)}/merge`, { into }, 204)

/** Laisse un « Autre » hors du catalogue : 204. */
const dismiss = async (typed: string) =>
  adminWrite(`/v1/moderation/tools/${await pendingSlug(typed)}/dismiss`, undefined, 204)

/** La première page de notifications de ce membre, et son texte brut (pour chercher une fuite). */
const readPage = async (cookie: string) => {
  const res = await act.send('GET', '/v1/notifications', cookie)
  expect(res.status).toBe(200)
  const raw = await res.text()
  return { page: NotificationPage.parse(JSON.parse(raw)), raw }
}

/** Les notifications de ce membre, sans celle du pseudo que chacun reçoit en s'inscrivant. */
const notifications = async (cookie: string) =>
  (await readPage(cookie)).page.items.filter((n) => n.kind !== 'handle')

/** Les seules notifications du catalogue de ce membre, dans l'ordre de la liste. */
const catalogueOf = async (cookie: string) =>
  (await notifications(cookie)).filter(
    (n) => n.kind === 'project_category' || n.kind === 'tool_added',
  )

/** Le nombre de la cloche. */
const unread = async (cookie: string) => {
  const res = await act.send('GET', '/v1/notifications/unread', cookie)
  expect(res.status).toBe(200)
  return UnreadCount.parse(await res.json()).count
}

/** Ouvre l'écran, comme l'appli : lit la première page, puis marque vu jusqu'à son heure. */
const openScreen = async (cookie: string) => {
  later()
  await act.openNotifications(cookie)
  later()
}

/**
 * Les lignes `catalogue_notice` d'un membre, en base (sorte et outil), dans l'ordre d'écriture :
 * ce que la notification ne montre pas (l'outil visé) et ce qui reste après une suppression.
 */
const noticesInBase = async (memberId: string) => {
  const result = (await ctx.db.execute(
    sql`select kind, tool_id, project_id from catalogue_notice where member_id = ${memberId} order by created_at`,
  )) as unknown as { rows: { kind: unknown; tool_id: unknown; project_id: unknown }[] }
  return result.rows.map((row) => ({
    kind: String(row.kind),
    toolId: row.tool_id === null ? null : String(row.tool_id),
    projectId: row.project_id === null ? null : String(row.project_id),
  }))
}
/** Le nombre de lignes `catalogue_notice`, tous membres confondus. */
const noticeCount = async () => {
  const result = (await ctx.db.execute(
    sql`select count(*)::int as n from catalogue_notice`,
  )) as unknown as { rows: { n: unknown }[] }
  return Number(result.rows[0]?.n)
}

/** Retire un projet : Zoé le signale, Louis décide (un retrait exige un signalement ouvert). */
const removeProject = async (id: string) => {
  later()
  await act.report(zoe, { kind: 'project', id })
  later()
  await act.decide(louis, {
    action: 'remove',
    target: { kind: 'project', id },
    ground: 'rules',
    explanation: 'Publicité déguisée.',
  })
}

/** Les e-mails reçus par une adresse depuis `before` (les confirmations d'inscription exclues). */
const sentTo = (address: string, before: number) =>
  ctx.mailer.sent.slice(before).filter((email) => email.to === address)

// ─── Le projet rangé ─────────────────────────────────────────────────────────────────────────────

describe('a project sorted by an administrator', () => {
  it('tells its author, with the project and the code of the category, signed by nobody', async () => {
    const papillon = await publish(ines, 'Quel papillon ?')

    await sort(papillon.id, 'animals')

    const { page, raw } = await readPage(ines)
    expect(page.items.filter((n) => n.kind === 'project_category')).toEqual([
      expect.objectContaining({
        kind: 'project_category',
        isNew: true,
        project: { id: papillon.id, title: 'Quel papillon ?', cover: null },
        category: 'animals',
      }),
    ])
    // Signée « L'équipe de Waiggle » par l'appli : ni l'identifiant ni le nom de l'administrateur.
    // Le nom se cherche avec sa clé : « Louis » seul pourrait se trouver dans un identifiant.
    expect(raw).not.toContain(louisId)
    expect(raw).not.toContain('"name":"Louis"')
    // Les autres membres n'en savent rien, l'administrateur non plus.
    for (const cookie of [zoe, sam, louis]) expect(await catalogueOf(cookie)).toEqual([])
  })

  // Choix de BE-A : le geste vient de « L'équipe », pas d'un membre ; un blocage de l'administrateur
  // n'efface donc pas la notification du rangement : l'autrice doit savoir où est son projet.
  it('still tells an author who blocked the administrator that a project was filed', async () => {
    const papillon = await publish(ines, 'Quel papillon ?')
    later()
    await act.block(louisId, ines)

    await sort(papillon.id, 'animals')

    expect(await catalogueOf(ines)).toEqual([
      expect.objectContaining({
        kind: 'project_category',
        project: expect.objectContaining({ id: papillon.id }),
        category: 'animals',
      }),
    ])
    expect(await noticesInBase(inesId)).toEqual([
      { kind: 'project_category', toolId: null, projectId: papillon.id },
    ])
  })

  it('dates the notification from the gesture of the administrator', async () => {
    const papillon = await publish(ines, 'Quel papillon ?')
    later(HOUR)
    const sortedAt = new Date(Date.now() + SECOND).toISOString()

    await sort(papillon.id, 'animals')

    expect(await catalogueOf(ines)).toEqual([expect.objectContaining({ at: sortedAt })])
  })

  it('names the new category when « other » was in second place', async () => {
    const pluie = await publish(ines, 'Pluie', {
      primaryCategory: 'cooking',
      secondaryCategory: 'other',
    })

    await sort(pluie.id, 'science')

    expect(await catalogueOf(ines)).toEqual([
      expect.objectContaining({
        kind: 'project_category',
        project: expect.objectContaining({ id: pluie.id }),
        category: 'science',
      }),
    ])
  })

  it('disappears while the project is private, and comes back once it is public again', async () => {
    const papillon = await publish(ines, 'Quel papillon ?')
    await sort(papillon.id, 'animals')
    expect(await catalogueOf(ines)).toHaveLength(1)

    later()
    await act.setVisibility(papillon.id, ines, 'private')
    expect(await catalogueOf(ines)).toEqual([])

    later()
    await act.setVisibility(papillon.id, ines, 'public')
    expect(await catalogueOf(ines)).toEqual([
      expect.objectContaining({ kind: 'project_category', category: 'animals' }),
    ])
  })

  it('disappears once the moderation removes the project', async () => {
    const papillon = await publish(ines, 'Quel papillon ?')
    await sort(papillon.id, 'animals')
    expect(await catalogueOf(ines)).toHaveLength(1)

    await removeProject(papillon.id)

    expect(await catalogueOf(ines)).toEqual([])
    // Le retrait, lui, est bien dit à l'autrice (témoin : la liste se lit).
    expect((await notifications(ines)).map((n) => n.kind)).toContain('removed')
  })

  it('is erased with the project its author deletes', async () => {
    const papillon = await publish(ines, 'Quel papillon ?')
    await sort(papillon.id, 'animals')
    expect(await noticesInBase(inesId)).toEqual([
      { kind: 'project_category', toolId: null, projectId: papillon.id },
    ])

    later()
    const res = await act.send('DELETE', `/v1/projects/${papillon.id}`, ines)
    expect(res.status).toBe(204)

    expect(await catalogueOf(ines)).toEqual([])
    expect(await noticesInBase(inesId)).toEqual([])
  })
})

// ─── L'outil rattaché ────────────────────────────────────────────────────────────────────────────

describe('an « other » tool admitted into the catalogue', () => {
  it('tells each author of a project citing it once, whatever the number of projects, with the name typed', async () => {
    await publish(malik, 'Mes listes', { tools: ['Glide'] })
    await publish(malik, 'Mes courses', { tools: ['Glide'] })
    // Inès l'a tapé autrement : chaque projet garde le nom tel que son auteur l'a écrit.
    await publish(ines, 'Quel papillon ?', { tools: ['glide'] })

    const tool = await admit('Glide')

    const expected = (typedName: string) => [
      expect.objectContaining({
        kind: 'tool_added',
        isNew: true,
        merged: false,
        typedName,
        toolSlug: tool.slug,
        toolName: 'Glide',
      }),
    ]
    expect(await catalogueOf(malik)).toEqual(expected('Glide'))
    expect(await catalogueOf(ines)).toEqual(expected('glide'))
    expect(await catalogueOf(zoe)).toEqual([])
    expect(await noticesInBase(malikId)).toEqual([
      { kind: 'tool_added', toolId: expect.any(String), projectId: null },
    ])
  })

  it('names the catalogue tool as the administrator corrected it, and keeps the name typed', async () => {
    await publish(malik, 'Mes listes', { tools: ['glide app builder'] })

    const tool = await admit('glide app builder', 'Glide Builder')

    expect(await catalogueOf(malik)).toEqual([
      expect.objectContaining({
        kind: 'tool_added',
        merged: false,
        typedName: 'glide app builder',
        toolSlug: tool.slug,
        toolName: 'Glide Builder',
      }),
    ])
  })

  it('tells nobody who only had the tool among the favourite tools of a profile', async () => {
    await act.updateProfile(sam, { favoriteTools: ['Glide'] })
    await publish(malik, 'Mes listes', { tools: ['Glide'] })

    await admit('Glide')

    expect(await catalogueOf(sam)).toEqual([])
    expect(await noticesInBase((await act.me(sam)).id)).toEqual([])
    // Témoin : l'auteur du projet, lui, est prévenu.
    expect(await catalogueOf(malik)).toHaveLength(1)
  })

  it('never tells the administrator about his own gesture, even on his own project', async () => {
    await publish(louis, 'Le projet de Louis', { tools: ['Glide'] })
    await publish(malik, 'Mes listes', { tools: ['Glide'] })

    await admit('Glide')

    expect(await catalogueOf(louis)).toEqual([])
    expect(await noticesInBase(louisId)).toEqual([])
    expect(await catalogueOf(malik)).toHaveLength(1)
  })

  // Choix de BE-A (plan R8, « Ce qui change au plan ») : un projet privé ou retiré ne prévient pas
  // son auteur. Ni notification à la lecture, ni ligne écrite en base.
  it('sends no catalogue notice for a tool cited only by a private or removed project', async () => {
    const hidden = await publish(malik, 'Mes listes', { tools: ['Glide'] })
    later()
    await act.setVisibility(hidden.id, malik, 'private')
    const removed = await publish(ines, 'Quel papillon ?', { tools: ['Glide'] })
    await removeProject(removed.id)
    // Témoin : le projet public de Zoé cite le même « Autre ».
    await publish(zoe, 'Mes recettes', { tools: ['Glide'] })

    await admit('Glide')

    expect(await catalogueOf(malik)).toEqual([])
    expect(await catalogueOf(ines)).toEqual([])
    expect(await noticesInBase(malikId)).toEqual([])
    expect(await noticesInBase(inesId)).toEqual([])
    expect(await catalogueOf(zoe)).toEqual([expect.objectContaining({ kind: 'tool_added' })])
  })
})

describe('an « other » tool merged into a catalogue tool', () => {
  it('tells each author once, merged, with the name typed and the target tool', async () => {
    await publish(malik, 'Mes listes', { tools: ['Glide app'] })
    await publish(malik, 'Mes courses', { tools: ['Glide app'] })
    await publish(ines, 'Quel papillon ?', { tools: ['glide-app'] })

    await merge('Glide app', glideApps.slug)

    expect(await catalogueOf(malik)).toEqual([
      expect.objectContaining({
        kind: 'tool_added',
        isNew: true,
        merged: true,
        typedName: 'Glide app',
        toolSlug: glideApps.slug,
        toolName: 'Glide Apps',
      }),
    ])
    expect(await catalogueOf(ines)).toEqual([
      expect.objectContaining({ merged: true, typedName: 'glide-app', toolSlug: glideApps.slug }),
    ])
    // La ligne vise l'outil cible : l'« Autre » est effacé par le rattachement.
    expect(await noticesInBase(malikId)).toEqual([
      { kind: 'tool_merged', toolId: glideApps.id, projectId: null },
    ])
  })

  it('never tells the administrator, nor a member whose profile only cited it', async () => {
    await publish(louis, 'Le projet de Louis', { tools: ['Glide app'] })
    await act.updateProfile(sam, { favoriteTools: ['Glide app'] })
    await publish(malik, 'Mes listes', { tools: ['Glide app'] })

    await merge('Glide app', glideApps.slug)

    expect(await catalogueOf(louis)).toEqual([])
    expect(await catalogueOf(sam)).toEqual([])
    expect(await catalogueOf(malik)).toHaveLength(1)
  })
})

describe('an « other » tool left out of the catalogue', () => {
  it('tells nobody: nothing changes for the project', async () => {
    await publish(malik, 'Mes listes', { tools: ['Bidule'] })
    await publish(ines, 'Quel papillon ?', { tools: ['Glide'] })

    await dismiss('Bidule')

    expect(await catalogueOf(malik)).toEqual([])
    expect(await noticeCount()).toBe(0)
    // Témoin : admettre un autre « Autre » prévient son auteur.
    await admit('Glide')
    expect(await catalogueOf(ines)).toHaveLength(1)
    expect(await catalogueOf(malik)).toEqual([])
  })
})

// ─── Nouveau, la cloche ──────────────────────────────────────────────────────────────────────────

describe('the bell and the new mark', () => {
  it('counts a catalogue notification as new until the screen is opened', async () => {
    const papillon = await publish(ines, 'Quel papillon ?')
    await publish(malik, 'Mes listes', { tools: ['Glide'] })
    await openScreen(ines)
    await openScreen(malik)
    expect(await unread(ines)).toBe(0)
    expect(await unread(malik)).toBe(0)

    await sort(papillon.id, 'animals')
    await admit('Glide')

    expect(await unread(ines)).toBe(1)
    expect(await unread(malik)).toBe(1)
    expect(await catalogueOf(ines)).toEqual([expect.objectContaining({ isNew: true })])

    await openScreen(ines)
    expect(await unread(ines)).toBe(0)
    expect(await catalogueOf(ines)).toEqual([expect.objectContaining({ isNew: false })])
    // Chacun pour soi : Malik n'a pas encore ouvert l'écran.
    expect(await unread(malik)).toBe(1)
  })

  it('ranks a catalogue notification by its date among the others', async () => {
    const papillon = await publish(ines, 'Quel papillon ?')
    later()
    await act.react(papillon.id, 'bravo', zoe)
    later(HOUR)
    await sort(papillon.id, 'animals')
    later(HOUR)
    await act.followMember(inesId, sam)

    expect((await notifications(ines)).map((n) => n.kind)).toEqual([
      'member_follows',
      'project_category',
      'reactions',
    ])
  })
})

// ─── Jamais par e-mail ───────────────────────────────────────────────────────────────────────────

describe('catalogue notifications and emails', () => {
  it('sends no email at the gesture, and puts nothing of it in the weekly recap', async () => {
    const papillon = await publish(ines, 'Quel papillon ?')
    await publish(malik, 'Mes listes', { tools: ['Glide'] })
    const before = ctx.mailer.sent.length

    await sort(papillon.id, 'animals')
    await admit('Glide')
    // Témoin du récap : une réaction, qui, elle, y figure.
    later()
    await act.react(papillon.id, 'bravo', zoe)
    expect(ctx.mailer.sent.slice(before)).toEqual([])
    // Les notifications existent bien (sinon le reste ne prouverait rien).
    expect(await catalogueOf(ines)).toHaveLength(1)
    expect(await catalogueOf(malik)).toHaveLength(1)

    // Le récap du dimanche suivant, 10 h à Paris (8 h UTC en juin). Les dépendances passent par une
    // variable : la tâche prend ce dont elle a besoin (le stockage, pour les vignettes).
    vi.setSystemTime(new Date('2026-06-21T08:00:00.000Z'))
    const deps = {
      db: ctx.db,
      mailer: ctx.mailer,
      storage: ctx.storage,
      appUrl: TEST_APP_URL,
      apiUrl: TEST_API_URL,
      secret: TEST_AUTH_SECRET,
    }
    await weeklyRecap(deps, new Date())

    const toInes = sentTo(inesAccount.email, before)
    expect(toInes).toHaveLength(1) // témoin : la réaction a fait partir le récap
    for (const email of toInes) {
      for (const leak of ['Animaux', 'Animals', 'animals']) {
        expect(email.text, leak).not.toContain(leak)
        expect(email.html, leak).not.toContain(leak)
      }
    }
    // Rien de nouveau pour Malik, sinon l'outil : pas de récap, ni rien qui le nomme.
    for (const email of sentTo(malikAccount.email, before)) {
      expect(email.text).not.toContain('Glide')
      expect(email.html).not.toContain('Glide')
    }
    expect(sentTo(malikAccount.email, before)).toEqual([])
  })
})

// ─── 90 jours, les suppressions ──────────────────────────────────────────────────────────────────

describe('keeping and erasing catalogue notices', () => {
  it('shows a catalogue notification for 90 days, then never again', async () => {
    const papillon = await publish(ines, 'Quel papillon ?')
    await sort(papillon.id, 'animals')

    // Une session dure 7 jours : Inès se reconnecte.
    vi.setSystemTime(Date.now() + 89 * DAY)
    const inesAgain = await act.signInAgain(inesAccount)
    expect(await catalogueOf(inesAgain)).toHaveLength(1)

    vi.setSystemTime(Date.now() + 2 * DAY)
    expect(await catalogueOf(inesAgain)).toEqual([])
  })

  it('purges catalogue notices after 90 days', async () => {
    const papillon = await publish(ines, 'Quel papillon ?')
    await publish(malik, 'Mes listes', { tools: ['Glide'] })
    await sort(papillon.id, 'animals')
    await admit('Glide')
    expect(await noticeCount()).toBe(2)
    const sortedAt = Date.now()

    await nightlyPurge(ctx.db, new Date(sortedAt + 89 * DAY), ctx.storage)
    expect(await noticeCount()).toBe(2)

    await nightlyPurge(ctx.db, new Date(sortedAt + 91 * DAY), ctx.storage)
    expect(await noticeCount()).toBe(0)
  })

  it('erases the notices of a deleted account, and only hers', async () => {
    const papillon = await publish(ines, 'Quel papillon ?')
    await publish(malik, 'Mes listes', { tools: ['Glide'] })
    await sort(papillon.id, 'animals')
    await admit('Glide')
    expect(await noticesInBase(malikId)).toHaveLength(1)

    later()
    await act.deleteAccount(malik, malikAccount.password)

    expect(await noticesInBase(malikId)).toEqual([])
    expect(await catalogueOf(ines)).toHaveLength(1)
  })

  it('keeps the notice of a member when the administrator who acted deletes his account', async () => {
    const papillon = await publish(ines, 'Quel papillon ?')
    await sort(papillon.id, 'animals')

    later()
    await act.deleteAccount(louis, louisAccount.password)

    expect(await catalogueOf(ines)).toEqual([
      expect.objectContaining({ kind: 'project_category', category: 'animals' }),
    ])
  })

  it('erases the notice of a tool that leaves the database', async () => {
    await publish(malik, 'Mes listes', { tools: ['Glide'] })
    const { slug } = await admit('Glide')
    expect(await catalogueOf(malik)).toHaveLength(1)

    // Aucune route n'efface un outil du catalogue : la base le fait (un nettoyage à la main), et la
    // clé étrangère emporte la notice. Les projets ne le citent plus d'abord (clé `restrict`).
    // L'outil se trouve par son slug : le contrat de l'administration ne donne pas son id.
    const id = sql`(select id from tool where slug = ${slug})`
    await ctx.db.execute(sql`delete from project_tool where tool_id = ${id}`)
    await ctx.db.execute(sql`delete from tool_alias where tool_id = ${id}`)
    await ctx.db.execute(sql`delete from tool_slug_redirect where tool_id = ${id}`)
    await ctx.db.execute(sql`delete from tool where slug = ${slug}`)

    expect(await noticesInBase(malikId)).toEqual([])
    expect(await catalogueOf(malik)).toEqual([])
  })
})

// ─── La miniature et la mise à jour ──────────────────────────────────────────────────────────────

describe('the thumbnail of a notified project', () => {
  /** Ajoute une photo à la galerie : la première sert de couverture. Rend le projet à jour. */
  const addPhoto = async (projectId: string, cookie: string) => {
    later()
    const res = await ctx.request(`/v1/projects/${projectId}/visuals`, {
      method: 'POST',
      headers: { cookie },
      body: visualForm(await photoWithGps()),
    })
    expect(res.status).toBe(201)
    return Project.parse(await res.json())
  }

  /** Les notifications qui nomment un projet, avec la sorte et la miniature de chacune. */
  const covers = (items: Notification[]) =>
    // Depuis R9, la notification d'un retrait de profil n'a pas de projet (`project` vaut null).
    items.flatMap((n) =>
      'project' in n && n.project !== null ? [{ kind: n.kind, cover: n.project.cover }] : [],
    )

  it('gives the cover of the project in each notification that names one, and null without a photo', async () => {
    const papillon = await publish(ines, 'Quel papillon ?')
    const withPhoto = await addPhoto(papillon.id, ines)
    const [photo] = withPhoto.visuals
    if (photo === undefined) throw new Error('no photo')
    const cover = { url: photo.url, thumbhash: photo.thumbhash }
    const bare = await publish(ines, 'Pluie')

    // Pour Inès : des réactions, un abonné au projet, un commentaire, le rangement.
    later()
    await act.react(papillon.id, 'bravo', zoe)
    later()
    await act.react(bare.id, 'useful', zoe)
    later()
    const followed = await act.send('POST', `/v1/projects/${papillon.id}/follow`, sam)
    expect(followed.status).toBe(204)
    later()
    const written = await act.comment(papillon.id, malik, 'Un joli papillon')
    await sort(papillon.id, 'animals')
    // Pour Malik : son commentaire masqué, et une mise à jour du projet qu'il suit.
    later()
    await act.hide(papillon.id, written.id, ines)
    later()
    expect((await act.send('POST', `/v1/projects/${papillon.id}/follow`, malik)).status).toBe(204)
    later()
    const update = await act.send('POST', `/v1/projects/${papillon.id}/updates`, ines, {
      title: null,
      version: 'v1.1',
      lines: [{ family: 'new', text: 'Les papillons de nuit' }],
      photos: [],
      beforeAfter: false,
    })
    expect(update.status).toBe(201)

    const forInes = covers(await notifications(ines))
    expect(forInes.map((n) => n.kind).sort()).toEqual([
      'comment',
      'project_category',
      'project_follows',
      'reactions',
      'reactions',
    ])
    // Chaque ligne de « Quel papillon ? » porte sa couverture ; « Pluie », sans photo, null.
    const reactions = (await notifications(ines)).filter((n) => n.kind === 'reactions')
    for (const n of reactions) {
      expect(n.project.cover, n.project.title).toEqual(n.project.id === bare.id ? null : cover)
    }
    for (const n of forInes.filter((n) => n.kind !== 'reactions')) {
      expect(n.cover, n.kind).toEqual(cover)
    }
    const forMalik = covers(await notifications(malik))
    expect(forMalik.map((n) => n.kind).sort()).toEqual(['hidden', 'project_update'])
    for (const n of forMalik) expect(n.cover, n.kind).toEqual(cover)
  })

  // Choix de BE-A : la couverture d'un projet est sa première photo de galerie, sinon sa couverture
  // verticale (slot « portrait »).
  it('uses the portrait cover when the project has no gallery photo', async () => {
    const papillon = await publish(ines, 'Quel papillon ?')
    later()
    const res = await ctx.request(`/v1/projects/${papillon.id}/visuals`, {
      method: 'POST',
      headers: { cookie: ines },
      body: visualForm(await jpegImage(900, 1600), 'portrait'),
    })
    expect(res.status).toBe(201)
    const portrait = Project.parse(await res.json()).portraitCover
    if (portrait === null || portrait.kind !== 'image') throw new Error('no portrait cover')

    await sort(papillon.id, 'animals')

    expect(await catalogueOf(ines)).toEqual([
      expect.objectContaining({
        project: {
          id: papillon.id,
          title: 'Quel papillon ?',
          cover: { url: portrait.url, thumbhash: portrait.thumbhash },
        },
      }),
    ])
  })

  it('takes the cover away once the photo is deleted', async () => {
    const papillon = await publish(ines, 'Quel papillon ?')
    const [photo] = (await addPhoto(papillon.id, ines)).visuals
    if (photo === undefined) throw new Error('no photo')
    await sort(papillon.id, 'animals')
    expect(await catalogueOf(ines)).toEqual([
      expect.objectContaining({ project: expect.objectContaining({ cover: expect.any(Object) }) }),
    ])

    later()
    const res = await act.send('DELETE', `/v1/projects/${papillon.id}/visuals/${photo.id}`, ines)
    expect(res.status).toBe(200)

    expect(await catalogueOf(ines)).toEqual([
      expect.objectContaining({ project: expect.objectContaining({ cover: null }) }),
    ])
  })
})

describe('the update of a followed project', () => {
  /** Publie une mise à jour avec ces lignes, une seconde plus tard. */
  const postUpdate = async (projectId: string, lines: UpdateLine[]) => {
    later()
    const res = await act.send('POST', `/v1/projects/${projectId}/updates`, ines, {
      title: null,
      version: null,
      lines,
      photos: [],
      beforeAfter: false,
    })
    expect(res.status).toBe(201)
    return ProjectUpdate.parse(await res.json())
  }

  it('counts the other lines of the update, zero when it has only one', async () => {
    const papillon = await publish(ines, 'Quel papillon ?')
    later()
    expect((await act.send('POST', `/v1/projects/${papillon.id}/follow`, malik)).status).toBe(204)
    const three = await postUpdate(papillon.id, [
      { family: 'new', text: 'Les papillons de nuit' },
      { family: 'fixed', text: 'La photo floue est reconnue' },
      { family: 'polish', text: 'Des couleurs plus douces' },
    ])
    const one = await postUpdate(papillon.id, [{ family: 'fixed', text: 'Le bouton répond' }])

    const updates = (await notifications(malik)).flatMap((n) =>
      n.kind === 'project_update' ? [{ id: n.update.id, moreLines: n.update.moreLines }] : [],
    )
    expect(updates).toEqual([
      { id: one.id, moreLines: 0 },
      { id: three.id, moreLines: 2 },
    ])
  })
})
