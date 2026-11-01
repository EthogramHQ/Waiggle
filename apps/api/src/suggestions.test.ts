// Tests d'intégration de « Proches à suivre » (tranche R4) : GET /v1/suggestions/members (jusqu'à
// cinq membres qui ont publié récemment, chacun avec son dernier projet public) et
// PUT /v1/suggestions/members/{id}/dismissed (« × », « Ne plus suggérer Léa »).
// Scénario : docs/scenarios/refonte.md, « R4 », section « Le premier lancement et « Proches à
// suivre » », paragraphe « Qui est suggéré ».
//
// Règles venues des relectures du plan (31/10/2026) :
// - sec-B1 : écarter répond le même 404 que « Suivre » à un membre inconnu, non vérifié ou bloqué
//   dans un sens ou l'autre : la réponse ne dit jamais qu'un blocage existe ;
// - sec-B2 : un membre suspendu reste suggéré, comme ses projets restent dans Explorer ;
// - sec-A1 : la liste se calcule depuis les 200 derniers projets listés seulement, en un nombre
//   fixe de requêtes ;
// - sec-A3 : quotas (600 lectures par heure ; 120 écartements par heure et 500 par jour), qui
//   comptent aussi les demandes mal formées ;
// - sec-A6 et jur-J4 : l'export de celui qui écarte nomme l'écarté par son pseudo ; l'écarté n'en
//   sait rien, ni dans son export ni par une notification ; tout part avec l'un des deux comptes ;
// - jur-J5 : l'ordre ne dépend que de la date du dernier projet, jamais de la popularité.
//
// Trois membres de départ : Max (qui lit les suggestions), Léa et Zoé (qui publient). D'autres
// auteurs naissent au besoin (`author`), chacun depuis sa propre adresse IP (quota d'inscription).
//
// Le temps est maîtrisé par le test (voir feed.test.ts) : une fausse horloge, posée avant de créer
// l'API, part d'une date fixe de juin 2026 ; `later()` l'avance entre deux publications, pour que
// leurs dates diffèrent et que l'ordre soit certain.
import {
  AccountExport,
  ErrorResponse,
  MemberSuggestions,
  type ModerationDecisionInput,
  type ProjectSummary,
  UnreadCount,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { type SQL, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memberCounterKeys } from './rate-limit'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { explainQueries } from './testing/explain'

let ctx: TestContext
let act: ReturnType<typeof activity>
let max: string // cookies de session
let lea: string
let zoe: string
let maxId: string
let leaId: string
let zoeId: string

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const START = new Date('2026-06-15T08:00:00.000Z')
/** Un identifiant bien formé (32 lettres et chiffres, comme ceux de Better Auth) que nul ne porte. */
const UNKNOWN_MEMBER = 'unknownMember0000000000000000000'
const SUGGESTIONS = '/v1/suggestions/members'

const maxAccount = { name: 'Max', email: 'max@example.com', password: 'another-long-password' }
const leaAccount = { name: 'Léa', email: 'lea@example.com', password: 'correct-horse-battery' }
const zoeAccount = { name: 'Zoé', email: 'zoe@example.com', password: 'zoe-long-password' }

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)

  ctx = await createTestContext()
  act = activity(ctx)
  max = await ctx.verifiedMember(maxAccount)
  lea = await ctx.verifiedMember(leaAccount)
  zoe = await ctx.verifiedMember(zoeAccount)
  maxId = (await act.me(max)).id
  leaId = (await act.me(lea)).id
  zoeId = (await act.me(zoe)).id
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une minute : assez pour que les dates diffèrent). */
const later = (ms = MINUTE) => vi.setSystemTime(Date.now() + ms)

/** Une requête de l'appli avec la session de `cookie` (`act` naît dans beforeEach : lu à l'appel). */
const send = (method: string, path: string, cookie: string | null, body?: unknown) =>
  act.send(method, path, cookie, body)

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Une réponse 204 : réussie, et sans corps. */
const expectDone = async (res: Response) => {
  expect(res.status).toBe(204)
  expect(await res.text()).toBe('')
}

