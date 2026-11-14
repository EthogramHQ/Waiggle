// Tests de la partie « Dans tes ruches » du récap du dimanche (R10). Scénario :
// docs/scenarios/refonte.md, « R10 », « La partie Dans tes ruches du récap » et « Le réglage
// Ruches » ; planche R10-Recap ; décision de Louis du 14/11/2026 (le nom de la ruche en texte
// simple, jamais en lien) ; plan R10, « Ce qui change au plan », points 1 (`imagesFor` exclut les
// projets réservés de toutes les parties) et 4 (le nom échappé et désarmé).
//
// Ruche par ruche, les projets publiés et les mises à jour de la semaine (titre, auteur) ; les
// invitations en attente si « Ruches » vaut « Dans le récap », sans le nom de la ruche ; rien pour
// « Jamais » ; rien s'il n'y a rien. Un projet réservé à une ruche n'a jamais de vignette, dans
// aucune partie, pas même chez son auteur.
//
// Quatre membres : Inès (qui reçoit le récap), Zoé (qui anime « Famille »), Malik (dans
// « Famille », anime « Atelier »), Sam (hors des ruches). Les ruches sont écrites en base
// (testing/hive-rows.ts) ; un projet réservé est publié par l'API, puis réservé en base (la
// publication « Une ruche » est testée ailleurs).

import { randomUUID } from 'node:crypto'
import { schema } from '@ruche/db'
import { fill, resources } from '@ruche/i18n'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Email } from '../email/templates'
import { activity } from '../testing/activity'
import {
  createTestContext,
  TEST_API_URL,
  TEST_APP_URL,
  TEST_AUTH_SECRET,
  type TestContext,
} from '../testing/context'
import { hiveRows } from '../testing/hive-rows'
import { photoWithGps, visualForm } from '../testing/images'
import { weeklyRecap } from './weekly-recap'

let ctx: TestContext
let act: ReturnType<typeof activity>
let hives: ReturnType<typeof hiveRows>
let ines: string // cookies de session
let malik: string
let zoe: string
let sam: string
let inesId: string
let malikId: string
let zoeId: string
let samId: string

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const START = new Date('2026-06-14T08:00:00.000Z') // un dimanche, 10 h à Paris

const inesAccount = { name: 'Inès', email: 'ines@example.com', password: 'ines-long-password' }
const fr = resources.fr.translation.email

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  hives = hiveRows(ctx)
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
  sam = await ctx.verifiedMember({
    name: 'Sam',
    email: 'sam@example.com',
    password: 'sam-long-password',
  })
  inesId = (await act.me(ines)).id
  malikId = (await act.me(malik)).id
  zoeId = (await act.me(zoe)).id
  samId = (await act.me(sam)).id
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

const runRecap = () =>
  weeklyRecap(
    {
      db: ctx.db,
      mailer: ctx.mailer,
      storage: ctx.storage,
      appUrl: TEST_APP_URL,
      apiUrl: TEST_API_URL,
      secret: TEST_AUTH_SECRET,
    },
    new Date(),
  )

const recapSubject = fill(fr.recap.subject)
const recapsTo = (address: string) =>
  ctx.mailer.sent.filter((email) => email.to === address && email.subject === recapSubject)
const onlyRecapTo = (address: string) => {
  const recaps = recapsTo(address)
  expect(recaps).toHaveLength(1)
  return recaps[0] as Email
}

const hrefsOf = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1])
/** Le texte de chaque lien (`<a …>texte</a>`) du HTML. */
const anchorTexts = (html: string) =>
  [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => match[1] ?? '')
/** Les textes de remplacement des images : le titre du projet de chaque vignette. */
const imageAlts = (html: string) =>
  [...html.matchAll(/<img\b[^>]*\balt="([^"]*)"/gi)].map((match) => match[1] ?? '')

/** Les titres des parties qui peuvent suivre « Dans tes ruches ». */
const OTHER_TITLES = [
  fr.recap.friendsTitle,
  fr.recap.testersWanted,
  fr.recap.updatesTitle,
  fr.recap.testersTitle,
  fr.recap.hiveInvitationsTitle,
]
/** La partie « Dans tes ruches » : de son titre à la partie suivante, ou au pied de l'e-mail. */
const hivesPartOf = (text: string) => {
  const start = text.indexOf(fr.recap.hivesTitle)
  expect(start, 'the hives part').toBeGreaterThanOrEqual(0)
  const rest = text.slice(start)
  const ends = [...OTHER_TITLES, fill(fr.recap.reason)]
    .map((title) => rest.indexOf(title, 1))
    .filter((at) => at > 0)
  return rest.slice(0, Math.min(...ends, rest.length))
}
/** Le morceau d'une ruche dans la partie : de son nom au nom de la ruche suivante. */
const hiveSegment = (part: string, name: string, others: string[]) => {
  const heading = fill(fr.recap.hiveName, { hive: name })
  const start = part.indexOf(heading)
  expect(start, heading).toBeGreaterThanOrEqual(0)
  const rest = part.slice(start)
  const ends = others
    .map((other) => rest.indexOf(fill(fr.recap.hiveName, { hive: other }), 1))
    .filter((at) => at > 0)
  return rest.slice(0, Math.min(...ends, rest.length))
}
const published = (name: string, title: string) => fill(fr.recap.hivePublished, { name, title })
const updated = (name: string, title: string) => fill(fr.recap.hiveUpdated, { name, title })

