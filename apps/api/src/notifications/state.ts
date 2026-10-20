// L'état des notifications d'un membre (tranche 6b), dans la table notification_state : jusqu'où
// il a vu ses notifications (seen_at), et depuis quand il a son pseudo (created_at, la date de sa
// première notification). La ligne naît avec le pseudo (handles/claim.ts) et part avec le compte
// (onDelete: 'cascade').
import { type Database, schema } from '@ruche/db'
import { eq, sql } from 'drizzle-orm'

const t = schema.notificationState

/** La dernière ouverture de l'écran des notifications (null : jamais), par la clé primaire. */
export const readSeenAt = async (db: Pick<Database, 'select'>, userId: string) => {
  const [row] = await db.select({ seenAt: t.seenAt }).from(t).where(eq(t.userId, userId))
  return row?.seenAt ?? null
}

/**
 * Crée la ligne d'un membre qui vient de recevoir son pseudo, datée de `now` ; ne fait rien si elle
 * existe déjà (« on conflict do nothing ») : la date de la première notification ne bouge plus.
 */
export const createNotificationState = async (db: Database, userId: string, now: Date) => {
  await db.insert(t).values({ userId, createdAt: now }).onConflictDoNothing()
}

/**
 * Note que le membre vient de choisir lui-même son pseudo (PATCH /v1/me, dans la transaction du
 * changement) : la notification « Ton pseudo est @… », qui parlait du pseudo reçu, disparaît
 * (source 6 de notifications/load.ts). Un « upsert » : la ligne existe presque toujours ; sinon
 * (un membre qui n'avait pas encore de pseudo), elle naît ici, déjà marquée « choisi ».
 */
export const markHandleChosen = async (db: Database, userId: string, now: Date) => {
  await db
    .insert(t)
    .values({ userId, createdAt: now, handleChosenAt: now })
    .onConflictDoUpdate({ target: t.userId, set: { handleChosenAt: now } })
}

/**
 * Marque vu tout ce qui est arrivé jusqu'à `upTo`, borné à `now` (l'heure du serveur : l'appli ne
 * peut pas marquer vu l'avenir). La date ne recule jamais : « greatest(ancienne, nouvelle) » garde
 * la plus récente des deux (et greatest ignore un null : jamais ouvert, la nouvelle date l'emporte).
 *
 * « insert … on conflict do update » (un « upsert ») : la ligne existe presque toujours ; sinon
 * (un membre dont le pseudo précède la tranche, avant le rattrapage du démarrage), elle est créée,
 * datée de maintenant comme le ferait ce rattrapage. « excluded » désigne la ligne qu'on voulait
 * insérer : la date arrive ainsi par la colonne, en paramètre lié, jamais écrite dans le SQL.
 */
export const markSeen = async (db: Database, userId: string, upTo: Date, now: Date) => {
  const seenAt = upTo > now ? now : upTo
  await db
    .insert(t)
    .values({ userId, seenAt, createdAt: now })
    .onConflictDoUpdate({
      target: t.userId,
      set: { seenAt: sql`greatest(${t.seenAt}, excluded.seen_at)` },
    })
}
