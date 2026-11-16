// Tests d'intégration de R12 : le plan du site, GET /v1/public/sitemap, que Caddy relaie à
// `/sitemap.xml` pour les moteurs de recherche. Scénario : docs/scenarios/refonte.md, « R12 », « Le
// référencement, les liens de partage et les aperçus » (« un plan du site liste l'accueil, les quatre
// pages, les projets publics et les pages publiques, dans les deux langues ; un projet qui cesse
// d'être public en sort tout de suite ») et « Les adresses par langue » ; plan R12, choix 6 ;
// relecture du plan, décisions 3 (jamais de cache partagé) et 6 (hors de la limite de lecture).
//
// Le plan du site ne contient que des adresses (et des dates) : jamais un titre ni un nom. Il suit
// le protocole « sitemaps.org » : un `<urlset>` de `<url>`, chacune avec son `<loc>`.
//
// Quatre membres : Léa (l'autrice), Max (un autre auteur, qui signale), Inès (page publique sans
// projet), Louis (l'administrateur, pour les retraits).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, TEST_APP_URL, type TestContext } from './testing/context'
import { seedHive } from './testing/hive-seeds'
import { expectNoSharedCache, later, visitorGestures } from './testing/visitor-world'

let ctx: TestContext
let act: ReturnType<typeof activity>
let world: ReturnType<typeof visitorGestures>
let lea: string // cookies de session
let max: string
let ines: string
let louis: string
let leaId: string
let maxId: string
let inesId: string

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
  ines = await ctx.verifiedMember({
    name: 'Ines Haddad',
    email: 'ines@example.com',
    password: 'ines-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  leaId = (await act.me(lea)).id
  maxId = (await act.me(max)).id
  inesId = (await act.me(ines)).id
  await act.makeAdmin((await act.me(louis)).id)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

// --- Lire le plan du site -----------------------------------------------------------------------

/** Les entités XML d'un texte, décodées une seule fois. */
const decode = (text: string) =>
  text.replace(/&(#\d+|#x[0-9a-f]+|lt|gt|quot|apos|amp);/gi, (_, entity: string) => {
    const lower = entity.toLowerCase()
    if (lower.startsWith('#x')) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16))
    if (lower.startsWith('#')) return String.fromCodePoint(Number(lower.slice(1)))
    return { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }[lower] ?? ''
  })

/**
 * Vérifie qu'un texte est un document XML bien formé, sans bibliothèque : la déclaration en tête,
 * puis des balises qui s'ouvrent et se ferment dans l'ordre (une pile), une seule racine, des
 * attributs entre guillemets, et aucun « & » ni « < » qui ne soit pas une entité ou une balise.
 * Rend le nom de la racine et ses attributs.
 */
const wellFormedRoot = (xml: string) => {
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), xml.slice(0, 80)).toBe(true)
  const body = xml.replace(/^<\?xml[^?]*\?>/, '')
  const stack: string[] = []
  let root: { name: string; tag: string } | undefined
  let roots = 0
  for (const token of body.split(/(<[^>]*>)/)) {
    if (token.startsWith('<')) {
      const close = token.match(/^<\/([\w:.-]+)\s*>$/)
      if (close) {
        expect(stack.pop(), `closes ${token}`).toBe(close[1])
        continue
      }
      const open = token.match(/^<([\w:.-]+)(\s+[\w:.-]+="[^"<]*")*\s*(\/?)>$/)
      expect(open, `a well formed tag: ${token}`).not.toBeNull()
      if (!open) continue
      const name = open[1] ?? ''
      if (stack.length === 0) {
        roots += 1
        root = { name, tag: token }
      }
      if (open[3] !== '/') stack.push(name)
    } else {
      // Du texte : rien hors de la racine, sauf des blancs ; aucune esperluette nue.
      if (stack.length === 0) expect(token.trim(), 'text outside the root').toBe('')
      expect(token, 'a bare ampersand').not.toMatch(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i)
    }
  }
  expect(stack, 'every tag closed').toEqual([])
  expect(roots, 'a single root').toBe(1)
  return root
}

/** Le plan du site lu par un visiteur : la réponse, et ses adresses (`<loc>`) décodées. */
const sitemap = async (ip?: string) => {
  const answer = await world.asVisitor('/v1/public/sitemap', ip)
  expect(answer.status, `sitemap: ${answer.body.slice(0, 160)}`).toBe(200)
  const locs = [...answer.body.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) =>
    decode((match[1] ?? '').trim()),
  )
  return { answer, locs }
}

/** Les deux adresses d'une page publique (scénario : « dans les deux langues »). */
const both = (path: string) => [`${TEST_APP_URL}/fr${path}`, `${TEST_APP_URL}/en${path}`]

/** Ce que le plan du site contient toujours : l'accueil et les quatre pages légales (R11). */
const ALWAYS = [
  ...both('/'),
  ...both('/rules'),
  ...both('/privacy'),
  ...both('/legal'),
  ...both('/accessibility'),
]

const sorted = (items: string[]) => [...items].sort()

/**
 * Un projet publié par l'API en « Public » (`web`) ; avec `visibility`, il passe ensuite à cette
 * visibilité (PATCH, comme dans l'appli) : un projet qui fut public un instant.
 */
const project = async (
  cookie: string,
  title: string,
  visibility?: { visibility: string; hiveId?: string },
) => {
  later()
  const id = await ctx.webProject(cookie, { title, pitch: `Le pitch de ${title}.` })
  if (visibility) await world.setVisibility(cookie, id, visibility)
  return id
}

// --- Le contenu ---------------------------------------------------------------------------------

