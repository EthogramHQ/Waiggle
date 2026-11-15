// La tâche des comptes inactifs (R11), chaque nuit : un compte sans visite depuis 3 ans est
// supprimé, après un e-mail un mois avant. Scénario : docs/scenarios/refonte.md, R11 ; relecture
// du plan : S-C1 (la ligne de journal), S-C2 (l'e-mail accepté avant la date notée, l'activité
// relue juste avant la suppression, une seule liste d'étapes), J3 (un e-mail de service).
//
// Pour chaque compte, deux dates (account/activity.ts les tient à jour à chaque visite) :
// - `last_active_at`, la dernière visite ;
// - `inactive_notice_at`, l'heure où l'e-mail est parti, ou rien.
// Puis trois cas :
// 1. visite il y a 3 ans moins 30 jours ou plus, aucun e-mail pour cette absence : l'e-mail part,
//    et sa date n'est notée qu'une fois l'envoi accepté par le prestataire. Un envoi refusé
//    repartira la nuit suivante ; sans e-mail parti, aucun compte n'est jamais supprimé ;
// 2. e-mail parti, et la date qu'il écrit est passée (inactiveDeletionDate) : le compte est
//    supprimé par la même suite d'étapes que « Supprimer mon compte » (account/delete.ts) ;
// 3. sinon, rien.
// Une visite efface l'e-mail noté : le compte repart pour 3 ans.
import { INACTIVE_ACCOUNT_YEARS, INACTIVE_NOTICE_DAYS } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { and, asc, eq, gt, lte, or } from 'drizzle-orm'
import { type DeletionOrigin, deleteAccount } from '../account/delete'
import { languageOfMember } from '../email/language'
import { inactiveAccountEmail } from '../email/templates'
import { BATCH_SIZE, type JobDeps, logMemberFailure } from './shared'

const DAY_MS = 24 * 60 * 60 * 1000
const NOTICE_MS = INACTIVE_NOTICE_DAYS * DAY_MS
const JOB = 'inactive-accounts'
/** Ce que les journaux d'une panne après la suppression disent de son origine (log.ts). */
const ORIGIN: DeletionOrigin = { method: 'JOB', path: JOB }

/**
 * La même date, tant d'années plus tard (ou plus tôt), en années du calendrier et en UTC : « 3 ans
 * après le 1er mars 2028 » est le 1er mars 2031, quel que soit le nombre de 29 février entre les
 * deux. Le 29 février d'une année bissextile devient le 1er mars (JavaScript reporte le jour qui
 * manque sur le mois suivant).
 */
const yearsAfter = (date: Date, years: number) => {
  const next = new Date(date)
  next.setUTCFullYear(next.getUTCFullYear() + years)
  return next
}

/** Le jour où l'e-mail doit partir : 3 ans moins 30 jours après la dernière visite. */
const warningDate = (lastActiveAt: Date) =>
  new Date(yearsAfter(lastActiveAt, INACTIVE_ACCOUNT_YEARS).getTime() - NOTICE_MS)

/**
 * La date de suppression, la seule fonction qui la calcule (J3) : la plus tardive de « 3 ans après
 * la dernière visite » et « 30 jours après l'e-mail ». Elle n'est jamais devancée : l'e-mail
 * l'écrit, et la tâche ne supprime pas avant. Un e-mail parti en retard (tâche arrêtée, sauvegarde
 * restaurée, prestataire en panne) donne toujours 30 jours entiers au membre.
 */
export const inactiveDeletionDate = (lastActiveAt: Date, noticeAt: Date) =>
  new Date(
    Math.max(
      yearsAfter(lastActiveAt, INACTIVE_ACCOUNT_YEARS).getTime(),
      noticeAt.getTime() + NOTICE_MS,
    ),
  )

type Activity = { lastActiveAt: Date; inactiveNoticeAt: Date | null }

/**
 * L'e-mail noté vaut-il pour cette absence ? Seulement s'il est parti après le jour où il devait
 * partir : une date plus ancienne (une sauvegarde restaurée, S-C1) ne compte pas, et l'e-mail
 * repart, plutôt que de supprimer un compte prévenu pour une autre absence.
 */
const noticeOf = ({ lastActiveAt, inactiveNoticeAt }: Activity) =>
  inactiveNoticeAt !== null && inactiveNoticeAt >= warningDate(lastActiveAt)
    ? inactiveNoticeAt
    : null

/** Ce compte est-il à supprimer à l'heure `now` ? E-mail parti pour cette absence, date passée. */
const dueForDeletion = (activity: Activity, now: Date) => {
  const notice = noticeOf(activity)
  return notice !== null && now >= inactiveDeletionDate(activity.lastActiveAt, notice)
}

/**
 * Prévient et supprime les comptes inactifs, à l'heure `now`. Rend le nombre d'e-mails partis et
 * de comptes supprimés (pg-boss ne garde que ces nombres, scheduler.ts).
 *
 * Les comptes sont lus par lots de 100, dans l'ordre de leur dernière visite, la plus ancienne
 * d'abord, puis de leur identifiant (une pagination par curseur : chaque lot reprend après le
 * dernier compte du précédent, jamais par `offset`, qui sauterait des comptes une fois d'autres
 * supprimés). La lecture suit l'index `user_last_active_idx` (last_active_at) : seuls les comptes
 * sans visite depuis près de 3 ans sont lus, jamais toute la table.
 */
