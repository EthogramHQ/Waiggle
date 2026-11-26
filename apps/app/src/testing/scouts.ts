// Les Éclaireuses d'exemple pour les captures (R20, docs/scenarios/refonte.md, « R20 — Les
// Éclaireuses ») : l'objet `scout` du profil de Léa (GET /v1/me), ses missions et ses retours
// (GET /v1/me/scout/…), et la page de tri de l'administrateur (GET /v1/moderation/scouts…).
// Conformes au contrat (`packages/contracts/src/scouts.ts`), datés autour de l'horloge des captures
// (`SHOT_NOW` de `scripts/shots.mjs` : le mardi 20 octobre 2026 à midi, heure de Paris).
//
// Seulement des types importés : `scripts/shots.mjs` lit ce fichier avec Node, qui ne sait charger
// ni les sources de @ruche/contracts (leurs imports n'ont pas d'extension), ni un autre fichier de
// `testing/` sans extension. Les identifiants des membres sont donc recopiés de `scripts/shots.mjs`
// (Inès, Max, Papi Jean) : toucher un nom ouvre une page que le faux serveur connaît.
import type {
  MeScout,
  MyScoutReports,
  ScoutContext,
  ScoutMissions,
  ScoutReport,
  ScoutReportAdmin,
  ScoutReportPage,
  ScoutTriage,
} from '@ruche/contracts'

/** Le lundi de la semaine des exemples (heure de Paris), celui de la récolte (`HARVEST_WEEK`). */
export const SCOUT_WEEK = '2026-10-19'

/**
 * Les états de Léa dans les captures (option `scout` de `fakeApi`) :
 * - `active` : Éclaireuse depuis le 9 octobre, deux missions à faire, la Goutte affichée ;
 * - `no-missions` : Éclaireuse, sans mission cette semaine (aucune n'est publiée) ;
 * - `removed` : retirée le 17 octobre (un abus) : plus de Goutte, ses retours restent lisibles ;
 * - `hidden` : Éclaireuse qui a coupé « Afficher la Goutte ».
 * `null` (le défaut) : un membre qui n'a jamais été Éclaireuse (`Me.scout` nul).
 */
export type ScoutShotState = 'active' | 'no-missions' | 'removed' | 'hidden'

/** Le mois, lancé le 8 octobre au matin : il finit le 7 novembre à minuit de Paris (jour 13 sur 30). */
const programStartedAt = '2026-10-08T07:00:00.000Z'
const programEndsAt = '2026-11-06T23:00:00.000Z'

const activeScout: MeScout = {
  active: true,
  joinedAt: '2026-10-09T08:30:00.000Z',
  removedAt: null,
  showDrop: true,
  programEndsAt,
  missionsLeft: 2,
}

/** L'objet `scout` du profil de Léa pour un état des captures (`null` : jamais Éclaireuse). */
export const scoutOf = (state: ScoutShotState | null): MeScout | null => {
  if (state === null) return null
  if (state === 'no-missions') return { ...activeScout, missionsLeft: 0 }
  if (state === 'hidden') return { ...activeScout, showDrop: false }
  if (state === 'removed') {
    return { ...activeScout, active: false, removedAt: '2026-10-17T14:00:00.000Z', missionsLeft: 0 }
  }
  return activeScout
}

/** Ce que rend POST /v1/me/scout quand le code est bon : Éclaireuse d'aujourd'hui. */
export const joinedScout: MeScout = {
  ...activeScout,
  joinedAt: '2026-10-20T10:00:00.000Z',
  missionsLeft: 2,
}

/** Le code des captures (la saisie de « J'ai un code ») ; tout autre code est refusé. */
export const SHOT_SCOUT_CODE = 'ruche-eclaireuses'

export const missionPhotoId = '0f1e2d3c-4b5a-4968-8776-655443322110'
export const missionSearchId = '2b3c4d5e-6f7a-4b9c-8d1e-2f3a4b5c6d7e'
export const missionPhoneId = '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d'

/** Les missions de la semaine : deux à faire, une faite. */
export const weekMissions: ScoutMissions = {
  week: SCOUT_WEEK,
  missions: [
    { id: missionPhotoId, text: 'Publie un projet avec une photo', done: false },
    { id: missionSearchId, text: 'Cherche un outil par son nom', done: true },
    {
      id: missionPhoneId,
      // Une mission longue : la rangée passe sur deux lignes.
      text: 'Ouvre l’appli sur ton téléphone, publie une mise à jour et dis ce qui te surprend',
      done: false,
    },
  ],
}

