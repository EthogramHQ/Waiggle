// Tests du démarrage de l'ordonnanceur (jobs/scheduler.ts), sans vrai PostgreSQL : pg-boss est
// remplacé par un faux (vi.mock), qui note ce qu'on lui demande. On ne vérifie ici que ce que fait
// startScheduler de pg-boss, pas pg-boss lui-même : les tâches se testent chacune sans lui.
//
// Relecture de sécurité A5 : une erreur après boss.start() (une file refusée, PostgreSQL coupé
// entre deux étapes) doit arrêter pg-boss avant de remonter, sinon il garderait ses connexions et
// sa maintenance en arrière-plan, sans que personne puisse l'arrêter.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startScheduler } from './scheduler'
import type { JobDeps } from './shared'

// vi.mock est remonté par Vitest avant les imports : scheduler.ts reçoit donc le faux pg-boss.
// vi.hoisted : ces fausses fonctions sont créées avant vi.mock, que Vitest remonte en tête du
// fichier ; la fausse classe peut ainsi s'en servir.
const boss = vi.hoisted(() => ({
  on: vi.fn(),
  start: vi.fn(async () => {}),
  createQueue: vi.fn(async () => {}),
  schedule: vi.fn(async () => {}),
  unschedule: vi.fn(async () => {}),
  deleteQueuedJobs: vi.fn(async () => {}),
  work: vi.fn(async () => 'worker'),
  stop: vi.fn(async () => {}),
}))

// Le module pg-boss remplacé : « new PgBoss(…) » rend toujours le même faux objet.
vi.mock('pg-boss', () => ({
  PgBoss: vi.fn(function PgBoss() {
    return boss
  }),
}))

// Les tâches ne tournent jamais ici (aucun travailleur n'est appelé) : des dépendances vides
// suffisent, d'où la conversion de type.
const deps = {} as JobDeps
const start = () => startScheduler({ databaseUrl: 'postgres://test', deps, emailJobs: true })

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('starting the job scheduler', () => {
  // Tranche 6d : une quatrième tâche, l'alerte de modération.
  it('plans the four tasks and stops pg-boss gracefully when asked', async () => {
    const scheduler = await start()

    expect(boss.start).toHaveBeenCalledOnce()
    expect(boss.schedule).toHaveBeenCalledTimes(4)
    expect(boss.stop).not.toHaveBeenCalled()
    await scheduler.stop()
    expect(boss.stop).toHaveBeenCalledWith({ graceful: true, timeout: 30_000 })
  })

  it('stops pg-boss at once and passes the error on when planning fails after the start', async () => {
    const failure = new Error('queue refused')
    boss.createQueue.mockRejectedValueOnce(failure)

    await expect(start()).rejects.toBe(failure)

    expect(boss.start).toHaveBeenCalledOnce()
    expect(boss.stop).toHaveBeenCalledWith({ graceful: false })
  })

  it('still passes the first error on when stopping fails too', async () => {
    const failure = new Error('queue refused')
    boss.createQueue.mockRejectedValueOnce(failure)
    boss.stop.mockRejectedValueOnce(new Error('stop failed'))

    await expect(start()).rejects.toBe(failure)
  })
})

// Tranche 6d : l'alerte aux administrateurs, toutes les 10 minutes, est un e-mail : EMAIL_JOBS=off
// la coupe, comme le récap et les mentions.
describe('the moderation alert task', () => {
  it('runs every 10 minutes', async () => {
    await start()

    expect(boss.schedule).toHaveBeenCalledWith(
      'moderation-alert',
      '*/10 * * * *',
      null,
      expect.objectContaining({ missed: 'skip' }),
    )
  })

  it('is switched off with the other e-mails', async () => {
    await startScheduler({ databaseUrl: 'postgres://test', deps, emailJobs: false })

    expect(boss.unschedule).toHaveBeenCalledWith('moderation-alert')
    expect(boss.schedule).not.toHaveBeenCalledWith(
      'moderation-alert',
      expect.anything(),
      null,
      expect.anything(),
    )
  })
})