/** Deux 404 identiques, mot pour mot : rien ne distingue un cas de l'autre. */
const expectSameNotFound = async (res: Response, reference: Response) => {
  expect(res.status).toBe(404)
  expect(reference.status).toBe(404)
  expect(await res.json()).toEqual(await reference.json())
}

/** Publie un projet public, une minute après ce qui précède. */
const publish = async (cookie: string, title: string, body: object = {}) => {
  later()
  return act.publish(cookie, title, body)
}

/** La liste des suggestions de ce membre (réponse brute). */
const suggestionsRaw = (cookie: string | null) => send('GET', SUGGESTIONS, cookie)

/** La liste des suggestions de ce membre, lue par le contrat. */
const suggestions = async (cookie: string) => {
  const res = await suggestionsRaw(cookie)
  expect(res.status).toBe(200)
  return MemberSuggestions.parse(await res.json()).members
}

/** Les noms suggérés, dans l'ordre de la liste. */
const names = async (cookie: string) => (await suggestions(cookie)).map((member) => member.name)

/** « × » : ne plus suggérer ce membre. */
const dismiss = (id: string, cookie: string | null) =>
  send('PUT', `${SUGGESTIONS}/${encodeURIComponent(id)}/dismissed`, cookie)

/** « Suivre », pour comparer ses 404 à ceux de « × ». */
const follow = (id: string, cookie: string) =>
  send('POST', `/v1/members/${encodeURIComponent(id)}/follow`, cookie)

const exportOf = async (cookie: string) => {
  const res = await send('GET', '/v1/me/export', cookie)
  expect(res.status).toBe(200)
  return AccountExport.parse(await res.json())
}

/** Range directement un compteur d'un membre, comme s'il avait déjà fait `count` demandes. */
const alreadyUsed = (key: string, count: number) =>
  ctx.db.insert(schema.apiRateLimit).values({ key, count, windowStart: Date.now() })

/** Les lignes d'une requête SQL brute (la table des écartements n'a pas encore de nom dans le schéma). */
const rows = async <T>(query: SQL) =>
  ((await ctx.db.execute(query)) as unknown as { rows: T[] }).rows

/** Les écartements en base, « qui a écarté qui », triés. */
const storedDismissals = async () =>
  (
    await rows<{ member_id: string; dismissed_id: string }>(
      sql`select member_id, dismissed_id from member_suggestion_dismissal`,
    )
  )
    .map((row) => `${row.member_id}>${row.dismissed_id}`)
    .sort()

/** L'identifiant d'un compte d'après son adresse (pour un compte qui ne peut pas se connecter). */
const idOf = async (email: string) => {
  const [found] = await ctx.db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(sql`${schema.user.email} = ${email}`)
  if (!found) throw new Error(`no account for ${email}`)
  return found.id
}

let ip = 10
/**
 * Un auteur de plus, vérifié, avec son cookie et son identifiant. Chacun s'inscrit depuis sa
 * propre adresse IP : au-delà de six inscriptions, le quota par IP refuserait (charte de l'API).
 */
const author = async (name: string) => {
  ip += 1
  // L'adresse sans accent (« Inès » → ines@example.com) : une adresse accentuée serait refusée.
  const email = `${name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()}@example.com`
  const res = await ctx.signUp(
    { name, email, password: `${name.toLowerCase()}-long-password` },
    { 'x-real-ip': `198.51.100.${ip}` },
  )
  expect(res.status).toBe(200)
  const link = ctx.mailer.sent.findLast((sent) => sent.to === email)?.text.match(/https?:\/\/\S+/)
  if (!link) throw new Error(`no verification link for ${email}`)
  const url = new URL(link[0])
  const cookie = ctx.cookiesFrom(await ctx.request(url.pathname + url.search))
  return { cookie, id: (await act.me(cookie)).id }
}

