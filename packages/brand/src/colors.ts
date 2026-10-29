// Les couleurs de la direction « Miel », de jour et de nuit. C'est le nuancier du peintre : les
// composants y piochent par leur nom (« text », « honey »…) et ne contiennent jamais de code couleur.
// Changer une valeur ici change toute l'appli, et les e-mails envoyés par l'API.
//
// Les noms décrivent un rôle, pas une teinte : « textMuted » plutôt que « gris ». Ainsi la nuit peut
// donner une autre teinte au même rôle sans qu'aucun composant ne change.

/** Les deux jeux de couleurs. */
export const schemes = ['day', 'night'] as const
export type Scheme = (typeof schemes)[number]

const day = {
  // Fonds
  // La « Cire » (Miel 2) : un blanc à peine chaud, pour que les surfaces blanches s'en détachent.
  background: '#FFFCF5', // fond de page
  surface: '#FFFFFF', // cartes, champs, tout ce qui se lit longtemps
  surfaceGrouped: '#F5F5F3', // fond derrière les listes groupées (réglages)
  surfaceRaised: '#FFFFFF', // posé sur un fond groupé : le choix actif d'un contrôle segmenté
  surfaceBorder: '#EFEBE1', // la bordure beige qui détache une surface pleine de la Cire

  // Textes : l'« encre », de la plus forte à la plus discrète
  text: '#1C1B19', // texte principal et icônes
  textSecondary: '#3D3A33', // pitch, descriptions
  textMuted: '#6B675E', // légendes, dates, libellés
  textPlaceholder: '#7A766C', // exemple grisé dans un champ vide
  textOnGlass: '#5A564C', // texte discret posé sur le verre (plus sombre que textMuted, qui s'y perdrait)

  // Le miel
  honey: '#FFC21A', // boutons principaux, sélection
  onHoneyTile: '#4A3500', // icône ou initiale posée sur une tuile de miel (un brun, moins dur que l'encre)
  honeyPressed: '#F2B000', // bouton miel pendant l'appui
  honeyLight: '#FFE58A', // lumière miel (dégradés)
  honeySoft: '#FFF0C2', // fond des pastilles de statut
  onHoney: '#1C1B19', // texte posé sur du miel (jamais du blanc : illisible)
  honeyDisabled: '#FFE7A3', // bouton miel inactif
  onHoneyDisabled: '#8A7A55',
  statusText: '#6A4300', // texte des pastilles de statut
  amber: '#C77F00', // icônes d'accent, jamais du texte courant
  amberText: '#8A5A00', // texte d'accent (liens)

  // Traits
  line: '#ECE8DE', // séparateurs
  lineStrong: '#DCD5C4', // pointillés, bordures marquées
  dashed: '#D9B95E', // pointillés miel d'une zone à remplir (ajouter une image, une ruche)
  outline: '#E8E4D8', // bordure des boutons secondaires et des étiquettes
  groupBorder: '#EFEBE1', // bordure d'un groupe de champs
  groupSeparator: '#F1EDE3', // trait entre deux champs d'un groupe
  handle: '#D8D3C6', // poignée d'une feuille qu'on fait glisser
  knob: '#FFFFFF', // pastille d'un interrupteur, point clair d'un bouton radio choisi

  // Contrôles (case à cocher, bouton radio, interrupteur). Leur forme dit leur état : elle doit se
  // voir à 3:1 au moins contre le fond (WCAG 1.4.11), là où un séparateur (lineStrong) fait 1,4:1.
  controlBorder: '#8F887A', // bord d'une case ou d'un rond vide, piste d'un interrupteur éteint
  // Le liseré d'un contrôle choisi, autour du miel : le miel seul fait 1,6:1 sur le blanc et ne
  // dessinerait pas le rond ; ce brun ambré le détache du fond.
  controlChecked: '#B87700',
  // Les formes d'un squelette (chargement). De jour, une ombre transparente, qui assombrit ce qu'il
  // y a dessous (la page, une carte, la lumière miel) et s'y voit donc partout, à 1,5:1 environ.
  skeleton: 'rgba(28,27,25,0.22)',

  // Messages
  danger: '#D92D20', // fond du bouton de suppression définitive
  onDanger: '#FFFFFF',
  dangerText: '#B42318', // texte d'erreur
  dangerSoft: '#FEE4E2', // fond d'un message d'erreur, bouton « Supprimer »
  dangerBorder: '#F2B8B5', // bordure d'un champ en erreur
  errorBand: '#FEF3F2', // fond du bandeau d'erreur d'un formulaire (plus pâle que dangerSoft)
  errorBorder: '#F2B8B5', // sa bordure
  success: '#12805C', // confirmation ponctuelle (« Copié »)
  // La pastille rouge des nouveautés (la cloche des notifications) et son chiffre, en blanc. Un
  // rouge assez sombre pour qu'un chiffre blanc s'y lise (contraste 4,5 : voir contrastPairs).
  badge: '#D1343A',
  onBadge: '#FFFFFF',

  // Matières (couleurs transparentes : rgba = rouge, vert, bleu, opacité de 0 à 1)
  glass: 'rgba(255,255,255,0.66)', // verre : barres flottantes, boutons ronds sur image
  glassBorder: 'rgba(255,255,255,0.75)',
  panel: 'rgba(255,255,255,0.76)', // verre qui porte du texte, posé sur une image
  panelBorder: 'rgba(255,255,255,0.8)',
  sheet: 'rgba(255,255,255,0.86)', // feuille qui monte du bas de l'écran
  scrim: 'rgba(28,27,25,0.32)', // voile derrière une feuille ou une fenêtre
  focusRing: '#C77F00', // contour de l'élément choisi au clavier (sur ordinateur)
}

