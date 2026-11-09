// Ce qui passe d'un outil du catalogue à sa feuille de modification (`screens/ToolEditSheet.tsx`),
// et retour : des fonctions pures, sans dépendance, dans un fichier à part (un test qui remplace
// `tools/api.ts` ne les perd pas). Utilisées par la page « Outils » de la Modération (tranche R6b).
// La page d'un outil (`TagScreen`) en a encore sa propre copie, à rapprocher de celle-ci.
import type { AdminCatalogueTool, ToolAdmit, ToolEdit } from '@ruche/contracts'

/** Les champs d'un outil d'administration, comme la feuille les attend (description vide : « »). */
export const initialOf = (tool: AdminCatalogueTool): Partial<ToolAdmit> => ({
  name: tool.name,
  family: tool.family,
  descriptionFr: tool.descriptionFr ?? '',
  descriptionEn: tool.descriptionEn ?? '',
  siteUrl: tool.siteUrl,
})

/** Ce qui a changé entre l'outil et les valeurs de la feuille : le PATCH n'envoie que cela. */
export const changesOf = (before: Partial<ToolAdmit>, after: ToolAdmit): ToolEdit => {
  const changes: ToolEdit = {}
  if (after.name !== before.name) changes.name = after.name
  if (after.family !== before.family) changes.family = after.family
  if (after.descriptionFr !== before.descriptionFr) changes.descriptionFr = after.descriptionFr
  if (after.descriptionEn !== before.descriptionEn) changes.descriptionEn = after.descriptionEn
  if (after.siteUrl !== before.siteUrl) changes.siteUrl = after.siteUrl
  return changes
}
