// Tests d'intégration de R12b, « Les exemples » : un compte de l'équipe (« {{appName}}Bot ») publie
// des projets fictifs qui remplissent la vitrine de l'accueil. Scénario : docs/scenarios/refonte.md,
// « R12b — Les exemples » ; contrat : packages/contracts/src/example.ts (`ExampleFlag`), porté par
// l'auteur d'un projet (`ProjectAuthor`, `PublicAuthor`, l'auteur d'un `ShowcaseItem`) et par la page
// d'un membre (`Member`, `PublicMember`).
//
// Ce que ces tests vérifient :
// - `example: true` accompagne l'auteur d'un projet d'exemples partout où il s'affiche (page du
//   projet, Fil, Explorer, page publique du projet, vitrine des visiteurs et « À la une » des
//   membres), et la page du compte (connectée comme publique) ; pour tout autre membre, le champ est
//   absent, jamais `false` (le contrat le promet : les autres réponses ne changent pas) ;
// - les suggestions de personnes à suivre ne proposent pas un compte d'exemples ;
// - les « Découvertes » du récap du dimanche ne proposent pas ses projets ;
// - un membre qui le suit voit pourtant ses projets dans son Fil, comme pour tout membre.
// La tête des pages et le plan du site sont dans examples.seo.test.ts.
//
// Le marquage d'un compte : en production, seul le script `infra/mark-example.sh` le pose,
// directement en base (aucun écran ni aucune route ne le donne). Le test écrit donc lui aussi dans
// la table `example_account`, comme `act.makeAdmin` dans `admin_member`. En SQL brut : la table
// n'existe pas encore dans le schéma Drizzle, la tranche l'y ajoute.
//
// Cinq membres : Léa (une autrice ordinaire, le témoin), le compte d'exemples, Max (qui lit), Inès
// (qui suit, et reçoit le récap) et Louis (l'administrateur, pour la vitrine). La fausse horloge part
// d'un dimanche, 10 h à Paris, comme les tests du récap (jobs/weekly-recap.test.ts).
import { appName } from '@ruche/brand'
import {
  DiscoverFeedPage,
  FeedPage,
  Member,
  MemberSuggestions,
  Project,
  PublicMember,
  PublicProject,
  ShowcasePage,
} from '@ruche/contracts'
import { fill, resources } from '@ruche/i18n'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { weeklyRecap } from './jobs/weekly-recap'
import { activity } from './testing/activity'
import {
  createTestContext,
  TEST_API_URL,
  TEST_APP_URL,
  TEST_AUTH_SECRET,
  type TestContext,
} from './testing/context'
import { later, visitorGestures } from './testing/visitor-world'

let ctx: TestContext
let act: ReturnType<typeof activity>
let world: ReturnType<typeof visitorGestures>
let lea: string // cookies de session
let bot: string
let max: string
let ines: string
let louis: string
let leaId: string
let botId: string

const HOUR = 60 * 60 * 1000
/** Avance la fausse horloge d'une heure : le récap lit ce qui est daté avant son heure. */
const anHourLater = () => vi.setSystemTime(Date.now() + HOUR)
const START = new Date('2026-06-14T08:00:00.000Z') // un dimanche, 10 h à Paris
const TESTABLE = { status: 'testable', demoUrl: 'https://papillon-demo.example.com/' }
/** Le nom du compte de l'équipe, tiré du nom de l'appli (jamais écrit en toutes lettres). */
const BOT_NAME = `${appName}Bot`

const fr = resources.fr.translation.email

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  world = visitorGestures(ctx, act)
  const member = (name: string, local: string) =>
    ctx.verifiedMember({ name, email: `${local}@example.com`, password: `${local}-long-password` })
  lea = await member('Léa Fournier', 'lea')
  bot = await member(BOT_NAME, 'bot')
  max = await member('Maxence', 'max')
  ines = await member('Inès Morel', 'ines')
  louis = await member('Louis', 'louis')
  leaId = (await act.me(lea)).id
  botId = (await act.me(bot)).id
  await act.makeAdmin((await act.me(louis)).id)
  await markExample(botId)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// --- Les gestes ---------------------------------------------------------------------------------

/**
 * Fait de ce compte un compte d'exemples, comme `infra/mark-example.sh` : une ligne dans
 * `example_account` (clé primaire et étrangère vers `user`). La date entre en texte ISO, lue en UTC,
 * pour ne pas dépendre du fuseau de la base.
 */
const markExample = (userId: string) =>
  ctx.db.execute(
    sql`insert into example_account (user_id, marked_at)
        values (${userId}, ${new Date().toISOString()}::timestamptz at time zone 'UTC')`,
  )

/** Une lecture de membre qui doit répondre 200 ; rend le corps en JSON. */
const memberJson = async (path: string, cookie: string): Promise<unknown> => {
  const res = await act.send('GET', path, cookie)
  expect(res.status, `GET ${path}: ${await res.clone().text()}`).toBe(200)
  return res.json()
}

