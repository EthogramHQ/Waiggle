// L'écriture d'un accord aux règles (tranche R11) : la ligne de rules_acceptance, posée à
// l'inscription (auth/auth.ts) et par l'écran « Accepter » (routes/rules.ts). Les lectures sont dans
// rules/acceptance.ts.
import { RULES_VERSION } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'

/**
 * Note que le membre accepte la version des règles en vigueur, à l'heure `now` de l'API. La
 * version vient toujours du serveur (RULES_VERSION), jamais de la demande : une page ancienne ne
 * peut pas faire accepter une autre version que celle-ci. `ageDeclared: true` : on ne garde un
 * accord que si le membre a déclaré avoir 15 ans ou plus (la base refuse toute autre valeur).
 *
 * `on conflict do nothing` : si la clé primaire (user_id, version) existe déjà, PostgreSQL n'écrit
 * rien, sans erreur. Accepter deux fois la même version garde donc la date du premier accord, la
 * seule qui prouve quand il a été donné ; deux demandes simultanées n'en écrivent qu'une.
 */
export const acceptCurrentRules = async (db: Database, userId: string, now: Date) => {
  await db
    .insert(schema.rulesAcceptance)
    .values({ userId, version: RULES_VERSION, acceptedAt: now, ageDeclared: true })
    .onConflictDoNothing()
}