// `satisfies` : TypeScript vérifie que la nuit a exactement les mêmes noms que le jour,
// sans en oublier ni en inventer. Une couleur ajoutée au jour mais pas à la nuit ne compile pas.
const night = {
  background: '#100E0A',
  surface: '#1A1712',
  surfaceGrouped: '#221E17',
  // La nuit, le choix actif est crème avec un texte encre (onHoney) : il se voit d'un coup d'œil.
  surfaceRaised: '#F7F3EA',
  surfaceBorder: 'rgba(255,255,255,0.08)',

  text: '#F7F3EA',
  textSecondary: '#D9D2C2',
  textMuted: '#A39B89',
  textPlaceholder: '#8F8776',
  textOnGlass: '#CFC7B5',

  honey: '#FFC933',
  onHoneyTile: '#4A3500',
  honeyPressed: '#F2B820',
  honeyLight: '#FFD666',
  honeySoft: '#3F3417',
  onHoney: '#1C1B19',
  honeyDisabled: '#4A3D1C',
  onHoneyDisabled: '#A39B89',
  statusText: '#FFD666',
  amber: '#E0A030',
  amberText: '#F5B942',

  line: 'rgba(255,255,255,0.10)',
  lineStrong: 'rgba(255,255,255,0.18)',
  dashed: 'rgba(255,201,51,0.45)',
  outline: 'rgba(255,255,255,0.14)',
  groupBorder: 'rgba(255,255,255,0.08)',
  groupSeparator: 'rgba(255,255,255,0.07)',
  handle: 'rgba(255,255,255,0.22)',
  knob: '#FFFFFF',

  controlBorder: '#766F62',
  // La nuit, le miel se détache seul du fond sombre (11:1) : le liseré reste du miel.
  controlChecked: '#FFC933',
  // La nuit, une forme pleine, un peu plus claire que la page : un blanc transparent se perdrait
  // dans le cœur clair de la lanterne (1,1:1), une forme pleine s'y détache.
  skeleton: '#3F3930',

  danger: '#D92D20',
  onDanger: '#FFFFFF',
  dangerText: '#FDA29B',
  dangerSoft: '#3A1A17',
  dangerBorder: '#7A2A24',
  errorBand: '#2A1513',
  errorBorder: '#7A2A24',
  success: '#3CCB8E',
  badge: '#D1343A',
  onBadge: '#FFFFFF',

  glass: 'rgba(30,26,20,0.70)',
  glassBorder: 'rgba(255,255,255,0.12)',
  panel: 'rgba(22,19,14,0.76)',
  panelBorder: 'rgba(255,255,255,0.14)',
  sheet: 'rgba(26,23,18,0.94)',
  scrim: 'rgba(0,0,0,0.5)',
  focusRing: '#FFC933',
} satisfies Record<keyof typeof day, string>

