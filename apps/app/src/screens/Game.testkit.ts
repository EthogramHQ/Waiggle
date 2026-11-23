// Les données et le faux serveur communs aux tests d'écran de la récolte (R19, la gamification) :
// la page d'un membre, la page d'un projet (offrir du miel), les réglages et la colonne du Fil.
// Pas de suffixe « .test » : Jest ne le prend pas pour une suite, il le charge quand un test
// l'importe.
//
// Ces tests ne remplacent pas les hooks de `gamification/api` : ils remplacent le client réseau
// (`api/client`, `request` et `requestWithoutBody`), comme ProjectScreen.testers.test.tsx et les
// réglages d'e-mail. Les vrais hooks tournent donc sur ce faux serveur : le test vérifie ce qui part
// vers l'API (GET /v1/me/harvest, PATCH /v1/me/game, POST /v1/projects/{id}/honey), quelle que soit
// la forme que les hooks donnent à leurs résultats.
import {
  type EarnedSeal,
  Harvest,
  HONEY,
  type MemberGame,
  MemberGame as MemberGameSchema,
} from '@ruche/contracts'
import type { ApiResult } from '../api/errors'

/** Deux sceaux gagnés, les plus récents d'abord : « Premier retour », « Cuisine explorée ». */
export const leaSeals: EarnedSeal[] = [
  { code: 'first_feedback', earnedAt: '2026-11-18T10:00:00.000Z' },
  { code: 'cooking', earnedAt: '2026-11-02T10:00:00.000Z' },
]

/**
 * « Ma récolte » de Léa (GET /v1/me/harvest) : niveau 4 à 880 pollen, 7 alvéoles sur 10, 120 pollen
 * avant le niveau 5 ; Gardienne ; 3 semaines butinées ; 35 miel ; un défi en cours. `Harvest.parse`
 * vérifie que ces fausses données ont la forme du contrat (un champ oublié casse ici, pas plus loin).
 */
export const leaHarvest: Harvest = Harvest.parse({
  level: 4,
  total: 880,
  cells: 7,
  toNext: 120,
  title: { family: 'keeper', form: 'f', pinned: false },
  obtainedFamilies: ['keeper', 'forager'],
  week: { total: 85, byFamily: { forager: 20, builder: 10, keeper: 55, dancer: 0 } },
  weeks: { count: 3, hibernating: false, currentForaged: true },
  honey: 35,
  personalChallenge: { state: 'active', code: 'feedback', progress: 0, target: 1 },
  hiveChallenges: [],
  seals: leaSeals,
  decoration: { tint: 'honey', pattern: 'smooth' },
  ownedDecorations: { tints: ['honey'], patterns: ['smooth'] },
  settings: { titleForm: 'f', pinnedFamily: null, inRankings: true, harvestNotices: true },
  levelSeen: 4,
})

/** Ce que la page d'un membre montre de son jeu (`Member.game`), tiré de la même récolte. */
export const gameOf = (harvest: Harvest = leaHarvest): MemberGame =>
  MemberGameSchema.parse({
    level: harvest.level,
    cells: harvest.cells,
    title: harvest.title,
    seals: harvest.seals,
    decoration: harvest.decoration,
  })

/** Une demande reçue par le faux serveur : méthode, adresse et corps (lu en JSON). */
export type GameSent = { method: string; path: string; body: unknown }

const HONEY_GIFT = /^\/v1\/projects\/([^/]+)\/honey$/

/**
 * Le faux serveur du jeu. `harvest` change avec les écritures, comme en vrai (un réglage coupé,
 * le niveau vu, le miel offert) ; `honeyAnswer` impose la réponse de l'offre (une attente, un refus) ;
 * `sent` garde tout.
 */
export const gameServer = {
  harvest: leaHarvest,
  sent: [] as GameSent[],
  honeyAnswer: null as null | (() => Promise<ApiResult<null>>),
  /** Les projets dont le miel a été offert (le projet relu dit alors `honeyGiven`). */
  gifted: new Set<string>(),

  reset(harvest: Harvest = leaHarvest) {
    this.harvest = harvest
    this.sent = []
    this.honeyAnswer = null
    this.gifted = new Set()
  },

  /**
   * La réponse à une demande du jeu, ou `undefined` si l'adresse n'est pas une des siennes (le
   * fichier de test répond alors pour le reste). Les écritures répondent 204, sans corps : ce que
   * `requestWithoutBody` rend (`data: null`), et `request` aussi, sans rien à lire.
   */
  async route(path: string, init: RequestInit = {}): Promise<ApiResult<unknown> | undefined> {
    const method = (init.method ?? 'GET').toUpperCase()
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    if (path === '/v1/me/harvest' && method === 'GET') {
      this.sent.push({ method, path, body })
      return { ok: true, data: this.harvest }
    }
    if (path === '/v1/me/game' && method === 'PATCH') {
      this.sent.push({ method, path, body })
      const {
        levelSeen,
        personalChallenge: _challenge,
        ...settings
      } = body as Record<string, never>
      this.harvest = {
        ...this.harvest,
        levelSeen: levelSeen ?? this.harvest.levelSeen,
        settings: { ...this.harvest.settings, ...settings },
      }
      return { ok: true, data: null }
    }
    const gift = HONEY_GIFT.exec(path)
    if (gift && method === 'POST') {
      this.sent.push({ method, path, body })
      if (this.honeyAnswer) return this.honeyAnswer()
      this.gifted.add(gift[1] ?? '')
      this.harvest = { ...this.harvest, honey: this.harvest.honey - HONEY.gift }
      return { ok: true, data: null }
    }
    return undefined
  },
}

/** Les corps envoyés à PATCH /v1/me/game, dans l'ordre. */
export const gamePatches = () =>
  gameServer.sent
    .filter((one) => one.method === 'PATCH' && one.path === '/v1/me/game')
    .map((one) => one.body)

/** Le nombre de lectures de « Ma récolte » (GET /v1/me/harvest). */
export const harvestReads = () =>
  gameServer.sent.filter((one) => one.method === 'GET' && one.path === '/v1/me/harvest').length

/** Les offres de miel envoyées (POST /v1/projects/{id}/honey), adresse par adresse. */
export const honeyGifts = () =>
  gameServer.sent.filter((one) => one.method === 'POST' && HONEY_GIFT.test(one.path))

/** Une réponse qui ne vient jamais : l'envoi reste en cours (pour la fermeture refusée, le double toucher). */
export const never = () => new Promise<ApiResult<null>>(() => undefined)
