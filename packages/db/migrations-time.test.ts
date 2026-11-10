// Garde des heures écrites par les migrations. Les colonnes de dates sont des `timestamp` sans
// fuseau qui contiennent l'heure UTC (l'API les écrit avec l'horloge de JavaScript). En SQL,
// `now()` donne un instant avec fuseau ; rangé dans une colonne sans fuseau, il est converti à
// l'heure du fuseau de la connexion : UTC sur le serveur aujourd'hui, mais Paris dans un `psql`
// lancé autrement, et la date serait décalée d'une ou deux heures sans que rien ne le signale.
// Une migration écrit donc `now() at time zone 'UTC'` (l'heure UTC, sans fuseau), jamais `now()`
// seul, ni `DEFAULT now()` (ce que Drizzle produit pour `defaultNow()`).
//
// Les migrations 0000 à 0018 sont déjà passées en production : on ne les réécrit pas (Drizzle
// vérifie leur empreinte), la règle vaut à partir de la suivante (relecture de sécurité de R7a).
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const folder = new URL('./migrations/', import.meta.url)
// La dernière migration écrite avant la règle.
const LAST_BEFORE_RULE = 18

const later = readdirSync(folder)
  .filter((name) => /^\d{4}_.*\.sql$/.test(name))
  .filter((name) => Number(name.slice(0, 4)) > LAST_BEFORE_RULE)

/** Les `now()` d'un texte SQL qui ne sont pas suivis de `at time zone 'UTC'`. */
function bareNows(text: string): string[] {
  // Les commentaires SQL (« -- … » jusqu'au bout de la ligne) ne comptent pas.
  const code = text.replace(/--.*$/gm, '')
  return [...code.matchAll(/now\(\)(?!\s+at\s+time\s+zone\s+'utc')/gi)].map((match) =>
    code.slice(Math.max(0, match.index - 30), match.index + 10).trim(),
  )
}

describe('the time written by migrations', () => {
  it('spots a bare now() and accepts the UTC one', () => {
    expect(bareNows(`UPDATE "x" SET "at" = now();`)).toHaveLength(1)
    expect(bareNows(`"created_at" timestamp DEFAULT now() NOT NULL`)).toHaveLength(1)
    expect(bareNows(`UPDATE "x" SET "at" = now() at time zone 'UTC';`)).toEqual([])
    expect(bareNows(`DEFAULT (NOW() AT TIME ZONE 'utc')`)).toEqual([])
    expect(bareNows(`-- daté de now(), en UTC`)).toEqual([])
  })

  it.each(later.length > 0 ? later : ['(aucune migration après 0018)'])(
    'writes UTC time in %s, never a bare now()',
    (name) => {
      if (!name.endsWith('.sql')) return
      expect(bareNows(readFileSync(new URL(name, folder), 'utf8'))).toEqual([])
    },
  )
})