const publish = async (cookie: string, title: string, body: object = {}) => {
  later()
  return act.publish(cookie, title, body)
}
/** Publie un projet, puis le réserve à une ruche. */
const publishIn = async (hiveId: string, cookie: string, title: string, body: object = {}) => {
  const project = await publish(cookie, title, body)
  await hives.reserve(project.id, hiveId)
  return project
}
const postUpdate = async (projectId: string, cookie: string) => {
  later()
  const res = await act.send('POST', `/v1/projects/${projectId}/updates`, cookie, {
    title: null,
    version: null,
    lines: [{ family: 'new', text: 'Une nouveauté' }],
    photos: [],
    beforeAfter: false,
  })
  expect(res.status).toBe(201)
}
const addPhoto = async (projectId: string, cookie: string) => {
  later()
  const res = await ctx.request(`/v1/projects/${projectId}/visuals`, {
    method: 'POST',
    headers: { cookie },
    body: visualForm(await photoWithGps()),
  })
  expect(res.status).toBe(201)
}

/** « Famille », animée par Zoé, avec Inès et Malik. */
const famille = (name = 'Famille') =>
  hives.create({ name, animatorId: zoeId, members: [{ id: inesId }, { id: malikId }] })

describe('the hives part of the recap', () => {
  it('shows, hive by hive, the projects published and updated this week, with their title and author', async () => {
    const familleId = await famille()
    const atelierId = await hives.create({
      name: 'Atelier',
      animatorId: malikId,
      members: [{ id: inesId }],
    })
    const secretId = await hives.create({ name: 'Secret', animatorId: samId, members: [] })
    // Potager, publié la semaine d'avant, mis à jour cette semaine.
    const potager = await publishIn(familleId, zoe, 'Potager')
    later(8 * DAY)
    zoe = await act.signInAgain({ email: 'zoe@example.com', password: 'zoe-long-password' })
    malik = await act.signInAgain({ email: 'malik@example.com', password: 'malik-long-password' })
    sam = await act.signInAgain({ email: 'sam@example.com', password: 'sam-long-password' })
    await postUpdate(potager.id, zoe)
    await publishIn(familleId, malik, 'Carnet de Mamie')
    await publishIn(atelierId, malik, 'Robot cuiseur')
    // Ni un projet de Sam, hors des ruches, ni un projet réservé à une ruche dont Inès n'est pas.
    await publish(sam, 'Fusée de Sam')
    await publishIn(secretId, sam, 'Projet caché')
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    const part = hivesPartOf(recap.text)
    const familleLines = hiveSegment(part, 'Famille', ['Atelier'])
    expect(familleLines).toContain(published('Malik', 'Carnet de Mamie'))
    expect(familleLines).toContain(updated('Zoé', 'Potager'))
    expect(familleLines).not.toContain('Robot cuiseur')
    expect(hiveSegment(part, 'Atelier', ['Famille'])).toContain(published('Malik', 'Robot cuiseur'))
    for (const absent of ['Fusée de Sam', 'Projet caché', 'Secret']) {
      expect(recap.text, absent).not.toContain(absent)
      expect(recap.html, absent).not.toContain(absent)
    }
    // Potager n'est pas « publié » cette semaine : il est mis à jour.
    expect(part).not.toContain(published('Zoé', 'Potager'))
  })

  it('writes the hive name as plain text, never as a link', async () => {
    const familleId = await famille('Famille Pivert')
    await publishIn(familleId, malik, 'Carnet de Mamie')
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.html).toContain('Famille Pivert') // témoin : le nom est bien là
    for (const text of anchorTexts(recap.html)) expect(text).not.toContain('Pivert')
    for (const href of hrefsOf(recap.html)) {
      expect(href, href).not.toContain(familleId)
      expect(href, href).not.toMatch(/\/hives\/./)
    }
  })

  it('leaves the hives part out when hives is set to never, and sends nothing when only hives have news', async () => {
    await act.setPreferences(ines, { hives: 'never' })
    const familleId = await famille()
    await publishIn(familleId, malik, 'Carnet de Mamie')
    later(HOUR)

    await runRecap()

    expect(recapsTo(inesAccount.email)).toEqual([])
    // Témoin : Zoé, aux réglages par défaut, a la partie.
    expect(onlyRecapTo('zoe@example.com').text).toContain(fr.recap.hivesTitle)

    // Avec une autre nouveauté, le récap suivant part, sans la partie des ruches.
    const meteo = await publish(ines, 'Météo')
    later(6 * DAY)
    await act.comment(meteo.id, sam, 'Bravo.')
    later(HOUR)
    await runRecap()
    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.text).not.toContain(fr.recap.hivesTitle)
    expect(recap.text).not.toContain('Carnet de Mamie')
  })

  it('says nothing of the hives when nothing happened in them this week', async () => {
    const familleId = await famille()
    const meteo = await publish(ines, 'Météo')
    later()
    await act.comment(meteo.id, sam, 'Bravo.')
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.text).not.toContain(fr.recap.hivesTitle)
    expect(recap.text).not.toContain(fill(fr.recap.hiveName, { hive: 'Famille' }))

    // Témoin : la semaine suivante, une publication dans la ruche fait naître la partie.
    later(6 * DAY)
    malik = await act.signInAgain({ email: 'malik@example.com', password: 'malik-long-password' })
    await publishIn(familleId, malik, 'Carnet de Mamie')
    later(HOUR)
    await runRecap()
    const next = recapsTo(inesAccount.email)[1]
    expect(hivesPartOf(next?.text ?? '')).toContain(published('Malik', 'Carnet de Mamie'))
  })

  it('leaves out the news of a member blocked either way', async () => {
    const familleId = await famille()
    await act.block(malikId, ines)
    await publishIn(familleId, malik, 'Carnet de Mamie')
    await publishIn(familleId, zoe, 'Potager') // témoin
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(hivesPartOf(recap.text)).toContain(published('Zoé', 'Potager'))
    expect(recap.text).not.toContain('Carnet de Mamie')
  })
})