/** Aucune mission publiée cette semaine. */
export const noMissions: ScoutMissions = { week: SCOUT_WEEK, missions: [] }

/** Ce que la Goutte joint d'ordinaire : l'écran, l'appareil, la version, la langue, le thème. */
const projectContext: ScoutContext = {
  screen: '/projects/42',
  platform: 'ios',
  width: 390,
  appVersion: 'a1b2c3d',
  language: 'fr',
  scheme: 'day',
}

export const bugReportId = '3c4d5e6f-7a8b-4c0d-9e1f-3a4b5c6d7e8f'
export const ideaReportId = '4d5e6f7a-8b9c-4d1e-8f2a-4b5c6d7e8f9a'
export const fixedReportId = '5e6f7a8b-9c0d-4e2f-9a3b-5c6d7e8f9a0b'
export const loveReportId = '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d'

/**
 * Les retours de Léa, les plus récents d'abord : un bug envoyé ce matin, une idée prévue (faite
 * pour une mission), un bug corrigé avec la note de l'administrateur, un « J'adore » lu.
 * `captureUrl` : l'adresse de la capture du premier, servie par l'API simulée.
 */
export const myReportsOf = (captureUrl: string): MyScoutReports => ({
  reports: [
    {
      id: bugReportId,
      kind: 'bug',
      severity: 'annoying',
      text: 'Le bouton Publier se cache derrière le clavier quand j’écris la description.',
      mission: null,
      context: projectContext,
      mediaUrl: captureUrl,
      status: 'sent',
      fixedNote: null,
      createdAt: '2026-10-20T07:40:00.000Z',
      fixedAt: null,
    },
    {
      id: ideaReportId,
      kind: 'idea',
      severity: null,
      text: 'Pouvoir trier mes projets par date, et retrouver d’un coup ceux que je n’ai pas mis à jour depuis longtemps. Ce serait pratique quand on en a beaucoup, comme Papi Jean qui en publie un par semaine.',
      mission: { id: missionPhotoId, text: 'Publie un projet avec une photo' },
      context: null,
      mediaUrl: null,
      status: 'planned',
      fixedNote: null,
      createdAt: '2026-10-19T16:10:00.000Z',
      fixedAt: null,
    },
    {
      id: fixedReportId,
      kind: 'bug',
      severity: 'blocking',
      text: 'La page de la ruche Famille reste blanche après une photo.',
      mission: null,
      context: { ...projectContext, screen: '/hives/famille', platform: 'web', width: 1280 },
      mediaUrl: null,
      status: 'fixed',
      fixedNote: 'Corrigé ce matin, merci Léa !',
      createdAt: '2026-10-12T09:00:00.000Z',
      fixedAt: '2026-10-14T09:00:00.000Z',
    },
    {
      id: loveReportId,
      kind: 'love',
      severity: null,
      text: 'Les mises à jour avant / après, c’est génial.',
      mission: null,
      context: null,
      mediaUrl: null,
      status: 'read',
      fixedNote: null,
      createdAt: '2026-10-10T18:00:00.000Z',
      fixedAt: null,
    },
  ],
})

/** Le retour que rend POST /v1/me/scout/reports : ce qui a été envoyé, « Envoyé ». */
export const sentReportOf = (
  id: string,
  input: Pick<ScoutReport, 'kind' | 'severity' | 'text' | 'context'>,
  createdAt: string,
): ScoutReport => ({
  id,
  ...input,
  mission: null,
  mediaUrl: null,
  status: 'sent',
  fixedNote: null,
  createdAt,
  fixedAt: null,
})

// --- La page de tri (l'administrateur) ---

const ines = { id: 'ines-id', name: 'Inès Haddad', handle: 'ines_haddad', avatarUrl: null }
const max = { id: 'max-id', name: 'Max Durand', handle: 'max_durand', avatarUrl: null }
const jean = { id: 'jean-id', name: 'Papi Jean', handle: 'papi_jean', avatarUrl: null }
const hugo = { id: 'hugo-id', name: 'Hugo Lefèvre', handle: 'hugo_lefevre', avatarUrl: null }

