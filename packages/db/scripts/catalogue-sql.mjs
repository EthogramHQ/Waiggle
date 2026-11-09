// Fabrique le SQL du catalogue des outils (tranche R6b) à partir de `catalogue/tools.json` : les
// trois fonctions de repli que la migration 0016 utilise pour rattacher les anciennes étiquettes, puis
// l'insertion des outils et de leurs alias. Le SQL de la migration n'est jamais écrit à la main :
//
//   node packages/db/scripts/catalogue-sql.mjs        (écrit le SQL sur la sortie standard)
//
// Ce fichier n'écrit rien quand on l'importe (le test l'importe pour `literal`) ; il ne s'exécute
// que lancé directement. Il lit les règles de repli et d'adresse dans le contrat : une seule
// source, que le SQL reproduit (le test de la migration compare les deux).
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { SEARCH_FOLD } from '../../contracts/src/fold.ts'
import { TOOL_SLUG_MAX, toolSlug } from '../../contracts/src/slug.ts'

/**
 * Écrit un texte comme littéral SQL : entre apostrophes, chaque apostrophe doublée. Rien d'autre à
 * échapper : PostgreSQL (`standard_conforming_strings`, le réglage par défaut) lit la barre oblique
 * inverse et le saut de ligne tels quels. Le caractère NUL (code 0) n'existe pas en PostgreSQL :
 * on refuse plutôt que d'écrire un SQL tronqué (relecture de sécurité sec-B1).
 */
export const literal = (value) => {
  if (typeof value !== 'string') throw new TypeError('literal() reçoit un texte')
  if (value.includes(String.fromCodePoint(0)))
    throw new Error('un texte SQL ne contient pas de NUL')
  return `'${value.replaceAll("'", "''")}'`
}

