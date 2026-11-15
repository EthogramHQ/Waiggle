// Les coordonnées des Mentions légales (tranche R11) : qui publie Waiggle, qui dirige la
// publication, et qui l'héberge. La loi pour la confiance dans l'économie numérique (LCEN, art. 6)
// demande qu'un site les donne. Seul endroit où elles sont écrites : la page /legal les lit ici.
import { contactEmail } from './name'

/**
 * La marque d'une valeur pas encore donnée. Les coordonnées de l'éditeur sont tapées par Louis
 * avant le déploiement (décision du 15/11/2026) ; d'ici là, chaque champ inconnu vaut ce texte, et
 * `legalPlaceholders()` dit lesquels restent à remplir.
 */
export const legalPlaceholder = '[…]'

/**
 * `as const` fige l'objet : ses valeurs ne changent pas pendant que l'appli tourne, et le type garde
 * leur forme exacte.
 */
export const legal = {
  /** L'éditeur : Louis, en micro-entreprise. `siren` : son numéro d'entreprise (9 chiffres). */
  publisher: {
    name: legalPlaceholder,
    address: legalPlaceholder,
    siren: legalPlaceholder,
    email: contactEmail,
  },
  /** Le directeur de la publication : la personne qui répond de ce qui est publié. */
  publicationDirector: legalPlaceholder,
  /**
   * L'hébergeur : le serveur (un VPS) est loué chez Hostinger et se trouve à Paris
   * (docs/adr/0003-hebergement.md). Sa raison sociale exacte, son adresse et son téléphone sont à
   * recopier depuis ses propres mentions légales.
   */
  host: {
    name: 'Hostinger',
    address: legalPlaceholder,
    phone: legalPlaceholder,
  },
} as const

/**
 * Les champs encore marqués `[…]`, par leur chemin (« publisher.siren »). Vide quand tout est
 * rempli : la vérification d'avant le déploiement s'en sert.
 */
export const legalPlaceholders = (): string[] => {
  const missing: string[] = []
  const visit = (value: unknown, path: string) => {
    if (value === legalPlaceholder) missing.push(path)
    else if (typeof value === 'object' && value !== null) {
      for (const [key, inner] of Object.entries(value)) visit(inner, path ? `${path}.${key}` : key)
    }
  }
  visit(legal, '')
  return missing
}
