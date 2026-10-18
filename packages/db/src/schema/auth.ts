// Tables de l'authentification, générées par Better Auth (`pnpm --filter @ruche/api auth:schema`)
// puis commentées. Drizzle décrit chaque table en TypeScript : pgTable('nom', { colonnes }).
// Ne pas modifier la forme à la main sans régénérer : Better Auth s'attend exactement à celle-ci.
import { relations } from 'drizzle-orm'
import { bigint, boolean, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// Les membres. Le mot de passe n'est PAS ici : il est dans `account`, chiffré (haché).
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(), // unique : deux comptes ne peuvent pas partager une adresse
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date()) // mis à jour automatiquement à chaque modification
    .notNull(),
  // Ajouté par Ruche : langue des e-mails et notifications ('fr' ou 'en').
  language: text('language').default('fr').notNull(),
})

// Les sessions : une par appareil connecté. Le `token` est le badge que l'appli présente
// à chaque requête pour prouver qui elle est.
export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    // « Clé étrangère » : chaque session appartient à un membre.
    // onDelete: 'cascade' : si le membre est supprimé, ses sessions le sont aussi, automatiquement.
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  // Un « index » accélère les recherches par userId, comme l'index à la fin d'un livre.
  (table) => [index('session_userId_idx').on(table.userId)],
)

// Les façons de se connecter d'un membre : e-mail + mot de passe aujourd'hui, peut-être Google
// ou Apple plus tard. `password` contient une empreinte du mot de passe, jamais le mot de passe lui-même.
export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
)

// Les jetons temporaires : lien de vérification de l'e-mail, réinitialisation du mot de passe…
export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
)

// Compteurs anti-abus : combien de tentatives une même adresse IP a faites sur une route.
export const rateLimit = pgTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
})

// Les « relations » décrivent les liens entre tables pour les requêtes Drizzle
// (par exemple : récupérer un membre avec toutes ses sessions en une fois).
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}))
