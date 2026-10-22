// L'ordonnanceur des tâches planifiées (tranche 6c) : pg-boss, une file de tâches rangée dans
// PostgreSQL (son propre schéma, « pgboss »), qui lance chaque tâche à son heure, sur le fuseau de
// Paris, une seule à la fois, même si l'API tournait un jour sur plusieurs serveurs.
//
// Il ne fait qu'appeler les tâches (weekly-recap.ts, mention-emails.ts, moderation-alert.ts,
// nightly-purge.ts), qui
// contiennent toutes les règles et se testent sans lui. Il ne démarre qu'avec un vrai PostgreSQL
// (DATABASE_URL) : en développement, en test et pendant le parcours local (PGlite), aucune tâche
// automatique ne tourne.
//
// Règles (plan 6c, relectures de sécurité et juridique) :
// - au plus une exécution : retryLimit 0 (une tâche qui échoue ne repart pas d'elle-même, les dates
//   d'envoi sont déjà notées), et une seule exécution à la fois par tâche (politique « exclusive ») ;
// - rien de personnel dans ce que pg-boss garde (ses tables sont dans les sauvegardes) : aucune
//   donnée envoyée aux tâches, un résultat fait de nombres, et une erreur remplacée par un message
//   fixe (l'erreur d'origine pourrait citer une adresse) ;
// - l'historique des tâches est effacé 7 jours après leur fin (deleteAfterSeconds), réussies comme
//   échouées : pg-boss 12 n'a plus de table d'archive ;
// - une panne de pg-boss (au démarrage ou plus tard, PostgreSQL coupé) est notée dans les journaux
//   et n'arrête jamais l'API.
import { PgBoss } from 'pg-boss'
import { describeError } from '../log'
import { mentionEmails } from './mention-emails'
import { moderationAlert } from './moderation-alert'
import { nightlyPurge } from './nightly-purge'
import type { JobDeps } from './shared'
import { weeklyRecap } from './weekly-recap'

const TIME_ZONE = 'Europe/Paris'
const SEVEN_DAYS = 7 * 24 * 60 * 60

type Task = {
  name: 'weekly-recap' | 'mention-emails' | 'moderation-alert' | 'nightly-purge'
  /** Quand : une expression « cron » (minute, heure, jour du mois, mois, jour de la semaine). */
  cron: string
  /** Combien de secondes une exécution peut durer avant d'être déclarée perdue. */
  expireInSeconds: number
  /** Une exécution manquée (serveur arrêté à l'heure prévue) : rattrapée une fois, ou sautée. */
  missed: 'once' | 'skip'
  /** Une tâche d'e-mails, coupée par EMAIL_JOBS=off ; la purge, elle, continue toujours. */
  sendsEmails: boolean
  run: (deps: JobDeps, now: Date) => Promise<object>
}

const tasks: Task[] = [
  {
    // Le lundi à 9 h. Un récap manqué (déploiement à 9 h) part une fois au redémarrage ; le délai
    // de 6 jours entre deux récaps empêche tout doublon.
    name: 'weekly-recap',
    cron: '0 9 * * 1',
    expireInSeconds: 2 * 60 * 60,
    missed: 'once',
    sendsEmails: true,
    run: weeklyRecap,
  },
  {
    // Toutes les 5 minutes : un passage manqué est simplement fait au suivant.
    name: 'mention-emails',
    cron: '*/5 * * * *',
    expireInSeconds: 15 * 60,
    missed: 'skip',
    sendsEmails: true,
    run: mentionEmails,
  },
  {
    // Toutes les 10 minutes (tranche 6d) : l'alerte aux administrateurs, au plus une par heure et
    // par administrateur (moderation-alert.ts). Un passage manqué est fait au suivant. C'est un
    // e-mail : EMAIL_JOBS=off la coupe ; la file se relève alors à la main (docs/ops/moderation.md).
    name: 'moderation-alert',
    cron: '*/10 * * * *',
    expireInSeconds: 15 * 60,
    missed: 'skip',
    sendsEmails: true,
    run: moderationAlert,
  },
  {
    // Chaque nuit à 3 h.
    name: 'nightly-purge',
    cron: '0 3 * * *',
    expireInSeconds: 60 * 60,
    missed: 'once',
    sendsEmails: false,
    run: (deps, now) => nightlyPurge(deps.db, now),
  },
]

