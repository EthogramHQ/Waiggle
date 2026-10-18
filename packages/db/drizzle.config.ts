// Configuration de drizzle-kit, l'outil qui compare le schéma TypeScript à la dernière migration
// et écrit le SQL nécessaire pour passer de l'un à l'autre : pnpm --filter @ruche/db db:generate
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
})