/** Le nom d'une couleur : 'text' | 'honey' | … (déduit de la liste ci-dessus). */
export type ColorName = keyof typeof day
/** Un jeu complet de couleurs (jour ou nuit). */
export type Palette = Record<ColorName, string>

export const palettes: Record<Scheme, Palette> = { day, night }

/**
 * Les noms de la marque (Miel, Cire…), tels que le canevas de marque les présente. Seul le catalogue
 * les affiche ; le code, lui, parle toujours par rôle. Un nom désigne une valeur d'un des deux jeux :
 * la « Nuit » est le fond de nuit, la « Crème » le miel doux du jour.
 */
export const brandNames: Record<Scheme, Partial<Record<ColorName, string>>> = {
  day: {
    honey: 'Miel',
    amber: 'Ambre',
    honeyLight: 'Pollen',
    honeySoft: 'Crème',
    text: 'Encre',
    background: 'Cire',
  },
  night: { background: 'Nuit' },
}

/**
 * Ce qu'il y a sous un fond transparent (le verre) : une couleur de la palette ou un code couleur.
 * Un fond opaque se mesure tel quel, sur le fond de page par défaut.
 */
type Backdrop = ColorName | `#${string}`
type ContrastPair = {
  text: ColorName
  on: ColorName
  /**
   * 4,5 pour un texte, 3 pour une icône, un gros titre ou la forme d'un contrôle ; 1,5 pour une
   * forme sans texte ni état, qui doit seulement se voir (un squelette de chargement).
   */
  min: 1.5 | 3 | 4.5
  /** Les fonds sur lesquels poser `on` avant de mesurer ; le fond de page si rien n'est dit. */
  base?: readonly Backdrop[]
}
const onAnyBackdrop = ['background', '#000000', 'honey'] as const
const onPageOrHoney = ['background', 'honey'] as const

/**
 * Les couples « texte sur fond » réellement utilisés par les composants, avec le contraste minimal
 * exigé (règles d'accessibilité WCAG, niveau AA) : 4,5 pour du texte, 3 pour les icônes et les gros
 * titres. Un test vérifie chaque couple, de jour comme de nuit : si on assombrit un fond ou éclaircit
 * un texte au point de le rendre illisible, le test échoue.
 */