/** Les caractères ASCII qui ne comptent pas pour reconnaître un outil (même plage que le contrat). */
const IGNORED_ASCII = /[\x20-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/g

/** Le même repli que `foldTool` du contrat (sans espaces ni ponctuation ASCII ; jamais vide). */
export const foldTool = (name) => {
  const text = name.trim().toLowerCase()
  let folded = ''
  for (const char of text) folded += SEARCH_FOLD[char] ?? char
  folded = folded.replace(IGNORED_ASCII, '')
  if (folded) return folded
  return Array.from(name.trim(), (char) => `u${char.codePointAt(0)?.toString(16)}`).join('')
}

/**
 * Les trois fonctions « temporaires » (elles disparaissent avec la connexion, la migration les efface
 * aussi) qui refont en SQL ce que `foldTool` et `toolSlug` (et sa borne) font en TypeScript, pour les libellés déjà
 * en base. Le texte du libellé n'est jamais collé dans le SQL : il arrive comme argument.
 * `translate` remplace chaque caractère de la liste « de » par celui de même rang dans la liste
 * « vers » ; `replace` s'occupe des lettres qui en donnent deux (œ, æ, ß).
 */
export const foldFunctionsSql = () => {
  const single = Object.entries(SEARCH_FOLD).filter(
    ([from, to]) => from.length === 1 && to.length === 1,
  )
  const double = Object.entries(SEARCH_FOLD).filter(([, to]) => to.length > 1)
  const from = single.map(([key]) => key).join('')
  const to = single.map(([, value]) => value).join('')
  let folded = `translate(lower(btrim(label)), ${literal(from)}::text, ${literal(to)}::text)`
  for (const [key, value] of double)
    folded = `replace(${folded}, ${literal(key)}::text, ${literal(value)}::text)`
  return [
    // La borne de l'adresse (sec-A1, `TOOL_SLUG_MAX` du contrat) : avant `r6b_slug`, qui l'appelle.
    `CREATE FUNCTION pg_temp.r6b_bound(slug text) RETURNS text LANGUAGE sql IMMUTABLE AS $r6b$
  SELECT CASE
    WHEN char_length(slug) <= ${TOOL_SLUG_MAX} THEN slug
    WHEN strpos(left(slug, ${TOOL_SLUG_MAX + 1}), '-') > 0 THEN regexp_replace(left(slug, ${TOOL_SLUG_MAX + 1}), '-[^-]*$', '')
    ELSE left(slug, ${TOOL_SLUG_MAX})
  END
$r6b$`,
    `CREATE FUNCTION pg_temp.r6b_fold(label text) RETURNS text LANGUAGE sql IMMUTABLE AS $r6b$
  SELECT CASE WHEN f.v <> '' THEN f.v ELSE (
    SELECT string_agg('u' || to_hex(ascii(c.ch)), '' ORDER BY c.n)
    FROM regexp_split_to_table(btrim(label), '') WITH ORDINALITY AS c(ch, n)
  ) END
  FROM (SELECT regexp_replace(${folded}, '[\\x20-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\x7e]', '', 'g') AS v) f
$r6b$`,
    `CREATE FUNCTION pg_temp.r6b_slug(label text) RETURNS text LANGUAGE sql IMMUTABLE AS $r6b$
  SELECT pg_temp.r6b_bound(CASE WHEN s.v <> '' THEN s.v ELSE (
    SELECT string_agg('u' || to_hex(ascii(c.ch)), '-' ORDER BY c.n)
    FROM regexp_split_to_table(btrim(label), '') WITH ORDINALITY AS c(ch, n)
  ) END)
  FROM (SELECT regexp_replace(regexp_replace(lower(regexp_replace(normalize(label, NFKD), '[\\u0300-\\u036f]', '', 'g')), '[^[:alnum:]]+', '-', 'g'), '^-+|-+$', '', 'g') AS v) s
$r6b$`,
  ]
}

/**
 * Les instructions qui sèment le catalogue : une pour les outils, une pour les alias. Les données
 * passent en JSON (un seul littéral, que `jsonb_to_recordset` déplie en lignes) : aucun texte du
 * fichier n'est du SQL. Le slug et le nom replié sont calculés ici, avec les mêmes règles que le
 * contrat. Une collision de slug donnerait un suffixe `-2` (jamais vu : le test l'écarterait).
 */
export const catalogueSql = (entries) => {
  const slugs = new Set()
  const tools = entries.map((entry) => {
    let slug = toolSlug(entry.name)
    for (let n = 2; slugs.has(slug); n++) slug = `${toolSlug(entry.name)}-${n}`
    slugs.add(slug)
    return {
      slug,
      name: entry.name,
      folded: foldTool(entry.name),
      family: entry.family,
      fr: entry.descriptionFr,
      en: entry.descriptionEn,
      site: entry.siteUrl,
    }
  })
  const aliases = entries.flatMap((entry) =>
    entry.aliases.map((alias) => ({ folded: foldTool(alias), tool: foldTool(entry.name) })),
  )
  return [
    `INSERT INTO "tool" ("id", "slug", "name", "folded", "status", "family", "description_fr", "description_en", "site_url", "created_at", "created_by", "admitted_at")
SELECT gen_random_uuid(), e.slug, e.name, e.folded, 'catalogue', e.family, e.fr, e.en, e.site, now(), NULL, now()
FROM jsonb_to_recordset(${literal(JSON.stringify(tools))}::jsonb) AS e(slug text, name text, folded text, family text, fr text, en text, site text)`,
    `INSERT INTO "tool_alias" ("folded", "tool_id")
SELECT a.folded, t.id
FROM jsonb_to_recordset(${literal(JSON.stringify(aliases))}::jsonb) AS a(folded text, tool text)
JOIN "tool" t ON t.folded = a.tool`,
  ]
}

/** Lancé directement : écrit les instructions, séparées comme dans une migration Drizzle. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const entries = JSON.parse(
    readFileSync(new URL('../catalogue/tools.json', import.meta.url), 'utf8'),
  )
  const statements = [...foldFunctionsSql(), ...catalogueSql(entries)]
  process.stdout.write(`${statements.join(';\n--> statement-breakpoint\n')};\n`)
}
