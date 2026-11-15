// Les accords d'un membre aux règles (tranche R11), lus dans la table rules_acceptance : a-t-il
// accepté la version en vigueur (le profil `Me`, la garde des écritures), et tous ses accords
// (l'export de ses données). Les écritures (l'inscription, l'écran « Accepter ») sont ailleurs.
import { RULES_CHANGES, RULES_VERSION, type RulesAcceptance } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, eq } from 'drizzle-orm'

const t = schema.rulesAcceptance

/**
 * Vrai si le membre a accepté la version des règles en vigueur. Une seule ligne au plus, trouvée
 * par la clé primaire (user_id, version) : la recherche ne lit rien d'autre.
 */
export const hasAcceptedRules = async (db: Database, userId: string): Promise<boolean> => {
  const [row] = await db
    .select({ version: t.version })
    .from(t)
    .where(and(eq(t.userId, userId), eq(t.version, RULES_VERSION)))
    .limit(1)
  return row !== undefined
}

/**
 * Ce que le profil `Me` dit des règles : la version en vigueur acceptée ou non, et « Ce qui
 * change » (les clés de texte de RULES_CHANGES), montré seulement à qui ne l'a pas encore acceptée.
 * `[...RULES_CHANGES]` : une copie, le contrat attend un tableau modifiable (`string[]`).
 */
export const rulesStateOf = async (
  db: Database,
  userId: string,
): Promise<{ rulesAccepted: boolean; rulesChanges: string[] }> => {
  const rulesAccepted = await hasAcceptedRules(db, userId)
  return { rulesAccepted, rulesChanges: rulesAccepted ? [] : [...RULES_CHANGES] }
}

/**
 * Tous les accords du membre, des plus anciens aux plus récents (l'export : l'historique entier est
 * la preuve). La clé primaire, par sa première colonne (user_id), trouve ses lignes ; elles sont peu
 * nombreuses (une par version), le tri se fait sans index. La version en second : deux accords à la
 * même seconde gardent un ordre stable.
 */
export const rulesAcceptancesOf = async (
  db: Database,
  userId: string,
): Promise<RulesAcceptance[]> => {
  const rows = await db
    .select({ version: t.version, acceptedAt: t.acceptedAt })
    .from(t)
    .where(eq(t.userId, userId))
    .orderBy(asc(t.acceptedAt), asc(t.version))
  // `ageDeclared: true` : la base refuse toute autre valeur (check rules_acceptance_age_declared_check).
  return rows.map((row) => ({
    version: row.version,
    acceptedAt: row.acceptedAt.toISOString(),
    ageDeclared: true,
  }))
}
