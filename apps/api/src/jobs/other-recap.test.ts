// Tests du récap des « Autre » aux administrateurs (tranche R6b). Scénario : docs/scenarios/refonte.md,
// « R6b », « Le récap des « Autre » aux administrateurs » ; plan R6b, B3, et « Relecture du plan »
// (décisions 1, 4, 5, 7 et 8 ; relecture juridique jur-T1, option A).
//
// La tâche, otherRecap({ db, mailer, appUrl, apiUrl, secret }, now), passe le lundi à 8 h (heure de
// Paris). Si des membres ont choisi « Autre » dans les sept jours avant `now` (un outil absent du
// catalogue, ou la catégorie « Autre » d'un projet), chaque administrateur en fonction, à l'adresse
// vérifiée et non suspendu, reçoit dans sa langue un e-mail qui ne porte QUE des nombres et deux
// liens : les « Autre » de la semaine à vérifier, les projets de la semaine à ranger, et le nombre
// de ceux qui attendent depuis plus d'une semaine (outils et projets ensemble). Ni nom d'outil, ni
// titre, ni auteur, ni accroche : rien d'un membre ne part chez l'envoyeur d'e-mails.
//
// Ne comptent que les projets que les membres peuvent voir (publics, pas retirés, d'un auteur
// vérifié), sans filtre de blocage ; jamais un « Autre » écarté, ni un projet que son auteur a remis
// en « Autre » après un rangement. La date d'envoi (admin_member.other_recap_at) est prise avant
// l'envoi, d'un seul geste : deux passages au même moment n'envoient qu'un e-mail, et un
// administrateur prévenu il y a moins de six jours ne l'est pas de nouveau.
//
// Les dates : les membres s'inscrivent le dimanche 7 juin 2026 ; « ancien » est ce dimanche-là
// (plus d'une semaine avant le passage), « récent » le vendredi 12 ; le passage, le lundi 15 juin à
// 8 h de Paris (6 h UTC). Une session dure 7 jours : après le lundi, un membre se reconnecte.

import { schema } from '@ruche/db'
import { fill, resources } from '@ruche/i18n'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mailer } from '../email/mailer'
import { activity } from '../testing/activity'
import {
  createTestContext,
  TEST_API_URL,
  TEST_APP_URL,
  TEST_AUTH_SECRET,
  type TestContext,
} from '../testing/context'
import { addCatalogueTool, clearCatalogue } from '../testing/tool-catalogue'
import { otherRecap } from './other-recap'

let ctx: TestContext
let act: ReturnType<typeof activity>
let louis: string // cookies de session
let ann: string
let lea: string
let max: string
let zoe: string
let louisId: string
let annId: string
let maxId: string

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
/** Le dimanche 7 juin 2026, plus d'une semaine avant le passage. */
const OLD = new Date('2026-06-07T08:00:00.000Z')
/** Le vendredi 12 juin 2026, dans la semaine du passage. */
const RECENT = new Date('2026-06-12T08:00:00.000Z')
/** Le lundi 15 juin 2026, 8 h à Paris (heure d'été : UTC + 2). */
const MONDAY_8H = new Date('2026-06-15T06:00:00.000Z')

const louisAccount = { name: 'Louis', email: 'louis@example.com', password: 'louis-long-password' }
const annAccount = {
  name: 'Ann',
  email: 'ann@example.com',
  password: 'ann-long-password',
  language: 'en',
}
const leaAccount = { name: 'Léa', email: 'lea@example.com', password: 'correct-horse-battery' }
const maxAccount = { name: 'Max', email: 'max@example.com', password: 'another-long-password' }
const zoeAccount = { name: 'Zoé', email: 'zoe@example.com', password: 'zoe-long-pw-1' }

const fr = resources.fr.translation.email
const en = resources.en.translation.email
const subjects = [fill(fr.otherRecap.subject), fill(en.otherRecap.subject)]
const TOOLS_URL = new URL('/moderation/tools', TEST_APP_URL).toString()
const CATEGORIES_URL = new URL('/moderation/categories', TEST_APP_URL).toString()

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(OLD.getTime() - HOUR))
  ctx = await createTestContext()
  act = activity(ctx)
  louis = await ctx.verifiedMember(louisAccount)
  ann = await ctx.verifiedMember(annAccount)
  lea = await ctx.verifiedMember(leaAccount)
  max = await ctx.verifiedMember(maxAccount)
  zoe = await ctx.verifiedMember(zoeAccount)
  louisId = (await act.me(louis)).id
  annId = (await act.me(ann)).id
  maxId = (await act.me(max)).id
  await act.makeAdmin(louisId)
  await act.makeAdmin(annId)
  // Un petit catalogue connu : tout autre nom tapé devient un « Autre ».
  await clearCatalogue(ctx.db)
  await addCatalogueTool(ctx.db, { name: 'Claude', family: 'assistant' })
  vi.setSystemTime(RECENT)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Avance la fausse horloge (par défaut d'une seconde : deux gestes n'ont jamais la même date). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

