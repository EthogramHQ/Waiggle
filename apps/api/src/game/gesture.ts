// Ce que partagent les routes de geste sur un projet (R19, plan, choix 3 et 5) : payer qui agit sur
// le projet d'un autre membre et ce que l'auteur du projet en reçoit (deux appels d'`award`, dans
// la transaction du geste), et déclarer l'en-tête `Waiggle-Pollen` dans la documentation OpenAPI
// de leurs réponses. L'écriture du grand livre et la pose de l'en-tête restent dans award.ts.
import { type Gesture, POLLEN_HEADER, type PollenSourceKind } from '@ruche/contracts'
import { award, type Tx } from './award'

/** Les gestes reçus par l'auteur d'un projet (`receive_feedback`, `receive_comment`…). */
type ReceivedGesture = Extract<Gesture, `receive_${string}`>

/** Un geste fait sur le projet d'un autre, et ce que son auteur en reçoit. */
type ProjectGesture = {
  /** Le membre qui agit (réagit, commente, devient testeur, envoie un retour). */
  actorId: string
  /** L'auteur du projet, qui reçoit. */
  authorId: string
  projectId: string
  gesture: Gesture
  received: ReceivedGesture
  /** Ce qui a rapporté, la même source pour les deux entrées : la modération révoque par elle. */
  sourceKind: PollenSourceKind
  sourceId: string
  /** La chose payée une fois à qui agit (voir `award`). */
  sourceKey: string
  /**
   * La chose payée une fois à l'auteur. Elle nomme qui agit quand la clé de qui agit ne le fait
   * pas (une réaction `<projet>:<sorte>` : chaque membre qui réagit fait recevoir une fois).
   */
  receivedKey: string
  now: Date
}

/**
 * Paie un geste fait sur le projet d'un autre membre, puis ce que l'auteur en reçoit ; rend le
 * pollen gagné par qui agit (celui de l'en-tête). Rien sur son propre projet (« commenter son
 * propre projet : aucun pollen »). Les deux paiements sont indépendants : l'auteur reçoit même si
 * qui agit a atteint son plafond du jour (la réception a son propre plafond, 50 par jour), et qui
 * agit gagne même si l'auteur est suspendu (relecture de sécurité S2 : l'en-tête ne dit rien de
 * l'auteur). Les deux verrous de jeu sont pris par le premier appel, triés (S1).
 */
export const awardOnProject = async (tx: Tx, g: ProjectGesture): Promise<number> => {
  if (g.actorId === g.authorId) return 0
  const source = {
    sourceKind: g.sourceKind,
    sourceId: g.sourceId,
    projectId: g.projectId,
    now: g.now,
  }
  const earned = await award(tx, {
    ...source,
    memberId: g.actorId,
    gesture: g.gesture,
    sourceKey: g.sourceKey,
    counterpartId: g.authorId,
  })
  await award(tx, {
    ...source,
    memberId: g.authorId,
    gesture: g.received,
    sourceKey: g.receivedKey,
    counterpartId: g.actorId,
  })
  return earned
}

/**
 * L'en-tête `Waiggle-Pollen` tel que la documentation OpenAPI le décrit (un « objet d'en-têtes »
 * d'OpenAPI 3 : son nom, sa description, son schéma). À joindre à la réponse réussie d'une route
 * de geste : `{ ...done, headers: pollenHeaders }`.
 */
export const pollenHeaders = {
  [POLLEN_HEADER]: {
    description:
      'The pollen this gesture earned the member who asked, when it earned some (absent when it ' +
      'earned nothing: daily cap reached, already paid, suspended or example account).',
    schema: { type: 'integer', minimum: 1 },
  },
} as const
