// Les Éclaireuses (R20, docs/scenarios/refonte.md, « R20 — Les Éclaireuses ») : une trentaine de
// proches essaient Waiggle pendant un mois et disent ce qui coince, par « la Goutte » (un retour
// rangé : sa sorte, sa gravité, son texte, une capture, l'écran où l'on était), avec des missions
// chaque semaine. Ce fichier tient les règles chiffrées (places, durée, quotas, longueurs) et les
// formes que l'API accepte et renvoie ; une règle qui change ne change qu'ici.
//
// Les routes :
// - POST /v1/me/scout (`JoinScouts`) : devenir Éclaireuse avec son code, pour un membre déjà inscrit ;
// - PATCH /v1/me/scout (`ScoutSettings`) : « Afficher la Goutte » ;
// - POST /v1/me/scout/reports : envoyer un retour, en multipart (voir `ScoutReportInput`) ;
// - GET /v1/me/scout/reports (`MyScoutReports`), DELETE /v1/me/scout/reports/{id} : « Mes retours » ;
// - GET /v1/me/scout/missions (`ScoutMissions`) : les missions de la semaine ;
// - sous /v1/moderation/scouts, pour l'administrateur seul : la page de tri (`ScoutTriage`), le
//   lancement du mois, les missions (`ScoutMissionsInput`), les retours (`ScoutReportPage`,
//   `ScoutReportPatch`) et « Retirer ».
//
// `Me.scout` vit dans accounts.ts, et non ici : ce fichier lit game.ts (le calendrier de Paris), qui
// lit projects.ts, qui lit profile.ts, qui lit accounts.ts. Si accounts.ts lisait ce fichier, la
// boucle ferait lire un schéma avant qu'il soit défini (`undefined`).
import { z } from 'zod'
import { InviteCode, LanguageSchema } from './accounts'
import { dayOf, GameWeek } from './game'
import { FreeText, ShortLabel, VisibleFreeText } from './text'

// --- Les règles chiffrées ---

/** 30 Éclaireuses actives au plus (une Éclaireuse retirée rend sa place). */
export const SCOUT_PLACES = 30
/** Le mois des Éclaireuses dure 30 jours de Paris, le jour du lancement compris. */
export const SCOUT_PROGRAM_DAYS = 30
/** 20 retours au plus par Éclaireuse et par 24 heures, comptés avant toute validation. */
export const SCOUT_REPORT_DAILY = 20
/** 10 essais de code par membre et par heure (POST /v1/me/scout), comptés avant tout examen. */
export const SCOUT_CODE_HOURLY = 10
/** 300 appels par jour à la page de tri, pour l'administrateur. */
export const SCOUT_ADMIN_DAILY = 300
/** Jusqu'à 3 missions par semaine. */
export const SCOUT_MISSIONS_MAX = 3

/** Le texte d'un retour : 1 à 2 000 caractères (le compteur de la feuille le montre). */
export const SCOUT_REPORT_TEXT_MAX = 2000
/** Le texte d'une mission, en français comme en anglais : 1 à 200 caractères, sur une ligne. */
export const SCOUT_MISSION_TEXT_MAX = 200
/** L'adresse de l'écran joint : 200 caractères au plus. */
export const SCOUT_SCREEN_MAX = 200
/** La largeur d'écran jointe, en points : de 0 à 10 000. */
export const SCOUT_WIDTH_MAX = 10_000
/** La note de l'administrateur pour l'Éclaireuse (« Corrigé le 28/11, merci ! ») : 300 au plus. */
export const SCOUT_FIXED_NOTE_MAX = 300
/** La note privée de l'administrateur, que l'Éclaireuse ne voit jamais : 2 000 au plus. */
export const SCOUT_ADMIN_NOTE_MAX = 2000
/** « Mes retours » montre les 100 plus récents. */
export const SCOUT_MY_REPORTS_MAX = 100
/** La page de tri se lit 30 retours par 30. */
export const SCOUT_TRIAGE_PAGE_SIZE = 30
/** L'extrait d'un retour dans l'avis « Ta danse a été entendue » : 80 caractères au plus. */
export const SCOUT_EXCERPT_MAX = 80

