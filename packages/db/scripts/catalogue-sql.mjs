// Fabrique le SQL du catalogue des outils (tranche R6b) à partir de `catalogue/tools.json` : les
// trois fonctions de repli que la migration 0016 utilise pour rattacher les anciennes étiquettes, puis
// l'insertion des outils et de leurs alias ; et, depuis 0017, la mise à jour d'un catalogue déjà en
// base (plus bas, `catalogueUpdateSql`). Le SQL d'une migration n'est jamais écrit à la main :
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
 * Les lignes du catalogue telles que la base les range : pour chaque outil son adresse (slug), son
 * nom, son nom replié, sa famille, ses deux descriptions et son site ; pour chaque alias son nom
 * replié et le nom replié de son outil. Le slug et le nom replié sont calculés ici, avec les mêmes
 * règles que le contrat. Une collision de slug donnerait un suffixe `-2` (jamais vu : le test
 * l'écarterait).
 */
export const catalogueRows = (entries) => {
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
  return { tools, aliases }
}

/**
 * Les instructions qui sèment le catalogue (migration 0016) : une pour les outils, une pour les
 * alias. Les données passent en JSON (un seul littéral, que `jsonb_to_recordset` déplie en lignes) :
 * aucun texte du fichier n'est du SQL.
 */
export const catalogueSql = (entries) => {
  const { tools, aliases } = catalogueRows(entries)
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

// ─── La mise à jour d'un catalogue déjà en base (migration 0017 et suivantes) ───────────────────
//
// Une migration déployée ne change plus jamais (0016 est en production depuis le 9/11/2026). Quand
// Louis modifie tools.json, on ne réécrit donc pas 0016 : une nouvelle migration amène la base de
// l'état semé par la précédente à l'état du fichier. Le script compare les deux et n'écrit que
// l'écart : les outils ajoutés, renommés ou modifiés, les alias ajoutés ou déplacés, les alias
// retirés. Ce qui n'a pas bougé n'est pas réécrit (une description corrigée depuis par
// l'administration reste la sienne).

/**
 * Le catalogue qu'une migration a semé, relu dans son texte : les deux littéraux JSON de
 * `jsonb_to_recordset('…'::jsonb)` (les outils, puis les alias), apostrophes dédoublées.
 */
export const seededRows = (migration) => {
  const literals = [...migration.matchAll(/jsonb_to_recordset\('((?:[^']|'')*)'::jsonb\)/g)].map(
    (match) => JSON.parse(match[1].replaceAll("''", "'")),
  )
  if (literals.length !== 2) throw new Error('la migration ne sème pas le catalogue')
  const [tools, aliases] = literals
  return { tools, aliases }
}

/** Les champs d'un outil que tools.json décide (le slug suit le nom). */
const TOOL_FIELDS = ['name', 'family', 'fr', 'en', 'site']

/**
 * L'écart entre un catalogue déjà en base (`before`, les lignes de `catalogueRows`) et tools.json
 * (`entries`) :
 * - `tools` : les outils à écrire (ajoutés, ou dont un champ a changé), avec `former`, l'ancien nom
 *   replié d'un outil renommé. Un renommage se reconnaît ainsi : un outil quitte le catalogue et son
 *   nom devient l'alias d'un outil neuf (« Jetson Nano » devient l'alias de « NVIDIA Jetson »), comme
 *   le fait un renommage de l'administration. Un outil qui disparaît sans cela est refusé : ses
 *   projets perdraient leur outil, c'est une décision à prendre à part ;
 * - `aliases` : les alias ajoutés ou passés à un autre outil ;
 * - `dropped` : les noms repliés des alias retirés (« GPT » quitte ChatGPT pour devenir un outil).
 */
export const catalogueChanges = (before, entries) => {
  const after = catalogueRows(entries)
  const old = new Map(before.tools.map((tool) => [tool.folded, tool]))
  const current = new Set(after.tools.map((tool) => tool.folded))
  const aliasesOld = new Map(before.aliases.map((alias) => [alias.folded, alias.tool]))
  const aliasesNow = new Map(after.aliases.map((alias) => [alias.folded, alias.tool]))
  const former = new Map()
  for (const tool of before.tools) {
    if (current.has(tool.folded)) continue
    const heir = aliasesNow.get(tool.folded)
    if (heir === undefined || old.has(heir) || former.has(heir))
      throw new Error(`« ${tool.name} » quitte le catalogue sans devenir l'alias d'un outil neuf`)
    former.set(heir, tool.folded)
  }
  for (const tool of after.tools) {
    // La place des suffixes « -2 » qu'une adresse prise peut demander (sec-A1 : 120 au plus).
    if (tool.slug.length > TOOL_SLUG_MAX - 4) throw new Error(`adresse trop longue : ${tool.slug}`)
  }
  return {
    tools: after.tools
      .filter((tool) => {
        const was = old.get(tool.folded)
        return was === undefined || TOOL_FIELDS.some((field) => was[field] !== tool[field])
      })
      .map((tool) => ({ ...tool, former: former.get(tool.folded) ?? null })),
    aliases: after.aliases.filter((alias) => aliasesOld.get(alias.folded) !== alias.tool),
    dropped: [...aliasesOld.keys()].filter((folded) => !aliasesNow.has(folded)),
  }
}

/**
 * Les instructions qui amènent un catalogue déjà en base (`before`) à l'état de tools.json
 * (`entries`). Elles se rejouent sans rien changer (chaque étape cherche l'état qu'elle produit), et
 * ne supposent rien de la production : un membre a pu y taper « Llama » avant qu'il entre au
 * catalogue. Aucun texte de tools.json n'est collé dans le SQL : tout passe par des littéraux JSON.
 * Le journal de l'administration (`catalogue_change`) n'en garde pas trace : aucun administrateur
 * n'agit, le changement vit dans l'historique du dépôt.
 */
export const catalogueUpdateSql = (before, entries) => {
  const changes = catalogueChanges(before, entries)
  return [
    `-- Les outils à écrire, dans une table temporaire (elle disparaît avec la connexion ; on l'efface
-- aussi à la fin). « former » : l'ancien nom replié d'un outil renommé.
CREATE TEMP TABLE c17_tool AS
SELECT * FROM jsonb_to_recordset(${literal(JSON.stringify(changes.tools))}::jsonb)
  AS e(slug text, name text, folded text, family text, fr text, en text, site text, former text)`,
    `-- Les alias retirés de tools.json. D'abord, pour qu'un nom qui devient un outil (« GPT »)
-- n'existe jamais à la fois comme outil et comme alias (sec-A3). Les projets rattachés par cet
-- alias en 0016 gardent leur outil : on ne touche pas aux liens existants.
DELETE FROM "tool_alias"
WHERE "folded" IN (SELECT jsonb_array_elements_text(${literal(JSON.stringify(changes.dropped))}::jsonb))`,
    `-- Le rattachement d'un « Autre » (ou d'un outil écarté) à un outil du catalogue, recopié de
-- mergeTool (apps/api/src/catalogue/admin.ts) : chaque projet et chaque profil qui le citent citent
-- l'outil, sans doublon, à la place la plus haute des deux, sans nom tapé (sec-B8) ; son nom devient
-- un alias de l'outil, son adresse y mène, et l'« Autre » est effacé. Une fonction PL/pgSQL
-- (le langage de programmes de PostgreSQL) « temporaire » : elle vit dans pg_temp, le temps de la
-- connexion, et la migration l'efface à la fin.
CREATE FUNCTION pg_temp.c17_merge(from_id uuid, into_id uuid) RETURNS void LANGUAGE plpgsql AS $c17$
BEGIN
  UPDATE "project_tool" AS kept SET "position" = moved."position"
  FROM "project_tool" AS moved
  WHERE moved."tool_id" = from_id AND kept."tool_id" = into_id
    AND kept."project_id" = moved."project_id" AND moved."position" < kept."position";
  DELETE FROM "project_tool" AS moved
  WHERE moved."tool_id" = from_id AND EXISTS (SELECT 1 FROM "project_tool" AS kept
    WHERE kept."tool_id" = into_id AND kept."project_id" = moved."project_id");
  UPDATE "project_tool" SET "tool_id" = into_id, "label" = NULL WHERE "tool_id" = from_id;
  UPDATE "profile_tool" AS kept SET "position" = moved."position"
  FROM "profile_tool" AS moved
  WHERE moved."tool_id" = from_id AND kept."tool_id" = into_id
    AND kept."user_id" = moved."user_id" AND moved."position" < kept."position";
  DELETE FROM "profile_tool" AS moved
  WHERE moved."tool_id" = from_id AND EXISTS (SELECT 1 FROM "profile_tool" AS kept
    WHERE kept."tool_id" = into_id AND kept."user_id" = moved."user_id");
  UPDATE "profile_tool" SET "tool_id" = into_id, "label" = NULL WHERE "tool_id" = from_id;
  INSERT INTO "tool_alias" ("folded", "tool_id")
  SELECT "folded", into_id FROM "tool" WHERE "id" = from_id ON CONFLICT DO NOTHING;
  INSERT INTO "tool_slug_redirect" ("slug", "tool_id")
  SELECT "slug", into_id FROM "tool" WHERE "id" = from_id ON CONFLICT DO NOTHING;
  DELETE FROM "tool" WHERE "id" = from_id;
END
$c17$`,
    `-- La première adresse libre « base-2 », « base-3 »… : aucun outil (sauf « me ») ni aucune
-- ancienne adresse ne la porte (index unique de tool.slug, clé primaire des redirections). La
-- boucle s'arrête toujours : les outils sont en nombre fini.
CREATE FUNCTION pg_temp.c17_free_slug(base text, me uuid) RETURNS text LANGUAGE plpgsql AS $c17$
DECLARE
  n int := 1;
BEGIN
  LOOP
    n := n + 1;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM "tool" t WHERE t."slug" = base || '-' || n AND t."id" IS DISTINCT FROM me)
      AND NOT EXISTS (SELECT 1 FROM "tool_slug_redirect" r WHERE r."slug" = base || '-' || n);
  END LOOP;
  RETURN base || '-' || n;
END
$c17$`,
    `-- Chaque outil à écrire, un par un (un bloc DO est un petit programme que PostgreSQL exécute une
-- fois) :
-- 1. son outil du catalogue : celui qui porte son nom replié, sinon, pour un renommage, l'ancien ;
-- 2. un « Autre » (ou un outil écarté) du même nom replié, tapé par des membres depuis 0016 :
--    s'il n'y a pas d'outil, il ENTRE au catalogue sur place (le geste « Admettre » de
--    l'administration : mêmes projets, noms tapés effacés) ; s'il y en a un (un renommage vers un
--    nom déjà tapé), il y est RATTACHÉ (c17_merge) ;
-- 3. son adresse, pour un outil neuf, admis ou renommé : celle de tools.json. Un « Autre » qui la
--    porte (« Gemma ✨ » a l'adresse gemma) passe à la suivante libre : la page d'un « Autre »
--    n'existe pas (404), son adresse ne mène nulle part. Un outil du catalogue qui la porte la
--    garde, et le nouvel outil prend la suivante. Une ancienne adresse égale s'efface (une adresse
--    n'est jamais à la fois celle d'un outil et une redirection, sec-A2) ; renommé, l'outil garde
--    son ancienne adresse comme redirection, comme après un renommage de l'administration ;
-- 4. ses champs, tels que tools.json les donne.
DO $c17$
DECLARE
  e record;
  target uuid;
  old_slug text;
  renamed boolean;
  admitted boolean;
  other record;
  holder record;
  wanted text;
BEGIN
  FOR e IN SELECT * FROM c17_tool ORDER BY folded LOOP
    target := NULL;
    old_slug := NULL;
    renamed := false;
    admitted := false;
    SELECT t."id", t."slug" INTO target, old_slug FROM "tool" t
    WHERE t."status" = 'catalogue' AND t."folded" = e.folded;
    IF target IS NULL AND e.former IS NOT NULL THEN
      SELECT t."id", t."slug" INTO target, old_slug FROM "tool" t
      WHERE t."status" = 'catalogue' AND t."folded" = e.former;
      renamed := target IS NOT NULL;
    END IF;
    SELECT t."id", t."slug" INTO other FROM "tool" t
    WHERE t."status" <> 'catalogue' AND t."folded" = e.folded;
    IF other.id IS NOT NULL AND target IS NULL THEN
      target := other.id;
      old_slug := other.slug;
      admitted := true;
      UPDATE "tool" SET "status" = 'catalogue', "admitted_at" = now() WHERE "id" = target;
      UPDATE "project_tool" SET "label" = NULL WHERE "tool_id" = target;
      UPDATE "profile_tool" SET "label" = NULL WHERE "tool_id" = target;
    ELSIF other.id IS NOT NULL THEN
      PERFORM pg_temp.c17_merge(other.id, target);
    END IF;
    IF target IS NULL OR renamed OR admitted THEN
      wanted := e.slug;
      SELECT t."id", t."status" INTO holder FROM "tool" t
      WHERE t."slug" = e.slug AND t."id" IS DISTINCT FROM target;
      IF holder.id IS NOT NULL AND holder.status = 'catalogue' THEN
        wanted := pg_temp.c17_free_slug(e.slug, target);
      ELSIF holder.id IS NOT NULL THEN
        UPDATE "tool" SET "slug" = pg_temp.c17_free_slug(e.slug, holder.id) WHERE "id" = holder.id;
      END IF;
      DELETE FROM "tool_slug_redirect" WHERE "slug" = wanted;
      IF target IS NULL THEN
        INSERT INTO "tool" ("id", "slug", "name", "folded", "status", "family", "description_fr", "description_en", "site_url", "created_at", "created_by", "admitted_at")
        VALUES (gen_random_uuid(), wanted, e.name, e.folded, 'catalogue', e.family, e.fr, e.en, e.site, now(), NULL, now())
        RETURNING "id" INTO target;
      ELSE
        UPDATE "tool" SET "slug" = wanted WHERE "id" = target;
        IF renamed AND old_slug <> wanted THEN
          INSERT INTO "tool_slug_redirect" ("slug", "tool_id") VALUES (old_slug, target) ON CONFLICT DO NOTHING;
        END IF;
      END IF;
    END IF;
    UPDATE "tool" SET "name" = e.name, "folded" = e.folded, "family" = e.family,
      "description_fr" = e.fr, "description_en" = e.en, "site_url" = e.site
    WHERE "id" = target;
  END LOOP;
END
$c17$`,
    `-- Les alias ajoutés ou déplacés. « ON CONFLICT … DO UPDATE » : un alias qui existe déjà (sa clé
-- primaire est son nom replié) change d'outil au lieu d'arrêter la migration ; c'est ce qui permet
-- à un alias de passer d'un outil à un autre en une seule instruction.
INSERT INTO "tool_alias" ("folded", "tool_id")
SELECT a.folded, t."id"
FROM jsonb_to_recordset(${literal(JSON.stringify(changes.aliases))}::jsonb) AS a(folded text, tool text)
JOIN "tool" t ON t."folded" = a.tool AND t."status" = 'catalogue'
ON CONFLICT ("folded") DO UPDATE SET "tool_id" = excluded."tool_id"`,
    `-- Un « Autre » (ou un outil écarté) dont le nom est désormais l'alias d'un outil du catalogue
-- (« Meta Llama ») y est rattaché : sinon qui tape « Meta Llama » retrouverait l'« Autre », que la
-- recherche par nom replié trouve avant les alias (tools/resolve.ts). Tous les alias, pas seulement
-- les neufs : la migration se rejoue sur n'importe quelle base.
DO $c17$
DECLARE
  o record;
BEGIN
  FOR o IN
    SELECT x."id" AS from_id, a."tool_id" AS into_id
    FROM "tool" x
    JOIN "tool_alias" a ON a."folded" = x."folded"
    JOIN "tool" c ON c."id" = a."tool_id" AND c."status" = 'catalogue'
    WHERE x."status" <> 'catalogue'
    ORDER BY x."folded"
  LOOP
    PERFORM pg_temp.c17_merge(o.from_id, o.into_id);
  END LOOP;
END
$c17$`,
    `-- Un alias égal au nom d'un outil ne sert plus à rien (le nom suffit, sec-A3) : celui qu'un
-- rattachement vers un outil renommé aurait laissé.
DELETE FROM "tool_alias" a USING "tool" t WHERE t."folded" = a."folded"`,
    `-- On range.
DROP TABLE c17_tool`,
    'DROP FUNCTION pg_temp.c17_merge(uuid, uuid)',
    'DROP FUNCTION pg_temp.c17_free_slug(text, uuid)',
  ]
}

/** Les instructions, séparées comme dans une migration Drizzle. */
const asMigration = (statements) => `${statements.join(';\n--> statement-breakpoint\n')};\n`

/** Le texte d'une option de la ligne de commande (`--since 0016_r6b_tools`), ou undefined. */
const option = (name) => {
  const at = process.argv.indexOf(name)
  return at === -1 ? undefined : process.argv[at + 1]
}

/**
 * Lancé directement : écrit les instructions sur la sortie standard.
 *
 *   node packages/db/scripts/catalogue-sql.mjs                          (le semis, comme en 0016)
 *   node packages/db/scripts/catalogue-sql.mjs --since 0016_r6b_tools   (l'écart depuis 0016)
 *   node packages/db/scripts/catalogue-sql.mjs --before ancien.json     (l'écart depuis ce fichier)
 *
 * `--since` relit le catalogue semé par la migration nommée (ainsi est née 0017_catalogue_llms.sql,
 * dans une migration vide créée par `db:generate --custom --name …`). 0017 ne sème pas : pour la
 * mise à jour suivante, l'état d'avant est le tools.json de la dernière migration du catalogue,
 * qu'on tire de Git (`git show <commit>:packages/db/catalogue/tools.json > ancien.json`) et qu'on
 * passe par `--before`.
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
  const entries = JSON.parse(read('../catalogue/tools.json'))
  const since = option('--since')
  const previous = option('--before')
  if (since === undefined && previous === undefined) {
    process.stdout.write(asMigration([...foldFunctionsSql(), ...catalogueSql(entries)]))
  } else {
    const before =
      since === undefined
        ? catalogueRows(JSON.parse(readFileSync(previous, 'utf8')))
        : seededRows(read(`../migrations/${since}.sql`))
    process.stdout.write(
      `-- Le catalogue d'outils suit tools.json : cette migration amène une base qui a passé les
-- précédentes à l'état du fichier, sans toucher aux liens des projets et des profils, sauf pour
-- rattacher un « Autre » déjà tapé à l'outil du catalogue qui prend son nom ou son alias. Une
-- migration déployée ne change plus : chaque changement du catalogue a la sienne.
-- Écrite par : node packages/db/scripts/catalogue-sql.mjs ${since === undefined ? '--before …' : `--since ${since}`}
-- Ne pas la modifier à la main : la régénérer. Aucune table ne change (instantané inchangé).
${asMigration(catalogueUpdateSql(before, entries))}`,
    )
  }
}
