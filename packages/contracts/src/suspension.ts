// La suspension d'un compte par la modération (tranche 7c). Un compte suspendu passe en lecture
// seule : il lit tout, supprime ses contenus, exporte ses données, mais ne publie plus et
// n'interagit plus. Fichier à part, sans autre import que zod et removal.ts : le compte (`Me`), la
// page d'un membre, les notifications et l'export s'en servent, et reports.ts lit les membres ; le
// mettre dans reports.ts ferait une boucle d'imports.
import { z } from 'zod'
import { RemovalGround } from './removal'

/** Les durées qu'un administrateur peut choisir : 7 jours, 30 jours, ou jusqu'à la levée. */
export const SuspensionDuration = z.enum(['7d', '30d', 'indefinite'])
export type SuspensionDuration = z.infer<typeof SuspensionDuration>

/** Le nombre de jours de chaque durée limitée ; une suspension « sans fin » n'a pas de date. */
export const SUSPENSION_DAYS = { '7d': 7, '30d': 30 } as const satisfies Record<
  Exclude<SuspensionDuration, 'indefinite'>,
  number
>

/**
 * Une suspension en cours, telle que le membre suspendu la lit (article 17 du règlement européen
 * sur les services numériques : la mesure, sa durée, le fondement, l'explication). Jamais
 * l'administrateur qui a décidé.
 */
export const Suspension = z
  .object({
    since: z.iso.datetime(),
    /**
     * La fin prévue, à la seconde près (l'heure de la pose, n jours plus tard) ; null : jusqu'à ce
     * qu'un administrateur la lève. L'appli et l'e-mail l'écrivent avec l'heure et le fuseau
     * (« heure de Paris ») : une date seule tromperait d'un jour (relecture juridique, J4).
     */
    endsAt: z.iso.datetime().nullable(),
    ground: RemovalGround,
    explanation: z.string(),
    /** Vrai si la suspension a suivi un signalement (jamais de qui) ; faux : à l'initiative de la modération (DSA art. 17.3, J2). */
    afterReport: z.boolean(),
  })
  .meta({ id: 'Suspension' })
export type Suspension = z.infer<typeof Suspension>

/**
 * Pourquoi un administrateur lève une suspension avant sa fin : plus tôt que prévu (`early`), ou
 * parce qu'elle était une erreur (`error`). Une suspension levée pour erreur ne compte plus dans le
 * rappel des décisions passées (relecture juridique, J10).
 */
export const LiftCause = z.enum(['early', 'error'])
export type LiftCause = z.infer<typeof LiftCause>

/**
 * Une suspension du compte, dans l'export de ses données (droit d'accès du RGPD), avec sa fin réelle
 * (J8) : jamais l'administrateur qui a décidé, jamais qui a signalé.
 */
export const SuspensionExport = z.object({
  since: z.iso.datetime(),
  duration: SuspensionDuration,
  /** La fin prévue à la pose ; null : sans fin. */
  endsAt: z.iso.datetime().nullable(),
  ground: RemovalGround,
  explanation: z.string(),
  afterReport: z.boolean(),
  /** La fin réelle ; null tant qu'elle dure. */
  endedAt: z.iso.datetime().nullable(),
  /** Comment elle a fini : à la date prévue (`term`), ou levée (`lift`) ; null tant qu'elle dure. */
  endedBy: z.enum(['term', 'lift']).nullable(),
  /** La raison et l'explication d'une levée ; null sinon. */
  liftCause: LiftCause.nullable(),
  liftExplanation: z.string().nullable(),
})
export type SuspensionExport = z.infer<typeof SuspensionExport>