/** La capture d'un retour : JPEG, PNG ou WebP, 5 Mo au plus, ré-encodée sans métadonnées. */
export const SCOUT_MEDIA_MAX_BYTES = 5 * 1024 * 1024
export const SCOUT_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** Les retours et leurs captures sont effacés 183 jours (6 mois) après la fin du mois. */
export const SCOUT_RETENTION_DAYS = 183
/** Une mission est effacée 8 jours après son lundi (ses retours perdent seulement le lien). */
export const SCOUT_MISSION_RETENTION_DAYS = 8

// --- Les listes fermées ---

/** La sorte d'un retour : Bug, Confus, Idée, J'adore. Des codes stables ; les noms sont traduits. */
export const ScoutReportKind = z.enum(['bug', 'confusing', 'idea', 'love'])
export type ScoutReportKind = z.infer<typeof ScoutReportKind>

/** La gravité d'un Bug ou d'un Confus : Détail, Gênant, Bloquant. */
export const ScoutSeverity = z.enum(['minor', 'annoying', 'blocking'])
export type ScoutSeverity = z.infer<typeof ScoutSeverity>

/** Les sortes qui demandent une gravité (et les seules qui l'acceptent). */
export const KINDS_WITH_SEVERITY = [
  'bug',
  'confusing',
] as const satisfies readonly ScoutReportKind[]

/** Vrai si la sorte demande une gravité : la feuille montre alors la ligne « Gravité ». */
export const needsSeverity = (kind: ScoutReportKind): boolean =>
  (KINDS_WITH_SEVERITY as readonly ScoutReportKind[]).includes(kind)

/** Le statut d'un retour : Envoyé, Lu, Prévu, Corrigé, Gardé de côté. */
export const ScoutStatus = z.enum(['sent', 'read', 'planned', 'fixed', 'parked'])
export type ScoutStatus = z.infer<typeof ScoutStatus>

/** Comment on est devenue Éclaireuse : à l'inscription, ou dans ses réglages. */
export const ScoutJoinVia = z.enum(['signup', 'settings'])
export type ScoutJoinVia = z.infer<typeof ScoutJoinVia>

/** L'appareil joint au retour. */
export const ScoutPlatform = z.enum(['web', 'ios', 'android'])
export type ScoutPlatform = z.infer<typeof ScoutPlatform>

/** Le thème joint au retour : jour ou nuit. */
export const ScoutScheme = z.enum(['day', 'night'])
export type ScoutScheme = z.infer<typeof ScoutScheme>

/** L'identifiant d'un retour, d'une mission : un uuid tiré par le serveur. */
export const ScoutReportId = z.uuid()
export const ScoutMissionId = z.uuid()

// --- Le mois des Éclaireuses ---

/**
 * La fin du mois lancé à `start` : minuit de Paris au soir du 30e jour, le jour du lancement
 * comptant pour 1 (lancé le 10 octobre, il finit le 9 novembre à 0 h, heure de Paris). On prend le
 * jour de Paris du lancement (`dayOf`, heure d'été comprise), on avance de 30 jours sur le
 * calendrier (en temps universel, où un jour fait toujours 24 heures), puis on cherche l'instant
 * où ce jour commence à Paris : 23 h ou 22 h la veille en temps universel, selon l'heure d'hiver
 * (+1) ou d'été (+2). Minuit n'est jamais sauté par un changement d'heure (ils ont lieu à 2 h ou
 * 3 h) : l'un des deux essais convient toujours.
 */
