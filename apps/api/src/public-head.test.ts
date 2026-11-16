// Tests d'intégration de R12 : la tête des pages publiques, GET /v1/public/head?path=…&lang=…, le
// morceau de `<head>` que Caddy glisse dans la page pré-rendue (titre, description, adresse
// canonique, `hreflang`, Open Graph, consigne aux moteurs). Scénario : docs/scenarios/refonte.md,
// « R12 », « Les adresses par langue » (ce que lisent les moteurs) et « Le référencement, les liens
// de partage et les aperçus » ; plan R12, choix 5 ; relecture du plan, décisions 1 (aucun crochet,
// toujours 200, sans quota) et 6 (la tête hors de la limite de lecture des visiteurs) ; relecture
// de sécurité B1 et I1.
//
// Une page publique reçoit ses métadonnées ; toute autre adresse (pas publique, inconnue, mal
// formée) reçoit la tête neutre, octet pour octet la même : titre « {{appName}} », `noindex`, aucune
// image. Ainsi la tête ne dit jamais si un projet existe.
//
// Lecture du fragment : les balises `<title>`, `<meta>` et `<link>`, attributs entre guillemets
// doubles, entités HTML décodées (`&#91;` redevient « [ ») pour comparer au texte du membre.
//
// Trois membres : Léa (l'autrice), Max (qui signale), Louis (l'administrateur, pour les retraits).
import { appName } from '@ruche/brand'
import { PublicProject } from '@ruche/contracts'
import { fill, resources } from '@ruche/i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, TEST_API_URL, TEST_APP_URL, type TestContext } from './testing/context'
import {
  type Answer,
  expectNoSharedCache,
  later,
  UNKNOWN_ID,
  visitorGestures,
} from './testing/visitor-world'

let ctx: TestContext
let act: ReturnType<typeof activity>
let world: ReturnType<typeof visitorGestures>
let lea: string // cookies de session
let max: string
let louis: string
let leaId: string

const LEA = { name: 'Léa Fournier', email: 'lea@example.com', password: 'lea-long-password' }

beforeEach(async () => {
  // La fausse horloge est posée avant de créer l'API (la limite de lecture lit Date.now).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-17T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  world = visitorGestures(ctx, act)
  lea = await ctx.verifiedMember(LEA)
  max = await ctx.verifiedMember({
    name: 'Maxence',
    email: 'max@example.com',
    password: 'max-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  leaId = (await act.me(lea)).id
  await act.makeAdmin((await act.me(louis)).id)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

// --- Lire le fragment ---------------------------------------------------------------------------

/** Les entités HTML d'un texte, décodées une seule fois (`&amp;#91;` reste `&#91;`). */
const decode = (text: string) =>
  text.replace(/&(#\d+|#x[0-9a-f]+|lt|gt|quot|apos|amp);/gi, (_, entity: string) => {
    const lower = entity.toLowerCase()
    if (lower.startsWith('#x')) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16))
    if (lower.startsWith('#')) return String.fromCodePoint(Number(lower.slice(1)))
    return { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }[lower] ?? ''
  })

type Tag = { name: string; attrs: Record<string, string> }

/** Les balises `<meta>` et `<link>` du fragment, avec leurs attributs décodés. */
const tagsOf = (html: string): Tag[] =>
  [...html.matchAll(/<(meta|link)\b([^>]*)>/gi)].map((match) => ({
    name: (match[1] ?? '').toLowerCase(),
    attrs: Object.fromEntries(
      [...(match[2] ?? '').matchAll(/([\w:-]+)="([^"]*)"/g)].map((attr) => [
        (attr[1] ?? '').toLowerCase(),
        decode(attr[2] ?? ''),
      ]),
    ),
  }))

/** Ce qu'une tête donne à lire, rangé : titre, description, canonique, langues, Open Graph. */
const read = (html: string) => {
  const tags = tagsOf(html)
  const meta = (key: 'name' | 'property', value: string) =>
    tags.find((tag) => tag.name === 'meta' && tag.attrs[key] === value)?.attrs.content
  const links = (rel: string) => tags.filter((tag) => tag.name === 'link' && tag.attrs.rel === rel)
  const rawTitle = html.match(/<title>([^<]*)<\/title>/i)?.[1]
  return {
    title: rawTitle === undefined ? undefined : decode(rawTitle),
    description: meta('name', 'description'),
    robots: meta('name', 'robots'),
    canonical: links('canonical').map((tag) => tag.attrs.href),
    alternates: Object.fromEntries(
      links('alternate').map((tag) => [tag.attrs.hreflang ?? '', tag.attrs.href ?? '']),
    ),
    ogTitle: meta('property', 'og:title'),
    ogDescription: meta('property', 'og:description'),
    ogImage: meta('property', 'og:image'),
    ogSiteName: meta('property', 'og:site_name'),
  }
}

