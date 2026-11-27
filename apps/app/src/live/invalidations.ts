// La table « signal → lectures à refaire » du temps réel (R21, choix 2 et 10 du plan) : un signal ne
// porte que son sujet et sa sorte (« les commentaires du projet X ont changé »), jamais de contenu ;
// ce fichier dit quelles lectures du cache il rend périmées. L'appli les relit alors avec les droits
// du membre, comme si l'écran s'était rouvert.
//
// Le cache de React Query range chaque lecture sous une clé (`['comments', id]`, `['project', id]`…).
// `queryClient.invalidateQueries(filtre)` marque périmées les lectures dont la clé commence par celle
// du filtre (ou qui passent son `predicate`), et relit tout de suite celles qu'un écran montre (les
// lectures « actives ») ; les autres attendront leur prochain écran. Chaque élément rendu par
// `invalidationsFor` est un tel filtre, à donner tel quel à `invalidateQueries`. Les clés viennent
// des modules qui font ces lectures : une clé qui change ne change que chez eux.
//
// Deux règles :
// - les files qui ne se relisent jamais seules, exprès, pour que rien ne bouge sous le doigt (la
//   file de modération, la page de tri des Éclaireuses, la liste de l'Activité) sont seulement
//   marquées périmées (`refetchType: 'none'`) : l'écran annonce l'arrivée, et elles se relisent à
//   leur prochaine ouverture ;
// - le Fil : seule sa tête se relit (`[...fil affiché, 'head']`, `useFeedNews` de feed/api.ts) ;
//   le bouton des nouveautés paraît, la liste ne bouge pas.
// Les filtres d'un même signal ne se recouvrent jamais : deux `invalidateQueries` sur la même
// lecture la relanceraient deux fois (le second annule le premier et relit).
import { type LiveEvent, LiveKind, type LiveTopic } from '@ruche/contracts'
import { type InvalidateQueryFilters, matchQuery, type Query } from '@tanstack/react-query'
import { commentsQueryKey } from '../comments/api'
import { feedQueryKey } from '../feed/api'
import { harvestQueryKey } from '../gamification/keys'
import { hiveQueryKey, myHivesQueryKey } from '../hives/api'
import { queueKey as moderationQueueKey } from '../moderation/keys'
import { scoutTriageKey } from '../moderation/scouts/api'
import { listKey as activityListKey, unreadKey } from '../notifications/api'
import { projectQueryKey } from '../projects/hooks'
import { scoutKeys } from '../scout/api'
import {
  allCornersKey,
  allThreadMessagesKey,
  allThreadsKey,
  callsKey,
  cornerKey,
  myTesterMessagesKey,
} from '../testers/corner-api'
import { projectUpdatesQueryKey } from '../updates/api'

/** La page d'un membre : la clé de `useMember` (members/api.ts), qui n'a pas de fabrique. */
const memberKey = (id: string) => ['member', id] as const

/** Les têtes des fils (Fil, Explorer, et leurs filtres) : une clé `['feed', …, 'head']`. */
const feedHeads: InvalidateQueryFilters = {
  queryKey: feedQueryKey,
  predicate: (query) => query.queryKey.at(-1) === 'head',
}

/** Marquée périmée, jamais relue d'elle-même : la file reste à sa place sous les yeux du membre. */
const kept = (queryKey: readonly unknown[]): InvalidateQueryFilters => ({
  queryKey,
  refetchType: 'none',
})

/** Ce qu'un signal sur la page d'un projet fait relire. */
const forProject = (id: string, kind: LiveKind): InvalidateQueryFilters[] => {
  switch (kind) {
    // Le nombre de commentaires est lu avec la page du projet : les deux se relisent.
    case 'comments':
      return [{ queryKey: commentsQueryKey(id) }, { queryKey: projectQueryKey(id) }]
    // Les nombres de la page (réactions, abonnés, testeurs) et ce que l'auteur a changé.
    case 'reactions':
    case 'followers':
    case 'testers':
    case 'project':
      return [{ queryKey: projectQueryKey(id) }]
    case 'updates':
      return [{ queryKey: projectUpdatesQueryKey(id) }]
    // Le projet n'est plus permis (passé en privé, retiré, blocage) : l'appli relit, reçoit le 404,
    // et l'écran retire le projet (choix 3 du plan).
    case 'gone':
      return [
        { queryKey: projectQueryKey(id) },
        { queryKey: commentsQueryKey(id) },
        { queryKey: projectUpdatesQueryKey(id) },
      ]
    default:
      return []
  }
}

