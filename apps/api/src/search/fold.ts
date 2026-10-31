// Le « repli » des accents et des majuscules, écrit en SQL (tranche R3) : la même table que
// l'appli (`SEARCH_FOLD` du contrat), pour que « eleve » trouve « Élève » côté base comme côté
// écran. Sans extension PostgreSQL (unaccent) : la même chose tourne en production et sous PGlite,
// sans migration.
import { SEARCH_FOLD } from '@ruche/contracts'
import { type Column, type SQL, sql } from 'drizzle-orm'

// La table, coupée en deux. Les entrées d'un caractère vers un caractère (« é » → « e ») vont
// dans un seul `translate`, qui remplace chaque caractère de FROM par celui de TO à la même place.
// Les autres (« œ » → « oe », « ß » → « ss ») ne tiennent pas dans translate : un `replace` chacune.
// `[...from]` compte les caractères (et non les unités UTF-16, que compte `.length`).
const entries = Object.entries(SEARCH_FOLD)
const oneToOne = entries.filter(([from, to]) => [...from].length === 1 && [...to].length === 1)
const FROM = oneToOne.map(([from]) => from).join('')
const TO = oneToOne.map(([, to]) => to).join('')
const expansions = entries.filter(([from, to]) => !([...from].length === 1 && [...to].length === 1))
/**
 * Le texte replié d'une colonne (ou d'une expression), en SQL :
 *   replace(replace(…(translate(lower(col), $from, $to), 'œ', 'oe')…), 'ß', 'ss')
 * `lower` d'abord (relecture de sécurité, sec-A2) : il met en minuscules ce que la base sait
 * replier, puis `translate` replie les accentuées, majuscules comprises (dans une base en locale
 * « C », comme PGlite, `lower` ne touche que l'ASCII ; la table a donc aussi « É » → « e »).
 * FROM, TO et chaque `replace` passent par des paramètres liés, jamais collés dans le texte SQL
 * (sec-A1) : TO contient une apostrophe, qui fermerait une chaîne SQL écrite à la main.
 * `::text` dit à PostgreSQL le type de chaque paramètre, qu'il ne peut pas deviner seul.
 *
 * Le coût (mesuré sous PGlite pour la relecture sec-B3, 500 descriptions de 10 000 caractères) :
 * presque tout vient de `translate`, qui compare chaque caractère du texte à chacun des 57 de
 * FROM (1,6 s ; `lower` seul : 0,07 s ; les six `replace` : moins de 0,05 s).
 */
export const foldSql = (value: Column | SQL): SQL => {
  let folded = sql`translate(lower(${value}), ${FROM}::text, ${TO}::text)`
  for (const [from, to] of expansions) folded = sql`replace(${folded}, ${from}::text, ${to}::text)`
  return folded
}

/**
 * « Ce texte replié contient ce mot » : `strpos(texte, mot)` rend la position du mot (1 pour le
 * début), 0 s'il est absent. Contrairement à `like`, il compare le mot tel quel : « % » et « _ »
 * n'y sont pas des jokers, et il n'y a rien à échapper. Le mot (déjà replié par `searchWords`)
 * est un paramètre lié. Il n'est jamais vide (`searchWords` écarte les mots de moins de 2
 * lettres) : `strpos(x, '')` vaudrait 1 et trouverait tout (sec-B2).
 */
export const contains = (folded: SQL, word: string): SQL => sql`strpos(${folded}, ${word}) > 0`