describe('the sitemap (plan R12, choice 6)', () => {
  it('is a valid XML sitemap that lists the home page and the four legal pages in both languages, even with nothing public', async () => {
    const { answer, locs } = await sitemap()
    expect(answer.contentType).toMatch(/^(application|text)\/xml\b/)
    expect(answer.contentType).toMatch(/charset=utf-8/i)
    expectNoSharedCache(answer.cacheControl, 'sitemap')
    const root = wellFormedRoot(answer.body)
    expect(root?.name).toBe('urlset')
    expect(root?.tag).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')
    // Chaque adresse est dans sa propre `<url>`, une seule fois.
    expect(answer.body.match(/<url>/g)?.length).toBe(locs.length)
    expect(new Set(locs).size).toBe(locs.length)
    expect(sorted(locs)).toEqual(sorted(ALWAYS))
  })

  it('lists the fr and en addresses of the visible public projects and the open public pages, and nothing else', async () => {
    // Ce qui doit y être : deux projets publics de deux auteurs, deux pages publiques ouvertes (dont
    // une sans aucun projet).
    const rocket = await project(lea, 'Décollage !')
    const garden = await project(max, 'Le potager connecté')
    await ctx.openPublicPage(lea)
    await ctx.openPublicPage(ines)
    // Ce qui ne doit pas y être : un projet « Membres », un privé, un d'une ruche, un public retiré
    // par la modération ; la page de Max, jamais ouverte, même avec un projet public.
    const members = await project(lea, 'Entre membres', { visibility: 'public' })
    const secret = await project(lea, 'Mon journal', { visibility: 'private' })
    const hiveId = await seedHive(ctx.db, { name: 'Famille', animatorId: leaId })
    const family = await project(lea, 'Pour la famille', { visibility: 'hive', hiveId })
    const removed = await project(lea, 'Le quiz piégé')
    await world.remove(max, louis, { kind: 'project', id: removed })

    const { answer, locs } = await sitemap()
    wellFormedRoot(answer.body)
    expect(sorted(locs)).toEqual(
      sorted([
        ...ALWAYS,
        ...both(`/projects/${rocket}`),
        ...both(`/projects/${garden}`),
        ...both(`/members/${leaId}`),
        ...both(`/members/${inesId}`),
      ]),
    )
    // Des adresses seulement : ni les projets cachés, ni un titre, ni un nom.
    for (const hidden of [members, secret, family, removed, maxId])
      expect(answer.body).not.toContain(hidden)
    for (const text of ['Décollage', 'potager', 'Léa', 'Ines', 'Maxence', 'Famille'])
      expect(answer.body).not.toContain(text)
  })

  it('takes a project out at once when it stops being public, and a page when it closes', async () => {
    const rocket = await project(lea, 'Décollage !')
    const quiz = await project(lea, 'Le quiz des planètes')
    await ctx.openPublicPage(lea)
    await ctx.openPublicPage(ines)
    const has = async (path: string) => (await sitemap()).locs.includes(`${TEST_APP_URL}/fr${path}`)
    // Témoin : tout y est.
    expect(await has(`/projects/${rocket}`)).toBe(true)
    expect(await has(`/projects/${quiz}`)).toBe(true)
    expect(await has(`/members/${inesId}`)).toBe(true)

    // Rendu aux membres : il sort à l'instant, dans les deux langues ; rendu public, il revient.
    await world.setVisibility(lea, rocket, { visibility: 'public' })
    expect((await sitemap()).locs).not.toContain(both(`/projects/${rocket}`)[0])
    expect((await sitemap()).locs).not.toContain(both(`/projects/${rocket}`)[1])
    await world.setVisibility(lea, rocket, { visibility: 'web' })
    expect(await has(`/projects/${rocket}`)).toBe(true)
    // Supprimé : il sort.
    later()
    expect((await act.send('DELETE', `/v1/projects/${quiz}`, lea)).ok).toBe(true)
    expect(await has(`/projects/${quiz}`)).toBe(false)
    // Une page refermée sort aussi.
    later()
    expect(
      (await act.send('PATCH', '/v1/me/public-page', ines, { publicPage: false })).status,
    ).toBe(200)
    expect(await has(`/members/${inesId}`)).toBe(false)
    // L'autrice supprime son compte : son projet et sa page sortent ensemble.
    later()
    await act.deleteAccount(lea, LEA.password)
    const { locs } = await sitemap()
    expect(sorted(locs)).toEqual(sorted(ALWAYS))
  })
})

// --- Hors de la limite de lecture (décision 6) --------------------------------------------------

describe('the sitemap and the visitor read limit (decision 6)', () => {
  it('does not count in the visitor read limit of a network, and is still answered past it', async () => {
    const rocket = await project(lea, 'Décollage !')
    for (let i = 0; i < 320; i += 1) {
      const res = await ctx.visitor('/v1/public/sitemap')
      expect(res.status, `sitemap ${i + 1}`).toBe(200)
    }
    // Ces lectures n'ont pas compté : la lecture d'un projet par le même réseau passe encore.
    expect((await world.asVisitor(`/v1/public/projects/${rocket}`)).status).toBe(200)

    // Témoin : la limite existe bien. 299 lectures de plus atteignent les 300 ; la suivante est
    // refusée, et le plan du site répond toujours.
    for (let i = 0; i < 299; i += 1) {
      const res = await ctx.visitor('/v1/public/projects/not-an-id')
      expect(res.status, `read ${i + 1}`).toBe(404)
    }
    expect((await world.asVisitor(`/v1/public/projects/${rocket}`)).status).toBe(429)
    expect((await sitemap()).locs).toContain(both(`/projects/${rocket}`)[0])
  }, 120_000)
})