export type Scheduler = { stop: () => Promise<void> }

type SchedulerOptions = {
  /** L'adresse du vrai PostgreSQL (DATABASE_URL). */
  databaseUrl: string
  deps: JobDeps
  /** EMAIL_JOBS : à false, ni récap, ni e-mails de mentions, ni alerte de modération (la purge continue). */
  emailJobs: boolean
}

/**
 * Démarre pg-boss et ses quatre planifications. Lève une erreur si le démarrage échoue : index.ts
 * la note dans les journaux et l'API continue sans tâches.
 */
export const startScheduler = async ({
  databaseUrl,
  deps,
  emailJobs,
}: SchedulerOptions): Promise<Scheduler> => {
  const boss = new PgBoss({
    connectionString: databaseUrl,
    // Deux connexions au plus : les tâches passent une par une, et la base sert d'abord l'API.
    max: 2,
    application_name: 'ruche-jobs',
  })
  // Sans écouteur, une erreur émise (PostgreSQL redémarre, connexion coupée) ferait tomber tout le
  // processus Node : on la note, sans son message (il peut citer une requête), et pg-boss réessaie.
  boss.on('error', (error) => {
    console.error('Job scheduler error', describeError(error, { method: 'JOB', path: 'pg-boss' }))
  })
  await boss.start()

  // Une fois pg-boss démarré, il tient des connexions et lance sa maintenance à intervalles : si la
  // suite échoue (une file refusée, PostgreSQL coupé entre deux étapes), on l'arrête aussitôt,
  // sans attendre de tâche (graceful: false), avant de rendre l'erreur à index.ts. Sinon il
  // tournerait en arrière-plan, sans que personne puisse plus l'arrêter (relecture de sécurité A5).
  try {
    await planTasks(boss, deps, emailJobs)
  } catch (error) {
    // Si l'arrêt lui-même échoue, on le note, et c'est l'erreur d'origine qui remonte : c'est elle
    // qui dit pourquoi les tâches ne tournent pas.
    await boss.stop({ graceful: false }).catch((stopError: unknown) => {
      console.error(
        'Job scheduler stop failed',
        describeError(stopError, { method: 'STARTUP', path: 'pg-boss' }),
      )
    })
    throw error
  }
  console.log(`Job scheduler started (${TIME_ZONE})`)

  return {
    // Arrêt propre : pg-boss laisse finir la tâche en cours (30 secondes au plus), puis ferme ses
    // connexions.
    stop: () => boss.stop({ graceful: true, timeout: 30_000 }),
  }
}

/** Crée les files, puis planifie chaque tâche (ou la retire, si EMAIL_JOBS=off). */
const planTasks = async (boss: PgBoss, deps: JobDeps, emailJobs: boolean) => {
  for (const task of tasks) {
    // createQueue ne change rien à une file qui existe déjà (« on conflict do nothing »).
    await boss.createQueue(task.name, {
      policy: 'exclusive',
      retryLimit: 0,
      expireInSeconds: task.expireInSeconds,
      deleteAfterSeconds: SEVEN_DAYS,
    })
    if (task.sendsEmails && !emailJobs) {
      // Les planifications sont gardées en base : il faut les retirer, sinon une planification
      // d'avant la coupure continuerait de créer des tâches. Aucun travailleur ne les prendrait,
      // mais on ne laisse rien en attente qui partirait au retour de EMAIL_JOBS=on.
      await boss.unschedule(task.name)
      await boss.deleteQueuedJobs(task.name)
      console.log(`Job ${task.name}: off (EMAIL_JOBS=off)`)
      continue
    }
    await boss.schedule(task.name, task.cron, null, { tz: TIME_ZONE, missed: task.missed })
    await boss.work(task.name, async () => {
      try {
        // L'heure de la tâche est prise ici, une fois, et passée à la tâche.
        return await task.run(deps, new Date())
      } catch (error) {
        console.error(
          `Job ${task.name} failed`,
          describeError(error, { method: 'JOB', path: task.name }),
        )
        // pg-boss garde l'erreur levée dans sa table : un message fixe, sans rien de l'erreur
        // d'origine (relecture juridique R10).
        throw new Error(`${task.name} failed`)
      }
    })
  }
}