export const programEndOf = (start: Date): Date => {
  const [year, month, day] = dayOf(start).split('-').map(Number)
  const lastDay = Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + SCOUT_PROGRAM_DAYS)
  const target = new Date(lastDay).toISOString().slice(0, 10)
  for (const offsetHours of [1, 2]) {
    const candidate = new Date(lastDay - offsetHours * 3_600_000)
    // Le bon instant est dans le jour visé, et la milliseconde d'avant est encore la veille.
    if (dayOf(candidate) === target && dayOf(new Date(candidate.getTime() - 1)) !== target) {
      return candidate
    }
  }
  // Inatteignable pour Paris ; on garde un résultat raisonnable plutôt qu'une exception.
  return new Date(lastDay - 3_600_000)
}

/** Le mois : `startedAt` et `endsAt` valent null tant que l'administrateur ne l'a pas lancé. */
export const ScoutProgram = z
  .object({ startedAt: z.iso.datetime().nullable(), endsAt: z.iso.datetime().nullable() })
  .meta({ id: 'ScoutProgram' })
export type ScoutProgram = z.infer<typeof ScoutProgram>

// --- Ce que l'API accepte ---

/**
 * POST /v1/me/scout : le code des Éclaireuses, tapé dans ses réglages. Même forme que le code
 * d'inscription : le formulaire vérifie seulement qu'un code est tapé, le serveur dit s'il est bon
 * (400 `scout_code_invalid`, avec le même message qu'un code d'invitation faux).
 */
export const JoinScouts = z.strictObject({ code: InviteCode }).meta({ id: 'JoinScouts' })
export type JoinScouts = z.infer<typeof JoinScouts>

/** PATCH /v1/me/scout : « Afficher la Goutte ». strictObject refuse tout autre champ. */
export const ScoutSettings = z.strictObject({ showDrop: z.boolean() }).meta({ id: 'ScoutSettings' })
export type ScoutSettings = z.infer<typeof ScoutSettings>

/**
 * L'adresse de l'écran où l'on était (« /projects/42 ») : elle commence par « / », sans espace, ni
 * caractère de contrôle (`\p{Cc}`), ni caractère de format invisible (`\p{Cf}`, qui comprend les
 * marques bidi capables de retourner un texte à l'affichage ; relecture de sécurité du plan, A3). Le
 * drapeau `u` de la regex permet ces classes Unicode. Ce qui
 * suit « ? » ou « # » (les paramètres) est accepté ici, puis coupé par l'API (`screenPathOf`) : on
 * ne garde jamais un paramètre, qui pourrait porter un jeton.
 */
export const ScoutScreen = z
  .string()
  .max(SCOUT_SCREEN_MAX)
  .regex(/^\/[^\s\p{Cc}\p{Cf}]*$/u)