const depsWith = (mailer: Mailer = ctx.mailer) => ({
  db: ctx.db,
  mailer,
  appUrl: TEST_APP_URL,
  apiUrl: TEST_API_URL,
  secret: TEST_AUTH_SECRET,
})

/** Lance la tâche à l'heure donnée (comme pg-boss, le lundi à 8 h). */
const runAt = (now: Date, mailer?: Mailer) => otherRecap(depsWith(mailer), now)

/** Les récaps reçus par une adresse, dans l'ordre d'envoi. */
const recapsTo = (address: string) =>
  ctx.mailer.sent.filter((email) => email.to === address && subjects.includes(email.subject))

/** Tous les récaps envoyés, à qui que ce soit. */
const allRecaps = () => ctx.mailer.sent.filter((email) => subjects.includes(email.subject))

/** Publie un projet (public, classé « Autre » par défaut), une seconde plus tard. */
const publish = async (cookie: string, title: string, tools: string[] = [], body: object = {}) => {
  later()
  return act.publish(cookie, title, { tools, ...body })
}

/** Publie à la date « ancienne » (plus d'une semaine avant le passage), puis revient au présent. */
const publishOld = async (
  cookie: string,
  title: string,
  tools: string[] = [],
  body: object = {},
) => {
  const now = Date.now()
  vi.setSystemTime(OLD)
  const project = await publish(cookie, title, tools, body)
  vi.setSystemTime(now)
  return project
}

/** Le texte français attendu pour un nombre (« 1 autre outil… », « 3 autres outils… »). */
const counted = (one: string, other: string, count: number) =>
  fill(count === 1 ? one : other, { count: String(count) })
const toolsLine = (count: number) =>
  counted(fr.otherRecap.tools_one, fr.otherRecap.tools_other, count)
const projectsLine = (count: number) =>
  counted(fr.otherRecap.projects_one, fr.otherRecap.projects_other, count)
const olderLine = (count: number) =>
  counted(fr.otherRecap.older_one, fr.otherRecap.older_other, count)

/** Le récap de Louis (français), le seul attendu. */
const louisRecap = () => {
  const recaps = recapsTo(louisAccount.email)
  expect(recaps).toHaveLength(1)
  return recaps[0]?.text ?? ''
}

/** Retire un projet : un membre le signale, Louis décide. */
const removeProject = async (id: string, reporter: string) => {
  later()
  await act.report(reporter, { kind: 'project', id })
  later()
  await act.decide(louis, {
    action: 'remove',
    target: { kind: 'project', id },
    ground: 'rules',
    explanation: 'Publicité déguisée.',
  })
}