describe('the pending invitations of the recap', () => {
  /** « Atelier Zébulon », animée par Malik, où il invite Inès ; Sam l'y invite aussi, refusée. */
  const invitations = async () => {
    const atelierId = await hives.create({
      name: 'Atelier Zébulon',
      animatorId: malikId,
      members: [],
    })
    await hives.join(atelierId, { id: samId })
    await hives.invite({ hiveId: atelierId, inviteeId: inesId, inviterId: malikId })
    const otherId = await hives.create({ name: 'Cousins', animatorId: samId, members: [] })
    await hives.invite({
      hiveId: otherId,
      inviteeId: inesId,
      inviterId: samId,
      refusedAt: new Date(),
    })
    // Une invitation de Zoé, vieille de plus de 30 jours : elle ne vaut plus.
    const oldId = await hives.create({ name: 'Ancienne', animatorId: zoeId, members: [] })
    await hives.invite({
      hiveId: oldId,
      inviteeId: inesId,
      inviterId: zoeId,
      createdAt: new Date(Date.now() - 31 * DAY),
    })
  }

  it('lists the pending invitations, without the hive name, when hives is set to the recap', async () => {
    await act.setPreferences(ines, { hives: 'digest' })
    await invitations()
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.text).toContain(fr.recap.hiveInvitationsTitle)
    expect(recap.text).toContain(fill(fr.recap.hiveInvitation, { name: 'Malik' }))
    // Ni la refusée, ni l'expirée ; jamais le nom d'une ruche où Inès n'est pas.
    expect(recap.text).not.toContain(fill(fr.recap.hiveInvitation, { name: 'Sam' }))
    expect(recap.text).not.toContain(fill(fr.recap.hiveInvitation, { name: 'Zoé' }))
    for (const part of [recap.subject, recap.text, recap.html]) {
      for (const name of ['Zébulon', 'Cousins', 'Ancienne']) expect(part, name).not.toContain(name)
    }
  })

  it('leaves the pending invitations out of the recap when hives is set to now or never', async () => {
    // « Tout de suite » (par défaut) : l'invitation est partie dans l'e-mail « tout de suite ».
    await invitations()
    const meteo = await publish(ines, 'Météo')
    later()
    await act.comment(meteo.id, sam, 'Bravo.')
    later(HOUR)
    await runRecap()
    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.text).not.toContain(fr.recap.hiveInvitationsTitle)
    expect(recap.text).not.toContain(fill(fr.recap.hiveInvitation, { name: 'Malik' }))

    await act.setPreferences(ines, { hives: 'never' })
    later(6 * DAY)
    await act.comment(meteo.id, sam, 'Encore bravo.')
    later(HOUR)
    await runRecap()
    expect(recapsTo(inesAccount.email)).toHaveLength(2)
    expect(recapsTo(inesAccount.email)[1]?.text).not.toContain(fr.recap.hiveInvitationsTitle)

    // Témoin : « Dans le récap », la même invitation (encore valable) y entre.
    await act.setPreferences(ines, { hives: 'digest' })
    later(6 * DAY)
    sam = await act.signInAgain({ email: 'sam@example.com', password: 'sam-long-password' })
    await act.comment(meteo.id, sam, 'Toujours bravo.')
    later(HOUR)
    await runRecap()
    expect(recapsTo(inesAccount.email)[2]?.text).toContain(
      fill(fr.recap.hiveInvitation, { name: 'Malik' }),
    )
  })
})