/** L'adresse sans ses paramètres : tout ce qui suit le premier « ? » ou « # » est coupé. */
export const screenPathOf = (screen: string): string => screen.split(/[?#]/, 1)[0] ?? ''

/**
 * « Joint à ton retour » : l'écran, l'appareil et sa largeur, la version de l'appli, la langue et
 * le thème. Tout ou rien : la case « Joindre ces informations » décochée, `context` est absent.
 */
export const ScoutContext = z
  .strictObject({
    screen: ScoutScreen,
    platform: ScoutPlatform,
    width: z.int().min(0).max(SCOUT_WIDTH_MAX),
    // Le commit de l'appli web (`config.ts`, `EXPO_PUBLIC_APP_VERSION`), null en développement :
    // seulement de l'hexadécimal, rien qui puisse porter du texte (A3).
    appVersion: z
      .string()
      .regex(/^[0-9a-f]{7,40}$/)
      .nullable(),
    language: LanguageSchema,
    scheme: ScoutScheme,
  })
  .meta({ id: 'ScoutContext' })
export type ScoutContext = z.infer<typeof ScoutContext>

/**
 * La partie `report` (du JSON) de POST /v1/me/scout/reports, envoyé en multipart : à côté, une
 * partie `file` facultative porte la capture (`SCOUT_MEDIA_TYPES`, `SCOUT_MEDIA_MAX_BYTES`). La
 * gravité est obligatoire pour un Bug ou un Confus, refusée sinon : `refine` ajoute cette règle qui
 * relie deux champs. `missionId` : une mission de la semaine en cours (sinon 400
 * `scout_mission_invalid`, règle de l'API). `VisibleFreeText` refuse un texte vide ou fait seulement
 * de caractères invisibles.
 */
export const ScoutReportInput = z
  .strictObject({
    kind: ScoutReportKind,
    severity: ScoutSeverity.optional(),
    // 2 000 caractères, comptés comme on les voit (`[...text]` découpe par point de code : une
    // abeille 🐝 compte 1, alors que `.length` en compte 2) ; A3.
    text: VisibleFreeText(SCOUT_REPORT_TEXT_MAX * 2).refine(
      (text) => [...text].length <= SCOUT_REPORT_TEXT_MAX,
      { message: 'at most 2000 characters' },
    ),
    missionId: ScoutMissionId.optional(),
    context: ScoutContext.optional(),
  })
  .refine((report) => needsSeverity(report.kind) === (report.severity !== undefined), {
    message: 'a bug or a confusing spot needs a severity, and only they have one',
    path: ['severity'],
  })
  .meta({ id: 'ScoutReportInput' })
export type ScoutReportInput = z.infer<typeof ScoutReportInput>

/** Un texte de mission : 1 à 200 caractères, sur une ligne. */
const MissionText = ShortLabel(SCOUT_MISSION_TEXT_MAX)

/**
 * PUT /v1/moderation/scouts/missions : les missions de la semaine en cours, dans l'ordre (0 à 3).
 * Une mission gardée cite son `id` ; une mission absente est effacée ; une mission sans `id` est
 * neuve. Le texte anglais est facultatif (le français s'affiche à défaut). Le même `id` deux fois
 * est refusé.
 */
export const ScoutMissionsInput = z
  .strictObject({
    missions: z
      .array(
        z.strictObject({
          id: ScoutMissionId.optional(),
          textFr: MissionText,
          textEn: MissionText.optional(),
        }),
      )
      .max(SCOUT_MISSIONS_MAX),
  })
  .refine(
    (input) => {
      const ids = input.missions.flatMap((mission) =>
        mission.id === undefined ? [] : [mission.id],
      )
      return new Set(ids).size === ids.length
    },
    { message: 'each mission once', path: ['missions'] },
  )
  .meta({ id: 'ScoutMissionsInput' })
export type ScoutMissionsInput = z.infer<typeof ScoutMissionsInput>

/** La raison d'un retrait (« Retirer », pour un abus) : 1 à 500 caractères, dite à l'Éclaireuse. */
export const SCOUT_REMOVAL_REASON_MAX = 500

/**
 * DELETE /v1/moderation/scouts/{memberId} : la raison du retrait, écrite par l'administrateur. Elle
 * part dans l'avis `game_scout_removed` de l'Éclaireuse et dans son export : un retrait se motive.
 */
export const ScoutRemoval = z
  .strictObject({ reason: VisibleFreeText(SCOUT_REMOVAL_REASON_MAX) })
  .meta({ id: 'ScoutRemoval' })
export type ScoutRemoval = z.infer<typeof ScoutRemoval>

/** Les statuts que l'administrateur peut donner : tous, sauf « Envoyé » (celui du départ). */
export const ScoutTriageStatus = ScoutStatus.exclude(['sent'])
export type ScoutTriageStatus = z.infer<typeof ScoutTriageStatus>

/**
 * PATCH /v1/moderation/scouts/reports/{id} : un statut, la note privée, la note pour l'Éclaireuse.
 * Une note vide (« ») ou null efface la note. La note pour l'Éclaireuse ne va qu'avec « Corrigé » :
 * envoyée avec un autre statut, la forme la refuse ; envoyée seule, l'API vérifie que le retour est
 * déjà corrigé. Un retour corrigé ne change plus de statut (409 `scout_report_fixed`, règle de
 * l'API). Un corps vide ne changerait rien : refusé.
 */
export const ScoutReportPatch = z
  .strictObject({
    status: ScoutTriageStatus,
    adminNote: FreeText(SCOUT_ADMIN_NOTE_MAX).nullable(),
    fixedNote: FreeText(SCOUT_FIXED_NOTE_MAX).nullable(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'change at least one field' })
  .refine(
    (patch) =>
      patch.fixedNote === undefined || patch.status === undefined || patch.status === 'fixed',
    { message: 'a note for the scout goes with « fixed » only', path: ['fixedNote'] },
  )
  .meta({ id: 'ScoutReportPatch' })
export type ScoutReportPatch = z.infer<typeof ScoutReportPatch>

/** Le marque-page de la page de tri : la même forme que celui du fil. */
export const ScoutCursor = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)

/**
 * GET /v1/moderation/scouts/reports : les filtres (statut, sorte, gravité), tous facultatifs, et le
 * marque-page de la page suivante.
 */
export const ScoutReportsQuery = z.object({
  status: ScoutStatus.optional(),
  kind: ScoutReportKind.optional(),
  severity: ScoutSeverity.optional(),
  cursor: ScoutCursor.optional(),
})
export type ScoutReportsQuery = z.infer<typeof ScoutReportsQuery>

// --- Ce que l'API renvoie ---

/**
 * La mission à laquelle répond un retour : son texte (dans la langue du lecteur, le français à
 * défaut). Null : pas de mission, ou une mission effacée depuis (le retour garde son propre texte).
 */
export const ScoutReportMission = z.object({ id: ScoutMissionId, text: z.string() })
export type ScoutReportMission = z.infer<typeof ScoutReportMission>

/**
 * Un retour, tel que son autrice le voit (201 à l'envoi, « Mes retours ») : sa sorte, sa gravité
 * (null hors Bug et Confus), son texte (affiché en texte brut, jamais en Markdown), sa mission, ce
 * qui a été joint (null : la case décochée), l'adresse de sa capture (null : aucune ; elle ne
 * s'ouvre que pour elle et l'administrateur, `no-store`), son statut et la note « Corrigé ».
 * Jamais la note privée de l'administrateur : `strictObject` fait refuser par la validation de la
 * réponse toute clé de plus, pour qu'elle ne s'y glisse pas par mégarde.
 */
export const ScoutReport = z
  .strictObject({
    id: ScoutReportId,
    kind: ScoutReportKind,
    severity: ScoutSeverity.nullable(),
    text: z.string(),
    mission: ScoutReportMission.nullable(),
    context: ScoutContext.nullable(),
    mediaUrl: z.url().nullable(),
    status: ScoutStatus,
    fixedNote: z.string().nullable(),
    createdAt: z.iso.datetime(),
    fixedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'ScoutReport' })
export type ScoutReport = z.infer<typeof ScoutReport>

/** « Mes retours » (GET /v1/me/scout/reports) : les siens, les plus récents d'abord, 100 au plus. */
export const MyScoutReports = z
  .object({ reports: z.array(ScoutReport).max(SCOUT_MY_REPORTS_MAX) })
  .meta({ id: 'MyScoutReports' })
export type MyScoutReports = z.infer<typeof MyScoutReports>

/**
 * Les missions de la semaine (GET /v1/me/scout/missions) : la semaine (son lundi, à Paris), et
 * chaque mission dans l'ordre, avec son texte dans la langue du membre (le français à défaut) et
 * `done` si elle y a déjà répondu. Une semaine sans mission : une liste vide.
 */
export const ScoutMissions = z
  .object({
    week: GameWeek,
    missions: z
      .array(z.object({ id: ScoutMissionId, text: z.string(), done: z.boolean() }))
      .max(SCOUT_MISSIONS_MAX),
  })
  .meta({ id: 'ScoutMissions' })
export type ScoutMissions = z.infer<typeof ScoutMissions>

/** Une Éclaireuse dans la page de tri : de quoi écrire son nom, montrer sa photo et mener à sa page. */
export const ScoutMember = z.object({
  id: z.string(),
  name: z.string(),
  handle: z.string(),
  avatarUrl: z.url().nullable(),
})
export type ScoutMember = z.infer<typeof ScoutMember>

/** Une mission, telle que l'administrateur l'écrit : sa place (1 à 3) et ses deux textes. */
export const ScoutMissionAdmin = z
  .object({
    id: ScoutMissionId,
    position: z.int().min(1).max(SCOUT_MISSIONS_MAX),
    textFr: z.string(),
    textEn: z.string().nullable(),
  })
  .meta({ id: 'ScoutMissionAdmin' })
export type ScoutMissionAdmin = z.infer<typeof ScoutMissionAdmin>

/**
 * Le haut de la page de tri (GET /v1/moderation/scouts) : le mois, les places (« 18 sur 30 »), les
 * missions de la semaine en cours (`week`, son lundi), et les Éclaireuses, retirées comprises
 * (`removedAt`), avec leur nombre de retours.
 */
export const ScoutTriage = z
  .object({
    program: ScoutProgram,
    places: z.object({ taken: z.int().min(0).max(SCOUT_PLACES), max: z.literal(SCOUT_PLACES) }),
    week: GameWeek,
    missions: z.array(ScoutMissionAdmin).max(SCOUT_MISSIONS_MAX),
    scouts: z.array(
      z.object({
        member: ScoutMember,
        joinedAt: z.iso.datetime(),
        removedAt: z.iso.datetime().nullable(),
        reports: z.int().nonnegative(),
      }),
    ),
  })
  .meta({ id: 'ScoutTriage' })
export type ScoutTriage = z.infer<typeof ScoutTriage>

/**
 * Un retour dans la page de tri : tout ce que voit l'autrice, plus l'autrice elle-même, la note
 * privée et la date du dernier changement. Le texte d'un membre, affiché tel quel.
 */
export const ScoutReportAdmin = ScoutReport.extend({
  author: ScoutMember,
  adminNote: z.string().nullable(),
  updatedAt: z.iso.datetime(),
}).meta({ id: 'ScoutReportAdmin' })
export type ScoutReportAdmin = z.infer<typeof ScoutReportAdmin>

/** Une page de la liste des retours, les plus récents d'abord ; `nextCursor` vaut null tout au bout. */
export const ScoutReportPage = z
  .object({
    reports: z.array(ScoutReportAdmin).max(SCOUT_TRIAGE_PAGE_SIZE),
    nextCursor: ScoutCursor.nullable(),
  })
  .meta({ id: 'ScoutReportPage' })
export type ScoutReportPage = z.infer<typeof ScoutReportPage>

// --- L'export du compte ---

/**
 * `AccountExport.scout` (null : jamais Éclaireuse) : son entrée, son retrait et sa raison, ses
 * retours et le nombre de missions faites. Chaque retour a sa capture par son adresse, pas par le
 * fichier (comme `TesterMessageExport.captureUrl`), et la note de l'administrateur à son sujet :
 * l'export (droit d'accès du RGPD) donne tout ce qui la concerne, alors que « Mes retours » ne la
 * montre jamais. `mission` : le texte de la mission, ou null.
 */
export const ScoutExport = z.object({
  joinedAt: z.iso.datetime(),
  removedAt: z.iso.datetime().nullable(),
  removalReason: z.string().nullable(),
  reports: z.array(
    z.object({
      kind: ScoutReportKind,
      severity: ScoutSeverity.nullable(),
      text: z.string(),
      context: ScoutContext.nullable(),
      status: ScoutStatus,
      fixedNote: z.string().nullable(),
      adminNote: z.string().nullable(),
      captureUrl: z.url().nullable(),
      mission: z.string().nullable(),
      createdAt: z.iso.datetime(),
      fixedAt: z.iso.datetime().nullable(),
    }),
  ),
  missionsDone: z.int().nonnegative(),
})
export type ScoutExport = z.infer<typeof ScoutExport>