/**
 * Range des projets publics directement en base, datés de `at` et des secondes qui suivent : la
 * publication par l'API est limitée à 20 par jour, et certains tests en demandent 200.
 */
const insertProjects = async (authorId: string, count: number, at: Date, title = 'Projet') => {
  const ids = Array.from({ length: count }, () => crypto.randomUUID())
  await ctx.db.insert(schema.project).values(
    ids.map((id, i) => {
      const when = new Date(at.getTime() + i * SECOND)
      return {
        id,
        authorId,
        title: `${title} ${i}`,
        pitch: 'Un petit projet.',
        description: '',
        status: 'idea' as const,
        visibility: 'public' as const,
        tools: [],
        toolSlugs: [],
        createdAt: when,
        updatedAt: when,
        publishedAt: when,
      }
    }),
  )
  return ids
}

/** Zoé devient administratrice (comme le ferait infra/grant-admin.sh) : elle retire, suspend. */
const zoeModerates = () => act.makeAdmin(zoeId)

/** Zoé retire un projet, après le signalement d'un autre membre que l'auteur (`reporter`). */
const removeProject = async (projectId: string, reporter: string) => {
  later()
  await act.report(reporter, { kind: 'project', id: projectId })
  later()
  await act.decide(zoe, {
    action: 'remove',
    target: { kind: 'project', id: projectId },
    ground: 'rules',
    explanation: 'Ce projet ne respecte pas les règles.',
  })
}

// ─── Qui peut lire et écarter ─────────────────────────────────────────────────────────────────────

describe('who may read and dismiss suggestions', () => {
  it('asks to sign in, to read as to dismiss', async () => {
    await publish(lea, 'Carnet de cafés')
    await expectError(await suggestionsRaw(null), 401, 'unauthorized')
    await expectError(await dismiss(leaId, null), 401, 'unauthorized')
    // Témoin : les mêmes demandes, avec la session de Max, réussissent (les routes existent).
    expect(await names(max)).toEqual(['Léa'])
    await expectDone(await dismiss(leaId, max))
  })

  it('answers the same 404 for an unknown member, an unverified one, and one blocked either way, as follow does', async () => {
    // Tom s'inscrit sans ouvrir son lien : son compte existe, jamais vérifié.
    await ctx.signUp(
      { name: 'Tom', email: 'tom@example.com', password: 'tom-long-password' },
      { 'x-real-ip': '198.51.100.200' },
    )
    const tomId = await idOf('tom@example.com')
    const nina = await author('Nina')
    await act.block(maxId, lea) // Léa a bloqué Max
    await act.block(nina.id, max) // Max a bloqué Nina

    for (const id of [UNKNOWN_MEMBER, tomId, leaId, nina.id]) {
      // Le même 404 que « Suivre » pour ce membre, et le même que pour un inconnu.
      await expectSameNotFound(await dismiss(id, max), await follow(id, max))
      await expectSameNotFound(await dismiss(id, max), await dismiss(UNKNOWN_MEMBER, max))
    }
    // Un identifiant mal formé : le même 404 encore.
    await expectSameNotFound(
      await dismiss('pas un identifiant !', max),
      await follow(UNKNOWN_MEMBER, max),
    )
    // Soi-même : le même refus 400 que « Suivre » sur soi (sec-A2), et rien n'est écrit.
    const ownDismissal = await dismiss(maxId, max)
    await expectError(ownDismissal, 400, 'cannot_follow_own')
    expect(await (await follow(maxId, max)).json()).toEqual(
      await (await dismiss(maxId, max)).json(),
    )
    // Rien n'est écrit pour eux.
    expect(await storedDismissals()).toEqual([])
    // Témoin : Zoé, vérifiée et sans blocage, s'écarte.
    await expectDone(await dismiss(zoeId, max))
    expect(await storedDismissals()).toEqual([`${maxId}>${zoeId}`])
  })

  it('dismisses once: a second « × » answers 204 and keeps a single choice', async () => {
    await publish(lea, 'Carnet de cafés')

    await expectDone(await dismiss(leaId, max))
    later()
    await expectDone(await dismiss(leaId, max))

    expect(await storedDismissals()).toEqual([`${maxId}>${leaId}`])
    expect((await exportOf(max)).dismissedSuggestions).toHaveLength(1)
  })
})