/**
 * La page de tri : `running`, le mois en cours (jour 13 sur 30), 18 places prises, une mission ;
 * `not-launched`, avant le lancement (personne encore, aucune mission).
 */
export const triageOf = (state: 'running' | 'not-launched'): ScoutTriage =>
  state === 'not-launched'
    ? {
        program: { startedAt: null, endsAt: null },
        places: { taken: 0, max: 30 },
        week: SCOUT_WEEK,
        missions: [],
        scouts: [],
      }
    : {
        program: { startedAt: programStartedAt, endsAt: programEndsAt },
        places: { taken: 18, max: 30 },
        week: SCOUT_WEEK,
        missions: [
          {
            id: missionPhotoId,
            position: 1,
            textFr: 'Publie un projet avec une photo',
            textEn: 'Publish a project with a photo',
          },
          {
            id: missionSearchId,
            position: 2,
            textFr: 'Cherche un outil par son nom',
            textEn: null,
          },
        ],
        scouts: [
          { member: ines, joinedAt: '2026-10-08T09:00:00.000Z', removedAt: null, reports: 4 },
          { member: jean, joinedAt: '2026-10-08T15:20:00.000Z', removedAt: null, reports: 2 },
          { member: max, joinedAt: '2026-10-09T08:30:00.000Z', removedAt: null, reports: 1 },
          {
            member: hugo,
            joinedAt: '2026-10-10T11:00:00.000Z',
            removedAt: '2026-10-17T14:00:00.000Z',
            reports: 0,
          },
        ],
      }

/** Les retours de la page de tri (une seule page), du plus récent au plus ancien. */
export const adminReportsOf = (captureUrl: string): ScoutReportPage => ({
  reports: [
    {
      id: '7a8b9c0d-1e2f-4a4b-9c5d-7e8f9a0b1c2d',
      kind: 'bug',
      severity: 'blocking',
      text: 'Le fil ne se recharge plus après une heure : il faut fermer l’appli et la rouvrir pour voir les nouveaux projets.',
      mission: null,
      context: { ...projectContext, screen: '/feed', platform: 'android', width: 412 },
      mediaUrl: captureUrl,
      status: 'sent',
      fixedNote: null,
      createdAt: '2026-10-20T08:15:00.000Z',
      fixedAt: null,
      author: ines,
      adminNote: null,
      updatedAt: '2026-10-20T08:15:00.000Z',
    },
    {
      id: '8b9c0d1e-2f3a-4b5c-8d6e-8f9a0b1c2d3e',
      kind: 'idea',
      severity: null,
      text: 'Une ruche pour les petits-enfants, avec des projets plus simples à essayer.',
      mission: { id: missionPhotoId, text: 'Publie un projet avec une photo' },
      context: null,
      mediaUrl: null,
      status: 'planned',
      fixedNote: null,
      createdAt: '2026-10-19T17:30:00.000Z',
      fixedAt: null,
      author: jean,
      adminNote: 'À voir avec la refonte des ruches',
      updatedAt: '2026-10-19T18:00:00.000Z',
    },
    {
      id: '9c0d1e2f-3a4b-4c6d-9e7f-9a0b1c2d3e4f',
      kind: 'confusing',
      severity: 'annoying',
      text: 'Je ne comprends pas la différence entre suivre un projet et le tester.',
      mission: null,
      context: { ...projectContext, platform: 'web', width: 1280, scheme: 'night' },
      mediaUrl: null,
      status: 'read',
      fixedNote: null,
      createdAt: '2026-10-18T10:00:00.000Z',
      fixedAt: null,
      author: max,
      adminNote: null,
      updatedAt: '2026-10-18T12:00:00.000Z',
    },
    {
      id: '0d1e2f3a-4b5c-4d7e-8f8a-0b1c2d3e4f5a',
      kind: 'bug',
      severity: 'minor',
      text: 'Une faute dans la page Confidentialité.',
      mission: null,
      context: null,
      mediaUrl: null,
      status: 'fixed',
      fixedNote: 'Corrigé, merci !',
      createdAt: '2026-10-12T10:00:00.000Z',
      fixedAt: '2026-10-13T10:00:00.000Z',
      author: ines,
      adminNote: null,
      updatedAt: '2026-10-13T10:00:00.000Z',
    },
  ] satisfies ScoutReportAdmin[],
  nextCursor: null,
})
