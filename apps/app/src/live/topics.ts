// Les sujets du temps réel que les écrans ouverts regardent (R21, choix 3 et 10 du plan) : la page
// d'un projet écoute `project:<id>`, celle d'un membre `member:<id>`, celle d'une ruche `hive:<id>`,
// le fil d'un testeur `corner:<id du projet>`. Ce fichier les réunit dans un magasin ; la connexion
// (connection.tsx) les envoie au serveur, par `PUT /v1/live/<connexion>/topics`.
//
// Un « magasin » est ici une donnée gardée au niveau du module, hors de React : une seule liste pour
// toute l'appli, que n'importe quel écran modifie et que la connexion lit, sans passer par un
// contexte. Chaque sujet a un compteur : deux écrans ouverts sur le même projet ne déclarent qu'un
// sujet, et le sujet part quand le dernier des deux se ferme.
//
// L'interface, pour les écrans :
//   useLiveTopic(topic: LiveTopic | null): void
//     déclare le sujet tant que le composant est monté ; `null` : rien à déclarer (l'identifiant
//     n'est pas encore connu). Un sujet qui change (la page passe à un autre projet) retire l'ancien
//     et ajoute le nouveau. Seuls les sujets déclarables passent (`DeclaredLiveTopic` : avec un
//     « : » et un identifiant bien formé) : `me`, `feed`, `moderation` et `scouts` viennent d'office
//     avec le flux, et un identifiant mal formé (une adresse tapée à la main) ferait refuser toute la
//     liste par le serveur.
//
// L'interface, pour la connexion :
//   liveTopics(): readonly LiveTopic[]
//     la liste actuelle, celle à envoyer telle quelle dans `{ topics }`. Ses sujets sont uniques,
//     dans l'ordre où ils ont été ouverts, et 20 au plus (`LIVE_MAX_TOPICS`) : au-delà, les plus
//     anciens restent hors de la liste (le serveur refuserait la liste entière). Le tableau rendu
//     est le même tant que rien ne change : il peut servir d'instantané à `useSyncExternalStore`.
//   subscribeTopics(listener: () => void): () => void
//     appelle `listener` à chaque changement de la liste (un sujet ajouté ou retiré, pas un
//     deuxième écran sur le même sujet) ; rend la fonction qui désabonne. L'appel est immédiat et
//     peut venir plusieurs fois de suite (plusieurs écrans montés d'un coup) : c'est à la connexion
//     de regrouper ses envois (300 ms).
import { DeclaredLiveTopic, LIVE_MAX_TOPICS, type LiveTopic } from '@ruche/contracts'
import { useEffect } from 'react'

// Le compteur de chaque sujet : combien d'écrans montés le déclarent. Une `Map` garde l'ordre
// d'ajout, celui de la liste rendue.
const counts = new Map<LiveTopic, number>()
const listeners = new Set<() => void>()
// La liste rendue par `liveTopics()`, refaite seulement quand un sujet arrive ou part.
let snapshot: readonly LiveTopic[] = []

/** Refait la liste et prévient les abonnés (la connexion). */
const changed = () => {
  snapshot = [...counts.keys()].slice(-LIVE_MAX_TOPICS)
  for (const listener of [...listeners]) listener()
}

const addTopic = (topic: LiveTopic) => {
  const count = counts.get(topic) ?? 0
  counts.set(topic, count + 1)
  if (count === 0) changed()
}

const removeTopic = (topic: LiveTopic) => {
  const count = counts.get(topic) ?? 0
  if (count <= 1) {
    if (counts.delete(topic)) changed()
  } else counts.set(topic, count - 1)
}

/** Les sujets des écrans ouverts, uniques, 20 au plus : ce que la connexion déclare au serveur. */
export const liveTopics = (): readonly LiveTopic[] => snapshot

/** Prévient `listener` à chaque sujet ajouté ou retiré ; rend la fonction qui désabonne. */
export const subscribeTopics = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Hook : l'écran déclare `topic` tant qu'il est monté, pour recevoir ses signaux. `useEffect` lance
 * l'ajout après l'affichage, et sa fonction de nettoyage le retrait : au démontage, ou avant
 * d'ajouter le nouveau sujet quand `topic` change.
 */
export const useLiveTopic = (topic: LiveTopic | null): void => {
  useEffect(() => {
    if (topic === null || !DeclaredLiveTopic.safeParse(topic).success) return
    addTopic(topic)
    return () => removeTopic(topic)
  }, [topic])
}