/** L'auteur d'un projet d'exemples porte `example: true`. */
const expectExample = (author: object, where: string) => {
  expect(author, where).toHaveProperty('example', true)
}

/** L'auteur ordinaire n'a pas le champ : absent, jamais `false` (contrat `ExampleFlag`). */
const expectOrdinary = (author: object, where: string) => {
  expect(author, where).not.toHaveProperty('example')
}

/** Un projet de chacun, réservé aux membres (`public`), une seconde après ce qui précède. */
const bothPublish = async () => {
  later()
  const fake = await act.publish(bot, 'Le carnet de randonnée')
  later()
  const real = await act.publish(lea, 'Décollage !')
  return { fake, real }
}

/** Un projet « Public » de chacun (lisible sans compte), une seconde après ce qui précède. */
const bothPublishOnTheWeb = async () => {
  later()
  const fake = await ctx.webProject(bot, { title: 'Le carnet de randonnée' })
  later()
  const real = await ctx.webProject(lea)
  return { fake, real }
}

// --- La pastille « Exemple » : ce que lisent les membres ----------------------------------------

describe('the example flag, as members read it', () => {
  it('flags the author of an example project on its page, and not the author of another', async () => {
    const { fake, real } = await bothPublish()

    const fakePage = Project.parse(await memberJson(`/v1/projects/${fake.id}`, max))
    const realPage = Project.parse(await memberJson(`/v1/projects/${real.id}`, max))

    expectExample(fakePage.author, 'example project')
    expectOrdinary(realPage.author, 'ordinary project')
  })

  it('flags an example project in Explore, and leaves the others as they were', async () => {
    const { fake, real } = await bothPublish()

    const page = DiscoverFeedPage.parse(await memberJson('/v1/feed/discover', max))
    const authorOf = (id: string) => {
      const item = page.items.find((entry) => entry.project.id === id)
      if (!item) throw new Error(`project ${id} missing from Explore`)
      return item.project.author
    }

    expectExample(authorOf(fake.id), 'Explore, example project')
    expectOrdinary(authorOf(real.id), 'Explore, ordinary project')
  })

  it('flags the page of an example account and its projects, and not the page of another member', async () => {
    const { fake, real } = await bothPublish()

    const botPage = Member.parse(await memberJson(`/v1/members/${encodeURIComponent(botId)}`, max))
    const leaPage = Member.parse(await memberJson(`/v1/members/${encodeURIComponent(leaId)}`, max))

    expect(botPage.example).toBe(true)
    expect(leaPage).not.toHaveProperty('example')
    // Les cartes de ses projets, sur sa page, portent la pastille aussi.
    const botCard = botPage.projects.find((project) => project.id === fake.id)
    const leaCard = leaPage.projects.find((project) => project.id === real.id)
    if (!botCard || !leaCard) throw new Error('a project is missing from its author page')
    expectExample(botCard.author, 'card on the example page')
    expectOrdinary(leaCard.author, 'card on an ordinary page')
  })

  it('flags an example project on « À la une », and not the other one', async () => {
    const { fake, real } = await bothPublishOnTheWeb()
    await world.setShowcase(louis, [fake, real])

    const showcase = ShowcasePage.parse(await memberJson('/v1/showcase', max))

    expect(showcase.items.map((item) => item.id)).toEqual([fake, real])
    const [fakeItem, realItem] = showcase.items
    if (!fakeItem || !realItem) throw new Error('the showcase is short')
    expectExample(fakeItem.author, '« À la une », example project')
    expectOrdinary(realItem.author, '« À la une », ordinary project')
  })
})

// --- La pastille « Exemple » : ce que lisent les visiteurs --------------------------------------

describe('the example flag, as visitors read it', () => {
  it('flags the author of a public example project, and not the author of another', async () => {
    const { fake, real } = await bothPublishOnTheWeb()

    const fakePage = PublicProject.parse(await world.visitorJson(`/v1/public/projects/${fake}`))
    const realPage = PublicProject.parse(await world.visitorJson(`/v1/public/projects/${real}`))

    expectExample(fakePage.author, 'public example project')
    expectOrdinary(realPage.author, 'public ordinary project')
  })

  it('flags an example project in the showcase of the home page, and not the other one', async () => {
    const { fake, real } = await bothPublishOnTheWeb()
    await world.setShowcase(louis, [real, fake])

    const showcase = ShowcasePage.parse(await world.visitorJson('/v1/public/showcase'))

    expect(showcase.items.map((item) => item.id)).toEqual([real, fake])
    const [realItem, fakeItem] = showcase.items
    if (!fakeItem || !realItem) throw new Error('the showcase is short')
    expectExample(fakeItem.author, 'home showcase, example project')
    expectOrdinary(realItem.author, 'home showcase, ordinary project')
  })

  it('flags the public page of an example account, and not the public page of another member', async () => {
    await bothPublishOnTheWeb()
    await ctx.openPublicPage(bot)
    await ctx.openPublicPage(lea)

    const path = (id: string) => `/v1/public/members/${encodeURIComponent(id)}`
    const botPage = PublicMember.parse(await world.visitorJson(path(botId)))
    const leaPage = PublicMember.parse(await world.visitorJson(path(leaId)))

    expect(botPage.example).toBe(true)
    expect(leaPage).not.toHaveProperty('example')
  })
})