// ─── Qui est suggéré ──────────────────────────────────────────────────────────────────────────────

describe('who is suggested', () => {
  it('suggests the authors of a public project, never oneself', async () => {
    await publish(lea, 'Carnet de cafés')
    await publish(zoe, 'Météo du jardin')
    await publish(max, 'Le projet de Max')

    expect(await names(max)).toEqual(['Zoé', 'Léa'])
    expect(await names(lea)).toEqual(['Max', 'Zoé'])
  })

  it('suggests nobody who has no public project', async () => {
    // Personne n'a publié : la liste est vide (pas d'erreur).
    expect(await suggestions(max)).toEqual([])
  })

  it('leaves out a member already followed', async () => {
    await publish(lea, 'Carnet de cafés')
    await publish(zoe, 'Météo du jardin')

    await act.followMember(leaId, max)

    expect(await names(max)).toEqual(['Zoé'])
    // Témoin : Zoé, qui ne suit pas Léa, la voit toujours.
    expect(await names(zoe)).toEqual(['Léa'])
  })

  it('leaves out a dismissed member, on every device, and for nobody else', async () => {
    await publish(lea, 'Carnet de cafés')
    await publish(zoe, 'Météo du jardin')

    await expectDone(await dismiss(leaId, max))

    expect(await names(max)).toEqual(['Zoé'])
    // Un autre appareil de Max (une autre session) : Léa n'y est pas non plus.
    const otherDevice = await act.signInAgain(maxAccount)
    expect(await names(otherDevice)).toEqual(['Zoé'])
    // Zoé, elle, voit toujours Léa : l'écart n'est qu'à Max.
    expect(await names(zoe)).toEqual(['Léa'])
  })

  it('hides a member blocked either way from the suggestions, and his latest project with him', async () => {
    const leaProject = await publish(lea, 'Carnet de cafés')
    const maxProject = await publish(max, 'Le projet de Max')
    const nina = await author('Nina')
    const ninaProject = await publish(nina.cookie, 'Herbier')
    // Témoin avant le blocage : chacun voit l'autre.
    expect(await names(max)).toEqual(['Nina', 'Léa'])

    await act.block(maxId, lea) // Léa bloque Max
    await act.block(nina.id, max) // Max bloque Nina

    // Ni Léa (qui l'a bloqué) ni Nina (qu'il a bloquée), ni leur dernier projet, nulle part.
    const res = await suggestionsRaw(max)
    expect(res.status).toBe(200)
    const text = await res.text()
    for (const hidden of [leaId, leaProject.id, nina.id, ninaProject.id]) {
      expect(text).not.toContain(hidden)
    }
    // Et dans l'autre sens : Max n'est suggéré ni à Léa ni à Nina.
    expect(await names(lea)).toEqual(['Nina'])
    expect(await names(nina.cookie)).toEqual(['Léa'])
    // Témoin : Zoé voit les trois, Max compris, avec son projet.
    expect(await names(zoe)).toEqual(['Nina', 'Max', 'Léa'])
    expect((await suggestions(zoe)).find((m) => m.id === maxId)?.latestProject.id).toBe(
      maxProject.id,
    )
  })

  it('keeps suggesting a suspended author, as discover keeps his projects', async () => {
    await publish(lea, 'Carnet de cafés')
    await zoeModerates()
    later()
    const before = await (await suggestionsRaw(max)).text()
    const discoverBefore = await (await send('GET', '/v1/feed/discover', max)).text()

    later()
    const suspension: ModerationDecisionInput = {
      action: 'suspend',
      memberId: leaId,
      duration: '7d',
      ground: 'rules',
      explanation: 'Messages insultants répétés sous les projets des autres.',
    }
    await act.decide(zoe, suspension)
    // Témoin : la suspension refuse bien à Léa de publier.
    later()
    expect((await send('POST', '/v1/projects', lea, { title: 'Non', pitch: 'Non.' })).status).toBe(
      403,
    )

    // Max lit exactement la même liste, et le même Explorer : rien ne trahit la suspension.
    expect(await (await suggestionsRaw(max)).text()).toBe(before)
    expect(await (await send('GET', '/v1/feed/discover', max)).text()).toBe(discoverBefore)
    expect(await names(max)).toEqual(['Léa'])
  })

  it('leaves out an author who never verified his address', async () => {
    await publish(lea, 'Carnet de cafés')
    await ctx.signUp(
      { name: 'Tom', email: 'tom@example.com', password: 'tom-long-password' },
      { 'x-real-ip': '198.51.100.200' },
    )
    // Son projet est rangé en base, plus récent que celui de Léa (un compte non vérifié ne peut
    // pas se connecter pour publier : c'est l'état d'une donnée ancienne).
    later()
    const [tomProject] = await insertProjects(await idOf('tom@example.com'), 1, new Date())

    const res = await suggestionsRaw(max)
    expect(res.status).toBe(200)
    expect(await res.clone().text()).not.toContain(tomProject)
    expect(await names(max)).toEqual(['Léa'])
  })
})

