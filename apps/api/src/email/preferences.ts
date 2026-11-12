// Les réglages d'e-mail d'un membre (tranche 6c, R8), dans la table email_preference : les lire, les
// changer (Réglages → Notifications), les baisser depuis un lien de désinscription, et les exporter.
// Une ligne par membre, créée à la première écriture ; sans ligne, ce sont les valeurs par défaut (le
// récap activé, chaque type « Dans le récap »).
//
// R8 : un choix par type (`now`, `digest`, `never`). Jusqu'à R9, l'ancien interrupteur de 6c
// (`mention_emails`) est encore écrit en copie : vrai seulement quand « Réponses et mentions » passe à
// « Tout de suite » par les réglages, jamais remis à vrai par un lien (relecture du plan, sec-A1 et
// jur-2a). Un retour à la version d'avant R8 respecte ainsi les choix pris entre-temps.
import {
  DEFAULT_EMAIL_PREFERENCES,
  type DigestOnlyChoice,
  type EmailChoice,
  EmailPreferences,
  type EmailPreferencesExport,
  type EmailPreferencesPatch,
  type EmailType,
  INSTANT_EMAIL_TYPES,
  type UnsubscribeKind,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { eq } from 'drizzle-orm'

const t = schema.emailPreference

/** Les sept réglages, chacun avec sa colonne : le nom du contrat → la colonne de la table. */
const columns = {
  weeklyRecap: t.weeklyRecap,
  reactions: t.emailReactions,
  comments: t.emailComments,
  replies: t.emailReplies,
  follows: t.emailFollows,
  updates: t.emailUpdates,
  testers: t.emailTesters,
}

/**
 * Le « rang » d'un choix, pour savoir s'il baisse : « Tout de suite » au-dessus de « Dans le récap »,
 * au-dessus de « Jamais ». Seule une baisse laisse une trace dans le journal.
 */
const RANK: Record<EmailChoice, number> = { never: 0, digest: 1, now: 2 }

/**
 * Ce qu'un geste a baissé, pour la ligne de journal de la route (`Unsubscribe <id> …`) : le récap
 * coupé, un type passé à un choix plus bas, ou, pour un lien « tout de suite », tous les types qui
 * étaient « Tout de suite » d'un coup (`instant`).
 */
export type Lowered = { what: 'recap' } | { what: EmailType | 'instant'; to: DigestOnlyChoice }

/** Les colonnes à écrire pour des réglages donnés (seulement ceux qui sont présents). */
const columnValues = (values: Partial<EmailPreferences>) => ({
  ...(values.weeklyRecap !== undefined && { weeklyRecap: values.weeklyRecap }),
  ...(values.reactions !== undefined && { emailReactions: values.reactions }),
  ...(values.comments !== undefined && { emailComments: values.comments }),
  ...(values.replies !== undefined && { emailReplies: values.replies }),
  ...(values.follows !== undefined && { emailFollows: values.follows }),
  ...(values.updates !== undefined && { emailUpdates: values.updates }),
  ...(values.testers !== undefined && { emailTesters: values.testers }),
})

/**
 * Les réglages d'un membre, lus par la clé primaire ; les valeurs par défaut sans ligne. Les choix
 * sont du texte en base : `EmailPreferences.parse` vérifie qu'ils sont bien ceux du contrat (le
 * `check` de la table le garantit déjà, Zod le dit aussi au typage).
 *
 * `lock` : dans une transaction, « for update » verrouille la ligne jusqu'à la fin. Une seconde
 * demande au même moment attend, puis relit la valeur écrite par la première : la baisse notée au
 * journal est donc toujours la vraie.
 */
const readRow = async (db: Database, userId: string, lock: boolean) => {
  const query = db.select(columns).from(t).where(eq(t.userId, userId))
  const [row] = await (lock ? query.for('update') : query)
  return row ? EmailPreferences.parse(row) : DEFAULT_EMAIL_PREFERENCES
}

/** Les réglages d'un membre (GET /v1/me/email-preferences). */
export const readEmailPreferences = (db: Database, userId: string): Promise<EmailPreferences> =>
  readRow(db, userId, false)

/**
 * Change le seul réglage envoyé (le contrat n'en prend qu'un), puis rend les sept, et ce qui a
 * baissé. Une transaction : la lecture de l'ancienne valeur (verrouillée) et l'écriture forment un
 * tout, aucune autre demande ne passe entre les deux.
 *
 * L'écriture est un « upsert » (insert … on conflict do update) : la ligne naît à la première
 * modification, avec les valeurs par défaut pour le reste ; ensuite, seule la colonne envoyée change.
 * Si deux premières modifications arrivent en même temps, la seconde ne réécrit donc pas la colonne
 * de la première. `updated_at` note la modification par le membre (l'export la donne).
 */
export const updateEmailPreferences = async (
  db: Database,
  userId: string,
  patch: EmailPreferencesPatch,
  now: Date,
): Promise<{ preferences: EmailPreferences; lowered: Lowered[] }> => {
  // Chaque forme du contrat est un objet à un seul champ : vue comme un morceau des réglages.
  const change: Partial<EmailPreferences> = patch
  return db.transaction(async (tx) => {
    const before = await readRow(tx, userId, true)
    const after: EmailPreferences = { ...before, ...change }
    // La copie de 6c ne suit que « Réponses et mentions » : elle ne bouge que si ce réglage change.
    const legacy = change.replies !== undefined && { mentionEmails: change.replies === 'now' }
    await tx
      .insert(t)
      .values({
        userId,
        ...columnValues(after),
        mentionEmails: after.replies === 'now',
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: t.userId,
        set: { ...columnValues(change), ...legacy, updatedAt: now },
      })
    return { preferences: after, lowered: loweredBetween(before, after) }
  })
}

/** Ce qui a baissé d'un état à l'autre, type par type (le récap d'abord, puis l'ordre du contrat). */
const loweredBetween = (before: EmailPreferences, after: EmailPreferences): Lowered[] => {
  const types = ['reactions', 'comments', 'replies', 'follows', 'updates', 'testers'] as const
  return [
    ...(before.weeklyRecap && !after.weeklyRecap ? [{ what: 'recap' as const }] : []),
    ...types.flatMap((type) => {
      const to = after[type]
      // Une baisse ne mène jamais à « now » : `to` est forcément `digest` ou `never`.
      return RANK[to] < RANK[before[type]] && to !== 'now' ? [{ what: type, to }] : []
    }),
  ]
}

/** Ce que demande un lien de désinscription : sa sorte, `scope=all`, et le choix de la page. */
export type UnsubscribeRequest = {
  kind: UnsubscribeKind
  all: boolean
  /** Pour les types « Tout de suite » : `digest` sans choix (le « un clic » d'une messagerie). */
  choice: DigestOnlyChoice
}

/**
 * Baisse les réglages qu'un lien de désinscription vise, pour son membre. Ne rallume jamais rien :
 * - `recap` (ou `scope=all`) coupe le récap ;
 * - `instant` (ou `scope=all`) passe chaque type « Tout de suite » au choix donné ; un type sur
 *   « Dans le récap » ou « Jamais » ne bouge pas ;
 * - `mentions` (l'ancien lien de 6c) passe « Réponses et mentions » de « Tout de suite » à « Dans le
 *   récap », et seulement de là.
 * La copie de 6c (`mention_emails`) passe à faux quand « Réponses et mentions » quitte « Tout de
 * suite », et n'est jamais mise à vrai ici.
 *
 * Rend null si le membre n'existe pas (compte supprimé) : rien n'est créé. Sinon, ce qui a baissé
 * (une liste vide si rien ne visait un réglage encore haut : aucune écriture alors).
 *
 * Une transaction, en trois temps :
 * 1. le compte, lu avec « for key share » : un verrou léger qui empêche seulement sa suppression
 *    jusqu'à la fin, pour que l'insertion de la ligne ne heurte pas sa clé étrangère ;
 * 2. les réglages actuels, verrouillés (« for update ») ;
 * 3. l'écriture des seuls réglages qui changent.
 */
export const unsubscribeMember = async (
  db: Database,
  userId: string,
  { kind, all, choice }: UnsubscribeRequest,
  now: Date,
): Promise<Lowered[] | null> =>
  db.transaction(async (tx) => {
    const [member] = await tx
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .for('key share')
    if (!member) return null
    const before = await readRow(tx, userId, true)

    const change: Partial<EmailPreferences> = {}
    const lowered: Lowered[] = []
    if ((all || kind === 'recap') && before.weeklyRecap) {
      change.weeklyRecap = false
      lowered.push({ what: 'recap' })
    }
    if (all || kind === 'instant') {
      const instant = INSTANT_EMAIL_TYPES.filter((type) => before[type] === 'now')
      for (const type of instant) change[type] = choice
      if (instant.length > 0) lowered.push({ what: 'instant', to: choice })
    } else if (kind === 'mentions' && before.replies === 'now') {
      change.replies = 'digest'
      lowered.push({ what: 'replies', to: 'digest' })
    }
    if (lowered.length === 0) return lowered

    const after: EmailPreferences = { ...before, ...change }
    // Seulement vers faux : `replies` ne peut ici que quitter « Tout de suite ».
    const legacy = change.replies !== undefined && { mentionEmails: false }
    await tx
      .insert(t)
      .values({ userId, ...columnValues(after), mentionEmails: false, updatedAt: now })
      .onConflictDoUpdate({
        target: t.userId,
        set: { ...columnValues(change), ...legacy, updatedAt: now },
      })
    return lowered
  })

/** Le bloc « emailPreferences » de l'export des données : les réglages, les dates, jamais de jeton. */
export const exportEmailPreferences = async (
  db: Database,
  userId: string,
): Promise<EmailPreferencesExport> => {
  const [row] = await db
    .select({
      ...columns,
      recapSentAt: t.recapSentAt,
      recapUnvisited: t.recapUnvisited,
      instantSentAt: t.instantSentAt,
      updatedAt: t.updatedAt,
    })
    .from(t)
    .where(eq(t.userId, userId))
  return {
    ...(row ? EmailPreferences.parse(row) : DEFAULT_EMAIL_PREFERENCES),
    recapSentAt: row?.recapSentAt?.toISOString() ?? null,
    recapUnvisited: row?.recapUnvisited ?? 0,
    instantSentAt: row?.instantSentAt?.toISOString() ?? null,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  }
}
