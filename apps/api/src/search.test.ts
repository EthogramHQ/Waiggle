// Tests d'intégration de la recherche par mots (tranche R3) : GET /v1/search?q= rend, en trois
// groupes, les projets, les membres et les outils dont le texte contient chaque mot tapé, sans
// tenir compte des accents ni des majuscules, et sans jamais montrer ce que le membre ne verrait
// pas ailleurs (projet privé d'un autre, projet retiré, membre bloqué, compte non vérifié).
// Scénario : docs/scenarios/refonte.md, « R3 », « La recherche par mots » ; règles sec-A1 à A6,
// sec-B1 à B4 et jur-J2, J4, J6 des relectures du plan.
//
// Trois membres : Inès (autrice, pseudo ines_morel), Malik (qui cherche, pseudo malik) et Zoé
// (pseudo zoe). Louis, administrateur, sert aux retraits et aux suspensions. Le temps est maîtrisé
// par le test, comme dans mentions.test.ts : les quotas se vérifient sans attendre.
import { randomUUID } from 'node:crypto'
import { ErrorResponse, SEARCH_GROUP_MAX, SearchResults, toolSlug } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memberCounterKeys } from './rate-limit'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { explainQueries } from './testing/explain'

let ctx: TestContext
let act: ReturnType<typeof activity>
let ines: string // cookies de session
let malik: string
let zoe: string
let louis: string
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
const louisAccount = { name: 'Louis', email: 'louis@example.com', password: 'louis-long-password' }