export const inactiveAccounts = async (
  deps: JobDeps,
  now: Date,
): Promise<{ warned: number; deleted: number }> => {
  const { db, storage, secret } = deps
  // La suppression efface aussi des fichiers : sans stockage, elle ne doit pas partir à moitié.
  if (!storage) throw new Error('The inactive accounts job needs the file storage')
  // Le tri fin se fait en JavaScript (warningDate, années du calendrier) ; la base ne fait que
  // borner la lecture. « 3 ans avant » ne se calcule pas exactement à rebours (un 29 février), d'où
  // deux jours de marge : un compte lu de trop est simplement passé.
  const bound = new Date(
    yearsAfter(new Date(now.getTime() + NOTICE_MS), -INACTIVE_ACCOUNT_YEARS).getTime() + 2 * DAY_MS,
  )
  let warned = 0
  let deleted = 0
  let cursor: { lastActiveAt: Date; id: string } | null = null
  for (;;) {
    const page: {
      id: string
      email: string
      name: string
      language: string
      lastActiveAt: Date
      inactiveNoticeAt: Date | null
    }[] = await db
      .select({
        id: schema.user.id,
        email: schema.user.email,
        name: schema.user.name,
        language: schema.user.language,
        lastActiveAt: schema.user.lastActiveAt,
        inactiveNoticeAt: schema.user.inactiveNoticeAt,
      })
      .from(schema.user)
      .where(
        and(
          lte(schema.user.lastActiveAt, bound),
          // Une adresse jamais vérifiée ne reçoit rien : elle est peut-être celle d'un inconnu (une
          // faute de frappe), et la purge de nuit efface ces comptes bien avant 3 ans.
          eq(schema.user.emailVerified, true),
          cursor === null
            ? undefined
            : or(
                gt(schema.user.lastActiveAt, cursor.lastActiveAt),
                and(
                  eq(schema.user.lastActiveAt, cursor.lastActiveAt),
                  gt(schema.user.id, cursor.id),
                ),
              ),
        ),
      )
      .orderBy(asc(schema.user.lastActiveAt), asc(schema.user.id))
      .limit(BATCH_SIZE)
    for (const account of page) {
      if (now < warningDate(account.lastActiveAt)) continue
      try {
        if (noticeOf(account) === null) {
          await warn(deps, account, now)
          warned++
        } else if (dueForDeletion(account, now)) {
          if (await deleteIfStillInactive({ db, storage, secret }, account.id, now)) deleted++
        }
      } catch (error) {
        // Une panne sur un compte (l'envoi refusé, une étape de la suppression) : notée sans
        // l'adresse ni le message du prestataire (logMemberFailure), et la boucle continue.
        logMemberFailure(JOB, error)
      }
    }
    const last = page.at(-1)
    if (last === undefined || page.length < BATCH_SIZE) break
    cursor = { lastActiveAt: last.lastActiveAt, id: last.id }
  }
  return { warned, deleted }
}

/**
 * L'e-mail, puis sa date. Jamais l'inverse (S-C2) : une date notée avant un envoi refusé
 * ferait supprimer, 30 jours plus tard, un compte jamais prévenu. Le prix : deux passages
 * simultanés pourraient envoyer deux e-mails, ce que pg-boss empêche (une seule exécution à la
 * fois, politique « exclusive », scheduler.ts). Rien n'est envoyé dans une transaction.
 *
 * La date n'est notée que si la dernière visite est toujours celle qu'on a lue : un membre
 * revenu pendant l'envoi a déjà repris ses 3 ans (account/activity.ts), et une date notée
 * après sa visite le ferait supprimer malgré elle. `appUrl` sert au bouton et au pied.
 */
const warn = async (
  { db, mailer, appUrl }: Pick<JobDeps, 'db' | 'mailer' | 'appUrl'>,
  account: { id: string; email: string; name: string; language: string; lastActiveAt: Date },
  at: Date,
) => {
  const language = languageOfMember(account)
  await mailer.send({
    to: account.email,
    ...inactiveAccountEmail(language, {
      name: account.name,
      deleteOn: inactiveDeletionDate(account.lastActiveAt, at),
      appUrl,
    }),
  })
  await db
    .update(schema.user)
    .set({ inactiveNoticeAt: at })
    .where(and(eq(schema.user.id, account.id), eq(schema.user.lastActiveAt, account.lastActiveAt)))
}

/**
 * Relit l'activité du compte juste avant la première étape de la suppression (S-C2) : le membre a
 * pu revenir depuis la lecture du lot, pendant l'envoi d'un autre e-mail ou la suppression d'un
 * autre compte. Revenu, il est passé ; sinon, la suppression suit, et son adresse (relue elle
 * aussi) sert à effacer les compteurs qui en portent l'empreinte. Rend vrai si le compte est parti.
 *
 * Il reste un court instant entre cette lecture et l'effacement de la ligne, le temps des
 * premières étapes (commentaires, ruches) : une visite tombée là ne sauve pas le compte. Un membre
 * absent depuis 3 ans, prévenu depuis 30 jours, qui revient à cette seconde précise : le cas est
 * accepté plutôt que de verrouiller sa ligne pendant des étapes qui ont leurs propres transactions.
 */
const deleteIfStillInactive = async (
  deps: Parameters<typeof deleteAccount>[0],
  userId: string,
  now: Date,
) => {
  const [fresh] = await deps.db
    .select({
      email: schema.user.email,
      lastActiveAt: schema.user.lastActiveAt,
      inactiveNoticeAt: schema.user.inactiveNoticeAt,
    })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
  if (fresh === undefined || !dueForDeletion(fresh, now)) return false
  await deleteAccount(deps, { id: userId, email: fresh.email }, ORIGIN)
  return true
}
