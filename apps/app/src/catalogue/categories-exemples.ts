// Les catégories des exemples du catalogue : des exemples fixes, tirés des seize catégories de test
// (`testing/categories.ts`), dans la langue de l'appli. Le catalogue ne lit pas l'API : il n'y a
// ni réseau ni cache de requêtes sous ses exemples.
import { categoryOf } from '../categories/api'
import { optionOf } from '../projects/categories'
import { categoryList } from '../testing/categories'

/** Toutes les catégories d'exemple, dans l'ordre de la feuille (« Autre » en dernier). */
export const sampleCategories = (language: string) =>
  categoryList(language === 'en' ? 'en' : 'fr').categories

/** Une catégorie d'exemple prête à afficher (nom, icône), par son code. */
export const sampleCategory = (language: string, code: string) => {
  const found = categoryOf(sampleCategories(language), code)
  if (!found) throw new Error(`catégorie d'exemple inconnue : ${code}`)
  return optionOf(found)
}
