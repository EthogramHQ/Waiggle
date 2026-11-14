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
  // Le surlignage miel sous les lettres trouvées par la recherche (R3, HighlightedText). Il porte
  // toujours l'encre (`text`), même dans une ligne grise : la partie trouvée se lit d'un coup d'œil.
  highlight: '#FFE58A',
  // R5b : le miel pâle d'un commentaire visé par une réponse ou une modification (CommentCard,
  // `highlighted`). Plus pâle que la pastille d'une mention, qui doit encore s'y voir.
  highlightSoft: '#FFF7DB',
  // R8 (relecture de design) : le liseré d'une ligne surlignée de miel pâle (une notification
  // nouvelle, NotificationCard). Le miel pâle seul ne se détache pas de la lumière miel d'Activité
  // (1,16:1 sur téléphone, 1,04:1 sur ordinateur) : aucun fond assez clair ou assez foncé pour s'en
  // détacher ne garderait les textes gris à 4,5:1. Le bord, lui, se voit : 1,5:1 au moins contre la
  // page, le miel pâle et la lumière miel jusqu'au miel vif (`honey`).
  highlightEdge: '#D99A00',
  // R5b : le fond de la pastille d'une mention (« @Léa Moreau », MentionText), qui porte l'encre.
  // Assez soutenu pour se détacher d'une carte blanche, grise (les siens) ou surlignée.
  mentionPill: '#FFE58A',
  onHoney: '#1C1B19', // texte posé sur du miel (jamais du blanc : illisible)
  honeyDisabled: '#FFE7A3', // bouton miel inactif
  onHoneyDisabled: '#8A7A55',
  statusText: '#6A4300', // texte des pastilles de statut
  amber: '#C77F00', // icônes d'accent, jamais du texte courant
  amberText: '#8A5A00', // texte d'accent (liens)
  // Le fond doux d'un encadré de prudence (Callout, ton `caution` : « Relis-le avant de t'en
  // servir », sur un prompt). Il porte amberText ou l'encre ; l'icône prend amberText, car l'ambre
  // seul n'y fait que 3:1 tout juste.
  cautionSoft: '#FFF4DB',

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
  // Le même bouton pendant l'appui : un rouge plus sombre, où le blanc garde son contraste. (Un
  // bouton rendu transparent mêlait le blanc au fond : 4,0:1 de jour, relecture de design R2.)
  dangerPressed: '#B42318',
  onDanger: '#FFFFFF',
  dangerText: '#B42318', // texte d'erreur
  dangerSoft: '#FEE4E2', // fond d'un message d'erreur, bouton « Supprimer »
  dangerBorder: '#F2B8B5', // bordure d'un champ en erreur
  errorBand: '#FEF3F2', // fond du bandeau d'erreur d'un formulaire (plus pâle que dangerSoft)
  errorBorder: '#F2B8B5', // sa bordure
  success: '#12805C', // confirmation ponctuelle (« Copié »)

  // Les trois familles d'une ligne de mise à jour (R7a, ui/UpdateFamilyBadge.tsx) : « Nouveau »
  // (ambre), « Réparé » (vert), « Plus joli » (encre discrète). Chacune a trois rôles : le fond de
  // sa pastille ronde (`Surface`), l'icône posée dessus (`Icon`, au moins 3:1 sur ce fond : dans la
  // frise, c'est la seule marque visible de la famille) et son nom écrit en couleur au-dessus du
  // champ de la feuille (`Text`, 4,5:1 sur la feuille et sur une carte). L'ambre de l'icône est plus
  // sombre que `amber`, qui ne ferait que 2,7:1 sur la crème de la pastille.
  familyNewSurface: '#FFEDC2',
  familyNewIcon: '#A36800',
  familyNewText: '#8A5A00',
  familyFixedSurface: '#DCF2E6',
  familyFixedIcon: '#12805C',
  familyFixedText: '#0F7453',
  familyPolishSurface: '#EEEAE1',
  familyPolishIcon: '#5E5A51',
  familyPolishText: '#6B675E',

  // R7b, le coin des testeurs : l'issue d'un retour (« Ça a marché ? », ui/OutcomePill.tsx). Chaque
  // issue a trois rôles, comme les familles d'une mise à jour : le fond de sa pastille, son icône
  // (au moins 3:1 sur ce fond) et son libellé (4,5:1). « Oui » : une coche verte, le libellé à
  // l'encre (planche R7b-Fil) ; « En partie » : un demi-cercle ambre, plus sombre que `amber`, qui
  // ne ferait que 2,9:1 sur la crème ; « Non » : une croix rouge sur le rose d'une erreur.
  outcomeYesSurface: '#E0F2E9',
  outcomeYesIcon: '#12805C',
  outcomeYesText: '#1C1B19',
  outcomePartlySurface: '#FFF0C2',
  outcomePartlyIcon: '#A36800',
  outcomePartlyText: '#6A4300',
  outcomeNoSurface: '#FEE4E2',
  outcomeNoIcon: '#D92D20',
  outcomeNoText: '#B42318',
  // « Réglé dans la v1.3 », sous un retour : un vert plus sombre que `success`, qui tombait à
  // 4,3:1 sur la crème d'une bulle de l'auteur.
  settledText: '#0F7453',
  // Les bulles d'un fil : la couleur suit le rôle de qui écrit, quel que soit le lecteur. L'auteur
  // du projet en crème miel (à droite), le testeur en blanc (à gauche, avec une bordure `line`).
  bubbleAuthor: '#FFF0C2',
  bubbleTester: '#FFFFFF',
  // Le point d'un fil non lu (ThreadRow) : du miel, cerclé d'un liseré ambre. Le miel seul ne fait
  // que 1,6:1 sur une carte blanche : c'est le liseré qui dessine le point, à 3:1 au moins sur la
  // carte et sur le surlignage d'une ligne choisie (`highlight`, où `amber` ne faisait que 2,6:1).
  unreadDot: '#FFC21A',
  unreadDotRing: '#A36800',

  // La pastille rouge des nouveautés (la cloche des notifications) et son chiffre, en blanc. Un
  // rouge assez sombre pour qu'un chiffre blanc s'y lise (contraste 4,5 : voir contrastPairs).
  badge: '#D1343A',
  onBadge: '#FFFFFF',

  // Matières (couleurs transparentes : rgba = rouge, vert, bleu, opacité de 0 à 1)
  glass: 'rgba(255,255,255,0.66)', // verre : barres flottantes, boutons ronds sur image
  glassBorder: 'rgba(255,255,255,0.75)',
  panel: 'rgba(255,255,255,0.76)', // verre qui porte du texte, posé sur une image
  panelBorder: 'rgba(255,255,255,0.8)',
  // Feuille qui monte du bas de l'écran : la crème de la page, opaque (décision du 7/11/2026, R5b). Le
  // blanc translucide d'avant, posé sur son voile, donnait un gris où les cartes grises s'effaçaient.
  sheet: '#FFFCF5',
  scrim: 'rgba(28,27,25,0.32)', // voile derrière une feuille ou une fenêtre
  // Le reflet qui suit la souris sur une carte inclinée (ui/tilt.ts) : une lueur blanche au centre,
  // qui s'efface vers ses bords. Il ne porte aucun texte.
  glare: 'rgba(255,255,255,0.22)',
  focusRing: '#C77F00', // contour de l'élément choisi au clavier (sur ordinateur)

  // La mascotte (ui/Mascot.tsx). Son dessin est une image, à l'encre presque noire de jour comme de
  // nuit : `mascotInk` est cette encre (le contour, mesuré sur les images), qui ne sert qu'à vérifier
  // son contraste ; `mascotDisc` est le disque sur lequel elle est posée. De jour, le verre ; de
  // nuit, un miel pâle : sur un verre sombre, le contour noir (les antennes) disparaîtrait.
  mascotInk: '#1C1B19',
  mascotDisc: 'rgba(255,255,255,0.66)',
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
  // Un miel brun, deux fois plus clair que la carte de nuit (2:1) : la crème claire du texte
  // s'y lit encore à 8:1.
  highlight: '#5A4712',
  // De nuit, un brun miel à peine plus clair que la carte ; la pastille, nettement plus claire.
  highlightSoft: '#2A2313',
  // De nuit, la lanterne d'Activité est tantôt plus claire que la ligne, tantôt plus sombre : un
  // miel doré plus clair que l'une et l'autre (1,6:1 au moins contre l'arrêt le plus vif du halo).
  highlightEdge: '#C8902A',
  mentionPill: '#4F4118',
  onHoney: '#1C1B19',
  honeyDisabled: '#4A3D1C',
  onHoneyDisabled: '#A39B89',
  statusText: '#FFD666',
  amber: '#E0A030',
  amberText: '#F5B942',
  cautionSoft: '#3A2C10',

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
  dangerPressed: '#B42318',
  onDanger: '#FFFFFF',
  dangerText: '#FDA29B',
  dangerSoft: '#3A1A17',
  dangerBorder: '#7A2A24',
  errorBand: '#2A1513',
  errorBorder: '#7A2A24',
  success: '#3CCB8E',
  // La nuit, des fonds sombres teintés (un brun miel, un vert, un gris chaud), à peine plus clairs
  // que la carte ; l'icône et le nom prennent les teintes vives de l'accent et du succès.
  familyNewSurface: '#3F3112',
  familyNewIcon: '#F5B942',
  familyNewText: '#F5B942',
  familyFixedSurface: '#143426',
  familyFixedIcon: '#3CCB8E',
  familyFixedText: '#3CCB8E',
  familyPolishSurface: '#2C2821',
  familyPolishIcon: '#CFC7B5',
  familyPolishText: '#B3AB99',
  // La nuit, les issues prennent les fonds sombres teintés des familles et des messages ; icône et
  // libellé, les teintes vives. Le libellé de « Oui » reste la crème du texte.
  outcomeYesSurface: '#143426',
  outcomeYesIcon: '#3CCB8E',
  outcomeYesText: '#F7F3EA',
  outcomePartlySurface: '#3F3417',
  outcomePartlyIcon: '#E0A030',
  outcomePartlyText: '#FFD666',
  outcomeNoSurface: '#3A1A17',
  outcomeNoIcon: '#F97066',
  outcomeNoText: '#FDA29B',
  settledText: '#3CCB8E',
  // La bulle de l'auteur, un brun miel (planche R7b-Fil-Nuit) ; celle du testeur, la carte.
  bubbleAuthor: '#3F3417',
  bubbleTester: '#1A1712',
  // Le miel se détache seul du fond sombre ; le liseré ambre le garde à 3,9:1 sur le surlignage.
  unreadDot: '#FFC933',
  unreadDotRing: '#E0A030',
  badge: '#D1343A',
  onBadge: '#FFFFFF',

  glass: 'rgba(30,26,20,0.70)',
  glassBorder: 'rgba(255,255,255,0.12)',
  panel: 'rgba(22,19,14,0.76)',
  panelBorder: 'rgba(255,255,255,0.14)',
  sheet: 'rgba(26,23,18,0.94)',
  scrim: 'rgba(0,0,0,0.5)',
  // De nuit, plus discret : un reflet vif sur une photo sombre éblouirait.
  glare: 'rgba(255,255,255,0.12)',
  focusRing: '#FFC933',

  // L'encre de l'image ne change pas avec le thème ; le disque devient un miel pâle et chaud.
  mascotInk: '#1C1B19',
  mascotDisc: '#F3DFA8',
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
  // La carte d'une note du fil (R4, ui/NoteCard.tsx) est tout entière de ce verre, posé sur la page
  // et sa lumière miel, jamais sur une photo : son surtitre « Note » y est en texte
  // d'accent, mesuré sur ces deux fonds.
  { text: 'amberText', on: 'panel', min: 4.5, base: onPageOrHoney },
  // Le verre plus léger des barres flottantes : même règle, avec un gris plus sombre que textMuted
  // (qui y tomberait sous 4,5). Sur une photo sombre, de jour, il ferait 3,1:1 : là, le panneau.
  { text: 'text', on: 'glass', min: 4.5, base: onAnyBackdrop },
  { text: 'textOnGlass', on: 'glass', min: 4.5, base: onPageOrHoney },
  // Les onglets inactifs de la barre d'onglets du téléphone (R3, ui/TabBar.tsx) : libellé et icône
  // à l'encre (`text`) sur le verre. La page défile sous la barre : mesurés sur la page, la lumière
  // miel et une photo toute noire ou toute blanche. Le gris `textSecondary` y tombait à 4,24:1 de
  // nuit, le verre sombre posé sur une photo blanche (correcteur N1c).
  { text: 'text', on: 'glass', min: 4.5, base: [...onAnyBackdrop, '#FFFFFF'] },
  // La pastille de verre « Suivre Nora » posée sur la photo d'une carte (R3, relecture ui-9) : une
  // photo peut être toute noire ou toute blanche, et le verre sombre de nuit pâlit sur du blanc.
  // Son texte et ses icônes (coche, « ajouter ») sont en `text`, mesurés aux deux extrêmes.
  { text: 'text', on: 'glass', min: 4.5, base: ['#000000', '#FFFFFF'] },
  // Le bandeau d'erreur d'un formulaire et la tuile de miel (icône ou initiale brune).
  { text: 'dangerText', on: 'errorBand', min: 4.5 },
  // L'encadré d'une partie retirée par la modération (R9, ui/RemovedPart.tsx) : ses phrases en
  // `textSecondary`, le lien de l'adresse de contact à l'encre (`text`).
  { text: 'textSecondary', on: 'errorBand', min: 4.5 },
  { text: 'text', on: 'errorBand', min: 4.5 },
  { text: 'onHoneyTile', on: 'honey', min: 4.5 },
  // La barre fixe des formulaires sur téléphone (fond « feuille »).
  { text: 'text', on: 'sheet', min: 4.5 },
  { text: 'onHoney', on: 'honey', min: 4.5 },
  { text: 'onHoney', on: 'honeyPressed', min: 4.5 },
  // « Tu es à jour » (R4, ui/UpToDate.tsx) : un texte posé sur la sphère de miel l'est à l'encre,
  // sur son cœur clair (honeyLight) ou sur le miel, jour et nuit. Au bord de la sphère, presque noir
  // la nuit, aucun texte : là, il passe par le verre (`panel`, mesuré sur le miel et sur le noir).
  { text: 'onHoney', on: 'honeyLight', min: 4.5 },
  { text: 'statusText', on: 'honeySoft', min: 4.5 },
  // Un champ choisi dans un groupe : sa ligne prend le fond honeySoft (TextField).
  { text: 'text', on: 'honeySoft', min: 4.5 },
  { text: 'amberText', on: 'honeySoft', min: 4.5 },
  // Le surlignage d'une recherche (R3, relecture ui-9) : les lettres trouvées passent à l'encre sur
  // le miel, dans un titre comme dans une ligne grise.
  { text: 'text', on: 'highlight', min: 4.5 },
  // R5b (relecture du plan ui-M2) : un commentaire visé par une réponse ou une modification porte
  // son nom, sa date et son texte sur le miel pâle ; une mention, l'encre sur sa pastille. La
  // pastille est opaque : posée sur une carte blanche, grise ou surlignée, seul son propre fond
  // compte pour le texte.
  { text: 'text', on: 'highlightSoft', min: 4.5 },
  { text: 'textSecondary', on: 'highlightSoft', min: 4.5 },
  { text: 'textMuted', on: 'highlightSoft', min: 4.5 },
  { text: 'text', on: 'mentionPill', min: 4.5 },
  { text: 'amberText', on: 'background', min: 4.5 },
  // La carte d'une note et le journal d'un projet : texte posé sur une surface pleine.
  { text: 'amberText', on: 'surface', min: 4.5 },
  { text: 'textSecondary', on: 'surface', min: 4.5 },
  { text: 'amber', on: 'background', min: 3 },
  // L'encadré de prudence (Callout, ton `caution`) : titre et icône en amberText, phrase à l'encre.
  { text: 'amberText', on: 'cautionSoft', min: 4.5 },
  { text: 'text', on: 'cautionSoft', min: 4.5 },
  { text: 'textSecondary', on: 'cautionSoft', min: 4.5 },
  { text: 'dangerText', on: 'background', min: 4.5 },
  { text: 'dangerText', on: 'dangerSoft', min: 4.5 },
  { text: 'onDanger', on: 'danger', min: 4.5 },
  { text: 'onDanger', on: 'dangerPressed', min: 4.5 },
  // Le chiffre de la pastille des nouveautés (CountBadge).
  { text: 'onBadge', on: 'badge', min: 4.5 },
  // R6a : les ronds de couleur de « Facile à refaire ? » (Choices, `dot` : vert, jaune, rouge). Des
  // formes, qui doivent se voir sur le blanc d'un choix (3:1) ; la couleur n'est jamais seule, le
  // texte dit tout. Sur le miel d'un choix coché, le rond est cerclé d'encre (onHoney sur honey, plus
  // haut) : le jaune n'y ferait que 1,5:1.
  { text: 'success', on: 'surface', min: 3 },
  { text: 'amber', on: 'surface', min: 3 },
  { text: 'danger', on: 'surface', min: 3 },
  { text: 'success', on: 'background', min: 4.5 },
  // R7a (relecture du plan, interface B5) : les familles d'une mise à jour. L'icône sur le fond
  // opaque de sa pastille (une forme : 3), où qu'elle soit posée ; le nom de la famille, écrit en
  // couleur sur la feuille « Nouvelle mise à jour » et sur une carte (un texte : 4,5).
  { text: 'familyNewIcon', on: 'familyNewSurface', min: 3 },
  { text: 'familyFixedIcon', on: 'familyFixedSurface', min: 3 },
  { text: 'familyPolishIcon', on: 'familyPolishSurface', min: 3 },
  { text: 'familyNewText', on: 'sheet', min: 4.5 },
  { text: 'familyNewText', on: 'surface', min: 4.5 },
  { text: 'familyFixedText', on: 'sheet', min: 4.5 },
  { text: 'familyFixedText', on: 'surface', min: 4.5 },
  { text: 'familyPolishText', on: 'sheet', min: 4.5 },
  { text: 'familyPolishText', on: 'surface', min: 4.5 },
  // R7a (U1c) : la ligne où l'on écrit se teinte de miel doux (UpdateLineField), nom compris.
  { text: 'familyNewText', on: 'honeySoft', min: 4.5 },
  { text: 'familyFixedText', on: 'honeySoft', min: 4.5 },
  { text: 'familyPolishText', on: 'honeySoft', min: 4.5 },
  // R7b (relecture du plan, interface B4) : l'issue d'un retour. L'icône sur le fond opaque de sa
  // pastille (une forme : 3), le libellé sur le même fond (un texte : 4,5) ; la pastille est opaque,
  // où qu'elle soit posée (une bulle, une ligne de la feuille « Nouvelle mise à jour »).
  { text: 'outcomeYesIcon', on: 'outcomeYesSurface', min: 3 },
  { text: 'outcomeYesText', on: 'outcomeYesSurface', min: 4.5 },
  { text: 'outcomePartlyIcon', on: 'outcomePartlySurface', min: 3 },
  { text: 'outcomePartlyText', on: 'outcomePartlySurface', min: 4.5 },
  { text: 'outcomeNoIcon', on: 'outcomeNoSurface', min: 3 },
  { text: 'outcomeNoText', on: 'outcomeNoSurface', min: 4.5 },
  // Les mêmes icônes dans les choix de « Ça a marché ? » (feuille « Ton retour », correction 5),
  // sur le fond d'un choix pas coché (`surface`, `ui/Choices.tsx`) ; coché, l'icône est à l'encre.
  { text: 'outcomeYesIcon', on: 'surface', min: 3 },
  { text: 'outcomePartlyIcon', on: 'surface', min: 3 },
  { text: 'outcomeNoIcon', on: 'surface', min: 3 },
  // « Réglé dans la v1.3 » : sous un retour, dans la bulle du testeur, sur une carte, et dans la
  // bulle de l'auteur.
  { text: 'settledText', on: 'surface', min: 4.5 },
  { text: 'settledText', on: 'bubbleTester', min: 4.5 },
  { text: 'settledText', on: 'bubbleAuthor', min: 4.5 },
  // Le texte d'un message et l'appareil d'un retour, dans les deux bulles.
  { text: 'text', on: 'bubbleAuthor', min: 4.5 },
  { text: 'textSecondary', on: 'bubbleAuthor', min: 4.5 },
  { text: 'text', on: 'bubbleTester', min: 4.5 },
  { text: 'textSecondary', on: 'bubbleTester', min: 4.5 },
  // Le liseré du point non lu (une forme : 3), sur la carte de la liste et sur une ligne surlignée.
  { text: 'unreadDotRing', on: 'surface', min: 3 },
  { text: 'unreadDotRing', on: 'highlight', min: 3 },
  // R7b : la ligne du fil choisi passe sur highlightSoft (textMuted y garde son contraste de nuit).
  { text: 'unreadDotRing', on: 'highlightSoft', min: 3 },
  { text: 'focusRing', on: 'background', min: 3 },
  // Les contrôles (WCAG 1.4.11) : le bord d'une case ou d'un rond vide, la piste d'un interrupteur
  // éteint, et le liseré du rond ou de la case choisis, sur une carte comme sur la page.
  { text: 'controlBorder', on: 'surface', min: 3 },
  { text: 'controlBorder', on: 'background', min: 3 },
  { text: 'controlChecked', on: 'surface', min: 3 },
  { text: 'controlChecked', on: 'background', min: 3 },
  // R8 (relecture du plan ui-B3) : une ligne de choix ouverte (ChoiceRow) pose ses ronds sur
  // highlightSoft, comme une notification nouvelle.
  { text: 'controlBorder', on: 'highlightSoft', min: 3 },
  { text: 'controlChecked', on: 'highlightSoft', min: 3 },
  // R8 (relecture de design) : le liseré d'une notification nouvelle (une forme qui dit un état
  // déjà lu en mots, « Nouveau » : 1,5, comme un squelette). Contre son propre fond, contre la page
  // où elle est posée, et contre une carte (catalogue). Contre la lumière miel, arrêt par arrêt :
  // highlightEdge.test.ts.
  { text: 'highlightEdge', on: 'highlightSoft', min: 1.5 },
  { text: 'highlightEdge', on: 'background', min: 1.5 },
  { text: 'highlightEdge', on: 'surface', min: 1.5 },
  // Le contour de la mascotte sur son disque (une forme, pas un texte : 3), sur la Cire, le noir
  // et le miel vif des écrans de marque, où le disque de verre de jour est posé.
  { text: 'mascotInk', on: 'mascotDisc', min: 3, base: onAnyBackdrop },
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
 * Le blanc d'un masque SVG : il ne se voit jamais, il dit seulement « ici, le dessin se voit »
 * (un masque lit la clarté de ce qu'il contient : blanc, visible ; transparent, caché). Le même de
 * jour et de nuit. Sert aux alvéoles de l'introuvable, qui s'effacent vers le haut et le bas (R5a).
 */
export const maskVisible = '#FFFFFF'

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