// ─── Le dernier projet montré ─────────────────────────────────────────────────────────────────────

describe('the latest project shown', () => {
  it('shows the latest public project, with the summary and total that discover gives', async () => {
    await publish(lea, 'Ancien carnet')
    const latest = await publish(lea, 'Carnet de cafés', { status: 'testable' })
    await act.react(latest.id, 'bravo', zoe)
    await act.react(latest.id, 'useful', max)

    const [suggested] = await suggestions(max)

    expect(suggested).toMatchObject({ id: leaId, name: 'Léa', avatarUrl: null })
    // Le résumé est celui de la carte d'Explorer pour le même lecteur, total compris (2).
    const discover = (await (await send('GET', '/v1/feed/discover', max)).json()) as {
      items: { project: ProjectSummary }[]
    }
    const card = discover.items.find((item) => item.project.id === latest.id)?.project
    expect(card).toBeDefined()
    expect(suggested?.latestProject).toEqual(card)
    expect(suggested?.latestProject.reactionTotal).toBe(2)
    expect(suggested?.latestProject.visibility).toBe('public')
  })

  it('never shows a draft, and never orders by it', async () => {
    const shown = await publish(lea, 'Carnet de cafés')
    await publish(zoe, 'Météo du jardin')
    // Un brouillon de Léa, plus récent que tout : jamais montré, et il ne remonte pas Léa.
    const draft = await publish(lea, 'Brouillon secret', { visibility: 'private' })

    const list = await suggestions(max)

    expect(list.map((m) => m.name)).toEqual(['Zoé', 'Léa'])
    expect(list.find((m) => m.id === leaId)?.latestProject.id).toBe(shown.id)
    expect(JSON.stringify(list)).not.toContain(draft.id)
  })

  it('never shows a project turned private, and orders by the previous public one', async () => {
    const shown = await publish(lea, 'Carnet de cafés')
    await publish(zoe, 'Météo du jardin')
    const hidden = await publish(lea, 'Devenu privé')
    // Témoin : public, il remonte Léa en tête.
    expect(await names(max)).toEqual(['Léa', 'Zoé'])

    later()
    await act.setVisibility(hidden.id, lea, 'private')

    const list = await suggestions(max)
    expect(list.map((m) => m.name)).toEqual(['Zoé', 'Léa'])
    expect(list.find((m) => m.id === leaId)?.latestProject.id).toBe(shown.id)
    expect(JSON.stringify(list)).not.toContain(hidden.id)
  })

  it('never shows a removed project, and leaves out an author who has nothing else listed', async () => {
    const shown = await publish(lea, 'Carnet de cafés')
    const removedToo = await publish(lea, 'Retiré aussi')
    const onlyOne = await publish(max, 'Le seul projet de Max')
    await zoeModerates()

    await removeProject(removedToo.id, max)
    await removeProject(onlyOne.id, lea)

    // Léa reste, avec son projet encore listé ; Max, dont le seul projet est retiré, n'est plus
    // suggéré (à Zoé, qui lit ici).
    const list = await suggestions(zoe)
    expect(list.map((m) => m.name)).toEqual(['Léa'])
    expect(list[0]?.latestProject.id).toBe(shown.id)
    expect(JSON.stringify(list)).not.toContain(removedToo.id)
    expect(JSON.stringify(list)).not.toContain(onlyOne.id)
  })
})

