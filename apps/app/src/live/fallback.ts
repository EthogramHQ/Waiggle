// Le repli du temps réel (R21, choix 10 du plan) : avant R21, l'appli guettait le nouveau en relisant
// toutes les minutes la cloche (`useUnreadCount`), la tête du Fil (`useFeedNews`) et « mes ruches »
// sous la pastille d'une ruche (HomeScreen). Le flux du temps réel rend ces relectures inutiles tant
// qu'il est là : chaque changement arrive en signal. Mais il peut manquer (un réseau d'entreprise qui
// coupe les réponses longues, une coupure qui dure, un sixième appareil qui a pris sa place) ; les
// relectures d'une minute reprennent alors, comme avant.
//
// Ce fichier tient une seule information, partagée par toute l'appli : « le flux couvre-t-il le
// membre ? ». La connexion (connection.tsx) l'écrit ; les trois lectures la lisent par
// `useLiveFallback()`. Le flux couvre quand il est ouvert, ou quand il va se rouvrir sous peu (moins de
// trois échecs de suite). Il ne couvre pas :
// - sans connexion montée (un visiteur, la page pré-rendue, les tests d'écran d'avant R21) ;
// - après trois échecs de suite, jusqu'au prochain flux ouvert ;
// - après `replaced`, jusqu'au retour au premier plan ;
// - en arrière-plan : les relectures d'une minute s'y taisent d'elles-mêmes (React Query ne relit
//   pas en arrière-plan), et le retour au premier plan rouvre le flux.
//
// L'interface :
//   setLiveCovers(covers: boolean): void   pour la connexion seulement ;
//   useLiveFallback(): boolean             vrai : relire toutes les minutes, comme avant R21.
import { useSyncExternalStore } from 'react'

// Un « magasin » au niveau du module (comme topics.ts) : une valeur hors de React, et les composants
// qui veulent être redessinés quand elle change.
let covers = false
const listeners = new Set<() => void>()

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** La connexion dit si le flux couvre le membre ; les lectures du repli sont prévenues. */
export const setLiveCovers = (next: boolean): void => {
  if (next === covers) return
  covers = next
  for (const listener of [...listeners]) listener()
}

/**
 * Hook : faut-il relire toutes les minutes, faute de flux ? `useSyncExternalStore` lit la valeur
 * du magasin et redessine le composant quand elle change. Sur la page pré-rendue, le troisième
 * argument donne la même réponse qu'au premier affichage du navigateur (aucun flux encore) : pas
 * d'écart à l'hydratation.
 */
export const useLiveFallback = (): boolean =>
  !useSyncExternalStore(
    subscribe,
    () => covers,
    () => false,
  )
