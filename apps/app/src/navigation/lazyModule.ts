// Une partie d'écran chargée à la demande (R19, après la garde de poids de R18) : comme `lazyScreen`
// le fait pour une route entière, `lazyModule` le fait pour un morceau posé DANS une page (la
// feuille « Offrir du miel » d'un projet, le rayon d'un membre). Ce que la page n'utilise pas dès
// son arrivée ne pèse pas dans le script de départ de l'accueil.
//
// `load` rend le module par un `import()` : sur le web, la construction du site range ce module
// dans un morceau à part (on rejoint un morceau existant de `navigation/chunks/`, on n'en crée pas
// un neuf, pour la raison dite dans `chunks/moderation.ts`). Sur téléphone, tout est déjà dans
// l'appli installée : la promesse se tient aussitôt.
//
// Contrairement à `lazyScreen`, rien ne s'affiche à la place pendant l'attente : c'est à
// l'appelant de ne pas montrer la partie tant que le module manque (`null`), et de décider si
// l'attente se voit (la page d'un membre garde son attente) ou non (une feuille fermée).
import { useEffect, useState } from 'react'
import { forgetReload, reloadOnce } from '../chunkReload'

/**
 * Fabrique le hook d'un module à la demande. À appeler une fois, au niveau du module :
 * `const useHarvestParts = lazyModule(() => import('…/chunks/settings'))`.
 * Le hook prend `wanted` : tant qu'il est faux, rien n'est demandé ; vrai, le module est demandé
 * (une seule fois pour toute l'appli) et le hook le rend dès qu'il est arrivé, `null` avant.
 */
export function lazyModule<M>(load: () => Promise<M>): (wanted?: boolean) => M | null {
  // Comme `lazyScreen` : le module arrivé sert à toutes les visites suivantes, la promesse en
  // cours est partagée, un échec s'oublie pour qu'un nouvel essai redemande le morceau.
  let loaded: M | null = null
  let pending: Promise<M> | null = null
  const fetchModule = () => {
    pending ??= load().then(
      (module) => {
        loaded = module
        forgetReload()
        return module
      },
      (error: unknown) => {
        pending = null
        throw error
      },
    )
    return pending
  }

  // biome-ignore lint/correctness/noComponentHookFactories: la fabrique s'appelle une fois par module, au chargement du fichier, jamais pendant un rendu : le hook garde la même identité d'un rendu à l'autre.
  return function useLazyModule(wanted = true) {
    // `useState(() => …)` : la fonction donne la valeur de départ (le module déjà arrivé, ou null).
    const [module, setModule] = useState<M | null>(() => loaded)
    const [failure, setFailure] = useState<{ error: unknown } | null>(null)
    useEffect(() => {
      if (!wanted || module) return
      // `live` : le composant a pu disparaître avant l'arrivée du morceau.
      let live = true
      fetchModule().then(
        (next) => {
          if (live) setModule(() => next)
        },
        (error: unknown) => {
          // Un morceau introuvable (onglet ouvert avant une mise en ligne) : la page se recharge,
          // une seule fois par adresse ; sinon l'erreur va à l'écran de secours de la route.
          if (live && !reloadOnce()) setFailure({ error })
        },
      )
      return () => {
        live = false
      }
    }, [wanted, module])
    if (failure) throw failure.error
    return module
  }
}