export const contrastPairs: readonly ContrastPair[] = [
  { text: 'text', on: 'background', min: 4.5 },
  { text: 'text', on: 'surfaceGrouped', min: 4.5 },
  // Le choix actif d'un contrôle segmenté : crème la nuit, il porte l'encre (onHoney), jour et nuit.
  { text: 'onHoney', on: 'surfaceRaised', min: 4.5 },
  { text: 'textSecondary', on: 'background', min: 4.5 },
  { text: 'textMuted', on: 'background', min: 4.5 },
  { text: 'textMuted', on: 'surface', min: 4.5 },
  { text: 'textMuted', on: 'surfaceGrouped', min: 4.5 },
  { text: 'textPlaceholder', on: 'surface', min: 4.5 },
  // Le panneau de verre des cartes de projet et des pages en deux colonnes (Surface « panel »).
  // Le verre laisse voir ce qu'il y a dessous : chaque couple est mesuré sur la page, sur une photo
  // sombre (le noir, le pire cas) et sur la lumière miel. Sur une photo, seuls `text` et
  // `textSecondary` tiennent : un texte posé sur une image passe par le panneau, dans l'un des deux.
  { text: 'text', on: 'panel', min: 4.5, base: onAnyBackdrop },
  { text: 'textSecondary', on: 'panel', min: 4.5, base: onAnyBackdrop },
  // Le texte discret, seulement sur la page : 3,2:1 sur une photo sombre de jour, 3,7:1 sur la
  // lumière miel de nuit. Sur une image ou la lumière, une légende passe en textSecondary.
  { text: 'textMuted', on: 'panel', min: 4.5 },
  // Le verre plus léger des barres flottantes : même règle, avec un gris plus sombre que textMuted
  // (qui y tomberait sous 4,5). Sur une photo sombre, de jour, il ferait 3,1:1 : là, le panneau.
  { text: 'text', on: 'glass', min: 4.5, base: onAnyBackdrop },
  { text: 'textOnGlass', on: 'glass', min: 4.5, base: onPageOrHoney },
  // Le bandeau d'erreur d'un formulaire et la tuile de miel (icône ou initiale brune).
  { text: 'dangerText', on: 'errorBand', min: 4.5 },
  { text: 'onHoneyTile', on: 'honey', min: 4.5 },
  // La barre fixe des formulaires sur téléphone (fond « feuille »).
  { text: 'text', on: 'sheet', min: 4.5 },
  { text: 'onHoney', on: 'honey', min: 4.5 },
  { text: 'onHoney', on: 'honeyPressed', min: 4.5 },
  { text: 'statusText', on: 'honeySoft', min: 4.5 },
  // Un champ choisi dans un groupe : sa ligne prend le fond honeySoft (TextField).
  { text: 'text', on: 'honeySoft', min: 4.5 },
  { text: 'amberText', on: 'honeySoft', min: 4.5 },
  { text: 'amberText', on: 'background', min: 4.5 },
  // La carte d'une note et le journal d'un projet : texte posé sur une surface pleine.
  { text: 'amberText', on: 'surface', min: 4.5 },
  { text: 'textSecondary', on: 'surface', min: 4.5 },
  { text: 'amber', on: 'background', min: 3 },
  { text: 'dangerText', on: 'background', min: 4.5 },
  { text: 'dangerText', on: 'dangerSoft', min: 4.5 },
  { text: 'onDanger', on: 'danger', min: 4.5 },
  // Le chiffre de la pastille des nouveautés (CountBadge).
  { text: 'onBadge', on: 'badge', min: 4.5 },
  { text: 'success', on: 'background', min: 4.5 },
  { text: 'focusRing', on: 'background', min: 3 },
  // Les contrôles (WCAG 1.4.11) : le bord d'une case ou d'un rond vide, la piste d'un interrupteur
  // éteint, et le liseré du rond ou de la case choisis, sur une carte comme sur la page.
  { text: 'controlBorder', on: 'surface', min: 3 },
  { text: 'controlBorder', on: 'background', min: 3 },
  { text: 'controlChecked', on: 'surface', min: 3 },
  { text: 'controlChecked', on: 'background', min: 3 },
  // La pastille blanche posée sur la piste éteinte d'un interrupteur.
  { text: 'knob', on: 'controlBorder', min: 3 },
  // Les formes d'un squelette, sur la page et sur une carte. Sur la lumière miel de jour, chaque
  // arrêt du dégradé est mesuré à part (brand.test.ts) : un couple ne sait pas viser le seul jour.
  { text: 'skeleton', on: 'background', min: 1.5 },
  { text: 'skeleton', on: 'surface', min: 1.5 },
]

/**
 * Le halo du focus clavier : le miel du thème, rendu transparent à cette opacité (de 0 à 1),
 * autour de l'anneau. Assez pour adoucir l'anneau, trop peu pour cacher ce qu'il entoure.
 */
export const focusHaloOpacity = 0.28

/**
 * La « lumière miel » : le dégradé rond qui sert de lumière d'ambiance quand un écran n'a pas de
 * visuel (et de couverture aux projets sans image). Chaque arrêt = une position de 0 à 1 et une couleur.
 */
export const honeyLight: Record<Scheme, readonly { at: number; color: string }[]> = {
  day: [
    { at: 0, color: '#FFFFFF' },
    { at: 0.38, color: '#FFE58A' },
    { at: 0.78, color: '#FFC21A' },
    { at: 1, color: '#F2A900' },
  ],
  // La nuit, la lumière est une lanterne : un halo de miel qui s'éteint dans le noir.
  night: [
    { at: 0, color: '#FFC933' },
    { at: 0.3, color: '#9A6A12' },
    { at: 0.7, color: '#2A1F0C' },
    { at: 1, color: '#100E0A' },
  ],
}
