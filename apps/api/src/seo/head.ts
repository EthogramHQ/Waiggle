// La tête HTML des pages publiques (tranche R12, plan, choix 5) : le morceau de `<head>` que Caddy
// glisse dans la page pré-rendue de l'appli, pour les moteurs de recherche et les aperçus de liens
// (titre, description, adresse canonique, langues, Open Graph, consigne aux moteurs). Il est servi
// par GET /v1/public/head (routes/public-head.ts).
//
// Trois règles de sécurité (relecture du plan, décision 1 ; relecture de sécurité B1 et I1) :
// - tout texte est échappé, crochets compris : Caddy relit le fragment comme un gabarit, avec les
//   délimiteurs `[[waiggle` … `]]` ; sans aucun « [ » dans la réponse, un texte de membre ne peut
//   jamais y devenir une instruction (redirection, lecture de variables d'environnement) ;
// - les adresses sont fabriquées ici, depuis l'identifiant LU EN BASE, jamais recopiées du chemin
//   reçu : un chemin fabriqué (`?ref=…`, `"onload=`, `//autre.site`) ne peut rien y glisser ;
// - toute page qui n'est pas publique (inconnue, mal formée, cachée, fermée) reçoit la tête
//   neutre, la même octet pour octet que celle d'un identifiant inconnu : la tête ne dit jamais si
//   un projet ou une page existe.
//
// La visibilité n'est pas réécrite ici : un projet passe par `visitorVisibleProject`
// (projects/visibility.ts), une page de membre par `loadPublicMember` et donc `publicPageOf`
// (profile/public-page.ts), les deux seules conditions « visible d'un visiteur ».
import { appName } from '@ruche/brand'
import {
  LEGAL_PAGES,
  type LegalPage,
  MemberId,
  ProjectId,
  type PublicLanguage,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { fill, resources } from '@ruche/i18n'
import { and, eq } from 'drizzle-orm'
import { isExampleAccountSql } from '../accounts/example'
import { visitorVisibleProject } from '../projects/visibility'
import { loadPublicMember, toCards } from '../public/load'

/**
 * Le remplacement de chaque caractère qui a un sens en HTML ou pour le gabarit de Caddy, par son
 * entité numérique ou nommée. `[` et `]` en plus des cinq habituels (B1), et l'accent grave, que le
 * gabarit de Caddy lit comme un guillemet de chaîne.
 */
const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '[': '&#91;',
  ']': '&#93;',
  '`': '&#96;',
}

/**
 * Un texte prêt à être écrit entre deux balises ou dans un attribut entre guillemets doubles.
 * Une expression régulière avec une classe de caractères (`[...]`) trouve chacun d'eux en un seul
 * passage, et la fonction de remplacement donne son entité. Le texte se relit à l'identique une
 * fois décodé par le navigateur.
 */
