// Le curseur des listes paginées : les fils de l'accueil (feed/load.ts) et les commentaires d'un
// projet (comments/load.ts). Un seul curseur pour toutes ces listes, rangées de la même façon : du
// plus récent au plus ancien, puis par identifiant.
//
// Pourquoi un curseur plutôt qu'un numéro de page (« offset 20 », « offset 40 ») : avec offset,
// PostgreSQL doit relire puis jeter toutes les lignes des pages précédentes, de plus en plus
// lentement ; et si un élément est publié pendant qu'on lit, tout glisse d'un cran : le dernier
// élément de la page 1 revient en haut de la page 2. Le curseur dit au contraire « la suite, après
// celui-là » : la base saute directement au bon endroit de son index, et ce qui arrive entre deux
// pages ne décale rien.
import { type Column, type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'

/**
 * Ce que contient un curseur, une fois décodé : la date et l'identifiant du dernier élément de la
 * page (un projet, une note, un commentaire : tous ont un identifiant uuid tiré au hasard parmi des
 * milliards de milliards, deux éléments n'ont en pratique jamais le même). strictObject refuse tout
 * champ de plus. La date est bornée : PostgreSQL refuse l'an 0, et un curseur fabriqué avec cette
 * date ferait échouer la requête (erreur 500) au lieu d'être refusé comme invalide (400). Rien n'a
 * été publié avant l'an 2000 (et la date ISO a toujours une année de quatre chiffres : comparer les
 * textes suffit).
 */
const CursorContent = z.strictObject({
  at: z.iso.datetime().refine((at) => at >= '2000', 'date trop ancienne'),
  id: z.uuid(),
})
export type CursorContent = z.infer<typeof CursorContent>

/**
 * Fabrique le curseur de la page suivante : `{ at, id }` écrit en JSON, puis en base64url (le
 * base64 des adresses : des lettres, des chiffres, « - » et « _ », sans « = » final). L'appli le
 * renvoie tel quel, sans jamais le lire.
 */
export const encodeCursor = (content: CursorContent): string =>
  Buffer.from(JSON.stringify(content), 'utf8').toString('base64url')

/**
 * Lit un curseur reçu de l'appli. Le contrat a déjà vérifié sa forme (base64url, 200 caractères au
 * plus) ; ici, on vérifie son contenu. null : un curseur qui ne veut rien dire (pas du JSON, une
 * date ou un identifiant mal formés…), que la route refuse comme toute donnée invalide.
 */
export const decodeCursor = (cursor: string): CursorContent | null => {
  let content: unknown
  try {
    content = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    return null // pas du JSON
  }
  const parsed = CursorContent.safeParse(content)
  return parsed.success ? parsed.data : null
}

/**
 * Le curseur d'une adresse (?cursor=…), décodé pour une route : null sans curseur (la première
 * page), 'invalid' s'il ne veut rien dire. Un curseur invalide est refusé (400), comme toute autre
 * donnée invalide, plutôt que de renvoyer en silence la première page.
 */
export const readCursor = (cursor: string | undefined): CursorContent | null | 'invalid' => {
  if (cursor === undefined) return null
  return decodeCursor(cursor) ?? 'invalid'
}

/**
 * « Après le curseur », dans l'ordre des listes (date desc, identifiant desc). Une comparaison de
 * couples : (a, b) < (c, d) veut dire « a < c, ou bien a = c et b < d », comme on range des mots
 * par leur première lettre, puis par la deuxième en cas d'égalité. Ici : daté d'avant le dernier
 * élément de la page, ou du même instant avec un identifiant plus petit. L'identifiant départage
 * les ex aequo : sans lui, des éléments datés du même instant seraient perdus (ou répétés) d'une
 * page à l'autre.
 *
 * `at` et `id` sont les colonnes de la date et de l'identifiant : (published_at, id) pour un
 * projet, (created_at, id) pour une note ou un commentaire. PostgreSQL sait lire cette condition
 * directement dans l'index qui les range : il part du curseur et descend. La date et l'identifiant
 * viennent du client : ils n'entrent dans la requête que comme paramètres liés ($1, $2), envoyés à
 * part du texte SQL, donc jamais exécutés. La date passe par la colonne (sql.param(…, at)), qui
 * l'écrit comme elle écrit ses valeurs.
 */
export const after = (cursor: CursorContent, at: Column, id: Column): SQL =>
  sql`(${at}, ${id}) < (${sql.param(new Date(cursor.at), at)}::timestamp, ${cursor.id}::uuid)`