// --- Ce qui ne propose pas un compte d'exemples -------------------------------------------------

describe('what does not offer an example account', () => {
  it('never suggests an example account as someone to follow, and still suggests the others', async () => {
    // Le compte d'exemples publie le dernier : c'est lui qu'une liste triée par date mettrait en tête.
    later()
    await act.publish(lea, 'Décollage !')
    later()
    await act.publish(bot, 'Le carnet de randonnée')

    const res = await act.send('GET', '/v1/suggestions/members', max)
    expect(res.status).toBe(200)
    const suggested = MemberSuggestions.parse(await res.json()).members

    // Témoin : Léa, qui a publié elle aussi, reste suggérée.
    expect(suggested.map((member) => member.id)).toContain(leaId)
    expect(suggested.map((member) => member.id)).not.toContain(botId)
  })

  it('shows the projects of a followed example account in the Following feed, flagged as examples', async () => {
    later()
    await act.followMember(botId, ines)
    later()
    await act.followMember(leaId, ines)
    const { fake, real } = await bothPublish()

    const page = FeedPage.parse(await memberJson('/v1/feed/following', ines))
    const authorOf = (id: string) =>
      page.items.find((item) => item.kind === 'project' && item.project.id === id)?.project.author

    // Suivre le compte d'exemples, c'est voir ses projets, comme pour tout membre suivi.
    const fakeAuthor = authorOf(fake.id)
    const realAuthor = authorOf(real.id)
    if (!fakeAuthor) throw new Error('the followed example project is missing from the feed')
    if (!realAuthor) throw new Error('the followed ordinary project is missing from the feed')
    expectExample(fakeAuthor, 'Following feed, example project')
    expectOrdinary(realAuthor, 'Following feed, ordinary project')
  })
})

// --- Les Découvertes du récap du dimanche --------------------------------------------------------

/** Lance le récap à l'heure de la fausse horloge (comme pg-boss le dimanche à 10 h). */
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

const recapSubjects = [fill(fr.recap.subject), fill(resources.en.translation.email.recap.subject)]
/** Les récaps reçus par une adresse (sans les e-mails de compte). */
const recapsTo = (address: string) =>
  ctx.mailer.sent.filter((email) => email.to === address && recapSubjects.includes(email.subject))

const projectUrl = (id: string) => `${TEST_APP_URL}/projects/${id}`

describe('the discoveries of the Sunday recap', () => {
  it('never offers the projects of a followed example account, and still offers the others', async () => {
    later()
    await act.followMember(leaId, ines)
    later()
    await act.followMember(botId, ines)
    // Léa d'abord, le compte d'exemples ensuite : « Ils cherchent des testeurs » ne montre qu'un
    // projet, le plus récent, qui serait le sien sans la règle ; « Nouveaux projets de tes proches »
    // en montre trois (RECAP_FRIEND_PROJECTS_MAX), et ses deux projets y prendraient la place de
    // « Décollage ! ».
    later()
    const real = await act.publish(lea, 'Décollage !')
    later()
    const realTestable = await act.publish(lea, 'Quel papillon ?', TESTABLE)
    later()
    const fake = await act.publish(bot, 'Le carnet de randonnée')
    later()
    const fakeTestable = await act.publish(bot, 'La boussole du dimanche', TESTABLE)
    anHourLater()

    await runRecap()

    const recaps = recapsTo('ines@example.com')
    expect(recaps).toHaveLength(1)
    const [recap] = recaps
    if (!recap) throw new Error('no recap to Inès')
    // Témoin : les deux parties « Découvertes » sont là, avec le dernier projet de Léa.
    for (const part of [fr.recap.friendsTitle, fr.recap.testersWanted, 'Quel papillon ?']) {
      expect(recap.text, part).toContain(part)
    }
    expect(recap.html).toContain(projectUrl(realTestable.id))
    for (const title of ['Le carnet de randonnée', 'La boussole du dimanche']) {
      expect(recap.text, title).not.toContain(title)
      expect(recap.html, title).not.toContain(title)
    }
    for (const project of [fake, fakeTestable]) {
      expect(recap.html).not.toContain(projectUrl(project.id))
    }
    // Les projets d'exemples sont écartés avant la limite de trois, pas après : le premier projet
    // de Léa garde sa place.
    expect(recap.text).toContain('Décollage !')
    expect(recap.html).toContain(projectUrl(real.id))
  })

  it('sends no recap when the projects of an example account are its only news', async () => {
    later()
    await act.followMember(botId, ines)
    // Témoin : Max suit Léa, qui publie la même semaine ; lui reçoit son récap.
    later()
    await act.followMember(leaId, max)
    await bothPublish()
    anHourLater()

    await runRecap()

    expect(recapsTo('max@example.com')).toHaveLength(1)
    expect(recapsTo('ines@example.com')).toEqual([])
  })
})
