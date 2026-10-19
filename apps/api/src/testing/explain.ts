// Lire le SQL qu'écrit Drizzle, et le plan que PostgreSQL choisit pour l'exécuter. Outil de mise au
// point pour les tests : on vérifie ainsi qu'une liste lit un index au lieu de toute la table.
// Rien ici n'est utilisé en production.
//
// Usage, dans un test temporaire (à ne pas enregistrer) :
//   const ctx = await createTestContext()
//   … des données d'essai …
//   console.log(await explainQueries(ctx.db, () => loadComments(ctx.db, …)))
import type { Database } from '@ruche/db'

// Le strict nécessaire du client PGlite qui est derrière Drizzle dans les tests (db.$client).
// On le décrit ici plutôt que d'importer PGlite, qui n'est pas une dépendance de l'API.
type Client = {
  query: (sql: string, params?: unknown[], options?: unknown) => Promise<{ rows: unknown[] }>
  transaction: <T>(callback: (tx: Client) => Promise<T>) => Promise<T>
}

/** Une requête enregistrée, et le plan de PostgreSQL pour elle. */
export type ExplainedQuery = { sql: string; params: unknown[]; plan: string }

/**
 * Exécute `run`, enregistre chaque requête envoyée à la base (y compris dans une transaction),
 * puis demande son plan à PostgreSQL. Une lecture (select, with) passe par EXPLAIN ANALYZE : elle
 * est rejouée pour de vrai, avec les temps mesurés. Une écriture passe par EXPLAIN seul, qui ne
 * l'exécute pas une deuxième fois.
 */
export const explainQueries = async (
  db: Database,
  run: () => Promise<unknown>,
): Promise<ExplainedQuery[]> => {
  const client = (db as unknown as { $client: Client }).$client
  const recorded: { sql: string; params: unknown[] }[] = []

  // « Envelopper » une méthode : la remplacer par une version qui note la requête, puis appelle
  // l'originale. Une transaction reçoit son propre client (tx) : on l'enveloppe aussi.
  const record = (target: Client) => {
    const query = target.query.bind(target)
    target.query = (sql, params = [], options) => {
      recorded.push({ sql, params })
      return query(sql, params, options)
    }
  }
  const { query, transaction } = client
  record(client)
  client.transaction = <T>(callback: (tx: Client) => Promise<T>) =>
    // call() perd le type générique de la méthode : on rappelle ce qu'elle rend.
    transaction.call(client, (tx: Client) => {
      record(tx)
      return callback(tx)
    }) as Promise<T>
  try {
    await run()
  } finally {
    // Le client retrouve ses vraies méthodes, même si `run` a échoué.
    client.query = query
    client.transaction = transaction
  }

  const explained: ExplainedQuery[] = []
  for (const { sql, params } of recorded) {
    // begin, commit, savepoint… n'ont pas de plan ; et PGlite lit lui-même le catalogue des types
    // (pg_catalog) à la première requête : ce n'est pas une requête de l'appli.
    if (!/^\s*(select|with|insert|update|delete)\b/i.test(sql) || /pg_catalog\./.test(sql)) continue
    const analyze = /^\s*(select|with)\b/i.test(sql) ? 'analyze, ' : ''
    const { rows } = await client.query(`explain (${analyze}costs off) ${sql}`, params)
    const plan = (rows as { 'QUERY PLAN': string }[]).map((row) => row['QUERY PLAN']).join('\n')
    explained.push({ sql, params, plan })
  }
  return explained
}