// ─── L'ordre et le nombre ─────────────────────────────────────────────────────────────────────────

describe('the order and the number of suggestions', () => {
  it('orders the authors by their latest public project, newest first', async () => {
    await publish(lea, 'Carnet de cafés')
    await publish(zoe, 'Météo du jardin')
    const nina = await author('Nina')
    await publish(nina.cookie, 'Herbier')
    expect(await names(max)).toEqual(['Nina', 'Zoé', 'Léa'])

    // Léa publie de nouveau : elle passe en tête, une seule fois.
    await publish(lea, 'Carnet de thés')
    expect(await names(max)).toEqual(['Léa', 'Nina', 'Zoé'])
  })

  // jur-J5 : la popularité ne compte jamais. Léa est suivie par trois membres et son projet a
  // reçu des réactions ; Nina, sans abonné ni réaction, a publié après elle : Nina passe devant.
  it('puts a much followed author with an older project after a newer one (no popularity)', async () => {
    const popular = await publish(lea, 'Carnet de cafés')
    const fans = [await author('Inès'), await author('Karim'), await author('Sam')]
    for (const fan of fans) {
      await act.followMember(leaId, fan.cookie)
      await act.react(popular.id, 'bravo', fan.cookie)
    }
    await act.followMember(leaId, zoe)
    const nina = await author('Nina')
    await publish(nina.cookie, 'Herbier')

    const list = await names(max)
    expect(list.indexOf('Nina')).toBeLessThan(list.indexOf('Léa'))
    expect(list.slice(0, 2)).toEqual(['Nina', 'Léa'])
  })

  it('suggests five members at most, the next one taking the place of a dismissed one', async () => {
    const authors = []
    for (const name of ['Ana', 'Bea', 'Cyd', 'Dan', 'Eve', 'Fay']) {
      const member = await author(name)
      await publish(member.cookie, `Le projet de ${name}`)
      authors.push(member)
    }

    // Les cinq plus récents, du plus récent au plus ancien : Ana, la plus ancienne, attend.
    expect(await names(max)).toEqual(['Fay', 'Eve', 'Dan', 'Cyd', 'Bea'])

    await expectDone(await dismiss(authors[3]?.id ?? '', max)) // Dan
    expect(await names(max)).toEqual(['Fay', 'Eve', 'Cyd', 'Bea', 'Ana'])
  })

  it('reads the suggestions in a constant number of queries, from the latest listed projects only', async () => {
    // 1. Un nombre fixe de requêtes, qu'il y ait un auteur ou cinq, et quel que soit le nombre de
    // leurs projets (dernier projet, médias et totaux lus par lots).
    const count = async () => (await explainQueries(ctx.db, () => suggestions(max))).length
    await publish(lea, 'Carnet de cafés')
    const one = await count()
    for (const name of ['Ana', 'Bea', 'Cyd', 'Dan']) {
      const member = await author(name)
      await publish(member.cookie, `Le projet de ${name}`)
      await publish(member.cookie, `Un autre projet de ${name}`)
    }
    expect(await names(max)).toHaveLength(5)
    expect(await count()).toBe(one)

    // 2. Seuls les 200 derniers projets listés sont lus (sec-A1) : un auteur dont le dernier
    // projet est plus ancien n'est plus trouvé. Zoé publie, puis Léa range 199 projets plus
    // récents : Zoé est encore dans la fenêtre (le 200e projet).
    await publish(zoe, 'Météo du jardin')
    later()
    await insertProjects(leaId, 199, new Date(), 'Série')
    // L'horloge passe après ces 199 projets (datés d'une seconde d'écart chacun).
    vi.setSystemTime(Date.now() + 200 * SECOND + MINUTE)
    expect((await suggestions(max)).map((m) => m.name).slice(0, 2)).toEqual(['Léa', 'Zoé'])

    // Un projet de Léa de plus : le projet de Zoé est le 201e, hors de la fenêtre.
    await insertProjects(leaId, 1, new Date(), 'Dernier')
    later()
    expect((await suggestions(max)).map((m) => m.name)).not.toContain('Zoé')
  })
})

