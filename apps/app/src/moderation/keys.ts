// La clé de la file de modération dans le cache de React Query, à part de `moderation/api` (R21) :
// la table du temps réel (live/invalidations.ts), montée avec l'appli, la lit sans charger tout le
// module de la modération ; et l'écran de la modération la lit même quand ses tests remplacent
// `moderation/api` par de faux hooks.

/** La file des signalements à traiter : un signal `moderation` la marque périmée. */
export const queueKey = ['moderation', 'queue'] as const