describe('the recap of the « other » items', () => {
  it('emails each administrator, in her language, the numbers and the links, nothing more', async () => {
    // Un « Autre » « Teachable Machine » sur le projet public « Mon chat qui parle » de Max (@max),
    // accroche « Une accroche de Max », et un projet de Max classé « other ».
    await publish(max, 'Mon chat qui parle', ['Teachable Machine'], {
      pitch: 'Une accroche de Max',
    })
    const result = await runAt(MONDAY_8H)
    expect(result).toMatchObject({ sent: 2, failed: 0 })
    const [french] = recapsTo(louisAccount.email)
    expect(french?.text).toContain(fill(fr.otherRecap.tools_one, { count: '1' }))
    expect(french?.text).toContain(fill(fr.otherRecap.projects_one, { count: '1' }))
    for (const email of [french, ...recapsTo(annAccount.email)]) {
      for (const leak of ['Mon chat qui parle', 'Une accroche de Max', 'Max', '@max', maxId]) {
        expect(`${email?.subject}${email?.text}${email?.html}`, leak).not.toContain(leak)
      }
    }
  })

  it('writes in English to an English-speaking administrator, and to no plain member', async () => {
    await publish(max, 'Mon chat qui parle', ['Teachable Machine'])

    await runAt(MONDAY_8H)

    const [english] = recapsTo(annAccount.email)
    expect(english?.subject).toBe(fill(en.otherRecap.subject))
    expect(english?.text).toContain(fill(en.otherRecap.tools_one, { count: '1' }))
    expect(english?.text).toContain(fill(en.otherRecap.projects_one, { count: '1' }))
    expect(recapsTo(louisAccount.email)[0]?.subject).toBe(fill(fr.otherRecap.subject))
    for (const account of [leaAccount, maxAccount, zoeAccount]) {
      expect(recapsTo(account.email)).toEqual([])
    }
  })

  it('links only to the two moderation pages, with no member-derived segment', async () => {
    await publish(max, 'Mon chat qui parle', ['Teachable Machine'])

    await runAt(MONDAY_8H)

    for (const email of allRecaps()) {
      const hrefs = [...email.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1] ?? '')
      expect([...new Set(hrefs)].sort()).toEqual([CATEGORIES_URL, TOOLS_URL].sort())
      expect(email.text).toContain(TOOLS_URL)
      expect(email.text).toContain(CATEGORIES_URL)
      // Aucune autre adresse dans le texte : ni projet, ni page d'outil, ni membre.
      const urls = email.text.match(/https?:\/\/\S+/g) ?? []
      for (const url of urls) expect([TOOLS_URL, CATEGORIES_URL], url).toContain(url)
      expect(email.html).not.toMatch(/<img|unsubscribe/i)
    }
    expect(allRecaps()).toHaveLength(2)
  })

  it('writes no domain from a tool name, a title, a pitch or an author name, in HTML or in text', async () => {
    await act.updateProfile(max, { name: 'Max de pirate-auteur.example' })
    await publish(max, 'Va sur pirate-titre.example', ['pirate-outil.example'], {
      pitch: 'Clique sur pirate-accroche.example',
    })

    await runAt(MONDAY_8H)

    expect(allRecaps()).toHaveLength(2)
    for (const email of allRecaps()) {
      for (const leak of ['pirate-', '.example', 'Va sur', 'Clique']) {
        expect(`${email.subject}${email.text}${email.html}`, leak).not.toContain(leak)
      }
    }
  })
})

