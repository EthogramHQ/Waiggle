// Configuration minimale, utilisée uniquement pour générer les tables d'authentification :
//   pnpm --filter @ruche/api auth:schema
// La commande écrit packages/db/src/schema/auth.ts. Ensuite : pnpm --filter @ruche/db db:generate
// pour produire la migration SQL correspondante.
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { drizzle } from 'drizzle-orm/node-postgres'
import { authSchemaOptions } from '../src/auth/schema-options'

export const auth = betterAuth({
  ...authSchemaOptions,
  // Aucune connexion n'est ouverte : la base sert seulement à connaître le dialecte (PostgreSQL).
  database: drizzleAdapter(drizzle('postgres://localhost/unused'), { provider: 'pg' }),
  emailAndPassword: { enabled: true },
})
