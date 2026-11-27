// Le temps réel (R21, docs/scenarios/refonte.md, « R21 — Le temps réel ») : ce que font les autres
// membres arrive tout de suite sur l'écran ouvert, sans recharger. Le serveur garde un flux ouvert
// par appareil (SSE : « Server-Sent Events », une réponse HTTP qui ne se termine pas et où le serveur
// écrit un message chaque fois qu'il a quelque chose à dire). Chaque message est un **signal sans
// contenu** : « les commentaires du projet X ont changé ». L'appli relit alors ce qu'il faut, avec
// ses propres droits ; aucun texte, aucun nom, aucun nombre ne passe par le flux. Ce fichier tient
// les formes du flux et ses règles chiffrées ; une règle qui change ne change qu'ici.
//
// Les routes :
// - GET /v1/live : le flux (`text/event-stream`). Son premier message, `hello`, donne l'identifiant
//   de la connexion (`LiveHello`) ; ensuite des `signal` (`LiveEvent`) et, toutes les
//   `LIVE_PING_MS`, un commentaire `: ping` qui garde la connexion ouverte ;
// - PUT /v1/live/{connectionId}/topics (`LiveTopicsBody`) : les sujets des écrans ouverts. Le serveur
//   garde ceux que le membre a le droit de lire et ignore les autres sans le dire → 204.
import { z } from 'zod'

// --- Les règles chiffrées ---

/** Un battement toutes les 20 secondes : un intermédiaire ne coupe pas une connexion qui parle. */
export const LIVE_PING_MS = 20_000
/** 20 sujets déclarés au plus par connexion (les écrans ouverts en même temps). */
export const LIVE_MAX_TOPICS = 20
/** 5 flux ouverts au plus par membre ; au sixième, le plus ancien est fermé. */
export const LIVE_MAX_STREAMS = 5
/** 30 ouvertures de flux par membre et par minute. */
export const LIVE_OPENS_PER_MINUTE = 30
/** 60 déclarations de sujets par membre et par minute. */
export const LIVE_TOPICS_PER_MINUTE = 60

// --- Les sujets ---

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
// Le même motif que `MemberId` (members.ts), que le test du contrat compare.
const MEMBER = '[A-Za-z0-9_-]{1,64}'

/**
 * Un sujet : ce qu'un écran regarde.
 * - `me` : ce qui ne concerne que le membre (Activité, pollen, Goutte, ses fils de testeur) ;
 * - `feed` : une publication publique (le bouton des nouveautés du Fil et d'Explorer) ;
 * - `moderation`, `scouts` : la file de modération et la page de tri, pour l'administrateur ;
 * - `project:<id>`, `member:<id>`, `hive:<id>`, `corner:<id du projet>` : une page ouverte.
 * `me`, `feed`, `moderation` et `scouts` viennent d'office avec le flux ; seuls les quatre derniers
 * se déclarent.
 */
export const LiveTopic = z
  .string()
  .regex(
    new RegExp(
      `^(me|feed|moderation|scouts|project:${UUID}|hive:${UUID}|corner:${UUID}|member:${MEMBER})$`,
    ),
  )
  .meta({ id: 'LiveTopic' })
export type LiveTopic = z.infer<typeof LiveTopic>

/** Les sujets qu'un écran peut déclarer (les autres viennent d'office). */
export const DeclaredLiveTopic = LiveTopic.refine((topic) => topic.includes(':'))

/** Ce qui a changé. `gone` : le sujet n'est plus permis (projet passé en privé, blocage…). */
export const LiveKind = z
  .enum([
    'comments',
    'reactions',
    'followers',
    'testers',
    'updates',
    'project',
    'hive',
    'corner',
    'notifications',
    'feed',
    'moderation',
    'scouts',
    'pollen',
    'gone',
  ])
  .meta({ id: 'LiveKind' })
export type LiveKind = z.infer<typeof LiveKind>

/** Un signal : seulement le sujet et ce qui a changé, jamais de contenu. */
export const LiveEvent = z
  .strictObject({ topic: LiveTopic, kind: LiveKind })
  .meta({ id: 'LiveEvent' })
export type LiveEvent = z.infer<typeof LiveEvent>

/** Le premier message du flux : l'identifiant de la connexion, pour déclarer ses sujets. */
export const LiveHello = z.strictObject({ connectionId: z.uuid() }).meta({ id: 'LiveHello' })
export type LiveHello = z.infer<typeof LiveHello>

/** Les sujets des écrans ouverts ; la liste remplace la précédente. */
export const LiveTopicsBody = z
  .strictObject({ topics: z.array(DeclaredLiveTopic).max(LIVE_MAX_TOPICS) })
  .meta({ id: 'LiveTopicsBody' })
export type LiveTopicsBody = z.infer<typeof LiveTopicsBody>

/**
 * Les noms des messages du flux (le champ `event:` du SSE). `replaced` : le flux est fermé parce que
 * le membre en a ouvert un sixième ailleurs ; l'appli ne se reconnecte alors qu'à son retour au
 * premier plan, sinon deux appareils se fermeraient l'un l'autre en boucle (relecture du plan, A2).
 */
export const LIVE_EVENT_NAMES = { hello: 'hello', signal: 'signal', replaced: 'replaced' } as const

/**
 * Toutes les 60 secondes, le serveur relit la session, le compte et le rôle d'administrateur de
 * chaque flux ouvert ; un flux dont la session a pris fin (déconnexion, mot de passe changé, compte
 * supprimé) est fermé, et `moderation` / `scouts` partent quand le rôle est retiré (relecture, B2).
 */
export const LIVE_RECHECK_MS = 60_000