describe('what the recap counts', () => {
  it('sends nothing when no « other » was chosen in the last seven days', async () => {
    // Des « Autre » anciens, encore en attente : ils ne font pas partir le récap à eux seuls.
    await publishOld(lea, 'Vieux projet', ['Vieil Outil'])
    await publish(max, 'Pluie', ['Claude'], { primaryCategory: 'cooking' })

    const result = await runAt(MONDAY_8H)

    expect(result).toMatchObject({ sent: 0, failed: 0 })
    expect(allRecaps()).toEqual([])
    // Témoin : un « Autre » de la semaine le fait partir, une semaine plus tard.
    vi.setSystemTime(new Date(MONDAY_8H.getTime() + DAY))
    await publish(await act.signInAgain(zoeAccount), 'Tri', ['Outil Neuf'], {
      primaryCategory: 'cooking',
    })
    await runAt(new Date(MONDAY_8H.getTime() + 7 * DAY))
    expect(louisRecap()).toContain(toolsLine(1))
  })

  it('counts the « other » items of the last seven days, and the older ones still waiting', async () => {
    // Anciens : un outil et un projet classé « Autre ».
    await publishOld(lea, 'Vieux projet', ['Vieil Outil'])
    // Récents : deux outils (projet classé « Cuisine »), un projet classé « Autre » en seconde.
    await publish(max, 'Pluie', ['Outil Neuf A', 'Outil Neuf B', 'Claude'], {
      primaryCategory: 'cooking',
    })
    await publish(zoe, 'Tri', [], { primaryCategory: 'cooking', secondaryCategory: 'other' })

    await runAt(MONDAY_8H)

    const text = louisRecap()
    expect(text).toContain(toolsLine(2))
    expect(text).toContain(projectsLine(1))
    expect(text).toContain(olderLine(2))
  })

  it('counts every pending tool, beyond the twenty of a page', async () => {
    const names = Array.from({ length: 23 }, (_, i) => `Outil ${String(i + 1).padStart(2, '0')}`)
    await publish(lea, 'Beaucoup d’outils', names.slice(0, 15), { primaryCategory: 'cooking' })
    await publish(lea, 'Encore des outils', names.slice(15), { primaryCategory: 'cooking' })

    await runAt(MONDAY_8H)

    expect(louisRecap()).toContain(toolsLine(23))
  })

  it('never mails an « other » whose only projects are private, removed or of a deleted account', async () => {
    const cooking = { primaryCategory: 'cooking' }
    await publish(lea, 'Carnet', ['Outil Privé'], { ...cooking, visibility: 'private' })
    const removed = await publish(max, 'Pub', ['Outil Retiré'], cooking)
    await removeProject(removed.id, zoe)
    await publish(zoe, 'Tri', ['Outil Parti'], cooking)
    later()
    await act.deleteAccount(zoe, zoeAccount.password)
    // Témoin : un « Autre » sur un projet public compte.
    await publish(lea, 'Potager', ['Outil Visible'], cooking)

    await runAt(MONDAY_8H)

    const text = louisRecap()
    expect(text).toContain(toolsLine(1))
    expect(text).not.toContain(fill(fr.otherRecap.projects_one, { count: '1' }))
  })

  it('never counts a private or removed project filed under « other »', async () => {
    await publish(lea, 'Carnet', [], { visibility: 'private' })
    const removed = await publish(max, 'Pub')
    await removeProject(removed.id, zoe)

    await runAt(MONDAY_8H)
    expect(allRecaps()).toEqual([])

    // Témoin : un projet public classé « Autre » fait partir le récap la semaine suivante.
    vi.setSystemTime(new Date(MONDAY_8H.getTime() + DAY))
    await publish(await act.signInAgain(zoeAccount), 'Tri')
    await runAt(new Date(MONDAY_8H.getTime() + 7 * DAY))
    expect(louisRecap()).toContain(projectsLine(1))
  })

  it('leaves out of the pending tools, and of the older count, an other tool cited only by private projects', async () => {
    const cooking = { primaryCategory: 'cooking' }
    await publishOld(lea, 'Carnet', ['Outil Secret'], { ...cooking, visibility: 'private' })
    await publishOld(max, 'Pluie', ['Vieil Outil'], cooking)
    await publish(zoe, 'Tri', ['Outil Neuf'], cooking)

    await runAt(MONDAY_8H)

    const text = louisRecap()
    expect(text).toContain(toolsLine(1))
    expect(text).toContain(olderLine(1))
    // La page « À vérifier » non plus ne le montre pas.
    const res = await act.send(
      'GET',
      '/v1/moderation/tools/pending',
      await act.signInAgain(louisAccount),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).not.toContain('Outil Secret')
  })

  it('keeps a shared « other » tool without author after its creator deleted his account, and counts it in the recap', async () => {
    const cooking = { primaryCategory: 'cooking' }
    await publish(max, 'Mon chat qui parle', ['Teachable Machine'], cooking)
    await publish(zoe, 'Tri', ['teachable machine'], cooking)
    later()
    await act.deleteAccount(max, maxAccount.password)

    await runAt(MONDAY_8H)

    expect(louisRecap()).toContain(toolsLine(1))
    // Un seul « Autre », sans auteur (SQL brut : la table est neuve, migration 0016). `execute` rend
    // des lignes sans type : on les lit comme des objets.
    const rows = (await ctx.db.execute(
      sql`select created_by from tool where folded = 'teachablemachine'`,
    )) as unknown as { rows: unknown[] }
    expect(rows.rows).toEqual([{ created_by: null }])
  })

  it('keeps a dismissed other tool out of the pending tools, the public list and the recap, and still shows it on its projects', async () => {
    const cooking = { primaryCategory: 'cooking' }
    const project = await publish(lea, 'Mon chat', ['Bidule'], cooking)
    later()
    const pending = await act.send('GET', '/v1/moderation/tools/pending', louis)
    expect(pending.status).toBe(200)
    const slug = ((await pending.json()) as { items: { slug: string; name: string }[] }).items.find(
      (item) => item.name === 'Bidule',
    )?.slug
    later()
    expect((await act.send('POST', `/v1/moderation/tools/${slug}/dismiss`, louis)).status).toBe(204)

    await runAt(MONDAY_8H)

    expect(allRecaps()).toEqual([])
    const again = await act.send('GET', '/v1/moderation/tools/pending', louis)
    expect(await again.text()).not.toContain('Bidule')
    const list = await act.send('GET', '/v1/tools', zoe)
    expect(await list.text()).not.toContain('Bidule')
    const page = await act.send('GET', `/v1/projects/${project.id}`, zoe)
    expect(await page.text()).toContain('"label":"Bidule"')
  })

  it('does not count a project its author set back to other after it was sorted', async () => {
    const project = await publish(lea, 'Mon chat qui parle')
    later()
    const sorted = await act.send('POST', `/v1/moderation/projects/${project.id}/category`, louis, {
      category: 'animals',
    })
    expect(sorted.status).toBe(204)
    later()
    await act.send('PATCH', `/v1/projects/${project.id}`, lea, { primaryCategory: 'other' })

    await runAt(MONDAY_8H)

    expect(allRecaps()).toEqual([])
  })

  it('counts the « other » items of a member who blocked the administrator', async () => {
    later()
    await act.block(louisId, max)
    await publish(max, 'Mon chat qui parle', ['Teachable Machine'])

    await runAt(MONDAY_8H)

    const text = louisRecap()
    expect(text).toContain(toolsLine(1))
    expect(text).toContain(projectsLine(1))
  })
})

