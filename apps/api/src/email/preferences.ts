// Les réglages d'e-mail d'un membre (tranche 6c), dans la table email_preference : les lire, les
// changer (Mon profil), les couper depuis un lien de désinscription, et les exporter. Une ligne par
// membre, créée à la première écriture ; sans ligne, ce sont les valeurs par défaut (le récap
// activé, l'e-mail de mentions coupé).
import {
  DEFAULT_EMAIL_PREFERENCES,
  type EmailPreferences,
  type EmailPreferencesExport,
  type EmailPreferencesUpdate,
  type UnsubscribeKind,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { utc } from '../notifications/load'

const t = schema.emailPreference

/** Les deux réglages d'un membre, par la clé primaire ; les valeurs par défaut sans ligne. */
export const readEmailPreferences = async (
  db: Database,
  userId: string,
): Promise<EmailPreferences> => {
  const [row] = await db
    .select({ weeklyRecap: t.weeklyRecap, mentionEmails: t.mentionEmails })
    .from(t)
    .where(eq(t.userId, userId))
  return row ?? DEFAULT_EMAIL_PREFERENCES
}

/**
 * Change les réglages envoyés, et eux seuls, puis rend les deux. Un « upsert » (insert … on
 * conflict do update) : la ligne naît à la première modification, avec la valeur par défaut pour le
 * réglage qui n'a pas été envoyé ; ensuite, seul ce qui est envoyé change. `updated_at` note la
 * modification par le membre (l'export la donne).
 */
export const updateEmailPreferences = async (
  db: Database,
  userId: string,
  update: EmailPreferencesUpdate,
  now: Date,
): Promise<EmailPreferences> => {
  const [row] = await db
    .insert(t)
    .values({
      userId,
      weeklyRecap: update.weeklyRecap ?? DEFAULT_EMAIL_PREFERENCES.weeklyRecap,
      mentionEmails: update.mentionEmails ?? DEFAULT_EMAIL_PREFERENCES.mentionEmails,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: t.userId,
      set: {
        ...(update.weeklyRecap !== undefined && { weeklyRecap: update.weeklyRecap }),
        ...(update.mentionEmails !== undefined && { mentionEmails: update.mentionEmails }),
        updatedAt: now,
      },
    })
    .returning({ weeklyRecap: t.weeklyRecap, mentionEmails: t.mentionEmails })
  return row ?? DEFAULT_EMAIL_PREFERENCES
}

/**
 * Coupe une sorte d'e-mail (ou les deux avec `all`) pour le membre d'un lien de désinscription.
 * Ne rallume jamais rien : « ancienne valeur ET nouvelle » ne peut que passer de vrai à faux.
 * Rend false si le membre n'existe pas (compte supprimé) : rien n'est créé.
 *
 * Une seule requête : la ligne à insérer vient de « select … from "user" where id = $1 ». Pour un
 * compte qui n'existe plus, ce select ne rend rien, donc rien n'est inséré (et aucune erreur de clé
 * étrangère) ; « returning » ne rend alors aucune ligne. La date entre par utc() (paramètre lié).
 */
export const unsubscribeMember = async (
  db: Database,
  userId: string,
  kind: UnsubscribeKind,
  all: boolean,
  now: Date,
) => {
  const keepRecap = !(all || kind === 'recap')
  const keepMentions = !(all || kind === 'mentions')
  const result = await db.execute(sql`
    insert into email_preference (user_id, weekly_recap, mention_emails, updated_at)
    select u.id, ${keepRecap}::boolean, false, ${utc(now)} from "user" u where u.id = ${userId}
    on conflict (user_id) do update set
      weekly_recap = email_preference.weekly_recap and ${keepRecap}::boolean,
      mention_emails = email_preference.mention_emails and ${keepMentions}::boolean,
      updated_at = excluded.updated_at
    returning user_id
  `)
  return (
    z.object({ rows: z.array(z.object({ user_id: z.string() })) }).parse(result).rows.length > 0
  )
}

/** Le bloc « emailPreferences » de l'export des données : les réglages, les dates, jamais de jeton. */
export const exportEmailPreferences = async (
  db: Database,
  userId: string,
): Promise<EmailPreferencesExport> => {
  const [row] = await db.select().from(t).where(eq(t.userId, userId))
  return {
    weeklyRecap: row?.weeklyRecap ?? DEFAULT_EMAIL_PREFERENCES.weeklyRecap,
    mentionEmails: row?.mentionEmails ?? DEFAULT_EMAIL_PREFERENCES.mentionEmails,
    recapSentAt: row?.recapSentAt?.toISOString() ?? null,
    recapUnvisited: row?.recapUnvisited ?? 0,
    mentionSentAt: row?.mentionSentAt?.toISOString() ?? null,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  }
}
