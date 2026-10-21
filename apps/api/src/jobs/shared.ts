// Ce que partagent les tâches planifiées des e-mails (tranche 6c) : ce qu'elles reçoivent, les
// adresses des liens d'un e-mail, la lecture des dates et le journal d'un échec.
//
// Une tâche est une fonction ordinaire, (deps, now) : l'ordonnanceur (pg-boss, scheduler.ts) ne
// fait que l'appeler, et les tests l'appellent eux-mêmes sur PGlite, à l'heure qu'ils choisissent.
// L'heure vient toujours du paramètre `now`, jamais de now() en SQL ni de l'horloge de pg-boss.
import type { UnsubscribeKind } from '@ruche/contracts'
import type { Database } from '@ruche/db'
import { z } from 'zod'
import type { Mailer } from '../email/mailer'
import type { NotificationLinks } from '../email/templates'
import { createUnsubscribeToken } from '../email/unsubscribe-token'
import { describeError } from '../log'

export type JobDeps = {
  db: Database
  mailer: Mailer
  /** L'adresse de l'appli web (le bouton, la page de désinscription, Mon profil). */
  appUrl: string
  /** L'adresse publique de l'API (la désinscription en un clic de la messagerie). */
  apiUrl: string
  /** BETTER_AUTH_SECRET : la clé des jetons de désinscription en est dérivée. */
  secret: string
}

/** Les membres sont lus par lots de 100 : la mémoire et la durée d'une requête restent bornées. */
export const BATCH_SIZE = 100

/** Les liens d'un e-mail de notification : tous chez nous, avec le jeton signé de ce membre. */
export const linksFor = (
  { appUrl, apiUrl, secret }: JobDeps,
  userId: string,
  kind: UnsubscribeKind,
): NotificationLinks => {
  const query = new URLSearchParams({ token: createUnsubscribeToken(secret, userId, kind) })
  return {
    button: new URL('/notifications', appUrl).toString(),
    unsubscribe: `${new URL('/unsubscribe', appUrl)}?${query}`,
    manage: new URL('/profile', appUrl).toString(),
    oneClick: `${new URL('/v1/email/unsubscribe', apiUrl)}?${query}`,
  }
}

/**
 * Une date lue par SQL brut (to_char, en UTC : « 2026-06-15T08:00:00.000Z ») ; null reste null.
 * db.execute rend les colonnes sans les convertir : on demande un texte ISO, puis on le relit.
 */
export const isoDate = z
  .string()
  .nullable()
  .transform((value) => (value === null ? null : new Date(value)))

/** La plus récente des dates données (les null ne comptent pas). */
export const latest = (...dates: (Date | null)[]) =>
  new Date(Math.max(...dates.map((date) => date?.getTime() ?? Number.NEGATIVE_INFINITY)))

/**
 * Note l'échec d'un membre dans les journaux, sans son adresse ni rien de ce qui a été écrit :
 * describeError (log.ts) garde la nature de l'erreur et l'endroit du code, jamais le message (celui
 * d'un prestataire d'e-mail peut recopier l'adresse). La boucle continue avec les autres membres.
 */
export const logMemberFailure = (job: string, error: unknown) => {
  console.error(`Job ${job}: one member failed`, describeError(error, { method: 'JOB', path: job }))
}

/**
 * Le code PostgreSQL 23503 (« clé étrangère violée ») : le compte a été supprimé entre la lecture
 * des candidats et l'écriture de la date d'envoi. Rien ne part, et ce n'est pas une panne.
 */
export const isDeletedMember = (error: unknown) => {
  const codeOf = (value: unknown) =>
    typeof value === 'object' && value !== null && 'code' in value ? value.code : undefined
  return codeOf(error) === '23503' || (error instanceof Error && codeOf(error.cause) === '23503')
}
