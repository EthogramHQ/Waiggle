// La clé de « Ma récolte » dans le cache de React Query, à part de `gamification/api` : les hooks de
// geste (réactions, commentaires…) l'invalident, et `gamification/api` lit lui-même un domaine de
// geste (`projects/hooks`) : la clé vit ici pour qu'aucun import ne boucle.

/** La clé de « Ma récolte » dans le cache : un geste qui rapporte du pollen l'invalide. */
export const harvestQueryKey = ['harvest'] as const
