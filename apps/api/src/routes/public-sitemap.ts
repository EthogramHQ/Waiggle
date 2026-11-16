// Le plan du site (tranche R12, plan, choix 6) : GET /v1/public/sitemap, que Caddy relaie à
// `/sitemap.xml` pour les moteurs de recherche. Il suit le protocole sitemaps.org : un `<urlset>`
// de `<url>`, chacune avec son adresse (`<loc>`) et, pour un projet, sa date de modification
// (`<lastmod>`). Rien d'autre : jamais un titre ni un nom.
//
// Il liste, en français et en anglais : l'accueil, les quatre pages légales, les projets visibles
// d'un visiteur et les pages publiques ouvertes, sauf ceux d'un compte d'exemples (R12b). Il est relu à chaque demande, sans cache partagé
// (relecture du plan, décision 3) : un projet qui cesse d'être public en sort à l'instant. Hors de
// la limite de lecture des visiteurs (décision 6 ; security/visitor-limit.ts l'exempte).
import { createRoute, z } from '@hono/zod-openapi'
import { LEGAL_PAGES, PUBLIC_LANGUAGES } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, desc, eq, not } from 'drizzle-orm'
import { isExampleAccountSql } from '../accounts/example'
import { publicPageOpen } from '../profile/public-page'
import { visitorVisibleProject } from '../projects/visibility'
import { createRouter } from './router'

/**
 * Un fichier de plan du site ne doit pas dépasser 50 000 adresses (protocole sitemaps.org). Les
 * pages fixes en font 10 ; chaque projet ou page en fait 2 (une par langue). Les bornes gardent la
 * somme sous la limite : 10 + 2 × 20 000 + 2 × 4 995 = 50 000. Au-delà, il faudra un index de plans
 * du site (plusieurs fichiers), ce qui est loin d'aujourd'hui.
 */
const PROJECTS_MAX = 20_000
const MEMBERS_MAX = 4_995

/** Un texte prêt pour le XML : les cinq caractères qui y ont un sens deviennent des entités. */
const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

/** Une `<url>` : l'adresse, et sa date de modification si on la connaît. */
const urlEntry = (loc: string, lastmod?: Date) =>
  `<url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${lastmod.toISOString()}</lastmod>` : ''}</url>`

/**
 * Les adresses du plan du site, dans les deux langues, fabriquées depuis les identifiants lus en
 * base. Deux requêtes, quel que soit le nombre de projets :
 * - les projets visibles d'un visiteur (`visitorVisibleProject`, la seule condition), les plus
 *   récemment publiés d'abord : l'index partiel project_web_published_idx (`visibility = 'web' and
 *   removed_at is null`, rangé par `published_at desc, id desc`) donne les lignes dans l'ordre, et
 *   la condition sur l'auteur (vérifié, encore là) se vérifie par la clé primaire de "user" ;
 * - les membres à page ouverte (`publicPageOpen`, la seule condition), par la jointure de `profile`
 *   à "user" sur sa clé primaire. Aucun index sur `profile.public_page` : la table des profils est
 *   lue en entier (une ligne par membre), ce qui reste petit, et le plan du site n'est lu que par
 *   les moteurs.
 *
 * R12b : ni les projets ni la page d'un compte d'exemples (leur tête dit `noindex`, seo/head.ts) :
 * `not (exists …)` dans chacun des deux `where` (accounts/example.ts), par la clé primaire
 * d'example_account (user_id), une lecture par ligne gardée. La table n'a que quelques lignes.
 */
const sitemapOf = async (db: Database, appUrl: string): Promise<string> => {
  const [projects, members] = await Promise.all([
    db
      .select({ id: schema.project.id, updatedAt: schema.project.updatedAt })
      .from(schema.project)
      .where(and(visitorVisibleProject(), not(isExampleAccountSql(schema.project.authorId))))
      .orderBy(desc(schema.project.publishedAt), desc(schema.project.id))
      .limit(PROJECTS_MAX),
    db
      .select({ id: schema.user.id })
      .from(schema.profile)
      .innerJoin(schema.user, eq(schema.user.id, schema.profile.userId))
      .where(and(publicPageOpen(), not(isExampleAccountSql(schema.user.id))))
      .orderBy(schema.user.id)
      .limit(MEMBERS_MAX),
  ])
  // Chaque page, une fois par langue : `/fr/projects/<id>`, puis `/en/projects/<id>`.
  const both = (suffix: string, lastmod?: Date) =>
    PUBLIC_LANGUAGES.map((lang) => urlEntry(`${appUrl}/${lang}${suffix}`, lastmod))
  const entries = [
    ...both('/'),
    ...LEGAL_PAGES.flatMap((page) => both(`/${page}`)),
    ...projects.flatMap((project) => both(`/projects/${project.id}`, project.updatedAt)),
    ...members.flatMap((member) => both(`/members/${member.id}`)),
  ]
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
  ].join('\n')
}

const sitemapRoute = createRoute({
  method: 'get',
  path: '/v1/public/sitemap',
  summary: 'The sitemap of the public pages, for search engines',
  description:
    'The home page, the four legal pages, the public projects and the open public pages, in ' +
    'French and English: addresses and dates only.',
  responses: {
    200: {
      description: 'A sitemaps.org XML document.',
      content: { 'application/xml': { schema: z.string() } },
    },
  },
})

type Deps = { db: Database; appUrl: string }

export const publicSitemapRoutes = ({ db, appUrl }: Deps) => {
  const app = createRouter()

  app.openapi(sitemapRoute, async (c) => {
    const xml = await sitemapOf(db, appUrl)
    // `no-cache` : un cache (celui d'un moteur) doit redemander avant de resservir ; jamais un cache
    // partagé qui garderait un projet redevenu privé.
    c.header('Cache-Control', 'no-cache')
    return c.body(xml, 200, { 'Content-Type': 'application/xml; charset=utf-8' })
  })

  return app
}
