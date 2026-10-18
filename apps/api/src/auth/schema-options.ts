// Les réglages de Better Auth qui changent la forme de la base de données.
// Ils sont partagés entre la vraie configuration (auth.ts) et le script qui génère les tables
// (scripts/auth-schema.config.ts) : ainsi, les deux ne peuvent pas se désaccorder.
import type { BetterAuthOptions } from 'better-auth'

export const authSchemaOptions = {
  user: {
    // Colonne en plus de celles que Better Auth prévoit : la langue du membre (e-mails, notifications).
    additionalFields: {
      language: { type: 'string', required: false, defaultValue: 'fr', input: true },
    },
  },
  // Les compteurs anti-abus (limitation de débit) sont gardés en base : ils survivent à un redémarrage.
  rateLimit: { storage: 'database' },
} satisfies BetterAuthOptions
