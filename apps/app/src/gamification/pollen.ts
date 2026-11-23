// Le dernier pollen gagné par un geste (R19, la gamification), entre la réponse de l'API et la
// pastille « +2 pollen » qui le montre. Le hook du geste (réagir, commenter, devenir testeur…) lit
// `pollen` dans le résultat du client (en-tête `Waiggle-Pollen`, api/client.ts) et appelle
// `reportPollen` ; le composant qui porte la pastille (une réaction, « Envoyer », le coin des
// testeurs, ou l'hôte global de l'appli) la lit par `usePollenGain`.
//
// Pourquoi un petit magasin à part plutôt que le cache de React Query : un gain n'est pas une donnée
// de l'API qu'on relit, c'est un événement d'un instant (« ce geste vient de rapporter 2 »), lu par
// un composant qui n'a pas fait la requête. Ce fichier n'importe que React : chaque domaine de geste
// l'importe, il ne doit dépendre d'aucun d'eux (sinon une boucle d'imports ; règle vérifiée par
// scripts/architecture.mjs).
import { useEffect, useSyncExternalStore } from 'react'

/**
 * Où la pastille apparaît : au-dessus de la réaction posée (`reaction`), au-dessus d'« Envoyer » du
 * composeur de commentaires (`comment`) et du fil de retour (`feedback`), à droite du « Coin des
 * testeurs » (`tester`) ; les autres gestes (publier, suivre, une ruche, le profil…) dans l'hôte
 * global de l'appli (`global`), à la place du toast.
 */
export type PollenAnchor = 'reaction' | 'comment' | 'tester' | 'feedback' | 'global'

/**
 * Un gain à montrer. `key` change à chaque gain (même montant deux fois de suite) : c'est la clé de
 * rejeu de la pastille (`PollenGain trigger`). `target` (facultatif) dit lequel des porteurs du même
 * ancrage a fait le geste, quand une page en a plusieurs (la réaction « utile » parmi les quatre).
 */
export type PollenGain = { amount: number; key: number; target?: string }

type Shown = PollenGain & { anchor: PollenAnchor }

/**
 * Combien de temps un gain reste « le dernier » : le temps que la pastille se joue (montée et
 * fondu, ~1,2 s), avec de la marge. Ensuite le magasin revient à vide : un porteur monté plus tard
 * (une autre page de projet ouverte après) ne rejoue pas un gain d'avant.
 */
export const POLLEN_GAIN_MS = 2_500

// L'état du magasin : un seul gain à la fois (le plus récent remplace le précédent, une pastille à
// la fois), et les écouteurs à prévenir quand il change.
let shown: Shown | null = null
let lastKey = 0
let clearTimer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

// Le nombre de porteurs montés pour chaque ancrage. Un gain sans porteur à l'écran (une réaction
// posée depuis une carte du Fil, sans pastille à cet endroit) part à l'hôte global : un gain n'est
// jamais perdu sans être vu.
const mounted = new Map<PollenAnchor, number>()

const emit = () => {
  for (const listener of listeners) listener()
}

/**
 * Le geste vient de rapporter `amount` pollen : la pastille de l'ancrage le montre. Un montant qui
 * n'est pas un entier positif ne montre rien (jamais « +0 pollen »).
 */
export const reportPollen = (amount: number, anchor: PollenAnchor, target?: string): void => {
  if (!Number.isSafeInteger(amount) || amount <= 0) return
  const where = anchor !== 'global' && (mounted.get(anchor) ?? 0) === 0 ? 'global' : anchor
  lastKey += 1
  shown = {
    amount,
    key: lastKey,
    anchor: where,
    // La clé n'est posée que si elle a un sens : un gain de l'hôte global n'a pas de porteur choisi.
    ...(target !== undefined && where === anchor ? { target } : null),
  }
  clearTimeout(clearTimer)
  clearTimer = setTimeout(() => {
    shown = null
    emit()
  }, POLLEN_GAIN_MS)
  emit()
}

/**
 * Pour les tests : vide le magasin (aucun gain, aucun minuteur), comme au démarrage de l'appli. Les
 * porteurs montés restent comptés : c'est React qui les démonte.
 */
export const resetPollen = (): void => {
  clearTimeout(clearTimer)
  shown = null
  emit()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// `useSyncExternalStore` (React 18) branche un composant sur un état gardé hors de React : React
// appelle `subscribe` pour être prévenu d'un changement, puis relit l'état par `getSnapshot`. Le
// même objet tant que rien ne change : React ne redessine que si la référence change.
const getSnapshot = () => shown
// Au pré-rendu du site, aucun geste n'a eu lieu : pas de pastille.
const getServerSnapshot = () => null

/**
 * Hook : le dernier gain de cet ancrage (`{ amount, key, target? }`), ou `null` (aucun, ou montré
 * ailleurs). Monter ce hook déclare un porteur de l'ancrage : tant qu'il est à l'écran, les gains de
 * cet ancrage lui reviennent au lieu de l'hôte global.
 */
export const usePollenGain = (anchor: PollenAnchor): PollenGain | null => {
  useEffect(() => {
    mounted.set(anchor, (mounted.get(anchor) ?? 0) + 1)
    return () => {
      mounted.set(anchor, Math.max(0, (mounted.get(anchor) ?? 0) - 1))
    }
  }, [anchor])
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  if (current === null || current.anchor !== anchor) return null
  // On rend un objet sans `anchor` (déjà connu de l'appelant), le même tant que le gain ne change pas.
  return gainOf(current)
}

// Le gain rendu, gardé pour la référence du dernier état : deux lectures du même gain rendent le
// même objet, une dépendance d'effet (`[gain]`) ne se relance pas à chaque rendu.
let lastShown: Shown | null = null
let lastGain: PollenGain | null = null
const gainOf = (current: Shown): PollenGain => {
  if (current !== lastShown || lastGain === null) {
    const { anchor: _anchor, ...gain } = current
    lastShown = current
    lastGain = gain
  }
  return lastGain
}