export const escapeHead = (value: string): string =>
  value.replace(/[&<>"'[\]`]/g, (char) => ENTITIES[char] ?? char)

/** Les deux langues, dans l'ordre des liens `hreflang`. */
const LANGUAGES = ['fr', 'en'] as const satisfies readonly PublicLanguage[]

/** La « locale » Open Graph de chaque langue (langue et pays, comme l'attendent les réseaux). */
const OG_LOCALE: Record<PublicLanguage, string> = { fr: 'fr_FR', en: 'en_US' }

/**
 * Le titre d'un onglet, comme dans l'appli (ui/Screen.tsx) : la page, puis le nom de l'appli. Le
 * séparateur « | » n'a pas à être traduit.
 */
const tabTitle = (page: string) => `${page} | ${appName}`

/** Les textes d'une langue, `{{appName}}` rempli (`fill`). */
const textsOf = (lang: PublicLanguage) => resources[lang].translation

/**
 * Ce que dit une page publique, avant d'être écrit en HTML. `suffix` : la fin de son adresse, sans
 * la langue (`/projects/<id>`, `/`), fabriquée depuis l'identifiant lu en base.
 */
type HeadContent = {
  title: string
  ogTitle: string
  description?: string
  image?: string
  ogType: 'website' | 'article' | 'profile'
  suffix: string
  /**
   * R12b : vrai pour un projet ou la page d'un compte d'exemples. La consigne aux moteurs devient
   * `noindex` (ils ne gardent pas la page dans leurs résultats) ; le titre, l'aperçu et l'image
   * restent ceux de la page, pour qu'un lien partagé s'affiche comme les autres.
   */
  noindex?: boolean
}

/** Une balise `<meta>` ; chaque valeur échappée. */
const meta = (key: 'name' | 'property', name: string, content: string) =>
  `<meta ${key}="${escapeHead(name)}" content="${escapeHead(content)}">`

/** Une balise `<link>` ; chaque valeur échappée. */
const link = (attrs: Record<string, string>) =>
  `<link ${Object.entries(attrs)
    .map(([key, value]) => `${key}="${escapeHead(value)}"`)
    .join(' ')}>`

/**
 * La tête neutre d'une langue : le nom de l'appli, sa phrase d'accueil et `noindex` (les moteurs
 * n'indexent pas la page). Ni adresse, ni image, rien qui dépende de l'adresse demandée : elle est
 * donc la même pour toute page qui n'est pas publique, cachée ou inconnue.
 */
export const neutralHead = (lang: PublicLanguage): string =>
  [
    `<title>${escapeHead(appName)}</title>`,
    meta('name', 'description', fill(textsOf(lang).home.tagline)),
    meta('name', 'robots', 'noindex'),
  ].join('\n')

/**
 * La tête d'une page publique : l'adresse canonique dans sa langue, les deux langues et
 * `x-default` (l'adresse sans langue, que Caddy envoie vers la langue du navigateur), puis l'aperçu
 * Open Graph.
 */
const pageHead = (content: HeadContent, lang: PublicLanguage, appUrl: string): string => {
  const address = (prefix: string) => `${appUrl}${prefix}${content.suffix}`
  const canonical = address(`/${lang}`)
  return [
    `<title>${escapeHead(content.title)}</title>`,
    ...(content.description ? [meta('name', 'description', content.description)] : []),
    // Une seule consigne aux moteurs : deux balises contradictoires les laisseraient choisir.
    meta('name', 'robots', content.noindex ? 'noindex' : 'index, follow'),
    link({ rel: 'canonical', href: canonical }),
    ...LANGUAGES.map((other) =>
      link({ rel: 'alternate', hreflang: other, href: address(`/${other}`) }),
    ),
    link({ rel: 'alternate', hreflang: 'x-default', href: address('') }),
    meta('property', 'og:type', content.ogType),
    meta('property', 'og:site_name', appName),
    meta('property', 'og:title', content.ogTitle),
    ...(content.description ? [meta('property', 'og:description', content.description)] : []),
    meta('property', 'og:url', canonical),
    meta('property', 'og:locale', OG_LOCALE[lang]),
    ...(content.image ? [meta('property', 'og:image', content.image)] : []),
    // L'aperçu des réseaux qui lisent leurs propres balises : grand si une photo l'illustre.
    meta('name', 'twitter:card', content.image ? 'summary_large_image' : 'summary'),
  ].join('\n')
}

/** Une sorte de page publique, telle que le chemin la désigne (identifiants encore à vérifier). */
type Page =
  | { kind: 'home' }
  | { kind: 'legal'; page: LegalPage }
  | { kind: 'project'; id: string; updates: boolean }
  | { kind: 'member'; id: string }

/**
 * Les chemins des pages publiques : `/fr/`, `/fr/rules`, `/fr/projects/<id>`,
 * `/fr/projects/<id>/updates`, `/fr/members/<id>` (et leur version `/en/`), une barre finale
 * permise. `(?:…)` groupe sans capturer, `(…)` capture un morceau, `?` le rend facultatif. Les
 * identifiants capturés ne sont que des candidats : `[^/]+` laisse passer `id?ref=…`, que les
 * schémas `ProjectId` et `MemberId` refusent ensuite.
 */
const PUBLIC_PATH =
  /^\/(fr|en)(?:\/(?:([a-z]+)|projects\/([^/]+)(\/updates)?|members\/([^/]+)))?\/?$/

/** La langue au début d'un chemin (`/en/…`, `/en`), ou null. */
const LANGUAGE_PREFIX = /^\/(fr|en)(?:\/|$)/

/** Une page légale nommée dans le chemin, ou undefined. */
const legalPageOf = (name: string): LegalPage | undefined =>
  LEGAL_PAGES.find((page) => page === name)

/** La page désignée par un chemin et sa langue, ou null si ce n'est pas une page publique. */
const pageOf = (path: string): { lang: PublicLanguage; page: Page } | null => {
  const match = PUBLIC_PATH.exec(path)
  if (!match) return null
  const [, lang, named, projectId, updates, memberId] = match
  if (lang !== 'fr' && lang !== 'en') return null
  if (named !== undefined) {
    const legal = legalPageOf(named)
    return legal ? { lang, page: { kind: 'legal', page: legal } } : null
  }
  if (projectId !== undefined)
    return ProjectId.safeParse(projectId).success
      ? { lang, page: { kind: 'project', id: projectId, updates: updates !== undefined } }
      : null
  if (memberId !== undefined)
    return MemberId.safeParse(memberId).success
      ? { lang, page: { kind: 'member', id: memberId } }
      : null
  return { lang, page: { kind: 'home' } }
}

/**
 * Ce que dit un projet public, ou null s'il n'est pas visible d'un visiteur. Deux requêtes : la clé
 * primaire de project, avec la condition commune `visitorVisibleProject` dans le même `where`
 * (l'identifiant entre comme paramètre lié) ; puis ses photos (`toCards`, la lecture de la vitrine et
 * des pages publiques), dont la première de la galerie qui n'est pas retirée devient l'image de
 * l'aperçu : la même que `visuals[0]` de GET /v1/public/projects/{id}.
 */
const projectContent = async (
  db: Database,
  id: string,
  updates: boolean,
  lang: PublicLanguage,
  apiUrl: string,
): Promise<HeadContent | null> => {
  const [row] = await db
    .select({
      id: schema.project.id,
      title: schema.project.title,
      pitch: schema.project.pitch,
      status: schema.project.status,
      // R12b : l'auteur est-il un compte d'exemples ? Dans la même lecture (accounts/example.ts),
      // par la clé primaire d'example_account : aucune requête de plus.
      example: isExampleAccountSql(schema.project.authorId),
    })
    .from(schema.project)
    .where(and(eq(schema.project.id, id), visitorVisibleProject()))
    .limit(1)
  if (!row) return null
  const [card] = await toCards(db, [row], apiUrl)
  // La frise d'un projet : « Les mises à jour | Décollage ! | {{appName}} ».
  const page = updates ? `${textsOf(lang).project.updates.title} | ${row.title}` : row.title
  return {
    title: tabTitle(page),
    ogTitle: page,
    description: row.pitch,
    ...(card?.cover && { image: card.cover.url }),
    ogType: 'article',
    suffix: `/projects/${row.id}${updates ? '/updates' : ''}`,
    ...(row.example && { noindex: true }),
  }
}

/**
 * Ce que dit la page publique d'un membre, ou null si elle est fermée ou le membre inconnu :
 * `loadPublicMember`, la lecture de GET /v1/public/members/{id}. Son nom, sa photo (null si la
 * modération l'a retirée), sa bio seulement s'il l'a cochée ; jamais son pseudo (Q8).
 */
const memberContent = async (
  db: Database,
  id: string,
  apiUrl: string,
): Promise<HeadContent | null> => {
  const member = await loadPublicMember(db, id, apiUrl)
  if (!member) return null
  return {
    title: tabTitle(member.name),
    ogTitle: member.name,
    ...(member.bio && { description: member.bio }),
    ...(member.avatarUrl && { image: member.avatarUrl }),
    ogType: 'profile',
    suffix: `/members/${member.id}`,
    // R12b : la pastille lue par `loadPublicMember` (présente seulement pour un compte d'exemples).
    ...(member.example && { noindex: true }),
  }
}

/** Ce que dit une page, ou null si elle n'est pas publique (tête neutre). */
const contentOf = async (
  db: Database,
  page: Page,
  lang: PublicLanguage,
  apiUrl: string,
): Promise<HeadContent | null> => {
  const texts = textsOf(lang)
  switch (page.kind) {
    case 'home':
      return {
        title: appName,
        ogTitle: appName,
        description: fill(texts.home.tagline),
        ogType: 'website',
        suffix: '/',
      }
    case 'legal': {
      const title = fill(texts.legal.pages[page.page].title)
      return { title: tabTitle(title), ogTitle: title, ogType: 'website', suffix: `/${page.page}` }
    }
    case 'project':
      return projectContent(db, page.id, page.updates, lang, apiUrl)
    case 'member':
      return memberContent(db, page.id, apiUrl)
  }
}

/**
 * La tête d'un chemin (`path`, déjà lu par `HeadQuery` : null s'il était illisible) :
 * - **la langue du chemin gagne** (`/en/…` donne une tête anglaise, quel que soit `lang`) ; `lang`
 *   ne sert qu'à un chemin sans langue, qui n'est jamais une page publique et reçoit donc la tête
 *   neutre dans cette langue (décision du 16/11/2026, plan R12) ;
 * - une page publique reçoit sa tête ; tout le reste, la tête neutre de la langue.
 * `appUrl` : l'adresse de l'appli (les canoniques) ; `apiUrl` : l'adresse publique de l'API (les
 * images, sous /media).
 */
export const headFor = async (
  db: Database,
  {
    path,
    lang,
    appUrl,
    apiUrl,
  }: { path: string | null; lang: PublicLanguage; appUrl: string; apiUrl: string },
): Promise<string> => {
  const prefix = path === null ? null : LANGUAGE_PREFIX.exec(path)?.[1]
  const language: PublicLanguage = prefix === 'fr' || prefix === 'en' ? prefix : lang
  const found = path === null ? null : pageOf(path)
  if (!found) return neutralHead(language)
  const content = await contentOf(db, found.page, found.lang, apiUrl)
  return content ? pageHead(content, found.lang, appUrl) : neutralHead(language)
}
