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
  background: '#FFFFFF', // fond de page
  surface: '#FFFFFF', // cartes, champs, tout ce qui se lit longtemps
  surfaceGrouped: '#F5F5F3', // fond derrière les listes groupées (réglages)
  surfaceRaised: '#FFFFFF', // posé sur un fond groupé : le choix actif d'un contrôle segmenté

  // Textes : l'« encre », de la plus forte à la plus discrète
  text: '#1C1B19', // texte principal et icônes
  textSecondary: '#3D3A33', // pitch, descriptions
  textMuted: '#6B675E', // légendes, dates, libellés
  textPlaceholder: '#7A766C', // exemple grisé dans un champ vide

  // Le miel
  honey: '#FFC21A', // boutons principaux, sélection
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
  outline: '#E8E4D8', // bordure des boutons secondaires et des étiquettes
  groupBorder: '#EFEBE1', // bordure d'un groupe de champs
  groupSeparator: '#F1EDE3', // trait entre deux champs d'un groupe
  handle: '#D8D3C6', // poignée d'une feuille qu'on fait glisser
  knob: '#FFFFFF', // pastille d'un interrupteur

  // Messages
  danger: '#D92D20', // fond du bouton de suppression définitive
  onDanger: '#FFFFFF',
  dangerText: '#B42318', // texte d'erreur
  dangerSoft: '#FEE4E2', // fond d'un message d'erreur, bouton « Supprimer »
  dangerBorder: '#F2B8B5', // bordure d'un champ en erreur
  success: '#12805C', // confirmation ponctuelle (« Copié »)
  badge: '#E5484D', // pastille rouge des nouveautés

  // Matières (couleurs transparentes : rgba = rouge, vert, bleu, opacité de 0 à 1)
  glass: 'rgba(255,255,255,0.56)', // verre : barres flottantes, boutons ronds sur image
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
  surfaceRaised: '#36302A',

  text: '#F7F3EA',
  textSecondary: '#D9D2C2',
  textMuted: '#A39B89',
  textPlaceholder: '#8F8776',

  honey: '#FFC933',
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
  outline: 'rgba(255,255,255,0.14)',
  groupBorder: 'rgba(255,255,255,0.08)',
  groupSeparator: 'rgba(255,255,255,0.07)',
  handle: 'rgba(255,255,255,0.22)',
  knob: '#FFFFFF',

  danger: '#D92D20',
  onDanger: '#FFFFFF',
  dangerText: '#FDA29B',
  dangerSoft: '#3A1A17',
  dangerBorder: '#7A2A24',
  success: '#3CCB8E',
  badge: '#E5484D',

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
 * Les couples « texte sur fond » réellement utilisés par les composants, avec le contraste minimal
 * exigé (règles d'accessibilité WCAG, niveau AA) : 4,5 pour du texte, 3 pour les icônes et les gros
 * titres. Un test vérifie chaque couple, de jour comme de nuit : si on assombrit un fond ou éclaircit
 * un texte au point de le rendre illisible, le test échoue.
 */
export const contrastPairs: readonly { text: ColorName; on: ColorName; min: 3 | 4.5 }[] = [
  { text: 'text', on: 'background', min: 4.5 },
  { text: 'text', on: 'surfaceGrouped', min: 4.5 },
  { text: 'text', on: 'surfaceRaised', min: 4.5 },
  { text: 'textSecondary', on: 'background', min: 4.5 },
  { text: 'textMuted', on: 'background', min: 4.5 },
  { text: 'textMuted', on: 'surface', min: 4.5 },
  { text: 'textMuted', on: 'surfaceGrouped', min: 4.5 },
  { text: 'textPlaceholder', on: 'surface', min: 4.5 },
  // Le panneau de verre des cartes de projet et des pages en deux colonnes (Surface « panel »).
  // Mesuré posé sur le fond de page : c'est le cas courant. Sur une image ou une lumière vive, le
  // contraste réel dépend de l'image ; le flou et la densité du verre le protègent, sans garantie.
  { text: 'text', on: 'panel', min: 4.5 },
  { text: 'textSecondary', on: 'panel', min: 4.5 },
  { text: 'textMuted', on: 'panel', min: 4.5 },
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
  { text: 'success', on: 'background', min: 4.5 },
  { text: 'focusRing', on: 'background', min: 3 },
]

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
