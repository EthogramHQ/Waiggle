// Les éléments d'un fil, sans rien d'autre : un fichier sans dépendance, que les écrans importent
// même quand leurs tests remplacent les requêtes (feed/api.ts) par de faux résultats.
import type { FeedItem } from '@ruche/contracts'

/** L'identifiant d'un élément du fil : celui du projet, ou celui de la note. */
export const feedItemId = (item: FeedItem) =>
  item.kind === 'note' ? item.note.id : item.project.id
