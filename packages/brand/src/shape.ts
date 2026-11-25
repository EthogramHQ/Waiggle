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
  mark: 4, // surlignage d'un mot trouvé, posé sur les lettres (web seulement : voir HighlightedText)
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
    // R6b (relecture ui-C6) : *sous* cette largeur, un téléphone étroit (320 points). Le fil des
    // commentaires y resserre le retrait des réponses, et le champ de réponse y laisse la photo.
    // Un seul seuil pour les deux, écrit ici plutôt que deux fois dans les composants.
    narrow: 360,
    // R15 (audit de design du 17/11, décision 11 de Louis) : au-delà, les marges du gabarit large
    // deviennent une part de la fenêtre ; la mosaïque d'un membre et le panneau d'Explorer
    // changent de forme ici.
    xwide: 1536,
  },
  maxContentWidth: 1280, // le contenu ne s'étale pas au-delà, même sur un grand écran
  // R15 : le gabarit large, celui des écrans de cartes (Fil, Explorer, étiquette, membre, accueil
  // du visiteur). Marges de `wideGutter` jusqu'à `breakpoints.xwide`, puis `wideGutterShare` de la
  // fenêtre de chaque côté ; jamais plus de `maxWideWidth`. Le texte qui se lit reste à
  // `readableWidth` (typography.ts), les formulaires à `formWidth`.
  maxWideWidth: 1920,
  wideGutter: 32,
  wideGutterShare: 0.05,
  // R15 : le champ de recherche de la barre du haut ne s'étire pas au-delà, même quand la barre
  // suit le gabarit large.
  searchFieldMax: 560,
  // R15 : la largeur sous laquelle une carte ne descend jamais ; une grille gagne une colonne dès
  // qu'une carte de plus tient à cette largeur. `feed` : les cartes du Fil (deux colonnes gardées à
  // 1 100 points) ; `feedWide` : les mêmes à partir de `breakpoints.xwide` (trois colonnes de 436 à
  // 1 920, planche R15-Fil-1920, et pas quatre) ; `compact` : les petites cartes
  // (Récents) ; `tile` : les tuiles d'une étiquette ou d'une ruche (quatre à 1 280, cinq à 1 920) ;
  // `mosaic` : les colonnes de la mosaïque d'un membre, à côté de son profil (trois à 1 920, planche
  // R15-Membre-1920, et pas quatre de 324).
  cardMin: { feed: 320, feedWide: 420, compact: 320, tile: 280, mosaic: 420 },
  // R15 : les colonnes de côté du gabarit large : le panneau du Fil et d'Explorer, la colonne du
  // profil sur la page d'un membre (planches R15-Fil-1920, R15-Membre-1920).
  sidePanel: 340,
  profileColumn: 360,
  formWidth: 520, // largeur d'un formulaire seul (connexion, inscription…)
  sideColumn: 320, // largeur de base de la colonne latérale
  // La colonne latérale large (la page d'un projet, décision de Louis du 2/11/2026) : elle part de
  // la même base, puis grandit jusqu'ici. À 320, le titre d'un projet long prenait six lignes.
  sideColumnWide: 450,
  mainColumn: 560, // largeur minimale de la colonne principale avant de passer en pile
  settingsNavWidth: 256, // la colonne des rubriques des réglages, sur ordinateur (R2)
  screenPadding: { compact: 16, medium: 24, wide: 32 }, // marges sur les côtés de l'écran
  touchTarget: 44, // taille minimale d'une zone à toucher du doigt
  // R3 : la barre d'onglets du téléphone. Le rond miel « + » (Publier) au milieu, et la taille de
  // la photo de l'onglet « Moi » (ses initiales sans photo).
  tabBar: { publish: 56, avatar: 28 },
  chipHeight: 36, // hauteur dessinée d'une étiquette (sa zone à toucher, autour, fait 44)
  chipControl: 28, // rond du bouton « retirer » posé dans une étiquette
  // R6a : le rond de couleur posé devant le libellé d'un choix (« Facile à refaire ? », Choices `dot`)
  choiceDot: 12,
  // R6a : la vignette d'un projet en tête de la fenêtre « Supprimer » (ProjectThumb), et le rond
  // de son badge (la corbeille), posé à cheval sur son coin bas droit.
  thumb: { size: 84, badge: 32 },
  // R6a : la danse de publication (PublishDance, planche R6-Danse), dessinée pour un téléphone de
  // 390 points et gardée telle quelle sur ordinateur : l'abeille ; le huit qu'elle dessine (sa
  // largeur, sa hauteur) ; où il se pose, en part de la hauteur de la scène (sous l'en-tête du
  // fil) ; la traînée de miel, fraîche puis plus fine quand elle s'efface ; la plus grosse goutte.
  publishDance: {
    bee: 52,
    eightWidth: 246,
    eightHeight: 76,
    eightTop: 0.29,
    trail: 7,
    trailFaded: 5,
    drop: 4,
  },
  // Hauteurs d'une couverture de projet : grande sur ordinateur, bande sans photo, verticale sur
  // téléphone (une photo plus haute que large a besoin de hauteur pour ne pas être trop recadrée).
  // medium : la galerie d'un projet sur tablette ou petite fenêtre (relecture de design de R5a) ; à
  // 768 × 900, avec 520, « Tester la démo » tombait sous le premier écran.
  cover: { hero: 520, band: 240, portrait: 480, medium: 400 },
  // Hauteur des boutons et des champs : xl pour l'action principale d'un écran de marque, small
  // pour un petit bouton dessiné (sa zone à toucher, autour, fait quand même 44).
  controlHeight: { xl: 56, regular: 52, compact: 44, small: 36 },
  // R13 : la place que la barre du haut réserve avant d'être mesurée, par taille d'écran (compact :
  // la barre du téléphone ; regular : la capsule d'ordinateur), marge au-dessus comprise. Dans la page
  // pré-rendue, aucun script ne la mesure encore : sans cette réserve, la barre se posait sur le titre
  // jusqu'au démarrage de l'appli (audit de design du 17/11/2026, 4.3). Seule une barre qui la déclare
  // la réserve ; la mesure garde le dernier mot, et ces valeurs doivent rester celles qu'elle trouve.
  // Mesurées au navigateur le 17/11/2026 (Chromium, site des captures, texte à 100 %) : la hauteur de
  // la bande de ScreenTopBar, la vue qui porte la marge du haut (16) et que sa vue de mesure épouse.
  // - compact, à 390 de large : la barre d'un visiteur (deux pilules de 44, VisitorBar) mesure 60 ;
  // - regular, à 1 440 : la capsule des membres (TopNav) mesure 79 (capsule de 63 : une rangée de 45
  //   pour des éléments de 44), celle d'un visiteur 78. 79 : la place gardée par TopNav pendant que
  //   la session se charge (79 - 16) vaut alors exactement la capsule qui la remplace ; la barre d'un
  //   visiteur, elle, se corrige d'un point à sa mesure, au moment où la page se montre.
  // À mesurer de nouveau si la barre change (taille d'un bouton, marge, capsule) : getBoundingClientRect
  // de cette bande, après le démarrage, aux deux largeurs.
  topBarHeight: { compact: 60, regular: 79 },
  fab: 64, // le bouton rond flottant (« Publier »)
  // R10 : l'alvéole d'une ruche (HiveBadge, planches R10), un hexagone pointe en haut, à trois
  // tailles : la ligne compacte de « Tes ruches » (small), la ligne de l'onglet Ruches et
  // l'invitation (regular), l'en-tête de la page d'une ruche et l'aperçu de la création (large).
  // Son icône prend une part de sa hauteur (`iconRatio`). Le choix de l'icône (HiveIconPicker) :
  // deux rangées de six alvéoles, chacune au plus `pickerCell` de large (assez pour 44 points de
  // zone à toucher, même quand la rangée se resserre à 320 points) et `pickerHeight` de haut ; la
  // coche du choix (`pickerCheck`) se pose sur son coin bas droit.
  hive: {
    small: 28,
    regular: 44,
    large: 64,
    iconRatio: 0.5,
    pickerCell: 52,
    pickerHeight: 56,
    pickerCheck: 20,
    pickerColumns: 6,
  },
  // R19 : le rayon (HoneyComb, planche R19-Recolte) : dix alvéoles pointe en haut, de `cell` de
  // large, à `gap` l'une de l'autre (318 points en tout) ; la jauge d'un défi les dessine à
  // `smallCell`. Le rayon se resserre si la colonne est plus étroite, jamais il ne s'élargit.
  comb: { cell: 30, smallCell: 22, gap: 2 },
  // R19 : le sceau de cire (WaxSeal, planche R19-Sceaux) : 40 dans un avis de l'Activité (small),
  // 60 dans une tuile de « Mes sceaux » (regular) ; son icône prend `iconRatio` de sa taille.
  seal: { small: 40, regular: 60, iconRatio: 0.38 },
  // R19 : l'alvéole du niveau (LevelCell, planches R19-Profil et R19-Niveau), par sa largeur ; sa
  // hauteur suit la forme de l'hexagone (× 1,1547). 40 dans un avis de l'Activité ou un rang
  // (small), 46 dans le panneau de la récolte (regular), 150 en gros plan (large).
  levelCell: { small: 40, regular: 46, large: 150 },
  // R19 : la pastille de gain (PollenGain, planche R19-Gain) : sa montée en deux temps, en points,
  // puis la largeur de la boîte qui la porte sur téléphone (voir PollenGain.tsx).
  pollenGain: { rise: 12, leave: 24, box: 240 },
} as const
