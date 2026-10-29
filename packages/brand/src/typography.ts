// Les lettres : deux familles de la même fonderie, une police à chasse fixe et une échelle de tailles.
// Funnel Display pour les titres (serrée, avec du caractère), Funnel Sans pour tout le reste, et
// Geist Mono en petites touches (étiquettes, versions, compteurs, prompts). Toutes sont sous licence
// libre OFL et livrées avec l'appli : aucune requête vers Google.

export const fontFamilies = {
  display: 'Funnel Display',
  text: 'Funnel Sans',
  mono: 'Geist Mono',
} as const
export type FontFamily = keyof typeof fontFamilies

/** Les graisses livrées avec l'appli. Une graisse absente d'ici n'existe pas dans l'appli. */
export const fontWeights = {
  display: [700],
  text: [400, 500, 600, 700, 800],
  mono: [400, 500],
} as const satisfies Record<FontFamily, readonly number[]>

export type FontWeight = 400 | 500 | 600 | 700 | 800

/** La graisse des initiales d'un avatar : très grasse, pour qu'elles se lisent même toutes petites. */
export const initialsWeight = 800

type TextStyle = {
  family: FontFamily
  size: number // taille en points (≈ pixels sur le web)
  lineHeight: number // hauteur de ligne, en points
  weight: FontWeight
  tracking: number // interlettrage en fraction de la taille : -0.03 resserre les lettres de 3 %
}

/**
 * L'échelle des textes, du plus grand au plus petit. Un composant choisit un rôle (« title2 »)
 * plutôt qu'une taille : pour agrandir tous les titres de projet, on change une seule ligne.
 */
export const textStyles = {
  toolNameWide: { family: 'display', size: 100, lineHeight: 92, weight: 700, tracking: -0.055 }, // nom géant d'un outil (ordinateur)
  hero: { family: 'display', size: 76, lineHeight: 80, weight: 700, tracking: -0.05 }, // le logo d'accueil
  toolName: { family: 'display', size: 64, lineHeight: 60, weight: 700, tracking: -0.055 }, // nom géant d'un outil
  poster: { family: 'display', size: 56, lineHeight: 58, weight: 700, tracking: -0.045 }, // l'affiche d'un écran de marque
  display: { family: 'display', size: 44, lineHeight: 48, weight: 700, tracking: -0.045 }, // grand titre (ordinateur)
  title1: { family: 'display', size: 38, lineHeight: 40, weight: 700, tracking: -0.04 }, // nom sur un profil
  title2: { family: 'display', size: 34, lineHeight: 38, weight: 700, tracking: -0.035 }, // titre d'un projet
  title3: { family: 'display', size: 27, lineHeight: 30, weight: 700, tracking: -0.03 }, // titre d'une carte
  heading: { family: 'display', size: 22, lineHeight: 26, weight: 700, tracking: -0.02 }, // titre de section
  lead: { family: 'text', size: 19, lineHeight: 26, weight: 400, tracking: 0 }, // l'accroche sous une affiche
  headline: { family: 'text', size: 18, lineHeight: 22, weight: 700, tracking: 0 }, // titre d'une barre
  body: { family: 'text', size: 17, lineHeight: 24, weight: 400, tracking: 0 }, // texte courant
  code: { family: 'mono', size: 15, lineHeight: 22, weight: 400, tracking: 0 }, // un prompt, du code
  button: { family: 'text', size: 17, lineHeight: 22, weight: 700, tracking: 0 }, // texte des boutons
  callout: { family: 'text', size: 15, lineHeight: 21, weight: 400, tracking: 0 }, // texte d'une carte
  caption: { family: 'text', size: 13, lineHeight: 17, weight: 400, tracking: 0 }, // légende, date, libellé
  mono: { family: 'mono', size: 13, lineHeight: 17, weight: 500, tracking: 0 }, // étiquette, version, compteur
  micro: { family: 'text', size: 11, lineHeight: 14, weight: 600, tracking: 0 }, // libellé d'onglet
} as const satisfies Record<string, TextStyle>

export type TextVariant = keyof typeof textStyles

/** Longueur de ligne confortable pour un texte long sur ordinateur, en points (≈ 70 caractères). */
export const readableWidth = 680

/** Agrandissement maximal des textes quand l'appareil est réglé en grande taille de texte. */
export const maxTextScale = 2