// ─── Le quota ─────────────────────────────────────────────────────────────────────────────────────

describe('the rates of the suggestions', () => {
  it('answers 600 suggestion reads an hour, then asks to wait', async () => {
    await alreadyUsed(memberCounterKeys(maxId).suggestionsHour, 599)
    // La 600e passe encore.
    expect((await suggestionsRaw(max)).status).toBe(200)

    const blocked = await suggestionsRaw(max)
    await expectError(blocked, 429, 'rate_limited')
    const retryAfter = Number(blocked.headers.get('retry-after'))
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(3600)

    // Chaque membre a son compteur ; une heure plus tard, Max lit de nouveau.
    expect((await suggestionsRaw(zoe)).status).toBe(200)
    later(HOUR)
    expect((await suggestionsRaw(max)).status).toBe(200)
  })

  it('answers 120 dismissals an hour, counting malformed ones, then asks to wait', async () => {
    await alreadyUsed(memberCounterKeys(maxId).suggestionDismissHour, 119)
    // La 120e, mal formée (un identifiant impossible), compte aussi : le quota passe avant tout.
    await expectError(await dismiss('pas un identifiant !', max), 404, 'not_found')

    const blocked = await dismiss(leaId, max)
    await expectError(blocked, 429, 'rate_limited')
    expect(Number(blocked.headers.get('retry-after'))).toBeLessThanOrEqual(3600)
    expect(await storedDismissals()).toEqual([])

    // Le compteur des lectures est un autre : la liste se lit toujours. Et Zoé écarte.
    expect((await suggestionsRaw(max)).status).toBe(200)
    await expectDone(await dismiss(leaId, zoe))
    later(HOUR)
    await expectDone(await dismiss(leaId, max))
  })

  it('answers 500 dismissals a day, counting malformed ones, then asks to wait', async () => {
    await alreadyUsed(memberCounterKeys(maxId).suggestionDismissDay, 498)
    // La 499e, mal formée, compte ; la 500e passe.
    await expectError(await dismiss('pas un identifiant !', max), 404, 'not_found')
    await expectDone(await dismiss(leaId, max))

    // Une heure plus tard (le compteur de l'heure est neuf), le plafond du jour tient encore.
    later(HOUR + MINUTE)
    await expectError(await dismiss(zoeId, max), 429, 'rate_limited')
    // Le lendemain, Max écarte de nouveau.
    later(DAY)
    await expectDone(await dismiss(zoeId, max))
  })
})

// ─── L'export et l'effacement ─────────────────────────────────────────────────────────────────────