describe('the hive projects and names in the recap', () => {
  it("never attaches a thumbnail to a hive-reserved project in any part of the recap, the author's own included", async () => {
    const familleId = await famille()
    await act.followMember(malikId, ines)
    // Chez Inès : Météo, réservé à Famille, et Jardin, public (témoin), tous deux avec une photo et
    // un commentaire de la semaine (la partie « Tes projets »).
    const meteo = await publish(ines, 'Météo')
    await addPhoto(meteo.id, ines)
    const jardin = await publish(ines, 'Jardin')
    await addPhoto(jardin.id, ines)
    for (const project of [meteo, jardin]) {
      later()
      await act.comment(project.id, zoe, 'Bravo.')
    }
    await hives.reserve(meteo.id, familleId)
    // Malik, suivi par Inès : Papillon, testable, réservé (« Nouveaux projets de tes proches », « Ils
    // cherchent des testeurs ») ; Zoé : Carnet, réservé (« Dans tes ruches »). Tous avec une photo.
    const papillon = await publishIn(familleId, malik, 'Papillon', {
      status: 'testable',
      demoUrl: 'https://papillon-demo.example.com/',
    })
    await addPhoto(papillon.id, malik)
    const carnet = await publishIn(familleId, zoe, 'Carnet')
    await addPhoto(carnet.id, zoe)
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    // Témoins : les projets réservés sont bien dans le récap (Météo dans « Tes projets », Carnet
    // dans « Dans tes ruches ») ; sans eux, l'absence de vignette ne prouverait rien.
    expect(recap.text).toContain('Météo')
    expect(hivesPartOf(recap.text)).toContain(published('Zoé', 'Carnet'))
    const alts = imageAlts(recap.html)
    expect(alts).toContain('Jardin')
    for (const title of ['Météo', 'Papillon', 'Carnet']) expect(alts, title).not.toContain(title)
    // Autant de pièces jointes que d'images montrées : aucune vignette cachée d'un projet réservé.
    expect(recap.attachments ?? []).toHaveLength(alts.length)
  })

  it('defangs a domain written in a hive name in the recap', async () => {
    const familleId = await famille('Famille sur zebre-pirate.example')
    await publishIn(familleId, malik, 'Carnet de Mamie')
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    for (const part of [recap.subject, recap.text, recap.html]) {
      expect(part).not.toContain('zebre-pirate')
    }
    expect(hivesPartOf(recap.text)).toContain('[lien]')
  })

  it('escapes the HTML written in a hive name', async () => {
    const familleId = await famille('<b>Famille</b>')
    await publishIn(familleId, malik, 'Carnet de Mamie')
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.html).not.toContain('<b>Famille</b>')
    expect(recap.html).toContain('&lt;b&gt;Famille&lt;/b&gt;')
  })

  it('writes « Ruche sans nom » for a hive whose name the moderation removed', async () => {
    const familleId = await famille('Famille Pivert')
    // Le retrait du nom, en base : une décision de la modération, et le nom vidé.
    const decisionId = randomUUID()
    await ctx.db.insert(schema.moderationDecision).values({
      id: decisionId,
      targetKind: 'hive',
      targetId: familleId,
      action: 'remove',
      ground: 'rules',
      explanation: 'Un nom qui vise une personne.',
      createdAt: new Date(),
      targetMemberId: zoeId,
      partField: 'name',
      previousValue: 'Famille Pivert',
    })
    await ctx.db
      .update(schema.hive)
      .set({ name: '', nameRemovalId: decisionId })
      .where(eq(schema.hive.id, familleId))
    await publishIn(familleId, malik, 'Carnet de Mamie')
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    const part = hivesPartOf(recap.text)
    expect(part).toContain(fill(fr.recap.hiveUnnamed))
    expect(part).toContain(published('Malik', 'Carnet de Mamie'))
    expect(recap.text).not.toContain('Pivert')
    expect(recap.html).not.toContain('Pivert')
  })
})