describe('when the recap goes', () => {
  // PGlite n'a qu'une connexion : les deux passages s'y suivent. Ce test vérifie que le second
  // relit la date notée par le premier, pas la course elle-même.
  it('sends the recap once when the job runs twice at the same time', async () => {
    await publish(max, 'Mon chat qui parle', ['Teachable Machine'])

    await Promise.all([runAt(MONDAY_8H), runAt(MONDAY_8H)])

    expect(recapsTo(louisAccount.email)).toHaveLength(1)
    expect(recapsTo(annAccount.email)).toHaveLength(1)
  })

  it('does not resend the recap to an administrator mailed less than six days ago', async () => {
    await publish(max, 'Mon chat qui parle', ['Teachable Machine'])
    await runAt(MONDAY_8H)
    expect(recapsTo(louisAccount.email)).toHaveLength(1)

    // Un nouvel « Autre » le mardi.
    vi.setSystemTime(new Date(MONDAY_8H.getTime() + DAY))
    await publish(await act.signInAgain(zoeAccount), 'Tri', ['Outil du mardi'], {
      primaryCategory: 'cooking',
    })

    await runAt(new Date(MONDAY_8H.getTime() + DAY + HOUR))
    await runAt(new Date(MONDAY_8H.getTime() + 6 * DAY - MINUTE))
    expect(recapsTo(louisAccount.email)).toHaveLength(1)

    await runAt(new Date(MONDAY_8H.getTime() + 7 * DAY))
    const sent = recapsTo(louisAccount.email)
    expect(sent).toHaveLength(2)
    expect(sent[1]?.text).toContain(toolsLine(1))
  })

  it('sends nothing to a revoked or a suspended administrator, nor to an unverified address', async () => {
    await act.revokeAdmin(annId)
    const karimAccount = {
      name: 'Karim',
      email: 'karim@example.com',
      password: 'karim-long-password',
    }
    const karimId = (await act.me(await ctx.verifiedMember(karimAccount))).id
    later()
    const suspended = await act.send('POST', '/v1/moderation/decisions', louis, {
      action: 'suspend',
      memberId: karimId,
      duration: '7d',
      ground: 'rules',
      explanation: 'Messages insultants répétés sous les projets des autres.',
    })
    expect(suspended.status).toBe(201)
    await act.makeAdmin(karimId)
    await publish(max, 'Mon chat qui parle', ['Teachable Machine'])
    await ctx.db
      .update(schema.user)
      .set({ emailVerified: false })
      .where(eq(schema.user.id, louisId))
    // Témoin : Max, administrateur en fonction à l'adresse vérifiée, le reçoit.
    await act.makeAdmin(maxId)

    await runAt(MONDAY_8H)

    expect(recapsTo(annAccount.email)).toEqual([])
    expect(recapsTo(karimAccount.email)).toEqual([])
    expect(recapsTo(louisAccount.email)).toEqual([])
    expect(recapsTo(maxAccount.email)).toHaveLength(1)
  })

  it('notes the date before sending: a failed sending is not retried at the next pass', async () => {
    const refused: string[] = []
    const failing: Mailer = {
      send: async (email) => {
        refused.push(email.to)
        throw new Error('refused')
      },
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await publish(max, 'Mon chat qui parle', ['Teachable Machine'])

    const result = await runAt(MONDAY_8H, failing)
    await runAt(new Date(MONDAY_8H.getTime() + HOUR), failing)

    expect(result).toMatchObject({ sent: 0, failed: 2 })
    expect(refused.sort()).toEqual([annAccount.email, louisAccount.email])
    expect(allRecaps()).toEqual([])
  })
})