describe('the dismissals in the export and with the accounts', () => {
  it('exports the dismissed members by identifier and handle, to the one who dismissed only', async () => {
    await publish(lea, 'Carnet de cafés')
    const leaHandle = (await act.me(lea)).handle
    expect((await exportOf(max)).dismissedSuggestions).toEqual([])
    const unreadBefore = UnreadCount.parse(
      await (await send('GET', '/v1/notifications/unread', lea)).json(),
    ).count

    later()
    const at = new Date().toISOString()
    await expectDone(await dismiss(leaId, max))

    // L'export de Max nomme Léa par son pseudo, jamais par son nom affiché (jur-J4).
    const exported = await exportOf(max)
    expect(exported.dismissedSuggestions).toEqual([{ memberId: leaId, handle: leaHandle, at }])
    // Léa, l'écartée, n'en garde rien : ni dans son export, ni par une notification.
    const leaExport = await send('GET', '/v1/me/export', lea)
    expect(leaExport.status).toBe(200)
    const leaText = await leaExport.text()
    expect(AccountExport.parse(JSON.parse(leaText)).dismissedSuggestions).toEqual([])
    expect(leaText).not.toContain(maxId)
    const unreadAfter = UnreadCount.parse(
      await (await send('GET', '/v1/notifications/unread', lea)).json(),
    ).count
    expect(unreadAfter).toBe(unreadBefore)
  })

  it('exports a dismissed member without his handle once he has blocked the dismisser', async () => {
    const leaHandle = (await act.me(lea)).handle
    const zoeHandle = (await act.me(zoe)).handle
    await expectDone(await dismiss(leaId, max))
    later()
    await expectDone(await dismiss(zoeId, max))

    // Léa bloque Max après coup : la page de Léa répond 404 à Max, son pseudo ne sort plus non plus.
    await act.block(maxId, lea)
    const exported = (await exportOf(max)).dismissedSuggestions
    // L'identifiant et la date restent ; seul le pseudo de Léa disparaît. Zoé, sans blocage, le garde.
    expect(exported.map((row) => [row.memberId, row.handle])).toEqual([
      [leaId, null],
      [zoeId, zoeHandle],
    ])
    expect(JSON.stringify(exported)).not.toContain(leaHandle ?? 'no handle')
  })

  it('exports a dismissed member without his handle once the dismisser has blocked him', async () => {
    const leaHandle = (await act.me(lea)).handle
    await expectDone(await dismiss(leaId, max))

    // Max bloque Léa après l'avoir écartée : le blocage joue dans les deux sens.
    await act.block(leaId, max)
    const exported = (await exportOf(max)).dismissedSuggestions
    expect(exported).toHaveLength(1)
    expect(exported[0]?.memberId).toBe(leaId)
    expect(exported[0]?.handle).toBeNull()
    expect(JSON.stringify(exported)).not.toContain(leaHandle ?? 'no handle')

    // Débloquée, Léa retrouve son pseudo dans l'export (le blocage seul le cachait).
    await act.unblock(leaId, max)
    expect((await exportOf(max)).dismissedSuggestions[0]?.handle).toBe(leaHandle)
  })

  it('drops the dismissal when the dismissed member deletes her account, and all of them with the dismisser', async () => {
    await expectDone(await dismiss(leaId, max))
    await expectDone(await dismiss(zoeId, max))
    await expectDone(await dismiss(leaId, zoe))
    await expectDone(await dismiss(maxId, zoe))
    expect(await storedDismissals()).toEqual(
      [`${maxId}>${leaId}`, `${maxId}>${zoeId}`, `${zoeId}>${leaId}`, `${zoeId}>${maxId}`].sort(),
    )

    // Léa, l'écartée, supprime son compte : les écartements qui la visent partent avec lui.
    await act.deleteAccount(lea, leaAccount.password)
    expect(await storedDismissals()).toEqual([`${maxId}>${zoeId}`, `${zoeId}>${maxId}`].sort())

    // Max, qui avait écarté, supprime le sien : ses écartements partent, et celui qui le visait.
    await act.deleteAccount(max, maxAccount.password)
    expect(await storedDismissals()).toEqual([])
  })
})

// ─── Le contrat ───────────────────────────────────────────────────────────────────────────────────

describe('the API contract', () => {
  it('documents the two routes of the suggestions', async () => {
    const doc = (await (await ctx.request('/openapi.json')).json()) as {
      paths: Record<string, Record<string, unknown>>
    }
    expect(Object.keys(doc.paths[SUGGESTIONS] ?? {})).toContain('get')
    expect(Object.keys(doc.paths[`${SUGGESTIONS}/{id}/dismissed`] ?? {})).toContain('put')
  })
})
