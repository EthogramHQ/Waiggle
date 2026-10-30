// Les formes et les espaces : rayons des coins, écarts entre les éléments, largeurs d'écran.
// Tout est en points (sur le web, un point = un pixel CSS).

/**
 * Les écarts, tous multiples de 4 : l'œil perçoit un rythme régulier. Un composant demande
 * « md » plutôt que 12 ; pour aérer toute l'appli, on change cette échelle.
 */
export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 40, // l'air autour d'une affiche (Miel 2)
  huge: 48,
} as const
export type Space = keyof typeof space

/** Les rayons des coins, du plus rond au plus serré. Plus un objet est grand, plus il est arrondi. */
export const radii = {
  ambiance: 40, // la feuille claire posée sur l'ambiance miel vif des écrans de marque
  sheet: 34, // cartes immersives du fil, feuilles qui montent du bas
  tile: 28, // tuiles et grandes cartes
  panel: 26, // panneau de verre posé dans une carte
  group: 22, // groupe de champs, liste de réglages
  small: 18, // petites tuiles
  code: 14, // bloc de prompt
  pill: 999, // boutons, pastilles, champs de recherche : complètement arrondis
} as const
export type Radius = keyof typeof radii

/** Épaisseurs de trait. */
export const borders = {
  hairline: 1,
  strong: 1.5, // bordure des boutons secondaires
  focus: 2, // contour de l'élément choisi au clavier
  quote: 3, // trait de miel devant une citation (le texte d'une note)
  thread: 2, // trait qui rattache les réponses à leur commentaire
  badge: 2, // liseré qui détache une pastille de nouveautés de l'icône qu'elle chevauche
} as const

/**
 * Mise en page. Les largeurs d'écran (« points de rupture ») décident quand l'écran passe d'une
 * colonne (téléphone) à plusieurs (tablette, ordinateur).
 */
export const layout = {
  breakpoints: {
    medium: 700, // à partir d'ici : tablette ou petite fenêtre d'ordinateur
    wide: 1100, // à partir d'ici : ordinateur, mise en colonnes
    // R2 (relecture de design de R1) : les écrans de marque (accueil d'un visiteur, connexion)
    // passent plus tôt à la scène à gauche et à la carte à droite : à 1 024 points, la colonne
    // seule laissait de grands vides de miel de chaque côté.
    card: 1000,
  },
  maxContentWidth: 1280, // le contenu ne s'étale pas au-delà, même sur un grand écran
  formWidth: 520, // largeur d'un formulaire seul (connexion, inscription…)
  sideColumn: 320, // largeur de base de la colonne latérale
  mainColumn: 560, // largeur minimale de la colonne principale avant de passer en pile
  settingsNavWidth: 256, // la colonne des rubriques des réglages, sur ordinateur (R2)
  screenPadding: { compact: 16, medium: 24, wide: 32 }, // marges sur les côtés de l'écran
  touchTarget: 44, // taille minimale d'une zone à toucher du doigt
  // R3 : la barre d'onglets du téléphone. Le rond miel « + » (Publier) au milieu, et la taille de
  // la photo de l'onglet « Moi » (ses initiales sans photo).
  tabBar: { publish: 56, avatar: 28 },
  chipHeight: 36, // hauteur dessinée d'une étiquette (sa zone à toucher, autour, fait 44)
  chipControl: 28, // rond du bouton « retirer » posé dans une étiquette
  // Hauteurs d'une couverture de projet : grande sur ordinateur, bande sans photo, verticale sur
  // téléphone (une photo plus haute que large a besoin de hauteur pour ne pas être trop recadrée).
  cover: { hero: 520, band: 240, portrait: 480 },
  // Hauteur des boutons et des champs : xl pour l'action principale d'un écran de marque, small
  // pour un petit bouton dessiné (sa zone à toucher, autour, fait quand même 44).
  controlHeight: { xl: 56, regular: 52, compact: 44, small: 36 },
  fab: 64, // le bouton rond flottant (« Publier »)
} as const