/** L'adresse de la demande de tête, comme Caddy la fabrique. */
const headUrl = (params: Record<string, string>) => `/v1/public/head?${new URLSearchParams(params)}`

/** La tête d'un chemin, lue par un visiteur, et ce qu'elle dit. */
const head = async (path: string, lang: 'fr' | 'en' = 'fr') => {
  const answer = await world.asVisitor(headUrl({ path, lang }))
  return { answer, ...read(answer.body) }
}

/** La tête neutre de référence : celle d'un projet qui n'a jamais existé. */
const unknownHead = async (lang: 'fr' | 'en' = 'fr') =>
  world.asVisitor(headUrl({ path: `/${lang}/projects/${UNKNOWN_ID}`, lang }))

/** Une tête lisible (200, en HTML) qui se laisse indexer. */
const expectIndexable = (answer: Answer, robots: string | undefined, where: string) => {
  expect(answer.status, `${where}: ${answer.body.slice(0, 160)}`).toBe(200)
  expect(answer.contentType, where).toMatch(/^text\/html/)
  expectNoSharedCache(answer.cacheControl, where)
  expect(robots ?? '', where).not.toMatch(/noindex/)
  expect(answer.body, where).not.toMatch(/noindex/)
}

/** La tête neutre : 200, titre « {{appName}} », `noindex`, aucune image. */
const expectNeutral = (answer: Answer, where: string) => {
  expect(answer.status, where).toBe(200)
  expect(answer.contentType, where).toMatch(/^text\/html/)
  const neutral = read(answer.body)
  expect(neutral.title, where).toBe(appName)
  expect(neutral.robots ?? '', where).toMatch(/noindex/)
  expect(neutral.ogImage, where).toBeUndefined()
  expect(answer.body, where).not.toMatch(/\/media\//)
}

/** Une photo de couverture, et son adresse telle qu'un visiteur la lit sur le projet public. */
const coverOf = async (id: string) => {
  const project = PublicProject.parse(await world.visitorJson(`/v1/public/projects/${id}`))
  const cover = project.visuals[0]
  if (!cover) throw new Error('no cover on the public project')
  return cover.url
}

/** « Décollage ! », public, avec une photo de couverture. */
const coveredWebProject = async (fields: Record<string, unknown> = {}) => {
  later()
  const id = await ctx.webProject(lea, fields)
  await world.uploadVisual(lea, id)
  return id
}

// --- Les pages publiques ------------------------------------------------------------------------

describe('the head of a public page (plan R12, choice 5)', () => {
  it('gives a public project its title, pitch, canonical address, both languages and its cover', async () => {
    const id = await coveredWebProject()
    const cover = await coverOf(id)
    for (const lang of ['fr', 'en'] as const) {
      const page = await head(`/${lang}/projects/${id}`, lang)
      expectIndexable(page.answer, page.robots, `/${lang}/projects`)
      expect(page.title).toContain('Décollage !')
      expect(page.description).toBe('Un compte à rebours pour la fusée du jardin.')
      // L'adresse canonique est la page elle-même, dans sa langue ; les deux langues, plus
      // `x-default` vers l'adresse sans langue (que Caddy redirige selon le navigateur).
      expect(page.canonical).toEqual([`${TEST_APP_URL}/${lang}/projects/${id}`])
      expect(page.alternates).toEqual({
        fr: `${TEST_APP_URL}/fr/projects/${id}`,
        en: `${TEST_APP_URL}/en/projects/${id}`,
        'x-default': `${TEST_APP_URL}/projects/${id}`,
      })
      // L'aperçu d'un lien : la couverture, le titre, l'accroche et « {{appName}} ».
      expect(page.ogImage).toBe(cover)
      expect(page.ogImage?.startsWith(`${TEST_API_URL}/media/`)).toBe(true)
      expect(page.ogTitle).toContain('Décollage !')
      expect(page.ogDescription).toBe('Un compte à rebours pour la fusée du jardin.')
      expect(page.ogSiteName).toBe(appName)
    }
  })

  it('gives a public page of a member her name, both languages, and nothing she did not check', async () => {
    await act.updateProfile(lea, { bio: 'Je construis des fusées en carton.', handle: 'leafusee' })
    await ctx.openPublicPage(lea, { showBio: false })
    for (const lang of ['fr', 'en'] as const) {
      const page = await head(`/${lang}/members/${leaId}`, lang)
      expectIndexable(page.answer, page.robots, `/${lang}/members`)
      expect(page.title).toContain('Léa Fournier')
      expect(page.canonical).toEqual([`${TEST_APP_URL}/${lang}/members/${leaId}`])
      expect(page.alternates).toEqual({
        fr: `${TEST_APP_URL}/fr/members/${leaId}`,
        en: `${TEST_APP_URL}/en/members/${leaId}`,
        'x-default': `${TEST_APP_URL}/members/${leaId}`,
      })
      // La bio décochée n'est pas dans la tête ; le pseudo n'est montré nulle part (Q8).
      expect(page.answer.body).not.toContain('fusées en carton')
      expect(page.answer.body).not.toContain('leafusee')
    }
  })

  it('gives the home page its canonical address and both languages', async () => {
    for (const lang of ['fr', 'en'] as const) {
      const page = await head(`/${lang}/`, lang)
      expectIndexable(page.answer, page.robots, `/${lang}/`)
      expect(page.title).toContain(appName)
      expect(page.description ?? '').not.toBe('')
      expect(page.canonical).toEqual([`${TEST_APP_URL}/${lang}/`])
      expect(page.alternates).toEqual({
        fr: `${TEST_APP_URL}/fr/`,
        en: `${TEST_APP_URL}/en/`,
        'x-default': `${TEST_APP_URL}/`,
      })
    }
  })

  it('gives each of the four legal pages its title in the language of the address', async () => {
    for (const page of ['rules', 'privacy', 'legal', 'accessibility'] as const) {
      for (const lang of ['fr', 'en'] as const) {
        const where = `/${lang}/${page}`
        const legal = await head(where, lang)
        expectIndexable(legal.answer, legal.robots, where)
        expect(legal.title, where).toContain(
          fill(resources[lang].translation.legal.pages[page].title),
        )
        expect(legal.canonical, where).toEqual([`${TEST_APP_URL}/${lang}/${page}`])
        expect(legal.alternates, where).toEqual({
          fr: `${TEST_APP_URL}/fr/${page}`,
          en: `${TEST_APP_URL}/en/${page}`,
          'x-default': `${TEST_APP_URL}/${page}`,
        })
      }
    }
  })
})

// --- Ce qui ne doit jamais sortir : les crochets, le chemin reçu --------------------------------

describe('what Caddy could run or a crafted address could inject (security review B1)', () => {
  it('writes no square bracket from a member text, so Caddy cannot run it as a template', async () => {
    // Caddy relit la tête incluse comme un gabarit, avec les délimiteurs `[[waiggle` … `]]` : un
    // texte de membre qui en contient s'exécuterait (redirection, variables d'environnement).
    const title = '[[waiggle env `APP_DOMAIN`]]'
    const pitch = '[[waiggle printf `%c>%cmeta` 34 60 62]] "<b>gras</b>" & [lien](x)'
    const name = '[[waiggle httpError 500]]'
    await act.updateProfile(lea, { name, bio: '[[waiggle .Req.Header]]' })
    await ctx.openPublicPage(lea)
    const id = await coveredWebProject({ title, pitch })

    const project = await head(`/fr/projects/${id}`)
    const member = await head(`/fr/members/${leaId}`)
    for (const [where, page] of [
      ['project', project],
      ['member', member],
    ] as const) {
      expect(page.answer.status, where).toBe(200)
      // Aucun crochet du tout, ni ouvrant ni fermant, dans tout le fragment.
      expect(page.answer.body, where).not.toMatch(/[[\]]/)
      // Aucune balise venue du texte du membre.
      expect(page.answer.body, where).not.toMatch(/<b>/i)
    }
    // Témoins : les textes sont bien écrits, échappés, et se relisent tels quels une fois décodés
    // (un guillemet échappé ne coupe pas l'attribut).
    expect(project.answer.body).toContain('&#91;&#91;waiggle')
    expect(project.title).toContain(title)
    expect(project.description).toBe(pitch)
    expect(project.ogDescription).toBe(pitch)
    expect(member.title).toContain(name)
  })

  it('builds the canonical address from the project id, never from the path received', async () => {
    const id = await coveredWebProject()
    const own = `${TEST_APP_URL}/fr/projects/${id}`
    // Témoins : l'adresse propre donne sa canonique, en français et en anglais.
    expect((await head(`/fr/projects/${id}`)).answer.status).toBe(200)
    expect((await head(`/fr/projects/${id}`)).canonical).toEqual([own])
    expect((await head(`/en/projects/${id}`, 'en')).canonical).toEqual([
      `${TEST_APP_URL}/en/projects/${id}`,
    ])

    // Des chemins fabriqués autour du même identifiant : la réponse est la tête du projet (avec
    // l'adresse que l'API fabrique elle-même) ou la tête neutre, jamais un morceau du chemin reçu.
    const crafted = [
      `/fr/projects/${id}/`,
      `/fr/projects/${id.toUpperCase()}`,
      `/fr/projects/${id}?ref=evil.example`,
      `/fr/projects/${id};evil.example`,
      `/fr/projects/${id}#evil.example`,
      `/fr/projects/${id}%2F..%2Fevil.example`,
      `/fr/projects/${id}"onload="evil.example`,
      `/fr/projects/${id}'><script>evil.example</script>`,
      `//evil.example/fr/projects/${id}`,
      `/fr/projects/${id}/updates/../../evil.example`,
    ]
    const allowed = new Set([own, `${own}/updates`])
    const wrong: string[] = []
    for (const path of crafted) {
      const page = await head(path)
      if (page.answer.status !== 200) wrong.push(`${path}: ${page.answer.status}`)
      if (/evil|onload|<script/i.test(page.answer.body)) wrong.push(`${path}: echoes the path`)
      for (const canonical of page.canonical)
        if (canonical === undefined || !allowed.has(canonical))
          wrong.push(`${path}: canonical ${canonical}`)
      // Toute adresse écrite dans la tête vient de l'appli ou des médias de l'API.
      for (const tag of tagsOf(page.answer.body))
        for (const value of [tag.attrs.href, tag.attrs.content])
          if (value?.includes('://') && !value.startsWith(`${TEST_APP_URL}/`))
            if (!value.startsWith(`${TEST_API_URL}/media/`)) wrong.push(`${path}: writes ${value}`)
    }
    expect(wrong.join('\n')).toBe('')
  })

  it('answers 200 with the neutral head to a malformed, overlong or unknown path', async () => {
    const id = await coveredWebProject()
    const neutral = await unknownHead('fr')
    expectNeutral(neutral, 'unknown project')
    expect(neutral.body).not.toContain(UNKNOWN_ID)
    expectNoSharedCache(neutral.cacheControl, 'neutral head')
    // Témoin : la tête d'un projet public n'est pas la tête neutre.
    expect((await unknownHead('fr')).body).toBe(neutral.body)
    expect((await head(`/fr/projects/${id}`)).answer.body).not.toBe(neutral.body)

    const requests = [
      '/v1/public/head',
      headUrl({ lang: 'fr' }),
      headUrl({ path: '', lang: 'fr' }),
      headUrl({ path: `fr/projects/${id}`, lang: 'fr' }),
      headUrl({ path: `/fr/projects/${id} x`, lang: 'fr' }),
      headUrl({ path: `/fr/projects/${id}\n<title>x</title>`, lang: 'fr' }),
      headUrl({ path: `/fr/projects/${'a'.repeat(600)}`, lang: 'fr' }),
      headUrl({ path: `/fr/projects/${id}/${'a'.repeat(600)}`, lang: 'fr' }),
      headUrl({ path: '/fr/projects/not-an-id', lang: 'fr' }),
      headUrl({ path: '/fr/projects/', lang: 'fr' }),
      headUrl({ path: `/fr/members/${UNKNOWN_ID}`, lang: 'fr' }),
      headUrl({ path: '/fr/members/no-such-member', lang: 'fr' }),
      headUrl({ path: `/de/projects/${id}`, lang: 'fr' }),
      headUrl({ path: '/fr/nowhere', lang: 'fr' }),
      headUrl({ path: '/feed', lang: 'fr' }),
      headUrl({ path: '/settings', lang: 'fr' }),
      // Une langue inconnue devient le français (HeadQuery, `.catch('fr')`).
      headUrl({ path: `/fr/projects/${UNKNOWN_ID}`, lang: 'de' }),
      headUrl({ path: `/fr/projects/${UNKNOWN_ID}` }),
    ]
    const wrong: string[] = []
    for (const request of requests) {
      const answer = await world.asVisitor(request)
      if (answer.status !== 200) wrong.push(`${request}: ${answer.status}`)
      else if (answer.body !== neutral.body) wrong.push(`${request}: not the neutral head`)
      else if (answer.contentType !== neutral.contentType) wrong.push(`${request}: content type`)
    }
    expect(wrong.join('\n')).toBe('')
    // L'anglais a sa tête neutre, la même pour toute adresse inconnue.
    const english = await unknownHead('en')
    expectNeutral(english, 'unknown project, en')
    expect((await world.asVisitor(headUrl({ path: '/en/nowhere', lang: 'en' }))).body).toBe(
      english.body,
    )
  })
})

// --- Un projet ou une page qui n'est pas public -------------------------------------------------

/** Les états qui retirent un projet aux visiteurs (scénario, « Revenir en arrière »). */
const HIDDEN = ['members', 'private', 'removed', 'author gone'] as const

describe('the head of what a visitor may not see (scenario « Un projet qui n’est pas public »)', () => {
  it.each(HIDDEN)(
    'gives a %s project exactly the neutral head of an unknown address, with nothing of its content',
    async (state) => {
      const id = await coveredWebProject()
      const cover = await coverOf(id)
      const coverFile = new URL(cover).pathname.split('/').pop() ?? cover
      // Témoin : avant, la tête montre le projet.
      const before = await head(`/fr/projects/${id}`)
      expect(before.answer.status, 'head before').toBe(200)
      expect(before.title).toContain('Décollage !')

      if (state === 'members') await world.setVisibility(lea, id, { visibility: 'public' })
      if (state === 'private') await world.setVisibility(lea, id, { visibility: 'private' })
      if (state === 'removed') await world.remove(max, louis, { kind: 'project', id })
      if (state === 'author gone') {
        later()
        await act.deleteAccount(lea, LEA.password)
      }

      for (const lang of ['fr', 'en'] as const) {
        const hidden = await world.asVisitor(headUrl({ path: `/${lang}/projects/${id}`, lang }))
        // Statut, corps, type et cache : exactement ceux d'une adresse inconnue.
        expect(hidden, `${state}, ${lang}`).toEqual(await unknownHead(lang))
        expectNeutral(hidden, `${state}, ${lang}`)
        for (const secret of ['Décollage', 'fusée du jardin', id, coverFile])
          expect(hidden.body, `${state}, ${lang}`).not.toContain(secret)
      }
    },
    60_000,
  )

  it('gives a public page that is closed, or was never opened, the neutral head of an unknown member', async () => {
    const neverOpened = await world.asVisitor(headUrl({ path: `/fr/members/${leaId}`, lang: 'fr' }))
    const unknown = await world.asVisitor(
      headUrl({ path: `/fr/members/${UNKNOWN_ID}`, lang: 'fr' }),
    )
    expect(neverOpened).toEqual(unknown)
    expectNeutral(neverOpened, 'never opened')
    // Un projet public ne rend pas la page publique (A14).
    await coveredWebProject()
    expect(await world.asVisitor(headUrl({ path: `/fr/members/${leaId}`, lang: 'fr' }))).toEqual(
      unknown,
    )

    await ctx.openPublicPage(lea)
    // Témoin : la page ouverte a sa tête.
    const open = await head(`/fr/members/${leaId}`)
    expect(open.answer.status, 'head of the open page').toBe(200)
    expect(open.title).toContain('Léa Fournier')
    later()
    expect((await act.send('PATCH', '/v1/me/public-page', lea, { publicPage: false })).status).toBe(
      200,
    )
    const closed = await world.asVisitor(headUrl({ path: `/fr/members/${leaId}`, lang: 'fr' }))
    expect(closed).toEqual(unknown)
    expect(closed.body).not.toContain('Léa')
    expect(closed.body).not.toContain(leaId)
  })
})

// --- Ni limite de lecture, ni quota (décisions 1 et 6) ------------------------------------------

describe('the head is always answered (decisions 1 and 6)', () => {
  it('answers every head request, past the visitor read limit of the network and without a quota', async () => {
    const id = await coveredWebProject()
    const path = headUrl({ path: `/fr/projects/${id}`, lang: 'fr' })
    const first = await world.asVisitor(path)
    expect(first.status).toBe(200)
    // Caddy demande la tête à chaque page servie : bien plus de 300 demandes d'un même réseau
    // reçoivent toutes la même tête.
    for (let i = 0; i < 320; i += 1) {
      const answer = await world.asVisitor(path)
      expect(answer.status, `head ${i + 1}`).toBe(200)
    }
    // Elles n'ont pas compté : une lecture du projet par le même réseau passe encore.
    expect((await world.asVisitor(`/v1/public/projects/${id}`)).status).toBe(200)

    // Témoin : la limite existe bien. 299 lectures de plus atteignent les 300 ; la suivante est
    // refusée, et la tête, elle, répond toujours la même chose.
    for (let i = 0; i < 299; i += 1) {
      const res = await ctx.visitor('/v1/public/projects/not-an-id')
      expect(res.status, `read ${i + 1}`).toBe(404)
    }
    expect((await world.asVisitor(`/v1/public/projects/${id}`)).status).toBe(429)
    expect(await world.asVisitor(path)).toEqual(first)
  }, 120_000)
})