/** Ce qu'un signal personnel (`me`) fait relire : ce qui ne concerne que le membre. */
const forMe = (kind: LiveKind): InvalidateQueryFilters[] => {
  switch (kind) {
    // La cloche se recompte ; la liste de l'Activité ouverte ne bouge pas sous le doigt.
    case 'notifications':
      return [{ queryKey: unreadKey }, kept(activityListKey)]
    case 'pollen':
      return [{ queryKey: harvestQueryKey }]
    // La Goutte : un retour d'Éclaireuse a été entendu (missions et retours, sous `['scout']`).
    case 'scouts':
      return [{ queryKey: scoutKeys.all }]
    // Un message dans un de ses fils de testeur : il ne part qu'au `me` des deux personnes du fil,
    // jamais sur `corner:` (relecture du plan, B1), et sans dire de quel projet. Se relisent donc
    // « Mes retours envoyés », le fil ouvert (ses messages), et, chez l'auteur, la liste de ses
    // fils (le point « non lu », « À traiter » et « Réglés ») et le coin ; seules les lectures
    // montrées à l'écran repartent.
    case 'corner':
      return [
        { queryKey: myTesterMessagesKey },
        { queryKey: allThreadMessagesKey },
        { queryKey: allThreadsKey },
        { queryKey: allCornersKey },
      ]
    // Une invitation reçue, acceptée ou refusée, une ruche rejointe : « mes ruches », qui porte
    // aussi les invitations valables (hives/api.ts).
    case 'hive':
      return [{ queryKey: myHivesQueryKey, exact: true }]
    // Un projet publié dans une de ses ruches : les têtes des fils, et la liste de ses ruches.
    case 'feed':
      return [feedHeads, { queryKey: myHivesQueryKey, exact: true }]
    default:
      return []
  }
}

/** La sorte du signal, d'après le préfixe de son sujet (`project:…`), et son identifiant. */
const splitTopic = (topic: LiveTopic): [string, string] => {
  const colon = topic.indexOf(':')
  return colon === -1 ? [topic, ''] : [topic.slice(0, colon), topic.slice(colon + 1)]
}

/**
 * Les lectures qu'un signal rend périmées : chaque filtre se donne tel quel à
 * `queryClient.invalidateQueries`. Un signal inattendu pour son sujet (une sorte que ce sujet
 * n'émet pas) ne relit rien.
 */
export const invalidationsFor = (event: LiveEvent): InvalidateQueryFilters[] => {
  const [prefix, id] = splitTopic(event.topic)
  switch (prefix) {
    case 'project':
      return forProject(id, event.kind)
    // La page d'un membre : ses abonnés, ses projets, ou le membre n'est plus permis (`gone`).
    case 'member':
      return [{ queryKey: memberKey(id) }]
    // Tout ce qui est rangé sous la ruche (sa page, ses membres, ses projets, son activité).
    case 'hive':
      return [{ queryKey: hiveQueryKey(id) }]
    // Le coin d'un projet : son état (les testeurs), et ses appels (un appel neuf de l'auteur).
    case 'corner':
      return [{ queryKey: cornerKey(id) }, { queryKey: callsKey(id) }]
    case 'me':
      return forMe(event.kind)
    case 'feed':
      return event.kind === 'feed' ? [feedHeads] : []
    // Les files de l'administrateur : marquées périmées, relues à leur prochaine ouverture.
    case 'moderation':
      return [kept(moderationQueueKey)]
    case 'scouts':
      return [kept(scoutTriageKey)]
    default:
      return []
  }
}

/**
 * Le rattrapage d'une (re)connexion (choix 10 du plan) : ce qu'une coupure a pu faire manquer sur
 * les sujets écoutés, et l'Activité (`me`). Toutes les sortes de chaque sujet sont réunies en deux
 * filtres au plus : un pour ce qui se relit, un pour ce qui reste à sa place. Un filtre par signal
 * relirait plusieurs fois la même lecture (la page d'un projet, par ses commentaires et ses
 * réactions) ; un seul `predicate` la relit une fois. `matchQuery` est la règle même de
 * `invalidateQueries` : « cette lecture passe-t-elle ce filtre ? ».
 */
export const catchUpFor = (topics: readonly LiveTopic[]): InvalidateQueryFilters[] => {
  const reread: InvalidateQueryFilters[] = []
  const stale: InvalidateQueryFilters[] = []
  for (const topic of new Set<LiveTopic>(['me', ...topics]))
    for (const kind of LiveKind.options)
      for (const filters of invalidationsFor({ topic, kind }))
        (filters.refetchType === 'none' ? stale : reread).push(filters)
  const anyOf = (list: InvalidateQueryFilters[]) => (query: Query) =>
    list.some((filters) => matchQuery(filters, query))
  return [
    ...(reread.length > 0 ? [{ predicate: anyOf(reread) }] : []),
    ...(stale.length > 0 ? [{ predicate: anyOf(stale), refetchType: 'none' as const }] : []),
  ]
}