beforeEach(async () => {
  // La fausse horloge est posée avant de créer l'API : la limite de débit garde la fonction
  // Date.now qu'elle trouve à ce moment-là (voir feed.test.ts).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-06-15T08:00:00.000Z'))

  ctx = await createTestContext()
  act = activity(ctx)
  ines = await ctx.verifiedMember(inesAccount)
  malik = await ctx.verifiedMember(malikAccount)
  zoe = await ctx.verifiedMember(zoeAccount)
  louis = await ctx.verifiedMember(louisAccount)
  inesId = (await act.me(ines)).id
  malikId = (await act.me(malik)).id
  zoeId = (await act.me(zoe)).id
  await act.makeAdmin((await act.me(louis)).id)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une seconde : deux gestes n'ont jamais la même date). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

/** La recherche, telle que l'appli l'envoie : `q` encodé dans l'adresse. */
const searchRaw = (cookie: string | null, params: Record<string, string> | string) =>
  act.send(
    'GET',
    `/v1/search?${typeof params === 'string' ? params : new URLSearchParams(params)}`,
    cookie,
  )

/** Les résultats d'une recherche qui doit réussir, vérifiés par le contrat. */
const search = async (cookie: string, q: string) => {
  const res = await searchRaw(cookie, { q })
  expect(res.status, `search « ${q} »`).toBe(200)
  return SearchResults.parse(await res.json())
}

/** Les titres des projets trouvés, les noms des membres, les étiquettes des outils. */
const titles = (results: SearchResults) => results.projects.items.map((p) => p.title)
const names = (results: SearchResults) => results.members.items.map((m) => m.name)
const slugs = (results: SearchResults) => results.tools.items.map((t) => t.slug)

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Publie un projet, une seconde après ce qui précède (les dates servent au tri). */
const publish = (cookie: string, title: string, body: object = {}) => {
  later()
  return act.publish(cookie, title, body)
}

/**
 * Des projets publics rangés directement dans la base (21 projets, ou 60 outils : plus rapide que
 * des publications, et la publication est limitée à 20 par jour). `at` : leur date, décalée
 * d'une seconde par projet pour que le tri soit sans ambiguïté.
 */
const insertProjects = async (
  authorId: string,
  projects: { title: string; tools?: string[]; visibility?: 'public' | 'private' }[],
) => {
  const start = Date.now()
  await ctx.db.insert(schema.project).values(
    projects.map((p, i) => {
      const at = new Date(start + i * SECOND)
      return {
        id: randomUUID(),
        authorId,
        title: p.title,
        pitch: 'Un petit projet pour essayer.',
        description: '',
        status: 'idea',
        visibility: p.visibility ?? 'public',
        tools: p.tools ?? [],
        toolSlugs: (p.tools ?? []).map(toolSlug),
        createdAt: at,
        updatedAt: at,
        publishedAt: p.visibility === 'private' ? null : at,
      }
    }),
  )
}

/**
 * Des membres vérifiés, rangés directement dans la base avec leur pseudo : plus rapide que des
 * inscriptions, et l'inscription est limitée à 10 par heure et par adresse IP.
 */
const insertMembers = async (members: { name: string; handle: string }[]) => {
  await ctx.db.insert(schema.user).values(
    members.map(({ name, handle }) => ({
      id: `id-${handle}`,
      name,
      email: `${handle}@example.com`,
      emailVerified: true,
    })),
  )
  await ctx.db
    .insert(schema.memberHandle)
    .values(
      members.map(({ handle }) => ({ handle, userId: `id-${handle}`, claimedAt: new Date() })),
    )
}

/** Louis retire un projet (POST /v1/moderation/decisions). */
// Un retrait de la modération répond à un signalement ouvert (reports/decide.ts) : Zoé signale
// d'abord, puis Louis retire. (Correction de la session, R3 : sans signalement, le retrait était
// refusé en 409, une raison étrangère à la règle testée.)
const remove = async (projectId: string) => {
  later()
  await act.report(zoe, { kind: 'project', id: projectId })
  later()
  return act.decide(louis, {
    action: 'remove',
    target: { kind: 'project', id: projectId },
    ground: 'rules',
    explanation: 'Ce projet ne respecte pas les règles.',
  })
}

/** Range directement un compteur d'un membre, comme s'il avait déjà fait `count` demandes. */
const alreadyUsed = (key: string, count: number) =>
  ctx.db.insert(schema.apiRateLimit).values({ key, count, windowStart: Date.now() })

// ─── Qui peut chercher ────────────────────────────────────────────────────────────────────────────

describe('who may search', () => {
  it('is only for signed-in members', async () => {
    await publish(ines, 'Carnet de cafés')

    await expectError(await searchRaw(null, { q: 'carnet' }), 401, 'unauthorized')
    // Témoin : la même demande, avec une session, réussit (la route existe bien).
    expect(titles(await search(malik, 'carnet'))).toEqual(['Carnet de cafés'])
  })

  it('lets a suspended member search, and still finds him', async () => {
    await publish(malik, 'Carnet de cafés')
    later()
    await act.decide(louis, {
      action: 'suspend',
      memberId: malikId,
      duration: '7d',
      ground: 'rules',
      explanation: 'Des messages insultants, plusieurs fois.',
    })

    expect(titles(await search(malik, 'carnet'))).toEqual(['Carnet de cafés'])
    expect(names(await search(zoe, 'malik'))).toEqual(['Malik'])
  })
})

// ─── Ce que l'appli peut demander ─────────────────────────────────────────────────────────────────

describe('the query', () => {
  it('refuses a malformed query: too short, too long, invisible characters, no word left', async () => {
    for (const q of ['a', ' a ', '', 'a'.repeat(81), 'car​net', 'e a', 'a b c']) {
      await expectError(await searchRaw(malik, { q }), 400, 'validation')
    }
    await expectError(await searchRaw(malik, ''), 400, 'validation')
  })

  it('refuses a repeated q parameter', async () => {
    await publish(ines, 'Carnet de cafés')

    await expectError(await searchRaw(malik, 'q=carnet&q=cafes'), 400, 'validation')
    // Témoin : une seule fois, la même recherche réussit.
    expect(titles(await search(malik, 'carnet'))).toEqual(['Carnet de cafés'])
  })

  it('counts even malformed requests', async () => {
    await alreadyUsed(memberCounterKeys(malikId).searchHour, 599)

    // La 600e, mal formée : refusée (400), mais comptée.
    await expectError(await searchRaw(malik, { q: 'a' }), 400, 'validation')

    await expectError(await searchRaw(malik, { q: 'carnet' }), 429, 'rate_limited')
  })
})

// ─── Les accents, les majuscules et les mots ──────────────────────────────────────────────────────

describe('the matching', () => {
  it('finds « Élève » and « ÉLÈVE » with « eleve », in the title, the pitch and the description', async () => {
    await publish(ines, 'Élève')
    await publish(ines, 'ÉLÈVE')
    await publish(ines, 'Sans accent', { pitch: 'Pour un élève curieux.' })
    await publish(ines, 'Description', { description: 'Un projet fait par une **ÉLÈVE**.' })
    await publish(ines, 'Témoin')

    expect(titles(await search(malik, 'eleve')).sort()).toEqual(
      ['Description', 'Sans accent', 'ÉLÈVE', 'Élève'].sort(),
    )
    // Dans l'autre sens aussi : un mot tapé avec ses accents trouve le texte sans accent.
    expect(titles(await search(malik, 'ÉLÈVE')).sort()).toEqual(
      ['Description', 'Sans accent', 'ÉLÈVE', 'Élève'].sort(),
    )
  })

  it("finds L’Élève with l'eleve", async () => {
    // L'apostrophe typographique du titre et l'apostrophe droite tapée : la même, repliée. Le
    // SQL reçoit la table en paramètres liés (sec-A1) : l'apostrophe de la table ne casse rien.
    await publish(ines, 'L’Élève')
    await publish(ines, 'Témoin')

    expect(titles(await search(malik, "l'eleve"))).toEqual(['L’Élève'])
    expect(titles(await search(malik, 'l’élève'))).toEqual(['L’Élève'])
  })

  it('finds « ŒUVRE » with « oeuvre », and a member named « Cœur » with « coeur »', async () => {
    await publish(ines, 'Mon ŒUVRE')
    await insertMembers([{ name: 'Cœur Vaillant', handle: 'coeur' }])

    expect(titles(await search(malik, 'oeuvre'))).toEqual(['Mon ŒUVRE'])
    expect(names(await search(malik, 'coeur'))).toEqual(['Cœur Vaillant'])
  })

  it('needs every word, wherever each one is', async () => {
    await publish(ines, 'Carnet de cafés')
    await publish(ines, 'Carnet du potager', { pitch: 'Semis, météo et récoltes.' })
    await publish(ines, 'Le potager', { description: 'Un carnet pour le jardin.' })

    expect(titles(await search(malik, 'carnet')).sort()).toEqual([
      'Carnet de cafés',
      'Carnet du potager',
      'Le potager',
    ])
    // « carnet » dans le titre et « semis » dans le pitch : les deux mots, pas forcément au même endroit.
    expect(titles(await search(malik, 'carnet semis'))).toEqual(['Carnet du potager'])
    expect(titles(await search(malik, 'potager carnet')).sort()).toEqual([
      'Carnet du potager',
      'Le potager',
    ])
    expect(titles(await search(malik, 'carnet cafés semis'))).toEqual([])
  })

  it('searches « % » and « _ » as they are, never as wildcards', async () => {
    await publish(ines, 'Promo 50%')
    await publish(ines, 'Promo 50 euros')
    await publish(ines, 'Outil a_c')
    await publish(ines, 'Outil abc')

    // Avec un LIKE, « 50% » trouverait aussi « 50 euros », et « a_c » trouverait « abc ».
    expect(titles(await search(malik, '50%'))).toEqual(['Promo 50%'])
    expect(titles(await search(malik, 'a_c'))).toEqual(['Outil a_c'])
  })

  it('ignores one-letter words, so "e a" finds no member', async () => {
    // Un mot d'une lettre trouverait presque tout ; seul, il ne reste rien à chercher : 400.
    await expectError(await searchRaw(malik, { q: 'e a' }), 400, 'validation')
    // Témoin : avec un vrai mot, la lettre seule est ignorée et ne retire rien.
    expect(names(await search(malik, 'a zoé'))).toEqual(['Zoé'])
  })

  it('never matches everything when the query has two spaces in a row', async () => {
    await publish(ines, 'Carnet de cafés')
    await publish(ines, 'Le potager')

    expect(titles(await search(malik, 'carnet  cafés'))).toEqual(['Carnet de cafés'])
    expect(titles(await search(malik, 'cafés  '))).toEqual(['Carnet de cafés'])
  })

  it('counts a repeated word once', async () => {
    await publish(ines, 'Carnet de cafés')

    expect(titles(await search(malik, 'carnet carnet CARNET Carnet'))).toEqual(['Carnet de cafés'])
  })

  it('keeps the first 5 words, and ignores the others', async () => {
    await publish(ines, 'Un deux trois quatre cinq')

    // Le sixième mot, « six », n'est nulle part : ignoré, le projet est trouvé quand même.
    expect(titles(await search(malik, 'un deux trois quatre cinq six'))).toEqual([
      'Un deux trois quatre cinq',
    ])
    // Témoin : cinq mots dont un absent ne trouvent rien.
    expect(titles(await search(malik, 'un deux trois quatre six'))).toEqual([])
  })

  it('folds each column once whatever the number of words', async () => {
    await publish(ines, 'Carnet de cafés')
    // Le SQL envoyé à la base, pour une recherche d'un mot puis de cinq : le repli (translate)
    // s'écrit une fois par colonne, après le filtre de visibilité, quel que soit le nombre de mots
    // (sec-B3). Sinon chaque mot replierait de nouveau chaque colonne de chaque ligne.
    const foldsFor = async (q: string) => {
      const queries = await explainQueries(ctx.db, async () => {
        expect((await searchRaw(malik, { q })).status).toBe(200)
      })
      return queries
        .map((query) => query.sql)
        .join('\n')
        .match(/translate\(/gi)?.length
    }

    const oneWord = await foldsFor('carnet')
    const fiveWords = await foldsFor('carnet cafés potager semis météo')

    expect(oneWord).toBeGreaterThan(0)
    expect(fiveWords).toBe(oneWord)
  })
})

// ─── Les projets ──────────────────────────────────────────────────────────────────────────────────

describe('the projects found', () => {
  it('gives the summary of each project, with its author, status and visibility', async () => {
    const carnet = await publish(ines, 'Carnet de cafés', {
      status: 'testable',
      tools: ['Claude Code'],
    })

    const [found] = (await search(malik, 'carnet')).projects.items

    expect(found).toMatchObject({
      id: carnet.id,
      title: 'Carnet de cafés',
      author: { id: inesId, name: 'Inès Morel' },
      status: 'testable',
      visibility: 'public',
      tools: [{ label: 'Claude Code', slug: 'claude-code' }],
      excerpt: null,
    })
  })

  it('never finds a private project of another member, and finds mine, marked private', async () => {
    await publish(ines, 'Carnet secret', { visibility: 'private' })
    await publish(malik, 'Carnet à moi', { visibility: 'private' })
    await publish(ines, 'Carnet de cafés')

    const results = await search(malik, 'carnet')

    // L'ordre n'est pas la règle de ce test (voir « ranks… » plus bas) : la date de création d'un
    // projet jamais publié vient de la base (horloge réelle), celle d'une publication de la fausse
    // horloge du test, et leur ordre variait d'une machine à l'autre (rouge en CI le 31/10 ;
    // correction de la session, R3). On vérifie donc l'ensemble, sans ordre.
    const found = results.projects.items.map((p) => [p.title, p.visibility])
    expect(found).toHaveLength(2)
    expect(found).toEqual(
      expect.arrayContaining([
        ['Carnet à moi', 'private'],
        ['Carnet de cafés', 'public'],
      ]),
    )
    // Son autrice, elle, trouve son projet privé.
    expect(titles(await search(ines, 'secret'))).toEqual(['Carnet secret'])
  })

  it('never finds a removed project, not even mine', async () => {
    const mine = await publish(malik, 'Carnet à moi')
    const hers = await publish(ines, 'Carnet de cafés')
    // Témoin : avant le retrait, les deux sont trouvés.
    expect(titles(await search(malik, 'carnet'))).toHaveLength(2)

    await remove(mine.id)
    await remove(hers.id)

    expect(titles(await search(malik, 'carnet'))).toEqual([])
    expect(titles(await search(ines, 'carnet'))).toEqual([])
  })

  it('never finds a project, a member or a tool of an account that was never verified', async () => {
    await ctx.signUp({
      name: 'Carnot Fantôme',
      email: 'fantome@example.com',
      password: 'a-long-password',
    })
    const [ghost] = await ctx.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eqEmail('fantome@example.com'))
    if (!ghost) throw new Error('no ghost account')
    await insertProjects(ghost.id, [{ title: 'Carnet fantôme', tools: ['Carnetix'] }])

    const results = await search(malik, 'carn')

    expect(titles(results)).toEqual([])
    expect(names(results)).toEqual([])
    expect(slugs(results)).toEqual([])
  })

  it('puts first the projects whose title has every word, then the newest first', async () => {
    await publish(ines, 'Vieux carnet')
    await publish(ines, 'Le potager', { pitch: 'Un carnet de semis.' })
    await publish(ines, 'Nouveau carnet')
    await publish(ines, 'La cave', { description: 'Mon carnet de cafés.' })

    expect(titles(await search(malik, 'carnet'))).toEqual([
      'Nouveau carnet',
      'Vieux carnet',
      'La cave',
      'Le potager',
    ])
  })

  it('says more only when a 21st visible project exists', async () => {
    await insertProjects(
      inesId,
      Array.from({ length: SEARCH_GROUP_MAX }, (_, i) => ({ title: `Carnet ${i + 1}` })),
    )
    // Le 21e est privé : invisible pour Malik, il ne compte pas.
    await insertProjects(inesId, [{ title: 'Carnet privé', visibility: 'private' }])

    const twenty = await search(malik, 'carnet')
    expect(twenty.projects.items).toHaveLength(SEARCH_GROUP_MAX)
    expect(twenty.projects.more).toBe(false)

    later()
    await insertProjects(inesId, [{ title: 'Carnet 21' }])
    const more = await search(malik, 'carnet')
    expect(more.projects.items).toHaveLength(SEARCH_GROUP_MAX)
    expect(more.projects.more).toBe(true)
    // Pour son autrice, le privé compte déjà : « plus » dès avant le 21e public.
    expect((await search(ines, 'carnet')).projects.more).toBe(true)
  })

  it('gives an excerpt of the description around the first word found, as plain text', async () => {
    const before =
      'Un long début de description qui parle de tout autre chose, de la pluie et du beau temps, '
    const after =
      ' et qui continue longtemps après le mot, pour que la fin soit coupée elle aussi, bien après.'
    await publish(ines, 'La cave', {
      description: `${before}un **carnet** de [cafés](https://cafes.example.com)${after}`,
    })

    const [found] = (await search(malik, 'carnet')).projects.items

    const excerpt = found?.excerpt ?? ''
    expect(excerpt).toContain('carnet')
    // Texte simple : ni les étoiles du gras, ni l'adresse du lien ; « … » aux deux coupures.
    expect(excerpt).not.toContain('**')
    expect(excerpt).not.toContain('https://')
    expect(excerpt).toContain('cafés')
    expect(excerpt.startsWith('…')).toBe(true)
    expect(excerpt.endsWith('…')).toBe(true)
    expect(excerpt.length).toBeLessThanOrEqual(160)
  })

  it('gives no excerpt when the word is in the title or the pitch', async () => {
    await publish(ines, 'Carnet de cafés', { description: 'Un carnet pour noter chaque café.' })
    await publish(ines, 'La cave', {
      pitch: 'Mon carnet de dégustation.',
      description: 'Un carnet pour noter chaque café.',
    })

    const results = await search(malik, 'carnet')

    expect(results.projects.items.map((p) => p.excerpt)).toEqual([null, null])
  })
})

/** « email = … » sur la table des comptes (une condition Drizzle, écrite ici pour un seul test). */
const eqEmail = (email: string) => eq(schema.user.email, email)

// ─── Les membres ──────────────────────────────────────────────────────────────────────────────────

describe('the members found', () => {
  it('gives the name, the handle, the picture and the follower count, never the email address', async () => {
    await act.followMember(inesId, malik)
    await act.followMember(inesId, zoe)

    const res = await searchRaw(malik, { q: 'ines' })

    expect(res.status).toBe(200)
    const raw = await res.text()
    expect(SearchResults.parse(JSON.parse(raw)).members).toEqual({
      items: [
        { id: inesId, name: 'Inès Morel', handle: 'ines_morel', avatarUrl: null, followerCount: 2 },
      ],
      more: false,
    })
    expect(raw).not.toContain('@example.com')
  })

  it('finds a member by the name or by the handle, and the searcher himself', async () => {
    expect(names(await search(malik, 'morel'))).toEqual(['Inès Morel'])
    expect(names(await search(malik, 'ines_m'))).toEqual(['Inès Morel'])
    expect(names(await search(malik, 'malik'))).toEqual(['Malik'])
  })

  it('finds only followed members with a two-letter query', async () => {
    await act.followMember(zoeId, malik)

    // « zo » : Zoé, que Malik suit ; pas Inès ni Zora, qu'il ne suit pas (« in », « zo »).
    await insertMembers([{ name: 'Zora', handle: 'zora' }])
    expect(names(await search(malik, 'zo'))).toEqual(['Zoé'])
    expect(names(await search(malik, 'in'))).toEqual([])
    // Les projets et les outils, eux, se trouvent dès 2 caractères.
    await publish(ines, 'Zoom arrière', { tools: ['Zotero'] })
    const results = await search(malik, 'zo')
    expect(titles(results)).toEqual(['Zoom arrière'])
    expect(slugs(results)).toEqual(['zotero'])
  })

  it('finds other members from three letters on', async () => {
    await insertMembers([{ name: 'Zora', handle: 'zora' }])

    expect(names(await search(malik, 'zor'))).toEqual(['Zora'])
    expect(names(await search(malik, 'zoé'))).toEqual(['Zoé'])
  })

  it('ranks members by name, not by follower count', async () => {
    await insertMembers([
      { name: 'Zoé Martin', handle: 'zoe_martin' },
      { name: 'Zoé Abel', handle: 'zoe_abel' },
      { name: 'Amie de Zoé', handle: 'amie' },
    ])
    // Zoé Martin a deux abonnés, les autres aucun : par abonnés, elle serait première.
    await ctx.db.insert(schema.memberFollow).values([
      { followerId: inesId, memberId: 'id-zoe_martin' },
      { followerId: malikId, memberId: 'id-zoe_martin' },
    ])

    const results = await search(malik, 'zoé')

    // Le nom qui commence par le mot d'abord, puis par nom ; « Amie de Zoé » ferme la marche.
    expect(results.members.items.map((m) => [m.name, m.followerCount])).toEqual([
      ['Zoé', 0],
      ['Zoé Abel', 0],
      ['Zoé Martin', 2],
      ['Amie de Zoé', 0],
    ])
  })

  it('a released handle does not find its former owner', async () => {
    // Témoin : avant le changement, « ines_morel » trouve Inès.
    expect(names(await search(malik, 'ines_morel'))).toEqual(['Inès Morel'])

    later()
    await act.updateProfile(ines, { handle: 'inesm' })

    expect(names(await search(malik, 'ines_morel'))).toEqual([])
    expect(names(await search(malik, 'inesm'))).toEqual(['Inès Morel'])
  })

  it('never finds a deleted account, by its name or its former handle', async () => {
    later()
    await act.updateProfile(zoe, { handle: 'zoe_ancien' })
    const zoeAgain = await act.signInAgain(zoeAccount)
    later()
    await act.updateProfile(zoeAgain, { handle: 'zoe_nouveau' })
    await publish(zoeAgain, 'Carnet de Zoé')

    await act.deleteAccount(zoeAgain, zoeAccount.password)

    for (const q of ['zoé', 'zoe_ancien', 'zoe_nouveau']) {
      expect(names(await search(malik, q)), q).toEqual([])
    }
    expect(titles(await search(malik, 'carnet'))).toEqual([])
  })

  it('says more only when a 21st member exists', async () => {
    await insertMembers(
      Array.from({ length: SEARCH_GROUP_MAX }, (_, i) => ({
        name: `Camille ${String(i + 1).padStart(2, '0')}`,
        handle: `camille_${i + 1}`,
      })),
    )

    const twenty = await search(malik, 'camille')
    expect(twenty.members.items).toHaveLength(SEARCH_GROUP_MAX)
    expect(twenty.members.more).toBe(false)

    await insertMembers([{ name: 'Camille 21', handle: 'camille_21' }])
    const more = await search(malik, 'camille')
    expect(more.members.items).toHaveLength(SEARCH_GROUP_MAX)
    expect(more.members.more).toBe(true)
  })
})

// ─── Les outils ───────────────────────────────────────────────────────────────────────────────────

describe('the tools found', () => {
  it('gives each tool once, with its number of public projects and its latest label', async () => {
    await publish(ines, 'Un', { tools: ['claude code'] })
    await publish(zoe, 'Deux', { tools: ['Claude Code', 'Cursor'] })
    await publish(ines, 'Trois', { tools: ['Claude Code'] })
    await publish(ines, 'Brouillon', { tools: ['Claude Code'], visibility: 'private' })

    const results = await search(malik, 'claude')

    expect(results.tools).toEqual({
      items: [{ slug: 'claude-code', label: 'Claude Code', projectCount: 3 }],
      more: false,
    })
    // Le libellé est celui du projet public le plus récent qui le cite.
    await publish(zoe, 'Quatre', { tools: ['CLAUDE CODE'] })
    expect((await search(malik, 'claude')).tools.items[0]?.label).toBe('CLAUDE CODE')
  })

  it('does not find a tool by a label typed only on a private project', async () => {
    const draft = await publish(ines, 'Brouillon', { tools: ['Zapier'], visibility: 'private' })

    expect(slugs(await search(malik, 'zapier'))).toEqual([])
    // Même pour son autrice : les outils sont ceux des projets publics.
    expect(slugs(await search(ines, 'zapier'))).toEqual([])

    // Témoin : public, le projet fait apparaître l'outil.
    later()
    await act.setVisibility(draft.id, ines, 'public')
    expect((await search(malik, 'zapier')).tools.items).toEqual([
      { slug: 'zapier', label: 'Zapier', projectCount: 1 },
    ])
  })

  it('finds a tool by its slug as well as by its label, every word needed', async () => {
    await publish(ines, 'Un', { tools: ['Home Assistant', 'Claude Code'] })

    expect(slugs(await search(malik, 'home-assist'))).toEqual(['home-assistant'])
    expect(slugs(await search(malik, 'home assistant'))).toEqual(['home-assistant'])
    expect(slugs(await search(malik, 'home claude'))).toEqual([])
  })

  it('says more only when a 21st tool exists', async () => {
    await insertProjects(inesId, [
      { title: 'Un', tools: Array.from({ length: 15 }, (_, i) => `Outil ${i + 1}`) },
      { title: 'Deux', tools: Array.from({ length: 5 }, (_, i) => `Outil ${i + 16}`) },
    ])

    const twenty = await search(malik, 'outil')
    expect(twenty.tools.items).toHaveLength(SEARCH_GROUP_MAX)
    expect(twenty.tools.more).toBe(false)

    await insertProjects(inesId, [{ title: 'Trois', tools: ['Outil 21'] }])
    const more = await search(malik, 'outil')
    expect(more.tools.items).toHaveLength(SEARCH_GROUP_MAX)
    expect(more.tools.more).toBe(true)
  })
})

// ─── Le blocage ───────────────────────────────────────────────────────────────────────────────────

describe('a block', () => {
  /** Les deux sens du blocage, avec qui bloque qui. */
  const DIRECTIONS = [
    ['Inès blocked Malik', () => act.block(malikId, ines)],
    ['Malik blocked Inès', () => act.block(inesId, malik)],
  ] as const

  describe.each(DIRECTIONS)('when %s', (_, blockNow) => {
    it('hides a blocked member, its projects and their tools, in both directions', async () => {
      await publish(ines, 'Carnet de cafés', { tools: ['Mistral'] })
      await publish(malik, 'Carnet de Malik', { tools: ['Ollama'] })
      await publish(zoe, 'Carnet de Zoé', { tools: ['Claude'] })
      // Témoin : avant le blocage, chacun trouve l'autre.
      expect(names(await search(malik, 'ines'))).toEqual(['Inès Morel'])
      expect(names(await search(ines, 'malik'))).toEqual(['Malik'])

      later()
      await blockNow()

      // Pour Malik : ni Inès, ni son projet, ni son outil ; Zoé et les siens restent.
      const forMalik = await search(malik, 'carnet')
      expect(titles(forMalik).sort()).toEqual(['Carnet de Malik', 'Carnet de Zoé'])
      expect(names(await search(malik, 'ines'))).toEqual([])
      expect(slugs(await search(malik, 'mistral'))).toEqual([])
      expect(slugs(await search(malik, 'claude'))).toEqual(['claude'])
      // Pour Inès, pareil dans l'autre sens.
      const forInes = await search(ines, 'carnet')
      expect(titles(forInes).sort()).toEqual(['Carnet de Zoé', 'Carnet de cafés'])
      expect(names(await search(ines, 'malik'))).toEqual([])
      expect(slugs(await search(ines, 'ollama'))).toEqual([])
      // Zoé, elle, ne voit aucune différence.
      expect(titles(await search(zoe, 'carnet'))).toHaveLength(3)
      expect(slugs(await search(zoe, 'mistral'))).toEqual(['mistral'])
    })

    it('takes the projects of the other one out of the tool counts', async () => {
      await publish(ines, 'Un', { tools: ['Claude Code'] })
      await publish(zoe, 'Deux', { tools: ['Claude Code'] })
      later()
      await blockNow()

      expect((await search(malik, 'claude')).tools.items).toEqual([
        { slug: 'claude-code', label: 'Claude Code', projectCount: 1 },
      ])
    })
  })
})

// ─── Les garde-fous ───────────────────────────────────────────────────────────────────────────────

describe('the safeguards', () => {
  it('answers 600 searches an hour per member, then asks to wait', async () => {
    await publish(ines, 'Carnet de cafés')
    await alreadyUsed(memberCounterKeys(malikId).searchHour, 599)

    expect(titles(await search(malik, 'carnet'))).toEqual(['Carnet de cafés'])
    const blocked = await searchRaw(malik, { q: 'carnet' })
    await expectError(blocked, 429, 'rate_limited')
    // L'appli lit Retry-After pour dire « réessaie dans un instant ».
    const retryAfter = Number(blocked.headers.get('retry-after'))
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(HOUR / SECOND)
    // Chaque membre a son compteur : Zoé cherche encore.
    expect(titles(await search(zoe, 'carnet'))).toEqual(['Carnet de cafés'])
    // Une heure plus tard, Malik aussi.
    later(HOUR)
    expect(titles(await search(malik, 'carnet'))).toEqual(['Carnet de cafés'])
  })

  it('answers 2 000 searches a day per member, then asks to wait until the next day', async () => {
    await publish(ines, 'Carnet de cafés')
    await alreadyUsed(memberCounterKeys(malikId).searchDay, 1999)

    expect(titles(await search(malik, 'carnet'))).toEqual(['Carnet de cafés'])
    await expectError(await searchRaw(malik, { q: 'carnet' }), 429, 'rate_limited')
    // L'heure suivante n'y change rien ; le lendemain, si.
    later(HOUR)
    await expectError(await searchRaw(malik, { q: 'carnet' }), 429, 'rate_limited')
    later(DAY)
    expect(titles(await search(malik, 'carnet'))).toEqual(['Carnet de cafés'])
  })

  it('searching stores the word nowhere', async () => {
    const logs = (['log', 'info', 'warn', 'error'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    )
    await publish(ines, 'Carnet de cafés')

    expect(titles(await search(malik, 'zanzibar carnet'))).toEqual([])
    expect(titles(await search(malik, 'carnet'))).toEqual(['Carnet de cafés'])

    // Ni dans les compteurs (la seule table que la recherche écrit : la clé porte le membre,
    // jamais le mot), ni dans les journaux du serveur.
    const keys = (await ctx.db.select().from(schema.apiRateLimit)).map((row) => row.key)
    expect(keys.some((key) => key.includes(malikId))).toBe(true) // témoin : le quota compte
    expect(keys.filter((key) => key.includes('zanzibar'))).toEqual([])
    const logged = logs.flatMap((spy) => spy.mock.calls.flat()).map((arg) => JSON.stringify(arg))
    expect(logged.filter((line) => line.includes('zanzibar'))).toEqual([])
  })

  it('forgets the search counters of a deleted account', async () => {
    await publish(ines, 'Carnet de cafés')
    expect(titles(await search(malik, 'carnet'))).toEqual(['Carnet de cafés'])
    // Témoin : la recherche a laissé un compteur au nom de Malik.
    const before = (await ctx.db.select().from(schema.apiRateLimit)).map((row) => row.key)
    expect(before.some((key) => key.includes(malikId))).toBe(true)

    await act.deleteAccount(malik, malikAccount.password)

    const keys = (await ctx.db.select().from(schema.apiRateLimit)).map((row) => row.key)
    expect(keys.filter((key) => key.includes(malikId))).toEqual([])
  })

  it('logs an unexpected error without the searched text', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    // La base tombe en panne au moment de la recherche : l'erreur brute cite le texte cherché,
    // comme le ferait PostgreSQL en citant un paramètre.
    vi.spyOn(ctx.db, 'transaction').mockImplementationOnce(async () => {
      throw new Error('connection lost while searching « zanzibar »')
    })

    await expectError(await searchRaw(malik, { q: 'zanzibar' }), 500, 'internal')

    expect(logged).toHaveBeenCalled()
    const lines = logged.mock.calls.flat().map((arg) => JSON.stringify(arg))
    expect(lines.filter((line) => line.includes('zanzibar'))).toEqual([])
    // Le chemin journalisé est celui de la route, sans la requête.
    expect(lines.some((line) => line.includes('/v1/search'))).toBe(true)
    expect(lines.filter((line) => line.includes('q='))).toEqual([])
  })

  it('stops a search past its time limit without logging q', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    // PGlite ne sait pas simuler une requête de deux secondes : on fait lever à la transaction
    // l'erreur que PostgreSQL lève quand `statement_timeout` tombe (code 57014), qui cite le texte.
    vi.spyOn(ctx.db, 'transaction').mockImplementationOnce(async () => {
      throw Object.assign(
        new Error('canceling statement due to statement timeout (« zanzibar »)'),
        { code: '57014' },
      )
    })

    const res = await searchRaw(malik, { q: 'zanzibar' })

    expect(res.status).toBe(503)
    const lines = logged.mock.calls.flat().map((arg) => JSON.stringify(arg))
    expect(lines.filter((line) => line.includes('zanzibar'))).toEqual([])
  })
})
